import axios, { AxiosInstance } from "axios";
import { ethers } from "ethers";
import { logger } from "../common/log";
import {
  DEFAULT_RETRY_ATTEMPTS,
  DEFAULT_HTTP_TIMEOUT_MS,
  RETRY_BASE_DELAY_MS,
  getHttpTimeoutMs
} from "../../config/constants";
import {
  AssembleRequest,
  AssembleResponse,
  QuoteRequest,
  QuoteResponse,
} from "./types";

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
        'Content-Type': 'application/json',
      },
    });
  }

  private async retryRequest<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = DEFAULT_RETRY_ATTEMPTS
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if error is retryable
        const isRetryable = axios.isAxiosError(error) && (
          !error.response ||
          error.response.status >= 500 ||
          error.response.status === 429 ||
          error.code === 'ETIMEDOUT' ||
          error.code === 'ECONNRESET' ||
          error.code === 'ENOTFOUND'
        );

        if (!isRetryable || attempt === maxRetries) {
          throw lastError;
        }

        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn(`${operationName} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms:`, {
          error: lastError.message,
          attempt
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error(`${operationName} failed after ${maxRetries} attempts`);
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
}
