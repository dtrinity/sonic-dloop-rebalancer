import dotenv from "dotenv";

import {
  ContractsConfig,
  NetworkConfig,
  NotificationsConfig,
  PolicyConfig,
} from "../types";

dotenv.config();

// Sonic Mainnet Configuration
export const SONIC_MAINNET_CONFIG: {
  network: NetworkConfig;
  contracts: ContractsConfig;
  policy: PolicyConfig;
  notifications: NotificationsConfig;
} = {
  network: {
    rpcUrl: "https://rpc.soniclabs.com",
    odosApiUrl: "https://api.odos.xyz",
    chainId: 146,
    privateKey: process.env.PRIVATE_KEY || "<not_private_key>",
  },
  contracts: {
    dloopCore: "0x269dB736a71d2e95Eea88487A5a0b51E8E78BDdf",
    dloopQuoter: "0x3409736eEC8EBA0A4bec98cC01d521068090d03B",
    increaseOdos: "0xe037a89e974910a340BFE6948F30482eBe48153F",
    decreaseOdos: "0x43F925337078e84CFf83500724Db52449270977b",
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
