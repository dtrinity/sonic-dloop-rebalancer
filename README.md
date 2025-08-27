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

### Network Configuration

All configuration values are now hardcoded in the network configuration files:

1. **Contract Addresses**: Update the contract addresses in:
   - `bot-solidity-contracts/config/networks/sonic_mainnet.ts`
   - `bot-solidity-contracts/config/networks/sonic_testnet.ts`
   - `bot-typescript/src/config/networks/sonic_mainnet.ts`
   - `bot-typescript/src/config/networks/sonic_testnet.ts`

2. **Network Settings**: Update network-specific settings in the respective config files:
   - RPC URLs
   - Private keys for deployment/operations
   - API keys for block explorers
   - Token configurations
   - Policy settings (rebalance percentages, retry limits, etc.)
   - Notification settings (Slack configuration)

## Deployment

### 1. Configure Network Settings

1. Update all required values in the network configuration files:
   - Set RPC URLs in the network configs
   - Add private keys for deployment/operations
   - Update contract addresses
   - Configure token settings
   - Set API keys for block explorers

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

1. Configure Slack settings in the network configuration files:
   - Set `token` and `channel` in the `notifications.slack` section
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

For detailed logs, set the `logLevel` to "debug" in the network configuration files.

## License

MIT