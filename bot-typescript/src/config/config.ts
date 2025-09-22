import { SONIC_MAINNET_CONFIG } from "./networks/sonic_mainnet";
import { SONIC_TESTNET_CONFIG } from "./networks/sonic_testnet";
import { BotConfig } from "./types";

/**
 * Load configuration based on the specified network
 *
 * @returns Bot configuration
 */
export function getConfig(): BotConfig {
  const network = process.env.NETWORK;

  if (!network) {
    throw new Error("NETWORK environment variable is not set");
  }

  switch (network) {
    case "sonic_mainnet":
      return SONIC_MAINNET_CONFIG;

    case "sonic_testnet":
      return SONIC_TESTNET_CONFIG;
    default:
      throw new Error(`Unsupported network: ${network}`);
  }
}
