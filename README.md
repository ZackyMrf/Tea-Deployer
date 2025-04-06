# Tea-Testnet-Deployer

**Automated Token Deployment and Distribution Tool**

Tea-Testnet-Deployer is a CLI tool designed to simplify the process of deploying ERC20 contracts and distributing tokens/native assets on the Tea Sepolia Testnet.

---

## Key Features
- 🛠️ Deploy ERC20 contracts with automatic verification.
- 💸 Distribute native tokens (TEA) to verified addresses.
- 🪙 Distribute ERC20 tokens to verified addresses.
- 🔍 Integrated with the Tea Sepolia blockchain explorer.

---

## Prerequisites
Before running this project, make sure you meet the following prerequisites:
- **Node.js** v18+ installed on your system.
- **npm** v9+ installed.
- A blockchain wallet with a TEA balance to pay for gas fees.
- A file named `address_KYC.txt` containing a list of addresses to receive tokens.

---

## Installation
1. Clone this repository to your computer:
   ```bash
   git clone https://github.com/ZackyMrf/Tea-Deployer.git
   cd Tea-Deployer
   ```

2. Install all required dependencies:
   ```bash
   npm install
   ```

3. Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```

4. Edit the `.env` file and fill in the required variables:
   ```properties
   MAIN_PRIVATE_KEY=0xyour_wallet_private_key
   RPC_URL=https://tea-sepolia.g.alchemy.com/public
   CHAIN_ID=10218
   EXPLORER_URL=https://sepolia.tea.xyz/
   CONTRACT_ADDRESS=
   ```

---

## How to Run
1. Start the application by running:
   ```bash
   npm run start
   ```

2. Follow the interactive menu:
   - **Deploy New Contract**: To create a new ERC20 contract.
   - **Send ERC20 Tokens**: To distribute tokens to addresses listed in the `address_KYC.txt` file.

3. Ensure your wallet has sufficient TEA balance to cover gas fees.

---

## Project Structure
- `main.js`: The main file to run the CLI application.
- `address_KYC.txt`: A file containing a list of addresses to receive tokens.
- `artifacts/`: Directory containing compiled contract artifacts.
- `.env`: Configuration file for storing environment variables.

---

## Notes
- Ensure your wallet has enough TEA balance to pay for gas fees.
- The `address_KYC.txt` file must contain valid Ethereum addresses.

---



## License
This project is licensed under the [MIT License](LICENSE).

---

thanks to https://github.com/Endijuan33

## Disclaimer
⚠️ **For Educational Use Only**  
- This script is provided for educational and testing purposes on the Tea Testnet.
- All transactions use testnet assets with no real monetary value.
- Usage on the mainnet is not recommended and may violate network policies.