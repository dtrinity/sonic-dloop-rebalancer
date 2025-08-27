import {
  ContractsConfig,
  NetworkConfig,
  NotificationsConfig,
  PolicyConfig,
  TokensConfig,
} from "../types";

// Sonic Mainnet Configuration
export const SONIC_MAINNET_CONFIG: {
  network: NetworkConfig;
  contracts: ContractsConfig;
  tokens: TokensConfig;
  policy: PolicyConfig;
  notifications: NotificationsConfig;
} = {
  network: {
    rpcUrl: "https://rpc.soniclabs.com",
    odosApiUrl: "https://api.odos.xyz",
    chainId: 146,
    privateKey: "",
  },
  contracts: {
    dloopCore: "0x0000000000000000000000000000000000000000",
    increaseOdos: "0x0000000000000000000000000000000000000000",
    decreaseOdos: "0x0000000000000000000000000000000000000000",
    odosRouter: "0x0000000000000000000000000000000000000000",
    flashLender: "0x0000000000000000000000000000000000000000",
  },
  tokens: {
    collateral: {
      address: "0x0000000000000000000000000000000000000000",
    },
    debt: {
      address: "0x0000000000000000000000000000000000000000",
    },
  },
  policy: {
    rebalancePercentageList: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
    minSubsidyAmount: {},
    maxTxRetriesPerTrial: 3,
    loopIntervalSec: 60,
    dryRun: false,
  },
  notifications: {
    slack: undefined,
    logLevel: "info",
  },
};
