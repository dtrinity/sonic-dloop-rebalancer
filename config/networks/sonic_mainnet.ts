import { BotConfig } from "../types";

export const sonicMainnetConfig: BotConfig = {
  network: {
    chainId: 146,
    rpcUrl: "https://rpc.soniclabs.com",
    privateKey: "",
  },
  contracts: {
    dloopCore: "",
    increaseOdos: "",
    decreaseOdos: "",
    odosRouter: "",
    flashLender: "",
  },
  tokens: {
    collateral: {
      address: "",
      decimals: 18,
      symbol: "WETH",
    },
    debt: {
      address: "",
      decimals: 18,
      symbol: "dUSD",
    },
  },
  policy: {
    rebalancePercentageList: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
    minSubsidyAmount: {
      // Default minimum subsidy amounts in token base units
      // These should be set via environment variables for specific tokens
    },
    maxTxRetriesPerTrial: 3,
    loopIntervalSec: 300, // 5 minutes
    dryRun: false,
  },
  notifications: {
    slack: process.env.SLACK_TOKEN
      ? {
          token: process.env.SLACK_TOKEN,
          channel: process.env.SLACK_CHANNEL || "",
        }
      : undefined,
    logLevel: (process.env.LOG_LEVEL as any) || "info",
  },
};
