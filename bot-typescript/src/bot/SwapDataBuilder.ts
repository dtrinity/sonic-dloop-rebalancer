import {
  getExactOutInputCapBps,
  getMaxPriceImpactBps,
  getSlippageLimitBps,
} from "../config/constants";
import { BotConfig, RebalanceQuote } from "../config/types";
import { formatTokenAmount, getTokenDecimals, getTokenSymbol, getTokenMetadata } from "../common/erc20";
import { logger } from "../common/log";
import { OdosClient } from "./OdosClient";
import { ContractManager } from "./ContractManager";

export class SwapDataBuilder {
  private odosClient: OdosClient;
  private collateralMetadata?: { decimals: number; symbol: string };
  private debtMetadata?: { decimals: number; symbol: string };

  constructor(
    private readonly contracts: ContractManager,
    private readonly config: BotConfig,
  ) {
    this.odosClient = new OdosClient(
      config.network.odosApiUrl,
      config.network.chainId,
    );
  }

  private async getCollateralMetadata() {
    if (!this.collateralMetadata) {
      this.collateralMetadata = await getTokenMetadata(
        this.contracts.provider,
        this.config.tokens.collateral.address,
      );
    }
    return this.collateralMetadata;
  }

  private async getDebtMetadata() {
    if (!this.debtMetadata) {
      this.debtMetadata = await getTokenMetadata(
        this.contracts.provider,
        this.config.tokens.debt.address,
      );
    }
    return this.debtMetadata;
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
        `Price impact too high: ${priceImpactBps / 100}% > ${maxPriceImpactBps / 100}%`,
      );
    }

    logger.debug("Price impact check passed:", {
      priceImpact: `${priceImpactBps / 100}%`,
      maxAllowed: `${maxPriceImpactBps / 100}%`,
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
    const collateralMetadata = await this.getCollateralMetadata();
    const collateralAmountOutFormatted = formatTokenAmount(
      collateralAmountOut,
      collateralMetadata.decimals,
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

    // Set a high input cap to ensure we have enough for exact-output
    const inputCapBps = getExactOutInputCapBps();
    const debtInputCap = (estimatedDebtInput * BigInt(inputCapBps)) / 10000n;
    const debtMetadata = await this.getDebtMetadata();
    const debtInputCapFormatted = formatTokenAmount(
      debtInputCap,
      debtMetadata.decimals,
    );

    logger.debug("Odos exact-output quote request for increase:", {
      inputToken: debtMetadata.symbol,
      inputCap: debtInputCapFormatted,
      inputCapPercent: `${inputCapBps / 100}%`,
      outputToken: collateralMetadata.symbol,
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
    const debtMetadata = await this.getDebtMetadata();
    const totalDebtNeededFormatted = formatTokenAmount(
      totalDebtNeeded,
      debtMetadata.decimals,
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

    // Set a high input cap to ensure we have enough for exact-output
    const inputCapBps = getExactOutInputCapBps();
    const collateralInputCap =
      (estimatedCollateralInput * BigInt(inputCapBps)) / 10000n;
    const collateralMetadata = await this.getCollateralMetadata();
    const collateralInputCapFormatted = formatTokenAmount(
      collateralInputCap,
      collateralMetadata.decimals,
    );

    logger.debug("Odos exact-output quote request for decrease:", {
      inputToken: collateralMetadata.symbol,
      inputCap: collateralInputCapFormatted,
      inputCapPercent: `${inputCapBps / 100}%`,
      outputToken: debtMetadata.symbol,
      exactOutputAmount: totalDebtNeededFormatted,
      flashFee: formatTokenAmount(flashFee, debtMetadata.decimals),
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