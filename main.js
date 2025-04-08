import 'dotenv/config';
import fs from 'fs';
import inquirer from 'inquirer';
import { ethers } from 'ethers';
import chalk from 'chalk';
import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);

// Validasi environment variables
if (!process.env.MAIN_PRIVATE_KEY) {
  console.error("❌ MAIN_PRIVATE_KEY is not defined in .env file.");
  process.exit(1);
}

const rpcUrl = process.env.RPC_URL || "https://tea-sepolia.g.alchemy.com/public";
let provider = null;
const baseWallet = new ethers.Wallet(process.env.MAIN_PRIVATE_KEY);
let contractInstance = null;
let CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";

function log(type, message) {
  const logTypes = {
    info: chalk.blue(`[info] : ${message}`),
    success: chalk.green(`[success] ✅ : ${message}`),
    error: chalk.red(`[error] ❌ : ${message}`)
  };
  console.log(logTypes[type] || message);
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
  log("info", "🛠️ Compiling contract...");
  try {
    await execPromise("npx hardhat compile");
    log("success", "🛠️ Compilation successful.");
  } catch (error) {
    log("error", "🛠️ Compilation failed: " + error.message);
    throw error;
  }

  const artifactPath = "artifacts/contracts/CustomToken.sol/CustomToken.json";
  if (!fs.existsSync(artifactPath)) {
    throw new Error("📦 Artifact not found: " + artifactPath);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  
  if (!artifact.abi || !artifact.bytecode) {
    throw new Error("❌ ABI or bytecode is invalid. Please recompile the contract.");
  }
  
  // Log more details for debugging
  log("info", `✅ ABI loaded with ${artifact.abi.length} methods`);
  
  // Ensure bytecode is properly structured
  const bytecode = typeof artifact.bytecode === 'object' && artifact.bytecode.object 
    ? artifact.bytecode.object 
    : artifact.bytecode;
    
  log("info", `✅ Bytecode loaded (${bytecode.length} chars)`);

  return { abi: artifact.abi, bytecode: bytecode };
}

async function deployContract() {
  const answers = await inquirer.prompt([
    { type: 'input', name: 'name', message: 'Enter Contract Name:' },
    { type: 'input', name: 'symbol', message: 'Enter Contract Symbol:' },
    {
      type: 'input',
      name: 'decimals',
      message: 'Enter Decimals (default 18):',
      validate: input => isValidNumber(input, "Decimals must be a valid number.")
    },
    {
      type: 'input',
      name: 'totalSupply',
      message: 'Enter Total Supply (e.g., 100000):',
      validate: input => isValidNumber(input, "Total Supply must be a valid number.")
    }
  ]);

  log("info", "🚀 Deploying contract...");
  const { abi, bytecode } = await compileContract();

  // Validasi ABI dan Bytecode
  if (!abi || !bytecode) {
    throw new Error("❌ ABI or bytecode is invalid. Please recompile the contract.");
  }

  const wallet = await getWallet();
  log("info", `🔑 Using wallet: ${wallet.address}`);

  try {
    // Create factory with explicit parameters
    const factory = new ethers.ContractFactory(
      abi,
      bytecode,
      wallet
    );

    // Log untuk memastikan ContractFactory berhasil dibuat
    log("info", "✅ ContractFactory created successfully.");

    // Hitung total supply dalam satuan wei
    const totalSupplyInWei = ethers.utils.parseUnits(answers.totalSupply, Number(answers.decimals));

    // Log parameter untuk debugging
    log("info", `Deploying with parameters: name=${answers.name}, symbol=${answers.symbol}, decimals=${answers.decimals}, totalSupply=${totalSupplyInWei}`);

    // Ambil gas price dari jaringan
    const gasPrice = await wallet.provider.getGasPrice();
    const adjustedGasPrice = gasPrice.mul(2); // Gandakan gas price untuk prioritas lebih tinggi

    // Skip estimateGas and use fixed gas limit to avoid errors
    log("info", "Deploying contract directly...");
    const contract = await factory.deploy(
      answers.name,
      answers.symbol,
      Number(answers.decimals),
      totalSupplyInWei,
      {
        gasLimit: 5000000, // Use a safe fixed gas limit
        maxFeePerGas: adjustedGasPrice,
        maxPriorityFeePerGas: ethers.utils.parseUnits("9", "gwei")
      }
    );

    log("info", `🚀 Tx Hash: ${contract.deployTransaction.hash}`);
    log("info", "⏳ Waiting for confirmation...");

    // Wait for transaction confirmation directly from deployment
    const receipt = await contract.deployTransaction.wait();
    
    log("success", `🚀 Contract deployed at: ${contract.address}`);
    CONTRACT_ADDRESS = contract.address;
    contractInstance = contract;
    updateEnv("CONTRACT_ADDRESS", contract.address);
    return contract;
  } catch (error) {
    log("error", `❌ Failed to deploy contract: ${error.message}`);
    if (error.stack) {
      log("error", `Stack trace: ${error.stack.split('\n')[0]}`);
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
  log("info", `📝 .env updated: ${key}=${value}`);
}

function readAddressKYC() {
  const filePath = 'address_KYC.txt';
  if (!fs.existsSync(filePath)) {
    log("error", "❌ address_KYC.txt not found.");
    return [];
  }

  const addresses = fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => ethers.utils.isAddress(line));

  if (addresses.length === 0) {
    log("error", "❌ No valid addresses found in address_KYC.txt.");
  }

  return addresses;
}

// Fungsi delay untuk menunggu 7 menit
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendERC20Token() {
  if (!CONTRACT_ADDRESS) {
    log("error", "❌ Contract not deployed. Please deploy the contract first.");
    return;
  }

  if (!contractInstance) {
    const { abi } = await compileContract();
    contractInstance = new ethers.Contract(CONTRACT_ADDRESS, abi, await getWallet());
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'amountPerTx',
      message: 'Enter the token amount per transaction (e.g., 0.001):',
      validate: input => isValidNumber(input, "Amount must be a valid number.")
    }
  ]);

  const tokenDecimals = await contractInstance.decimals();
  const amountPerTx = ethers.utils.parseUnits(answers.amountPerTx, tokenDecimals);
  const addresses = readAddressKYC();
  await checkWalletBalance();

  if (addresses.length === 0) return;

  log("info", `🪙 Sending tokens to ${addresses.length} addresses...`);
  for (let i = 0; i < addresses.length; i++) {
    const recipient = addresses[i];
    log("info", `🚀 Sending to ${recipient} (${i + 1}/${addresses.length})`);
    await sendToken(recipient, amountPerTx);
    log("info", "⏳ Waiting for 7 minutes before the next transaction...");
    await delay(7 * 60 * 1000); // Delay 7 menit
  }
}

async function checkWalletBalance() {
  const wallet = await getWallet();
  const balance = await wallet.getBalance();
  log("info", `💰 Wallet balance: ${ethers.utils.formatEther(balance)} TEA`);

  if (balance.lt(ethers.utils.parseEther("0.01"))) {
    throw new Error("Insufficient balance to cover gas fees.");
  }
}

async function sendToken(recipient, amount) {
  try {
    const wallet = await getWallet();

    // Ambil nonce terbaru dari jaringan
    const nonce = await wallet.getTransactionCount("pending");

    // Ambil gas price dari jaringan
    const gasPrice = await contractInstance.provider.getGasPrice();

    // Gandakan gas price untuk memastikan transaksi diterima
    const adjustedGasPrice = gasPrice.mul(2);

    // Estimasi gas limit untuk transaksi
    const estimatedGasLimit = await contractInstance.estimateGas.transfer(recipient, amount);

    // Kirim transaksi dengan gas fee dan nonce yang sesuai
    const tx = await contractInstance.transfer(recipient, amount, {
      gasLimit: estimatedGasLimit,
      maxFeePerGas: adjustedGasPrice,
      maxPriorityFeePerGas: ethers.utils.parseUnits("9", "gwei"),
      nonce: nonce // Gunakan nonce yang benar
    });

    log("info", `🪙 Tx Hash: ${tx.hash}`);
    log("info", "⏳ Waiting for confirmation...");

    // Tunggu hingga transaksi selesai
    await waitForTransaction(tx.hash);

    log("success", `🪙 Tokens sent to ${recipient}`);
  } catch (error) {
    if (error.message.includes("replacement transaction underpriced")) {
      log("error", "❌ Replacement transaction underpriced. Retrying with higher gas fees...");
      await sendToken(recipient, amount); // Kirim ulang transaksi
    } else {
      log("error", `❌ Failed to send tokens to ${recipient}: ${error.message}`);
    }
  }
}

async function waitForTransaction(txHash) {
  // Get provider directly instead of relying on contractInstance
  const provider = await getProvider();

  log("info", `⏳ Waiting for transaction ${txHash} to be mined...`);
  let receipt = null;
  const timeout = Date.now() + 1 * 60 * 1000; // 1 menit batas waktu

  // Periksa status transaksi setiap 5 detik
  while (!receipt) {
    if (Date.now() > timeout) {
      throw new Error(`Transaction ${txHash} is taking too long to be mined.`);
    }
    receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      await delay(5000); // Tunggu 5 detik sebelum memeriksa lagi
    }
  }

  log("success", `✅ Transaction ${txHash} confirmed.`);
  return receipt;
}

async function mainMenu() {
  try {
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Choose an option:',
        choices: [
          { name: '1. Deploy New Contract (Create ERC20 Token)', value: 'deploy' },
          { name: '2. Send ERC20 Token to verified addresses (KYC)', value: 'sendERC20' },
          { name: 'Exit', value: 'exit' }
        ]
      }
    ]);

    if (answer.action === 'deploy') {
      await deployContract();
    } else if (answer.action === 'sendERC20') {
      await sendERC20Token();
    } else if (answer.action === 'exit') {
      log("info", "🚪 Exiting...");
      process.exit(0);
    }
  } catch (error) {
    log("error", `⚠️ Error: ${error.message}`);
  }
  mainMenu();
}

mainMenu();