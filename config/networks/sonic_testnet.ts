import { BotConfig } from "../types";

export const sonicTestnetConfig: BotConfig = {
  network: {
    chainId: 57054,
    rpcUrl: "https://rpc.testnet.soniclabs.com",
    privateKey: "",
  },
  contracts: {
    dloopCore: "",
    increaseOdos: "",
    decreaseOdos: "",
    odosRouter: "", // Odos doesn't work on sonic testnet
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
    minSubsidyAmount: {},
    maxTxRetriesPerTrial: 3,
    loopIntervalSec: 300,
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
