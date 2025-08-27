export interface TokenInput {
  tokenAddress: string;
  amount: string;
}

export interface TokenOutput {
  tokenAddress: string;
  amount: string;
}

export interface QuoteRequest {
  chainId: number;
  inputTokens: TokenInput[];
  outputTokens: TokenOutput[];
  userAddr: string;
  slippageLimitPercent: number;
}

export interface QuoteResponse {
  pathId: string;
  inTokens: string[];
  inAmounts: string[];
  outTokens: string[];
  outAmounts: string[];
  priceImpact: number;
}

export interface AssembleRequest {
  userAddr: string;
  pathId: string;
  simulate?: boolean;
}

export interface TransactionData {
  to: string;
  data: string;
  value: string;
}

export interface SimulationResult {
  isSuccess: boolean;
  simulationError?: {
    type: string;
    errorMessage: string;
  };
}

export interface AssembleResponse {
  transaction: TransactionData;
  simulation: SimulationResult;
}