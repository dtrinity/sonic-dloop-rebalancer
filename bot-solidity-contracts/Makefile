# Make 'help' the default target
.DEFAULT_GOAL := help

help:
	@echo "Available commands:"
	@echo "  make compile     - Compile the contracts"
	@echo "  make test        - Run tests"
	@echo "  make lint        - Run linters"
	@echo "  make clean       - Clean build artifacts"

compile:
	@echo "Compiling contracts..."
	@yarn hardhat compile

test:
	@echo "Running tests..."
	@yarn hardhat test

lint:
	@echo "Running linters..."
	@yarn prettier --write --plugin=prettier-plugin-solidity 'contracts/**/*.sol'
	@yarn solhint "contracts/**/*.sol"

clean:
	@echo "Cleaning build artifacts..."
	@rm -rf typechain-types
	@rm -rf artifacts
	@rm -rf cache
	@echo "Cleaned solidity cache and artifacts. Remember to recompile."

.PHONY: help compile test lint clean