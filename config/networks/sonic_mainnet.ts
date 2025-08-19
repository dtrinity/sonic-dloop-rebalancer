import { BotConfig } from "../types";

export const sonicMainnetConfig: BotConfig = {
  network: {
    chainId: 146,
    rpcUrl: "https://rpc.soniclabs.com",
    privateKey: process.env.PRIVATE_KEY || "",
  },
  contracts: {
    dloopCore: "", // TODO: add mainnet address
    increaseOdos: "", // TODO: add mainnet address
    decreaseOdos: "", // TODO: add mainnet address
    odosRouter: "", // TODO: add mainnet address
    flashLender: "", // TODO: add mainnet address
  },
  tokens: {
    collateral: {
      address: "0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38", // WETH on Sonic Mainnet
      decimals: 18,
      symbol: "WETH",
    },
    debt: {
      address: "0x5B5Dc6B3d40E53fB9e4cFb6ae8e1A3f58C0a80F1", // dUSD on Sonic Mainnet
      decimals: 18,
      symbol: "dUSD",
    },
  },
  policy: {
    rebalancePercentageList: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
    minSubsidyAmount: {
      // WETH: minimum 0.001 WETH (in wei)
      "0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38": "1000000000000000", // 0.001 WETH
      // dUSD: minimum 1 dUSD (in wei)
      "0x5B5Dc6B3d40E53fB9e4cFb6ae8e1A3f58C0a80F1": "1000000000000000000", // 1 dUSD
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
