import dotenv from "dotenv";

import { SONIC_MAINNET_CONFIG } from "./networks/sonic_mainnet";
import { SONIC_TESTNET_CONFIG } from "./networks/sonic_testnet";
import { BotConfig } from "./types";

dotenv.config();

/**
 * Load configuration based on the specified network
 *
 * @param network Network name (sonic_mainnet, sonic_testnet, etc.)
 * @returns Bot configuration
 */
export function getConfig(network?: string): BotConfig {
  const networkName = network || process.env.NETWORK || "sonic_testnet";

  // Parse rebalance percentage list
  const rebalancePercentageListStr =
    process.env.REBALANCE_PERCENTAGE_LIST ||
    "1.0,0.9,0.8,0.7,0.6,0.5,0.4,0.3,0.2,0.1";
  const rebalancePercentageList = rebalancePercentageListStr
    .split(",")
    .map((p) => parseFloat(p.trim()))
    .filter((p) => !isNaN(p));

  // Parse minimum subsidy amounts
  const minSubsidyAmount: { [tokenAddress: string]: string } = {};

  if (process.env.MIN_SUBSIDY_COLLATERAL_TOKEN) {
    minSubsidyAmount[process.env.COLLATERAL_TOKEN_ADDRESS || ""] =
      process.env.MIN_SUBSIDY_COLLATERAL_TOKEN;
  }

  if (process.env.MIN_SUBSIDY_DEBT_TOKEN) {
    minSubsidyAmount[process.env.DEBT_TOKEN_ADDRESS || ""] =
      process.env.MIN_SUBSIDY_DEBT_TOKEN;
  }

  // Parse transaction retry configuration
  const maxTxRetriesPerTrial = parseInt(
    process.env.MAX_TX_RETRIES_PER_TRIAL || "3",
    10,
  );

  // Parse loop interval
  const loopIntervalSec = parseInt(process.env.LOOP_INTERVAL_SEC || "60", 10);

  // Parse dry run mode
  const dryRun = process.env.DRY_RUN === "true";

  switch (networkName) {
    case "sonic_mainnet":
      return {
        network: SONIC_MAINNET_CONFIG.network,
        contracts: SONIC_MAINNET_CONFIG.contracts,
        tokens: SONIC_MAINNET_CONFIG.tokens,
        policy: {
          rebalancePercentageList,
          minSubsidyAmount,
          maxTxRetriesPerTrial,
          loopIntervalSec,
          dryRun,
        },
        notifications: {
          slack:
            process.env.SLACK_TOKEN && process.env.SLACK_CHANNEL
              ? {
                  token: process.env.SLACK_TOKEN,
                  channel: process.env.SLACK_CHANNEL,
                }
              : undefined,
          logLevel:
            (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error") ||
            "info",
        },
      };

    case "sonic_testnet":
    default:
      return {
        network: SONIC_TESTNET_CONFIG.network,
        contracts: SONIC_TESTNET_CONFIG.contracts,
        tokens: SONIC_TESTNET_CONFIG.tokens,
        policy: {
          rebalancePercentageList,
          minSubsidyAmount,
          maxTxRetriesPerTrial,
          loopIntervalSec,
          dryRun,
        },
        notifications: {
          slack:
            process.env.SLACK_TOKEN && process.env.SLACK_CHANNEL
              ? {
                  token: process.env.SLACK_TOKEN,
                  channel: process.env.SLACK_CHANNEL,
                }
              : undefined,
          logLevel:
            (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error") ||
            "info",
        },
      };
  }
}
