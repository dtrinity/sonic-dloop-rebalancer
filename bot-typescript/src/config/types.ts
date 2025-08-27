export interface NetworkConfig {
  chainId: number;
  rpcUrl: string;
  privateKey?: string;
}

export interface ContractsConfig {
  dloopCore: string;
  increaseOdos: string;
  decreaseOdos: string;
  odosRouter: string;
  flashLender: string;
}

export interface TokenConfig {
  address: string;
  decimals: number;
  symbol: string;
}

export interface TokensConfig {
  collateral: TokenConfig;
  debt: TokenConfig;
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
  tokens: TokensConfig;
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
