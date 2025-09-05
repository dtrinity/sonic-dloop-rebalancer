import {
  ContractsConfig,
  NetworkConfig,
  NotificationsConfig,
  PolicyConfig,
} from "../types";

// Sonic Testnet Configuration
export const SONIC_TESTNET_CONFIG: {
  network: NetworkConfig;
  contracts: ContractsConfig;
  policy: PolicyConfig;
  notifications: NotificationsConfig;
} = {
  network: {
    rpcUrl: "https://rpc.sonic.fantom.network",
    odosApiUrl: "https://api.odos.xyz",
    chainId: 1946,
    privateKey: "",
  },
  contracts: {
    dloopCore: "0x0000000000000000000000000000000000000000",
    dloopQuoter: "0x0000000000000000000000000000000000000000",
    increaseOdos: "0x0000000000000000000000000000000000000000",
    decreaseOdos: "0x0000000000000000000000000000000000000000",
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
