export interface QuoteRequest {
  chainId: number;
  inputTokens: Array<{
    tokenAddress: string;
    amount: string;
  }>;
  outputTokens: Array<{
    tokenAddress: string;
    proportion: number;
  }>;
  userAddr: string;
  slippageLimitPercent: number;
  sourceBlacklist?: string[];
  sourceWhitelist?: string[];
}

export interface QuoteResponse {
  inTokens: string[];
  outTokens: string[];
  inAmounts: string[];
  outAmounts: string[];
  gasEstimate: number;
  dataGasEstimate: number;
  gweiPerGas: number;
  gasEstimateValue: number;
  inValues: number[];
  outValues: number[];
  netOutValue: number;
  priceImpact: number;
  percentDiff: number;
  partnerFeePercent: number;
  pathId: string;
  pathViz?: any;
  blockNumber?: number;
}

export interface AssembleRequest {
  userAddr: string;
  pathId: string;
  simulate?: boolean;
}

export interface AssembleResponse {
  deprecated?: any;
  blockNumber?: number;
  gasEstimate: number;
  gasEstimateValue: number;
  inputTokens: Array<{
    tokenAddress: string;
    amountDeducted: string;
  }>;
  outputTokens: Array<{
    tokenAddress: string;
    amountReceived: string;
  }>;
  netOutValue: number;
  outValues: number[];
  transaction: {
    gas: number;
    gasPrice: number;
    value: string;
    to: string;
    from: string;
    data: string;
    nonce: number;
  };
  simulation?: {
    isSuccess: boolean;
    amountsOut: number[];
    gasUsed: number;
    simulationError?: {
      type: string;
      errorMessage: string;
    };
  };
}
