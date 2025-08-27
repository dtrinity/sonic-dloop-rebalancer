# DLoop Rebalancer Bot

This repository contains the implementation of a DeFi bot that automatically rebalances DLoop vaults to maintain target leverage ratios using Odos swap routing and flash loans.

## Repository Structure

This repository contains two independent sub-repositories:

1. `bot-solidity-contracts` - Contains the Solidity smart contract interfaces for interacting with DLoop protocol
2. `bot-typescript` - Contains the TypeScript bot logic that orchestrates the rebalancing operations

Each sub-repository is completely independent and can be moved outside this repository if needed.

## Prerequisites

- Node.js (v18.x recommended)
- Yarn (v1.22.x recommended)
- Docker (for containerized deployment)

## Quick Start

1. Install dependencies for both sub-repos:

   ```bash
   make install
   ```

2. Compile the Solidity contracts:

   ```bash
   make compile
   ```

3. Run tests:

   ```bash
   make test
   ```

## Development

### Solidity Contracts

Navigate to the `bot-solidity-contracts` directory for contract development:

```bash
cd bot-solidity-contracts
```

- Compile contracts: `yarn compile`
- Run tests: `yarn test`
- Deploy contracts: `yarn deploy:testnet`

### TypeScript Bot

Navigate to the `bot-typescript` directory for bot development:

```bash
cd bot-typescript
```

- Build TypeScript: `yarn build`
- Run tests: `yarn test`
- Run bot: `yarn start`

## Configuration

### Environment Variables

Copy the `.env.example` files in each sub-repo and fill in the required values:

1. For contract deployment (`bot-solidity-contracts/.env`):
   - `PRIVATE_KEY`: Your wallet private key for contract deployment
   - `SONIC_MAINNET_RPC_URL`: RPC URL for Sonic mainnet
   - `SONIC_TESTNET_RPC_URL`: RPC URL for Sonic testnet
   - `SONICSCAN_API_KEY`: API key for SonicScan block explorer
   - Contract addresses for existing contracts

2. For bot execution (`bot-typescript/.env`):
   - `PRIVATE_KEY`: Your wallet private key for bot operations
   - `SONIC_MAINNET_RPC_URL`: RPC URL for Sonic mainnet
   - `SONIC_TESTNET_RPC_URL`: RPC URL for Sonic testnet
   - `SLACK_TOKEN` (optional): Slack API token for notifications
   - `SLACK_CHANNEL` (optional): Slack channel for notifications
   - Contract addresses for all required contracts
   - Token configuration (addresses, decimals, symbols)
   - Bot parameters (network, loop interval, dry run mode)
   - Minimum subsidy amounts for profitability checks
   - Rebalance percentage list for fallback strategy
   - Transaction retry configuration
   - Odos integration parameters

## Deployment

### 1. Configure Environment Variables

1. Copy and configure environment files:
   ```bash
   cp bot-solidity-contracts/.env.example bot-solidity-contracts/.env
   cp bot-typescript/.env.example bot-typescript/.env
   ```

2. Fill in all required values in both `.env` files

### 2. Testnet Deployment

1. Deploy contracts to testnet (if needed):
   ```bash
   make deploy-contracts.testnet
   ```

2. Run the TypeScript bot on testnet:
   ```bash
   make run.testnet
   ```

### 3. Mainnet Deployment

1. Deploy contracts to mainnet (if needed):
   ```bash
   make deploy-contracts.mainnet
   ```

2. Run the TypeScript bot on mainnet:
   ```bash
   make run.mainnet
   ```

## Docker Deployment

1. Build Docker image:

   For AMD64 (Intel/AMD):
   ```bash
   make docker.build.amd64
   ```

   For ARM64 (Apple Silicon):
   ```bash
   make docker.build.arm64
   ```

2. Run Docker container:

   Testnet:
   ```bash
   make docker.run.testnet
   ```

   Mainnet:
   ```bash
   make docker.run.mainnet
   ```

## Testing

Run all tests:
```bash
make test
```

Run tests for specific components:
```bash
# Solidity contracts
cd bot-solidity-contracts && yarn test

# TypeScript bot
cd bot-typescript && yarn test
```

## Security

Before deploying to production:

1. Conduct a thorough security review of the smart contracts and bot logic
2. Use a separate wallet with limited funds for the bot
3. Never commit private keys or sensitive data to version control
4. Regularly monitor bot operations and transactions
5. Set appropriate minimum subsidy thresholds to ensure profitability

## Monitoring and Alerts

The bot includes built-in logging and optional Slack notifications:

1. Configure `SLACK_TOKEN` and `SLACK_CHANNEL` in your `.env` file
2. The bot will send notifications for:
   - Successful rebalancing operations
   - Failed operations
   - Skipped operations
   - Critical errors

## Troubleshooting

Common issues and solutions:

1. **"Invalid chain ID"**: Ensure you're using the correct network configuration
2. **"Flash loan capacity exceeded"**: Reduce percentage list or check flash lender
3. **"Subsidy below minimum"**: Adjust minimum subsidy thresholds
4. **Contract call failures**: Verify contract addresses and network connectivity

For detailed logs, set `LOG_LEVEL=debug` in your environment.

## License

MIT