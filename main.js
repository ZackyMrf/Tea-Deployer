import 'dotenv/config';
import fs from 'fs';
import inquirer from 'inquirer';
import { ethers } from 'ethers';
import chalk from 'chalk';
import { exec } from 'child_process';
import util from 'util';
import ora from 'ora'; // Tambahkan package ora untuk spinner
import Table from 'cli-table3'; // Tambahkan package cli-table3 untuk tabel
import figlet from 'figlet'; // Tambahkan package figlet untuk ASCII art
import gradient from 'gradient-string'; // Tambahkan package gradient-string untuk efek warna

const execPromise = util.promisify(exec);

// ASCII Art Banner
console.log('\n');
console.log(gradient.pastel(figlet.textSync('TEA TOKEN', { font: 'Big', horizontalLayout: 'full' })));
console.log(gradient.rainbow('======= ERC-20 Token Deployer & Distributor by Mrf =======\n'));

// Validasi environment variables
if (!process.env.MAIN_PRIVATE_KEY) {
  console.log(chalk.red('🔑 Error: MAIN_PRIVATE_KEY is not defined in .env file.'));
  process.exit(1);
}

const rpcUrl = process.env.RPC_URL || "https://tea-sepolia.g.alchemy.com/public";
let provider = null;
const baseWallet = new ethers.Wallet(process.env.MAIN_PRIVATE_KEY);
let contractInstance = null;
let CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";

// Tema warna yang konsisten
const theme = {
  info: chalk.blue,
  success: chalk.greenBright,
  error: chalk.redBright,
  warning: chalk.yellowBright,
  highlight: chalk.cyanBright,
  muted: chalk.gray,
  title: chalk.magentaBright.bold
};

// Fungsi untuk logging yang lebih konsisten
function log(type, message) {
  const icons = {
    info: '📘',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    process: '⏳',
    money: '💰',
    contract: '📝'
  };
  
  const prefix = type === 'divider' 
    ? theme.muted('─'.repeat(50)) 
    : theme[type] ? `${icons[type] || '•'} ${theme[type](type.toUpperCase())}` : '';
  
  if (type === 'divider') {
    console.log(prefix);
    return;
  }
  
  console.log(`${prefix}: ${message}`);
}

async function getProvider() {
  if (!provider) {
    provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  }
  return provider;
}

async function getWallet() {
  const provider = await getProvider();
  return baseWallet.connect(provider);
}

async function compileContract() {
  const spinner = ora('Compiling contract...').start();
  
  try {
    await execPromise("npx hardhat compile");
    spinner.succeed('Contract compiled successfully');
    
    const artifactPath = "artifacts/contracts/CustomToken.sol/CustomToken.json";
    
    if (!fs.existsSync(artifactPath)) {
      throw new Error("Artifact not found: " + artifactPath);
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    
    if (!artifact.abi || !artifact.bytecode) {
      throw new Error("ABI or bytecode is invalid. Please recompile the contract.");
    }
    
    const bytecode = typeof artifact.bytecode === 'object' && artifact.bytecode.object 
      ? artifact.bytecode.object 
      : artifact.bytecode;
      
    log('success', `ABI loaded with ${theme.highlight(artifact.abi.length)} methods`);
    log('success', `Bytecode loaded (${theme.highlight(bytecode.length)} chars)`);

    return { abi: artifact.abi, bytecode: bytecode };
  } catch (error) {
    spinner.fail('Compilation failed');
    log('error', error.message);
    throw error;
  }
}

async function deployContract() {
  log('divider');
  log('info', 'Starting deployment process');
  
  const answers = await inquirer.prompt([
    { 
      type: 'input', 
      name: 'name', 
      message: 'Token Name:',
      prefix: theme.highlight('🏷️')
    },
    { 
      type: 'input', 
      name: 'symbol', 
      message: 'Token Symbol:',
      prefix: theme.highlight('💱')
    },
    {
      type: 'input',
      name: 'decimals',
      message: 'Decimals (default 18):',
      default: '18',
      validate: input => isValidNumber(input, "Decimals must be a valid number."),
      prefix: theme.highlight('🔢')
    },
    {
      type: 'input',
      name: 'totalSupply',
      message: 'Total Supply:',
      validate: input => isValidNumber(input, "Supply must be a valid number."),
      prefix: theme.highlight('💯')
    }
  ]);

  const deploymentSpinner = ora('Preparing deployment...').start();
  
  try {
    const { abi, bytecode } = await compileContract();
    deploymentSpinner.text = 'Setting up wallet connection...';
    
    const wallet = await getWallet();
    deploymentSpinner.text = `Using wallet: ${wallet.address.substring(0, 6)}...${wallet.address.substring(38)}`;

    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    deploymentSpinner.text = 'Contract factory created successfully';
    
    const totalSupplyInWei = ethers.utils.parseUnits(
      answers.totalSupply, 
      Number(answers.decimals)
    );
    
    // Show deployment parameters in a nice table
    deploymentSpinner.stop();
    
    const table = new Table({
      head: [theme.title('Parameter'), theme.title('Value')],
      colWidths: [20, 40]
    });
    
    table.push(
      ['Name', theme.highlight(answers.name)],
      ['Symbol', theme.highlight(answers.symbol)],
      ['Decimals', theme.highlight(answers.decimals)],
      ['Total Supply', theme.highlight(`${answers.totalSupply} (${totalSupplyInWei.toString()} wei)`)]
    );
    
    console.log(table.toString());
    
    deploymentSpinner.text = 'Deploying contract...';
    deploymentSpinner.start();

    const gasPrice = await wallet.provider.getGasPrice();
    const adjustedGasPrice = gasPrice.mul(2);

    const contract = await factory.deploy(
      answers.name,
      answers.symbol,
      Number(answers.decimals),
      totalSupplyInWei,
      {
        gasLimit: 5000000,
        maxFeePerGas: adjustedGasPrice,
        maxPriorityFeePerGas: ethers.utils.parseUnits("9", "gwei")
      }
    );

    deploymentSpinner.text = `Transaction sent: ${contract.deployTransaction.hash}`;
    
    const waitingSpinner = ora('Waiting for confirmation... (this may take a few minutes)').start();
    const receipt = await contract.deployTransaction.wait();
    waitingSpinner.succeed('Transaction confirmed');
    
    log('divider');
    log('success', `Contract deployed successfully`);
    log('contract', `Address: ${theme.highlight(contract.address)}`);
    
    // Update global variables
    CONTRACT_ADDRESS = contract.address;
    contractInstance = contract;
    updateEnv("CONTRACT_ADDRESS", contract.address);
    
    return contract;
  } catch (error) {
    deploymentSpinner.fail('Deployment failed');
    log('error', error.message);
    if (error.stack) {
      log('error', error.stack.split('\n')[0]);
    }
    throw error;
  }
}

function isValidNumber(input, errorMessage) {
  return !isNaN(input) && Number(input) > 0 ? true : errorMessage;
}

function updateEnv(key, value) {
  const envPath = '.env';
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const regex = new RegExp(`^${key}=.*$`, 'm');
  const newLine = `${key}=${value}`;
  envContent = regex.test(envContent) ? envContent.replace(regex, newLine) : `${envContent}\n${newLine}`;
  fs.writeFileSync(envPath, envContent);
  log('info', `Environment updated: ${key}=${value.substring(0, 10)}...`);
}

function readAddressKYC() {
  const filePath = 'address_KYC.txt';
  if (!fs.existsSync(filePath)) {
    log('error', "address_KYC.txt not found");
    return [];
  }

  const addresses = fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => ethers.utils.isAddress(line));

  if (addresses.length === 0) {
    log('error', "No valid addresses found in address_KYC.txt");
  }

  return addresses;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendERC20Token() {
  log('divider');
  log('info', 'Starting token distribution process');
  
  if (!CONTRACT_ADDRESS) {
    log('error', "Contract not deployed. Please deploy the contract first.");
    return;
  }

  const initSpinner = ora('Initializing contract...').start();
  
  try {
    if (!contractInstance) {
      const { abi } = await compileContract();
      contractInstance = new ethers.Contract(CONTRACT_ADDRESS, abi, await getWallet());
    }
    
    initSpinner.succeed(`Contract initialized at ${CONTRACT_ADDRESS.substring(0, 8)}...`);
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'amountPerTx',
        message: 'Amount per transaction:',
        validate: input => isValidNumber(input, "Amount must be a valid number."),
        prefix: theme.highlight('🪙')
      }
    ]);

    const balanceCheckSpinner = ora('Checking wallet balance...').start();
    await checkWalletBalance();
    balanceCheckSpinner.succeed('Wallet balance verified');

    const tokenDecimals = await contractInstance.decimals();
    const amountPerTx = ethers.utils.parseUnits(answers.amountPerTx, tokenDecimals);
    const addresses = readAddressKYC();

    if (addresses.length === 0) return;

    log('divider');
    log('info', `Sending ${theme.highlight(answers.amountPerTx)} tokens to ${theme.highlight(addresses.length)} addresses`);
    
    for (let i = 0; i < addresses.length; i++) {
      const recipient = addresses[i];
      
      const progressBar = `[${i + 1}/${addresses.length}]`;
      log('info', `${progressBar} Processing transaction to ${theme.highlight(recipient.substring(0, 8))}...`);
      
      await sendToken(recipient, amountPerTx);
      
      if (i < addresses.length - 1) {
        const waitSpinner = ora('Waiting for 7 minutes before the next transaction...').start();
        await delay(7 * 60 * 1000);
        waitSpinner.succeed('Wait completed');
      }
    }
    
    log('success', 'All transactions completed successfully');
  } catch (error) {
    initSpinner.fail('Process failed');
    log('error', error.message);
  }
}

async function checkWalletBalance() {
  const wallet = await getWallet();
  const balance = await wallet.getBalance();
  
  log('money', `Wallet balance: ${theme.highlight(ethers.utils.formatEther(balance))} TEA`);

  if (balance.lt(ethers.utils.parseEther("0.01"))) {
    throw new Error("Insufficient balance to cover gas fees");
  }
}

async function sendToken(recipient, amount) {
  const txSpinner = ora(`Preparing transaction...`).start();
  
  try {
    const wallet = await getWallet();
    const nonce = await wallet.getTransactionCount("pending");
    const gasPrice = await contractInstance.provider.getGasPrice();
    const adjustedGasPrice = gasPrice.mul(2);
    const estimatedGasLimit = await contractInstance.estimateGas.transfer(recipient, amount);

    txSpinner.text = 'Sending transaction...';
    
    const tx = await contractInstance.transfer(recipient, amount, {
      gasLimit: estimatedGasLimit,
      maxFeePerGas: adjustedGasPrice,
      maxPriorityFeePerGas: ethers.utils.parseUnits("9", "gwei"),
      nonce: nonce
    });

    txSpinner.text = `Transaction sent: ${tx.hash}`;
    
    // Wait for confirmation
    const confirmSpinner = ora('Waiting for confirmation...').start();
    await waitForTransaction(tx.hash);
    confirmSpinner.succeed('Transaction confirmed');
    
    log('success', `Tokens sent to ${recipient.substring(0, 8)}...`);
    return tx;
  } catch (error) {
    txSpinner.fail('Transaction failed');
    
    if (error.message.includes("replacement transaction underpriced")) {
      log('warning', "Replacement transaction underpriced. Retrying with higher gas fees...");
      await sendToken(recipient, amount);
    } else {
      log('error', `Failed to send tokens: ${error.message}`);
    }
  }
}

async function waitForTransaction(txHash) {
  const provider = await getProvider();
  
  let receipt = null;
  const timeout = Date.now() + 1 * 60 * 1000;

  while (!receipt) {
    if (Date.now() > timeout) {
      throw new Error(`Transaction ${txHash} is taking too long to be mined.`);
    }
    receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      await delay(5000);
    }
  }
  
  return receipt;
}

async function mainMenu() {
  try {
    log('divider');
    
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { 
            name: theme.highlight('🚀 Deploy New ERC20 Token'), 
            value: 'deploy' 
          },
          { 
            name: theme.highlight('💸 Send Tokens to KYC Addresses'), 
            value: 'sendERC20' 
          },
          { 
            name: theme.warning('🚪 Exit'), 
            value: 'exit' 
          }
        ]
      }
    ]);

    if (answer.action === 'deploy') {
      await deployContract();
    } else if (answer.action === 'sendERC20') {
      await sendERC20Token();
    } else if (answer.action === 'exit') {
      log('info', "Thank you for using TEA Token Deployer!");
      process.exit(0);
    }
  } catch (error) {
    log('error', error.message);
  }
  
  // Return to main menu
  mainMenu();
}

// Start the app
mainMenu();