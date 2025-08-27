# DLoop Rebalancer Bot - Testing

This directory contains comprehensive tests for the DLoop Rebalancer bot implementation.

## Test Structure

- `RebalanceManager.test.ts` - Tests for the core rebalancing logic
- `QuoteManager.test.ts` - Tests for quote management and subsidy checks
- `SwapDataBuilder.test.ts` - Tests for swap data construction with Odos
- `ContractManager.test.ts` - Tests for contract instance management
- `OdosClient.test.ts` - Tests for the Odos API client
- `bot-logic.test.ts` - High-level bot logic tests
- `integration.test.ts` - Integration tests for the complete flow

## Running Tests

```bash
# Run all tests
yarn test

# Run tests with coverage
yarn test --coverage

# Run specific test file
yarn test test/RebalanceManager.test.ts
```

## CI Testing

For CI environments, use the provided script:

```bash
./scripts/ci-test.sh
```

This script will:
1. Install dependencies
2. Run linter
3. Run tests with coverage
4. Build the project

## Test Coverage

Current test coverage is tracked and reported with each test run. The goal is to maintain high coverage for critical bot logic while ensuring all edge cases are handled properly.