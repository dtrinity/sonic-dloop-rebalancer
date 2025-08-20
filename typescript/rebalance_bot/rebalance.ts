import {
  DEFAULT_TX_RETRY_ATTEMPTS,
  FLASH_LOAN_SAFETY_DIVISOR,
  PERCENTAGE_PRECISION,
  RETRY_BASE_DELAY_MS,
} from "../../config/constants";
import { BotConfig, RebalanceQuote, RebalanceResult } from "../../config/types";
import { formatTokenAmountWithSymbol } from "../common/erc20";
import { logger } from "../common/log";
import { ContractManager } from "./contracts";
import { NotificationManager } from "./notification";
import { QuoteManager } from "./quote";
import { SwapDataBuilder } from "./swapdata";

export class RebalanceManager {
  private quoteManager: QuoteManager;
  private swapDataBuilder: SwapDataBuilder;
  private notificationManager: NotificationManager;

  constructor(
    private readonly contracts: ContractManager,
    private readonly config: BotConfig,
  ) {
    this.quoteManager = new QuoteManager(contracts, config);
    this.swapDataBuilder = new SwapDataBuilder(contracts, config);
    this.notificationManager = new NotificationManager(config);
  }

  async executeRebalance(): Promise<void> {
    try {
      logger.info("Starting rebalance cycle");

      // Step 1: Get quote
      const quote = await this.quoteManager.getRebalanceQuote();

      if (!quote) {
        await this.notificationManager.notifySkipped("No rebalancing needed");
        return;
      }

      // Step 2: Check subsidy gate
      const subsidyOk = await this.quoteManager.checkSubsidyGate(quote);

      if (!subsidyOk) {
        await this.notificationManager.notifySkipped(
          "Subsidy below minimum threshold",
        );
        return;
      }

      // Step 3: Try rebalancing with fallback percentages
      const result = await this.executeRebalanceWithFallback(quote);

      if (result.success) {
        await this.notificationManager.notifyRebalanceSuccess(result);
      } else {
        await this.notificationManager.notifyError(
          "All rebalance trials failed",
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Rebalance cycle failed:", error);
      await this.notificationManager.notifyError(errorMessage);
    }
  }

  private async executeRebalanceWithFallback(
    quote: RebalanceQuote,
  ): Promise<RebalanceResult> {
    const userAddress = await this.contracts.getSignerAddress();

    for (
      let i = 0;
      i < this.config.policy.rebalancePercentageList.length;
      i++
    ) {
      const percentage = this.config.policy.rebalancePercentageList[i];
      const isLastTrial =
        i === this.config.policy.rebalancePercentageList.length - 1;

      try {
        const trialAmount = this.calculateTrialAmount(
          quote.inputTokenAmount,
          percentage,
        );

        if (trialAmount === 0n) {
          logger.debug(
            `Skipping ${(percentage * 100).toFixed(0)}% trial - input amount is 0`,
          );
          continue;
        }

        logger.info(
          `Trying rebalance with ${(percentage * 100).toFixed(0)}% of input amount`,
        );

        // Per-trial subsidy check
        const subsidyOk = await this.quoteManager.checkTrialSubsidyGate(
          quote,
          percentage,
        );

        if (!subsidyOk) {
          logger.debug(
            `Trial subsidy below threshold for ${(percentage * 100).toFixed(0)}% trial`,
          );
          continue;
        }

        // Pre-flight flash loan check
        if (!(await this.checkFlashLoanAvailability(quote, trialAmount))) {
          logger.warn(
            `Flash loan capacity exceeded for ${(percentage * 100).toFixed(0)}% trial`,
          );
          continue;
        }

        // Build swap data
        const swapData = await this.swapDataBuilder.buildSwapData(
          quote,
          trialAmount,
          userAddress,
        );

        // Execute the rebalance
        const result = await this.executeTrial(
          quote,
          trialAmount,
          swapData,
          percentage,
        );

        if (result.success) {
          return result;
        }

        // Trial failed, notify and continue to next percentage
        await this.notificationManager.notifyRebalanceFailure(
          quote.direction,
          percentage,
          result.error || "Unknown error",
          isLastTrial,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(`Trial ${(percentage * 100).toFixed(0)}% failed:`, error);

        await this.notificationManager.notifyRebalanceFailure(
          quote.direction,
          percentage,
          errorMessage,
          isLastTrial,
        );
      }
    }

    return {
      success: false,
      direction: quote.direction,
      percentage: 0,
      inputAmount: 0n,
      error: "All trials failed",
    };
  }

  private calculateTrialAmount(
    inputAmount: bigint,
    percentage: number,
  ): bigint {
    const scaledPercentage = BigInt(
      Math.round(percentage * Number(PERCENTAGE_PRECISION)),
    );
    return (inputAmount * scaledPercentage) / PERCENTAGE_PRECISION;
  }

  private async checkFlashLoanAvailability(
    quote: RebalanceQuote,
    trialAmount: bigint,
  ): Promise<boolean> {
    try {
      const debtTokenAddress = this.config.tokens.debt.address;
      let requiredFlashAmount: bigint;

      if (quote.direction === 1) {
        // Increase: estimate required flash in debt for trialInput collateral
        const collateralInBase =
          await this.contracts.core.convertFromTokenAmountToBaseCurrency(
            trialAmount,
            this.config.tokens.collateral.address,
          );
        requiredFlashAmount =
          await this.contracts.core.convertFromBaseCurrencyToToken(
            collateralInBase,
            debtTokenAddress,
          );
      } else {
        // Decrease: required flash equals trialInput debt
        requiredFlashAmount = trialAmount;
      }

      const maxFlashLoan =
        await this.contracts.flashLender.maxFlashLoan(debtTokenAddress);
      const maxAllowed = maxFlashLoan / FLASH_LOAN_SAFETY_DIVISOR;

      const available = requiredFlashAmount <= maxAllowed;

      if (!available) {
        logger.debug("Flash loan precheck failed:", {
          required: requiredFlashAmount.toString(),
          maxAllowed: maxAllowed.toString(),
        });
      }

      return available;
    } catch (error) {
      logger.error("Flash loan availability check failed:", {
        error: error instanceof Error ? error.message : String(error),
        quote: {
          direction: quote.direction,
          inputAmount: quote.inputTokenAmount.toString(),
        },
        trialAmount: trialAmount.toString(),
      });
      return false; // Fail safe: skip trial if precheck fails
    }
  }

  private async retryTransaction(
    operation: () => Promise<any>,
    operationName: string,
    maxRetries: number = DEFAULT_TX_RETRY_ATTEMPTS,
  ): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        const errorMessage = lastError.message.toLowerCase();
        const isRetryable =
          errorMessage.includes("nonce too low") ||
          errorMessage.includes("replacement transaction underpriced") ||
          errorMessage.includes("rate limit") ||
          errorMessage.includes("timeout") ||
          errorMessage.includes("network") ||
          errorMessage.includes("server error") ||
          errorMessage.includes("econnrefused") ||
          errorMessage.includes("connection refused");

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

  private async executeTrial(
    quote: RebalanceQuote,
    trialAmount: bigint,
    swapData: string,
    percentage: number,
  ): Promise<RebalanceResult> {
    if (this.config.policy.dryRun) {
      logger.info("DRY RUN: Would execute rebalance", {
        direction: quote.direction,
        percentage: (percentage * 100).toFixed(0) + "%",
        trialInput: trialAmount.toString(),
      });
      return {
        success: true,
        direction: quote.direction,
        percentage,
        inputAmount: trialAmount,
        txHash:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
      };
    }

    try {
      const maxRetries = this.config.policy.maxTxRetriesPerTrial;

      const tx = await this.retryTransaction(
        async () => {
          if (quote.direction === 1) {
            // Increase leverage
            logger.info("Executing increase leverage", {
              amount: formatTokenAmountWithSymbol(
                trialAmount,
                this.config.tokens.collateral.decimals,
                this.config.tokens.collateral.symbol,
              ),
            });

            return await this.contracts.increaseOdos.increaseLeverage(
              trialAmount,
              swapData,
              this.config.contracts.dloopCore,
            );
          } else {
            // Decrease leverage
            logger.info("Executing decrease leverage", {
              amount: formatTokenAmountWithSymbol(
                trialAmount,
                this.config.tokens.debt.decimals,
                this.config.tokens.debt.symbol,
              ),
            });

            return await this.contracts.decreaseOdos.decreaseLeverage(
              trialAmount,
              swapData,
              this.config.contracts.dloopCore,
            );
          }
        },
        `${quote.direction === 1 ? "increaseLeverage" : "decreaseLeverage"} transaction`,
        maxRetries,
      );

      const txHash: string = tx.hash ?? "";
      logger.info(`Transaction submitted: ${txHash}`);

      const receipt = await this.retryTransaction(
        async () => {
          const receipt = await tx.wait();

          if (!receipt) {
            throw new Error("Transaction receipt is null");
          }
          return receipt;
        },
        "transaction receipt",
        maxRetries,
      );

      // Check transaction status
      if (receipt.status !== 1) {
        throw new Error(`Transaction failed with status: ${receipt.status}`);
      }

      logger.info(`Transaction confirmed in block ${receipt.blockNumber}`);

      return {
        success: true,
        direction: quote.direction,
        percentage,
        inputAmount: trialAmount,
        txHash: receipt.hash ?? txHash,
        gasUsed: receipt.gasUsed,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        direction: quote.direction,
        percentage,
        inputAmount: trialAmount,
        error: errorMessage,
      };
    }
  }
}
