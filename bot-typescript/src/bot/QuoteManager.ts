import {
  ONE_HUNDRED_PERCENT_BPS,
  PERCENTAGE_PRECISION,
} from "../config/constants";
import { BotConfig, RebalanceQuote } from "../config/types";
import { formatTokenAmountWithSymbol, getTokenMetadata } from "../common/erc20";
import { logger } from "../common/log";
import { ContractManager } from "./ContractManager";

export class QuoteManager {
  constructor(
    private readonly contracts: ContractManager,
    private readonly config: BotConfig,
  ) {}

  async getRebalanceQuote(): Promise<RebalanceQuote | null> {
    try {
      logger.debug("Getting rebalance quote from quoter contract");

      const [inputTokenAmount, estimatedOutputTokenAmount, direction] =
        await this.contracts.quoter.quoteRebalanceAmountToReachTargetLeverage(
          this.config.contracts.dloopCore,
        );

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
      const outputTokenAddress =
        quote.direction === 1
          ? await this.contracts.getDebtTokenAddress()
          : await this.contracts.getCollateralTokenAddress();
      const minSubsidyStr =
        this.config.policy.minSubsidyAmount[outputTokenAddress];

      if (!minSubsidyStr) {
        const outputTokenMetadata = await getTokenMetadata(
          this.contracts.provider,
          outputTokenAddress,
        );
        logger.warn(
          `No minimum subsidy configured for ${outputTokenMetadata.symbol}, allowing rebalance`,
        );
        return true;
      }

      const minSubsidy = BigInt(minSubsidyStr);
      const outputTokenMetadata = await getTokenMetadata(
        this.contracts.provider,
        outputTokenAddress,
      );

      logger.info("Subsidy check:", {
        estimatedSubsidy: formatTokenAmountWithSymbol(
          estSubsidy,
          outputTokenMetadata.decimals,
          outputTokenMetadata.symbol,
        ),
        minimumRequired: formatTokenAmountWithSymbol(
          minSubsidy,
          outputTokenMetadata.decimals,
          outputTokenMetadata.symbol,
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
      const outputTokenAddress =
        quote.direction === 1
          ? await this.contracts.getDebtTokenAddress()
          : await this.contracts.getCollateralTokenAddress();
      const minSubsidyStr =
        this.config.policy.minSubsidyAmount[outputTokenAddress];

      if (!minSubsidyStr) {
        const outputTokenMetadata = await getTokenMetadata(
          this.contracts.provider,
          outputTokenAddress,
        );
        logger.warn(
          `No minimum subsidy configured for ${outputTokenMetadata.symbol}, allowing trial`,
        );
        return true;
      }

      const minSubsidy = BigInt(minSubsidyStr);
      const outputTokenMetadata = await getTokenMetadata(
        this.contracts.provider,
        outputTokenAddress,
      );

      logger.debug("Trial subsidy check:", {
        percentage: `${(percentage * 100).toFixed(1)}%`,
        trialSubsidy: formatTokenAmountWithSymbol(
          trialSubsidy,
          outputTokenMetadata.decimals,
          outputTokenMetadata.symbol,
        ),
        minimumRequired: formatTokenAmountWithSymbol(
          minSubsidy,
          outputTokenMetadata.decimals,
          outputTokenMetadata.symbol,
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