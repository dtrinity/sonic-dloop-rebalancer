import { config } from "dotenv";
import { BotConfig } from "./types";
import { sonicMainnetConfig } from "./networks/sonic_mainnet";
import { sonicTestnetConfig } from "./networks/sonic_testnet";
import { localhostConfig } from "./networks/localhost";

// Load environment variables
config();

export function getConfig(): BotConfig {
  const network = process.env.NETWORK || "localhost";
  
  let baseConfig: BotConfig;
  
  switch (network) {
    case "sonic_mainnet":
      baseConfig = sonicMainnetConfig;
      break;
    case "sonic_testnet":
      baseConfig = sonicTestnetConfig;
      break;
    case "localhost":
      baseConfig = localhostConfig;
      break;
    default:
      throw new Error(`Unknown network: ${network}`);
  }

  // Override minSubsidyAmount from environment variables
  const minSubsidyCollateral = process.env.MIN_SUBSIDY_COLLATERAL;
  const minSubsidyDebt = process.env.MIN_SUBSIDY_DEBT;
  
  if (minSubsidyCollateral && baseConfig.tokens.collateral.address) {
    baseConfig.policy.minSubsidyAmount[baseConfig.tokens.collateral.address] = minSubsidyCollateral;
  }
  
  if (minSubsidyDebt && baseConfig.tokens.debt.address) {
    baseConfig.policy.minSubsidyAmount[baseConfig.tokens.debt.address] = minSubsidyDebt;
  }

  // Optional DRY_RUN override with strict validation (true/false or empty)
  const rawDryRun = process.env.DRY_RUN?.trim();
  if (rawDryRun !== undefined && rawDryRun !== "") {
    if (rawDryRun !== "true" && rawDryRun !== "false") {
      throw new Error("DRY_RUN must be either 'true', 'false', or empty");
    }
    baseConfig.policy.dryRun = rawDryRun === "true";
  }

  // Validate required configuration
  validateConfig(baseConfig);
  
  return baseConfig;
}

function validateConfig(config: BotConfig): void {
  if (!config.network.privateKey) {
    throw new Error("Config error: network.privateKey is required");
  }

  if (!config.contracts.dloopCore) {
    throw new Error("Config error: contracts.dloopCore is required");
  }

  if (!config.contracts.increaseOdos) {
    throw new Error("Config error: contracts.increaseOdos is required");
  }

  if (!config.contracts.decreaseOdos) {
    throw new Error("Config error: contracts.decreaseOdos is required");
  }

  if (!config.contracts.flashLender) {
    throw new Error("Config error: contracts.flashLender is required");
  }

  if (!config.tokens.collateral.address) {
    throw new Error("Config error: tokens.collateral.address is required");
  }

  if (!config.tokens.debt.address) {
    throw new Error("Config error: tokens.debt.address is required");
  }
}
