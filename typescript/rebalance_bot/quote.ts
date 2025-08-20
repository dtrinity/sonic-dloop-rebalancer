import {
  ONE_HUNDRED_PERCENT_BPS,
  PERCENTAGE_PRECISION,
} from "../../config/constants";
import { BotConfig, RebalanceQuote } from "../../config/types";
import { formatTokenAmountWithSymbol } from "../common/erc20";
import { logger } from "../common/log";
import { ContractManager } from "./contracts";

export class QuoteManager {
  constructor(
    private readonly contracts: ContractManager,
    private readonly config: BotConfig,
  ) {}

  async getRebalanceQuote(): Promise<RebalanceQuote | null> {
    try {
      logger.debug("Getting rebalance quote from core contract");

      const [inputTokenAmount, estimatedOutputTokenAmount, direction] =
        await this.contracts.core.quoteRebalanceAmountToReachTargetLeverage();

      logger.debug("Quote result:", {
        inputTokenAmount: inputTokenAmount.toString(),
        estimatedOutputTokenAmount: estimatedOutputTokenAmount.toString(),
        direction,
      });

      if (direction === 0 || inputTokenAmount === 0n) {
        logger.info("No rebalancing needed (direction=0 or input=0)");
        return null;
      }

      return {
        inputTokenAmount,
        estimatedOutputTokenAmount,
        direction,
      };
    } catch (error) {
      logger.error("Failed to get rebalance quote:", error);
      throw error;
    }
  }

  async checkSubsidyGate(quote: RebalanceQuote): Promise<boolean> {
    try {
      const subsidyBps = await this.contracts.core.getCurrentSubsidyBps();
      const estSubsidy =
        (quote.estimatedOutputTokenAmount * subsidyBps) /
        BigInt(ONE_HUNDRED_PERCENT_BPS);

      // Determine output token based on direction
      const outputToken =
        quote.direction === 1
          ? this.config.tokens.debt
          : this.config.tokens.collateral;
      const minSubsidyStr =
        this.config.policy.minSubsidyAmount[outputToken.address];

      if (!minSubsidyStr) {
        logger.warn(
          `No minimum subsidy configured for ${outputToken.symbol}, allowing rebalance`,
        );
        return true;
      }

      const minSubsidy = BigInt(minSubsidyStr);

      logger.info("Subsidy check:", {
        estimatedSubsidy: formatTokenAmountWithSymbol(
          estSubsidy,
          outputToken.decimals,
          outputToken.symbol,
        ),
        minimumRequired: formatTokenAmountWithSymbol(
          minSubsidy,
          outputToken.decimals,
          outputToken.symbol,
        ),
        subsidyBps: subsidyBps.toString(),
      });

      if (estSubsidy < minSubsidy) {
        logger.info("Subsidy below minimum threshold, skipping rebalance");
        return false;
      }

      return true;
    } catch (error) {
      logger.error("Failed to check subsidy gate:", error);
      throw error;
    }
  }

  async checkTrialSubsidyGate(
    quote: RebalanceQuote,
    percentage: number,
  ): Promise<boolean> {
    try {
      const subsidyBps = await this.contracts.core.getCurrentSubsidyBps();

      // Calculate trial output amount using the same precision as trial selection
      const scaledPercentage = BigInt(
        Math.round(percentage * Number(PERCENTAGE_PRECISION)),
      );
      const trialEstimatedOutput =
        (quote.estimatedOutputTokenAmount * scaledPercentage) /
        PERCENTAGE_PRECISION;

      const trialSubsidy =
        (trialEstimatedOutput * subsidyBps) / BigInt(ONE_HUNDRED_PERCENT_BPS);

      // Determine output token based on direction
      const outputToken =
        quote.direction === 1
          ? this.config.tokens.debt
          : this.config.tokens.collateral;
      const minSubsidyStr =
        this.config.policy.minSubsidyAmount[outputToken.address];

      if (!minSubsidyStr) {
        logger.warn(
          `No minimum subsidy configured for ${outputToken.symbol}, allowing trial`,
        );
        return true;
      }

      const minSubsidy = BigInt(minSubsidyStr);

      logger.debug("Trial subsidy check:", {
        percentage: `${(percentage * 100).toFixed(1)}%`,
        trialSubsidy: formatTokenAmountWithSymbol(
          trialSubsidy,
          outputToken.decimals,
          outputToken.symbol,
        ),
        minimumRequired: formatTokenAmountWithSymbol(
          minSubsidy,
          outputToken.decimals,
          outputToken.symbol,
        ),
        subsidyBps: subsidyBps.toString(),
      });

      if (trialSubsidy < minSubsidy) {
        logger.debug(
          `Trial subsidy below minimum threshold for ${(percentage * 100).toFixed(1)}%`,
        );
        return false;
      }

      return true;
    } catch (error) {
      logger.error("Failed to check trial subsidy gate:", error);
      throw error;
    }
  }
}
