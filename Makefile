# DLoop Rebalancer Bot Makefile

.PHONY: help install compile test lint format docker.build docker.run clean

help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	yarn install

compile: ## Compile contracts and generate typechain types
	yarn hardhat compile

test: ## Run tests
	yarn hardhat test

lint: ## Lint TypeScript code
	@yarn eslint --fix typescript/**/*.ts test/*.ts

format: ## Format TypeScript code
	yarn format

docker.build: ## Build Docker image
	docker build --build-arg HOST_PWD=$(PWD) -t dloop-rebalancer:latest .

docker.run: ## Run bot in Docker container
	docker run --rm -it \
		--env-file .env \
		dloop-rebalancer:latest

docker.run.daemon: ## Run bot in Docker container as daemon
	docker run -d \
		--name dloop-rebalancer \
		--env-file .env \
		--restart unless-stopped \
		dloop-rebalancer:latest

docker.stop: ## Stop Docker daemon
	docker stop dloop-rebalancer || true
	docker rm dloop-rebalancer || true

clean: ## Clean build artifacts
	rm -rf artifacts/ cache/ typechain-types/ node_modules/ dist/

env-example: ## Create example environment file
	@echo "Creating example .env file..."
	@echo "# Network Selection" > .env.example
	@echo "NETWORK=localhost" >> .env.example
	@echo "" >> .env.example
	@echo "# Private key (required)" >> .env.example
	@echo "PRIVATE_KEY=" >> .env.example
	@echo "" >> .env.example
	@echo "# Optional: Dry run (must be 'true', 'false', or empty)" >> .env.example
	@echo "DRY_RUN=" >> .env.example
	@echo "" >> .env.example
	@echo "# Notifications" >> .env.example
	@echo "SLACK_TOKEN=" >> .env.example
	@echo "SLACK_CHANNEL=#dloop-rebalancer" >> .env.example
	@echo "LOG_LEVEL=info" >> .env.example
	@echo ".env.example file created. Copy to .env and edit with your actual values."
