import axios, { AxiosInstance } from "axios";
import { ethers } from "ethers";

import {
  DEFAULT_RETRY_ATTEMPTS,
  getHttpTimeoutMs,
  RETRY_BASE_DELAY_MS,
} from "../config/constants";
import { logger } from "../common/log";
import {
  AssembleRequest,
  AssembleResponse,
  QuoteRequest,
  QuoteResponse,
} from "./types";
import { approveAllowanceIfNeeded } from "../common/erc20";

export class OdosClient {
  private readonly axiosInstance: AxiosInstance;

  /**
   * Create a new ODOS client instance
   *
   * @param baseUrl - Base URL for ODOS API
   * @param chainId - Optional chain ID to validate requests
   */
  constructor(
    private readonly baseUrl: string = "https://api.odos.xyz",
    private readonly chainId?: number,
  ) {
    this.axiosInstance = axios.create({
      baseURL: baseUrl,
      timeout: getHttpTimeoutMs(),
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  private async retryRequest<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = DEFAULT_RETRY_ATTEMPTS,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        const isRetryable =
          axios.isAxiosError(error) &&
          (!error.response ||
            error.response.status >= 500 ||
            error.response.status === 429 ||
            error.code === "ETIMEDOUT" ||
            error.code === "ECONNRESET" ||
            error.code === "ENOTFOUND");

        if (!isRetryable || attempt === maxRetries) {
          throw lastError;
        }

        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn(
          `${operationName} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms:`,
          {
            error: lastError.message,
            attempt,
          },
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw (
      lastError ||
      new Error(`${operationName} failed after ${maxRetries} attempts`)
    );
  }

  /**
   * Generate a quote for a swap through ODOS
   *
   * @param request Quote request parameters
   * @returns Quote response with pathId and output amounts
   */
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    // Validate chainId if provided
    if (this.chainId && request.chainId !== this.chainId) {
      throw new Error(
        `Chain ID mismatch. Expected ${this.chainId}, got ${request.chainId}`,
      );
    }

    return this.retryRequest(async () => {
      logger.debug("Requesting Odos quote:", request);
      const response = await this.axiosInstance.post<QuoteResponse>(
        "/sor/quote/v2",
        request,
      );

      if (
        !response.data ||
        !response.data.pathId ||
        !response.data.outTokens ||
        !response.data.outAmounts
      ) {
        throw new Error(
          "Invalid response from ODOS API: Missing required fields",
        );
      }

      logger.debug("Odos quote response:", response.data);
      return response.data;
    }, "Odos getQuote");
  }

  /**
   * Assemble a transaction for executing a swap
   *
   * @param request Assembly request parameters including pathId from quote
   * @returns Assembled transaction data ready for execution
   */
  async assembleTransaction(
    request: AssembleRequest,
  ): Promise<AssembleResponse> {
    return this.retryRequest(async () => {
      logger.debug("Assembling Odos transaction:", request);
      const response = await this.axiosInstance.post<AssembleResponse>(
        "/sor/assemble",
        request,
      );

      const data = response.data as any;

      // Safely check if simulation exists and is unsuccessful
      if (data?.simulation && !data.simulation.isSuccess) {
        const simulationError = data.simulation.simulationError;
        throw new Error(
          `Transaction simulation failed: ${simulationError?.type || "Unknown"} - ${simulationError?.errorMessage || "No error message"}`,
        );
      }

      logger.debug("Odos assemble response:", response.data);
      return response.data;
    }, "Odos assembleTransaction");
  }

  /**
   * Get assembled quote from Odos with required approvals
   *
   * @param odosRouter - The Odos router
   * @param signer - The signer
   * @param odosClient - The Odos client
   * @param quote - The quote
   * @param params - The parameters
   * @param params.chainId - The chain ID
   * @param params.liquidatorAccountAddress - The address of the liquidator
   * @param params.collateralTokenAddress - The address of the collateral token
   * @param receiverAddress - The address of the receiver
   * @returns The assembled quote
   */
  async getAssembledQuote(
    odosRouter: string,
    signer: ethers.Signer,
    odosClient: OdosClient,
    quote: QuoteResponse,
    params: {
      chainId: number;
      liquidatorAccountAddress: string;
      collateralTokenAddress: string;
    },
    receiverAddress: string,
  ): Promise<any> {
    await approveAllowanceIfNeeded(
      params.collateralTokenAddress,
      odosRouter,
      BigInt(quote.inAmounts[0]),
      signer,
    );

    const assembleRequest = {
      chainId: params.chainId,
      pathId: quote.pathId,
      userAddr: params.liquidatorAccountAddress,
      simulate: false,
      receiver: receiverAddress,
    };
    const assembled = await odosClient.assembleTransaction(assembleRequest);

    await approveAllowanceIfNeeded(
      params.collateralTokenAddress,
      receiverAddress,
      BigInt(quote.inAmounts[0]),
      signer,
    );

    return assembled;
  }

  /**
   * Helper method to format token amounts according to decimals
   *
   * @param amount Amount in human readable format
   * @param decimals Token decimals
   * @returns Amount formatted as string in token base units
   */
  static formatTokenAmount(amount: string | number, decimals: number): string {
    // Convert scientific notation or decimal to a fixed number
    const num = Number(amount);

    if (isNaN(num)) {
      throw new Error("Invalid amount provided");
    }
    // Use toFixed to get precise decimal representation
    const fixedAmount = num.toFixed(decimals);
    return ethers.parseUnits(fixedAmount, decimals).toString();
  }

  /**
   * Helper method to parse token amounts from base units
   *
   * @param amount Amount in base units
   * @param decimals Token decimals
   * @returns Amount in human readable format
   */
  static parseTokenAmount(amount: string, decimals: number): string {
    return ethers.formatUnits(amount, decimals);
  }

  /**
   * Calculate input amount based on desired output amount using token prices
   *
   * @param outputAmount Desired output amount in human readable format
   * @param inputTokenAddress Input token address
   * @param outputTokenAddress Output token address
   * @param chainId Chain ID for the tokens
   * @param slippagePercentage Percentage to increase input amount by (e.g., 0.1 for 0.1% increase)
   * @returns Calculated input amount in human readable format
   */
  async calculateInputAmount(
    outputAmount: string,
    inputTokenAddress: string,
    outputTokenAddress: string,
    chainId: number,
    slippagePercentage: number,
  ): Promise<string> {
    // Validate chainId if client was initialized with one
    if (this.chainId && chainId !== this.chainId) {
      throw new Error(
        `Chain ID mismatch. Expected ${this.chainId}, got ${chainId}`,
      );
    }

    try {
      // Get prices for both tokens
      const [inputPrice, outputPrice] = await Promise.all([
        this.getTokenPrice(chainId, inputTokenAddress),
        this.getTokenPrice(chainId, outputTokenAddress),
      ]);

      // Calculate input amount based on price ratio
      const outputAmountInUsd = Number(outputAmount) * outputPrice;
      const inputAmountInUsd = outputAmountInUsd / inputPrice;

      // Apply slippage percentage (e.g., 0.1% = 0.001)
      const slippageMultiplier = 1 + slippagePercentage / 100;
      const inputAmount = (inputAmountInUsd * slippageMultiplier).toString();
      return inputAmount;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(
          `Price calculation failed: ${error.response.data.message || error.message}`,
        );
      }
      throw error;
    }
  }

  /**
   * Get token price from ODOS API
   *
   * @param chainId Chain ID for the token
   * @param tokenAddress Token address
   * @returns Token price in USD
   */
  private async getTokenPrice(
    chainId: number,
    tokenAddress: string,
  ): Promise<number> {
    try {
      const response = await axios.get<{
        deprecated: string;
        currencyId: string;
        price: number;
      }>(`${this.baseUrl}/pricing/token/${chainId}/${tokenAddress}`);

      if (typeof response.data.price !== "number") {
        throw new Error("Invalid price data received from API");
      }

      return response.data.price;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(
          `Failed to get token price: ${error.response.data.message || error.message}`,
        );
      }
      throw error;
    }
  }
}