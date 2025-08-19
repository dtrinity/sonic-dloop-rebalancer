import { BotConfig } from "../types";

export const sonicTestnetConfig: BotConfig = {
  network: {
    chainId: 57054,
    rpcUrl: "https://rpc.testnet.soniclabs.com",
    privateKey: process.env.PRIVATE_KEY || "",
  },
  contracts: {
    dloopCore: "", // TODO: add testnet address
    increaseOdos: "", // TODO: add testnet address
    decreaseOdos: "", // TODO: add testnet address
    odosRouter: "", // Odos doesn't work on sonic testnet
    flashLender: "", // TODO: add testnet address
  },
  tokens: {
    collateral: {
      address: "0x4200000000000000000000000000000000000006", // WETH on Sonic Testnet
      decimals: 18,
      symbol: "WETH",
    },
    debt: {
      address: "0x8b5DeF00e69CdBdB6f2C13b6c6ad73de7A6AdF80", // dUSD on Sonic Testnet
      decimals: 18,
      symbol: "dUSD",
    },
  },
  policy: {
    rebalancePercentageList: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
    minSubsidyAmount: {
      // WETH: minimum 0.001 WETH (in wei) - lower for testnet
      "0x4200000000000000000000000000000000000006": "500000000000000", // 0.0005 WETH
      // dUSD: minimum 0.5 dUSD (in wei) - lower for testnet
      "0x8b5DeF00e69CdBdB6f2C13b6c6ad73de7A6AdF80": "500000000000000000", // 0.5 dUSD
    },
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
