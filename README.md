# DLoop Rebalancer Bot

A TypeScript bot that automatically rebalances DLoop vaults to maintain target leverage ratios using Odos swap routing and flash loans.

## Overview

This bot monitors DLoop core contracts and executes rebalancing operations when the current leverage deviates from the target leverage. It uses the existing deployed periphery contracts (`DLoopIncreaseLeverageOdos` and `DLoopDecreaseLeverageOdos`) to perform the rebalancing operations.

## Features

- **Automatic Rebalancing**: Monitors leverage and rebalances when needed
- **Subsidy Gating**: Only executes profitable rebalancing operations
- **Fallback Strategy**: Tries multiple percentage amounts (100%, 90%, 80%, etc.) if initial attempts fail
- **Flash Loan Integration**: Uses ERC-3156 flash loans for capital efficiency
- **Odos Integration**: Leverages Odos for optimal swap routing
- **Slack Notifications**: Sends success/failure notifications to Slack
- **Dry Run Mode**: Test mode for safe deployment
- **Docker Support**: Containerized deployment with Docker

## Architecture

```text
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   Bot Runner    │────│  RebalanceManager│────│   QuoteManager      │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
         │                       │                        │
         │              ┌──────────────────┐    ┌─────────────────────┐
         │              │  SwapDataBuilder │────│    OdosClient       │
         │              └──────────────────┘    └─────────────────────┘
         │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│ ContractManager │────│ NotificationMgr  │────│   Slack Client      │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
```

## Installation

```bash
# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test
```

## Configuration

Copy the example environment file and configure:

```bash
make .env
```

Key configuration options:

- `NETWORK`: Target network (localhost, sonic_testnet, sonic_mainnet)
- `DLOOP_CORE_ADDRESS`: Address of the DLoop core contract
- `INCREASE_ODOS_ADDRESS`: Address of the increase leverage periphery
- `DECREASE_ODOS_ADDRESS`: Address of the decrease leverage periphery
- `ODOS_ROUTER_ADDRESS`: Odos router address (if supported on network)
- `FLASH_LENDER_ADDRESS`: ERC-3156 flash lender address
- `MIN_SUBSIDY_*`: Minimum subsidy thresholds for profitability
- `SLACK_TOKEN`: Slack bot token for notifications
- `DRY_RUN`: Set to "true" for testing without real transactions

## Usage

### Local Development

```bash
# Run the bot locally
npm run ts-node typescript/rebalance_bot/run.ts
```

### Docker Deployment

```bash
# Build Docker image
make docker.build

# Run as daemon
make docker.run.daemon

# View logs
docker logs -f dloop-rebalancer

# Stop daemon
make docker.stop
```

## How It Works

1. **Quote Phase**: Calls `dloopCore.quoteRebalanceAmountToReachTargetLeverage()` to get:
   - Input token amount
   - Estimated output token amount  
   - Direction (1 = increase, -1 = decrease, 0 = no rebalance)

2. **Subsidy Gate**: Calculates expected subsidy and compares against minimum thresholds

3. **Execution Phase**:
   - **Increase Leverage**: Flash loans debt tokens → swap to collateral → call `increaseLeverage()` → repay loan
   - **Decrease Leverage**: Flash loans debt tokens → call `decreaseLeverage()` → swap collateral to debt → repay loan

4. **Fallback Strategy**: If execution fails, retries with smaller amounts (90%, 80%, etc.)

5. **Notification**: Sends results to Slack and logs

## Testing

The bot includes comprehensive tests covering:

- Quote manager functionality
- Subsidy gating logic
- Rebalancing execution flows
- Error handling and fallback strategies
- Integration scenarios

```bash
# Run all tests
npx hardhat test

# Run specific test suites
npx hardhat test --grep "QuoteManager"
npx hardhat test --grep "RebalanceManager"
npx hardhat test --grep "Integration"
```

## Monitoring

The bot provides detailed logging and Slack notifications:

- **Success**: Direction, percentage used, amounts, transaction hash, gas used
- **Failures**: Error messages, retry attempts, final outcomes
- **Skips**: Reasons for skipping (no rebalance needed, low subsidy, etc.)

## Safety Features

- **Flash Loan Precheck**: Validates flash loan availability before execution
- **Slippage Protection**: Uses exact-output swaps with reasonable buffers
- **Percentage Fallback**: Reduces amounts if initial attempts fail
- **Ignore Cache**: Prevents spam by caching recent failures
- **Dry Run Mode**: Test execution without real transactions

## Network Support

- **Sonic Mainnet**: Full Odos support
- **Sonic Testnet**: Limited (no Odos support)
- **Localhost**: For development and testing

## Deployment Checklist

1. ✅ Configure environment variables
2. ✅ Set appropriate minimum subsidy thresholds
3. ✅ Test with dry run mode first
4. ✅ Verify contract addresses are correct
5. ✅ Ensure sufficient gas tokens for operations
6. ✅ Set up Slack notifications
7. ✅ Monitor initial runs closely

## Troubleshooting

**Common Issues:**

- **"Invalid chain ID"**: Odos not supported on this network
- **"Flash loan capacity exceeded"**: Reduce percentage list or check flash lender
- **"Subsidy below minimum"**: Adjust minimum subsidy thresholds
- **Contract call failures**: Verify contract addresses and network connectivity

**Debug Mode:**
Set `LOG_LEVEL=debug` for detailed execution logs.

## Architecture Decisions

- **Standalone Design**: Bot is portable and doesn't depend on parent repo
- **TypeScript Runtime**: Uses ts-node for simpler deployment than compiled JS
- **Docker-First**: Designed for containerized production deployment
- **Minimal Interfaces**: Only includes necessary contract interfaces for smaller footprint
- **Error-First**: Comprehensive error handling and graceful failure recovery
