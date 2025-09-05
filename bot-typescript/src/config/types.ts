export interface NetworkConfig {
  rpcUrl: string;
  odosApiUrl: string;
  chainId: number;
  privateKey?: string;
}

export interface ContractsConfig {
  dloopCore: string;
  dloopQuoter: string;
  increaseOdos: string;
  decreaseOdos: string;
}

export interface TokenConfig {
  address: string;
}

export interface PolicyConfig {
  rebalancePercentageList: number[];
  minSubsidyAmount: { [tokenAddress: string]: string };
  maxTxRetriesPerTrial: number;
  loopIntervalSec: number;
  dryRun?: boolean;
}

export interface NotificationsConfig {
  slack?: {
    token: string;
    channel: string;
  };
  logLevel: "debug" | "info" | "warn" | "error";
}

export interface BotConfig {
  network: NetworkConfig;
  contracts: ContractsConfig;
  policy: PolicyConfig;
  notifications: NotificationsConfig;
}

export interface RebalanceQuote {
  inputTokenAmount: bigint;
  estimatedOutputTokenAmount: bigint;
  direction: number; // -1, 0, 1
}

export interface RebalanceResult {
  success: boolean;
  direction: number;
  percentage: number;
  inputAmount: bigint;
  outputAmount?: bigint;
  txHash?: string;
  gasUsed?: bigint;
  error?: string;
}
