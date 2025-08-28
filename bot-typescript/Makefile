.PHONY: install build test test-coverage lint clean run docker.build docker.build.arm64 docker.build.amd64 docker.run docker.stop docker.logs

# Install dependencies
install:
	yarn install

# Build the project
build:
	yarn build

# Run tests
test:
	yarn test

# Run tests with coverage
test-coverage:
	yarn test --coverage

# Run linter
lint:
	@yarn tsc
	@yarn lint:fix

# Clean build artifacts
clean:
	rm -rf dist/

# Run the bot
run:
	yarn start

# Install dependencies and build
prepare: install build

# Run all checks
check: lint test

# Docker targets
docker.build:
	@echo "Building Docker image..."
	docker build -t dloop-rebalancer .

docker.build.amd64:
	@echo "Building Docker image for AMD64..."
	docker build --platform linux/amd64 -t dloop-rebalancer:amd64 .

docker.build.arm64:
	@echo "Building Docker image for ARM64..."
	docker build --platform linux/arm64 -t dloop-rebalancer:arm64 .

docker.run:
	@echo "Running Docker container..."
	@if [ -z "$$network" ]; then \
		echo "Error: network parameter is required. Use 'make docker.run network=mainnet' or 'make docker.run network=testnet'"; \
		exit 1; \
	fi; \
	if [ "$$network" = "mainnet" ]; then \
		export NETWORK=sonic_mainnet; \
	elif [ "$$network" = "testnet" ]; then \
		export NETWORK=sonic_testnet; \
	else \
		echo "Error: network must be 'mainnet' or 'testnet'"; \
		exit 1; \
	fi; \
	if [ ! -f .env ]; then \
		echo "Error: .env file not found. Please copy env-example.txt to .env and configure it."; \
		exit 1; \
	fi; \
	docker run --name dloop-rebalancer-bot -e NETWORK=$$NETWORK -v $$(pwd)/.env:/app/.env -v $$(pwd)/cache:/app/cache --rm dloop-rebalancer

docker.stop:
	@echo "Stopping Docker container..."
	docker stop dloop-rebalancer-bot || true
	docker rm dloop-rebalancer-bot || true

docker.logs:
	@echo "Showing Docker container logs..."
	docker logs -f dloop-rebalancer-bot

# Default target
all: prepare check

help:
	@echo "Available commands:"
	@echo "  make install              - Install dependencies"
	@echo "  make build                - Build the project"
	@echo "  make test                 - Run tests"
	@echo "  make test-coverage        - Run tests with coverage"
	@echo "  make lint                 - Run linter"
	@echo "  make clean                - Clean build artifacts"
	@echo "  make run                  - Run the bot"
	@echo "  make prepare              - Install dependencies and build"
	@echo "  make check                - Run all checks"
	@echo "  make all                  - Install dependencies, build, and run checks"
	@echo ""
	@echo "Docker commands:"
	@echo "  make docker.build         - Build Docker image"
	@echo "  make docker.build.amd64   - Build Docker image for AMD64"
	@echo "  make docker.build.arm64   - Build Docker image for ARM64"
	@echo "  make docker.run network=mainnet|testnet  - Run Docker container"
	@echo "  make docker.stop          - Stop Docker container"
	@echo "  make docker.logs          - Show Docker container logs"