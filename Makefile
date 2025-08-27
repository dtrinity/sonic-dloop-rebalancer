.PHONY: help install build test lint clean compile deploy-contracts run docker.build.arm64 docker.build.amd64 docker.run

# Help target - shows available commands
help:
	@echo "Available commands:"
	@echo "  make install                          - Install dependencies for both sub-repos"
	@echo "  make build                            - Build both sub-repos"
	@echo "  make test                             - Run tests on both sub-repos"
	@echo "  make lint                             - Run linter on both sub-repos"
	@echo "  make clean                            - Clean build artifacts in both sub-repos"
	@echo "  make compile                          - Compile Solidity contracts"
	@echo "  make deploy-contracts.mainnet         - Deploy contracts to mainnet"
	@echo "  make deploy-contracts.testnet         - Deploy contracts to testnet"
	@echo "  make run.mainnet                      - Run TypeScript bot on mainnet"
	@echo "  make run.testnet                      - Run TypeScript bot on testnet"
	@echo "  make docker.build.arm64               - Build Docker image for ARM64"
	@echo "  make docker.build.amd64               - Build Docker image for AMD64"
	@echo "  make docker.run.mainnet               - Run Docker container on mainnet"
	@echo "  make docker.run.testnet               - Run Docker container on testnet"

# Install dependencies for both sub-repos
install:
	@echo "Installing dependencies for Solidity contracts..."
	cd bot-solidity-contracts && yarn install
	@echo "Installing dependencies for TypeScript bot..."
	cd bot-typescript && yarn install

# Build both sub-repos
build:
	@echo "Building Solidity contracts..."
	cd bot-solidity-contracts && make compile
	@echo "Building TypeScript bot..."
	cd bot-typescript && make build

# Run tests on both sub-repos
test:
	@echo "Running tests on Solidity contracts..."
	cd bot-solidity-contracts && yarn test
	@echo "Running tests on TypeScript bot..."
	cd bot-typescript && yarn test

# Run linter on both sub-repos
lint:
	@echo "Running linter on Solidity contracts..."
	cd bot-solidity-contracts && make lint
	@echo "Running linter on TypeScript bot..."
	cd bot-typescript && make lint

# Clean build artifacts in both sub-repos
clean:
	@echo "Cleaning build artifacts in Solidity contracts..."
	cd bot-solidity-contracts && make clean
	@echo "Cleaning build artifacts in TypeScript bot..."
	cd bot-typescript && make clean

# Compile Solidity contracts
compile:
	@echo "Compiling Solidity contracts..."
	cd bot-solidity-contracts && make compile

# Deploy contracts to mainnet
deploy-contracts.mainnet:
	@echo "Deploying contracts to mainnet..."
	cd bot-solidity-contracts && make deploy.mainnet

# Deploy contracts to testnet
deploy-contracts.testnet:
	@echo "Deploying contracts to testnet..."
	cd bot-solidity-contracts && make deploy.testnet

# Run TypeScript bot on mainnet
run.mainnet:
	@echo "Running TypeScript bot on mainnet..."
	cd bot-typescript && make run network=mainnet

# Run TypeScript bot on testnet
run.testnet:
	@echo "Running TypeScript bot on testnet..."
	cd bot-typescript && make run network=testnet

# Build Docker image for ARM64
docker.build.arm64:
	@echo "Building Docker image for ARM64..."
	cd bot-typescript && make docker.build.arm64

# Build Docker image for AMD64
docker.build.amd64:
	@echo "Building Docker image for AMD64..."
	cd bot-typescript && make docker.build.amd64

# Run Docker container on mainnet
docker.run.mainnet:
	@echo "Running Docker container on mainnet..."
	cd bot-typescript && make docker.run network=mainnet

# Run Docker container on testnet
docker.run.testnet:
	@echo "Running Docker container on testnet..."
	cd bot-typescript && make docker.run network=testnet

.DEFAULT_GOAL := help