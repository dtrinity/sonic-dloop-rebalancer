#!/bin/bash

# CI test script for the DLoop Rebalancer bot
# This script runs all tests and checks for CI environments

set -e  # Exit on any error

echo "Running CI tests for DLoop Rebalancer bot..."

# Install dependencies
echo "Installing dependencies..."
make install

# Run linter
echo "Running linter..."
make lint

# Run tests with coverage
echo "Running tests with coverage..."
make test-coverage

# Build the project
echo "Building the project..."
make build

echo "All CI tests passed!"