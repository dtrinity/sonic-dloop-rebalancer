import { BotConfig, RebalanceQuote } from "../../config/types";
import {
  getSlippageLimitBps,
  getMaxPriceImpactBps
} from "../../config/constants";
import { logger } from "../common/log";
import { formatTokenAmount } from "../common/erc20";
import { OdosClient } from "../odos/client";
import { ContractManager } from "./contracts";

export class SwapDataBuilder {
  private odosClient: OdosClient;

  constructor(
    private readonly contracts: ContractManager,
    private readonly config: BotConfig,
  ) {
    this.odosClient = new OdosClient(
      "https://api.odos.xyz",
      config.network.chainId,
    );
  }

  async buildSwapData(
    quote: RebalanceQuote,
    trialRebalanceAmount: bigint,
    userAddress: string,
  ): Promise<string> {
    if (!this.config.contracts.odosRouter) {
      throw new Error("Odos router not configured for this network");
    }

    try {
      if (quote.direction === 1) {
        // Increase leverage: swap debt -> collateral (exact out)
        return await this.buildIncreaseSwapData(
          trialRebalanceAmount,
          userAddress,
        );
      } else {
        // Decrease leverage: swap collateral -> debt (exact out, including flash fee)
        return await this.buildDecreaseSwapData(
          trialRebalanceAmount,
          userAddress,
        );
      }
    } catch (error) {
      logger.error("Failed to build swap data:", error);
      throw error;
    }
  }

  private validatePriceImpact(priceImpact: number): void {
    const maxPriceImpactBps = getMaxPriceImpactBps();
    const priceImpactBps = Math.abs(priceImpact) * 10000; // Convert to basis points

    if (priceImpactBps > maxPriceImpactBps) {
      throw new Error(
        `Price impact too high: ${priceImpactBps / 100}% > ${maxPriceImpactBps / 100}%`
      );
    }

    logger.debug("Price impact check passed:", {
      priceImpact: `${priceImpactBps / 100}%`,
      maxAllowed: `${maxPriceImpactBps / 100}%`
    });
  }

  private async buildIncreaseSwapData(
    collateralAmountOut: bigint,
    userAddress: string,
  ): Promise<string> {
    logger.debug("Building increase leverage swap data", {
      collateralAmountOut: collateralAmountOut.toString(),
    });

    // For increase: we need exact collateral out, spending debt tokens
    const collateralAmountOutFormatted = formatTokenAmount(
      collateralAmountOut,
      this.config.tokens.collateral.decimals,
    );

    // Estimate required debt input for the high input cap
    const collateralInBase =
      await this.contracts.core.convertFromTokenAmountToBaseCurrency(
        collateralAmountOut,
        this.config.tokens.collateral.address,
      );
    const estimatedDebtInput =
      await this.contracts.core.convertFromBaseCurrencyToToken(
        collateralInBase,
        this.config.tokens.debt.address,
      );

    // Set a high input cap (150% of estimated) to ensure we have enough for exact-output
    const debtInputCap = (estimatedDebtInput * 150n) / 100n;
    const debtInputCapFormatted = formatTokenAmount(
      debtInputCap,
      this.config.tokens.debt.decimals,
    );

    logger.debug("Odos exact-output quote request for increase:", {
      inputToken: this.config.tokens.debt.symbol,
      inputCap: debtInputCapFormatted,
      outputToken: this.config.tokens.collateral.symbol,
      exactOutputAmount: collateralAmountOutFormatted,
    });

    const quoteRequest = {
      chainId: this.config.network.chainId,
      inputTokens: [
        {
          tokenAddress: this.config.tokens.debt.address,
          amount: debtInputCap.toString(),
        },
      ],
      outputTokens: [
        {
          tokenAddress: this.config.tokens.collateral.address,
          amount: collateralAmountOut.toString(), // Exact output amount
        },
      ],
      userAddr: userAddress,
      slippageLimitPercent: getSlippageLimitBps() / 100, // Convert basis points to percentage
    };

    const quote = await this.odosClient.getQuote(quoteRequest);

    // Validate price impact
    this.validatePriceImpact(quote.priceImpact);

    const assembleRequest = {
      userAddr: userAddress,
      pathId: quote.pathId,
      simulate: true,
    };

    const assembly = await this.odosClient.assembleTransaction(assembleRequest);

    return assembly.transaction.data;
  }

  private async buildDecreaseSwapData(
    debtAmountToRepay: bigint,
    userAddress: string,
  ): Promise<string> {
    logger.debug("Building decrease leverage swap data", {
      debtAmountToRepay: debtAmountToRepay.toString(),
    });

    // Calculate flash loan fee
    const flashFee = await this.contracts.flashLender.flashFee(
      this.config.tokens.debt.address,
      debtAmountToRepay,
    );

    // Total debt needed = repay amount + flash fee
    const totalDebtNeeded = debtAmountToRepay + flashFee;
    const totalDebtNeededFormatted = formatTokenAmount(
      totalDebtNeeded,
      this.config.tokens.debt.decimals,
    );

    // Estimate required collateral input for the input cap
    const debtInBase =
      await this.contracts.core.convertFromTokenAmountToBaseCurrency(
        totalDebtNeeded,
        this.config.tokens.debt.address,
      );
    const estimatedCollateralInput =
      await this.contracts.core.convertFromBaseCurrencyToToken(
        debtInBase,
        this.config.tokens.collateral.address,
      );

    // Set a high input cap (150% of estimated) to ensure we have enough for exact-output
    const collateralInputCap = (estimatedCollateralInput * 150n) / 100n;
    const collateralInputCapFormatted = formatTokenAmount(
      collateralInputCap,
      this.config.tokens.collateral.decimals,
    );

    logger.debug("Odos exact-output quote request for decrease:", {
      inputToken: this.config.tokens.collateral.symbol,
      inputCap: collateralInputCapFormatted,
      outputToken: this.config.tokens.debt.symbol,
      exactOutputAmount: totalDebtNeededFormatted,
      flashFee: formatTokenAmount(flashFee, this.config.tokens.debt.decimals),
    });

    const quoteRequest = {
      chainId: this.config.network.chainId,
      inputTokens: [
        {
          tokenAddress: this.config.tokens.collateral.address,
          amount: collateralInputCap.toString(),
        },
      ],
      outputTokens: [
        {
          tokenAddress: this.config.tokens.debt.address,
          amount: totalDebtNeeded.toString(), // Exact output amount
        },
      ],
      userAddr: userAddress,
      slippageLimitPercent: getSlippageLimitBps() / 100, // Convert basis points to percentage
    };

    const quote = await this.odosClient.getQuote(quoteRequest);

    // Validate price impact
    this.validatePriceImpact(quote.priceImpact);

    const assembleRequest = {
      userAddr: userAddress,
      pathId: quote.pathId,
      simulate: true,
    };

    const assembly = await this.odosClient.assembleTransaction(assembleRequest);

    return assembly.transaction.data;
  }
}
