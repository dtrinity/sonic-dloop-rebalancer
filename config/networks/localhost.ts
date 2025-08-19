import { BotConfig } from "../types";

export const localhostConfig: BotConfig = {
  network: {
    chainId: 31337,
    rpcUrl: "http://127.0.0.1:8545",
    privateKey: process.env.PRIVATE_KEY || "",
  },
  contracts: {
    // Will be deployed in test
    dloopCore: "",
    increaseOdos: "",
    decreaseOdos: "",
    odosRouter: "", // Odos doesn't work on localhost
    flashLender: "",
  },
  tokens: {
    collateral: {
      address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH test address
      decimals: 18,
      symbol: "WETH",
    },
    debt: {
      address: "0xA0b86a33E6441986C3c3519E7E3C8BcBD5b8e000", // dUSD test address
      decimals: 18,
      symbol: "dUSD",
    },
  },
  policy: {
    rebalancePercentageList: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
    minSubsidyAmount: {
      // WETH: minimum 0.1 WETH for testing (in wei)
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2": "100000000000000000", // 0.1 WETH
      // dUSD: minimum 0.1 dUSD for testing (in wei)
      "0xA0b86a33E6441986C3c3519E7E3C8BcBD5b8e000": "100000000000000000", // 0.1 dUSD
    },
    maxTxRetriesPerTrial: 3,
    loopIntervalSec: 60, // 1 minute for testing
    dryRun: false,
  },
  notifications: {
    slack: process.env.SLACK_TOKEN
      ? {
          token: process.env.SLACK_TOKEN,
          channel: process.env.SLACK_CHANNEL || "",
        }
      : undefined,
    logLevel: (process.env.LOG_LEVEL as any) || "debug",
  },
};
