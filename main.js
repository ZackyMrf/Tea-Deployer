import 'dotenv/config';
import fs from 'fs';
import inquirer from 'inquirer';
import { ethers } from 'ethers';
import chalk from 'chalk';
import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);

const rpcUrl = process.env.RPC_URL || "https://tea-sepolia.g.alchemy.com/public";
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

async function getWallet() {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
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
  return { abi: artifact.abi, bytecode: artifact.bytecode.object || artifact.bytecode };
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
  const wallet = await getWallet();
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const totalSupplyInWei = ethers.utils.parseUnits(answers.totalSupply, Number(answers.decimals));
  const contract = await factory.deploy(answers.name, answers.symbol, Number(answers.decimals), totalSupplyInWei);

  log("info", `🚀 Tx Hash: ${contract.deployTransaction.hash}`);
  log("info", "⏳ Waiting for confirmation...");
  await contract.deployed();

  log("success", `🚀 Contract deployed at: ${contract.address}`);
  CONTRACT_ADDRESS = contract.address;
  contractInstance = contract;
  updateEnv("CONTRACT_ADDRESS", contract.address);
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

  if (addresses.length === 0) return;

  log("info", `🪙 Sending tokens to ${addresses.length} addresses...`);
  for (const recipient of addresses) {
    await sendToken(recipient, amountPerTx);
    log("info", "⏳ Waiting for 7 minutes before the next transaction...");
    await delay(7 * 60 * 1000); // Delay 7 menit
  }
}

async function sendToken(recipient, amount) {
  try {
    const tx = await contractInstance.transfer(recipient, amount);
    log("info", `🪙 Tx Hash: ${tx.hash}`);
    log("info", "⏳ Waiting for confirmation...");
    await tx.wait();
    log("success", `🪙 Tokens sent to ${recipient}`);
  } catch (error) {
    log("error", `❌ Failed to send tokens to ${recipient}: ${error.message}`);
  }
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