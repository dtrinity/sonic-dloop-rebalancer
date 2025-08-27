.PHONY: install build test lint clean run

# Install dependencies
install:
	yarn install

# Build the project
build:
	yarn build

# Run tests
test:
	yarn test

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

# Default target
all: prepare check

help:
	@echo "Available commands:"
	@echo "  make install     - Install dependencies"
	@echo "  make build       - Build the project"
	@echo "  make test        - Run tests"
	@echo "  make lint        - Run linter"
	@echo "  make clean       - Clean build artifacts"
	@echo "  make run         - Run the bot"
	@echo "  make prepare     - Install dependencies and build"
	@echo "  make check       - Run all checks"
	@echo "  make all         - Install dependencies, build, and run checks"