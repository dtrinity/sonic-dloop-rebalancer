#!/bin/bash

# Docker entrypoint script for DLoop Rebalancer Bot

set -e

echo "Starting DLoop Rebalancer Bot..."
echo "Network: ${NETWORK:-localhost}"
echo "Core Address: ${DLOOP_CORE_ADDRESS}"
echo "Dry Run: ${DRY_RUN:-false}"

# Run the bot
exec yarn ts-node typescript/rebalance_bot/run.ts
