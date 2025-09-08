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
        await this.contracts.getCollateralTokenAddress(),
      );
    }
    return this.collateralMetadata;
  }

  private async getDebtMetadata() {
    if (!this.debtMetadata) {
      this.debtMetadata = await getTokenMetadata(
        this.contracts.provider,
        await this.contracts.getDebtTokenAddress(),
      );
    }
    return this.debtMetadata;
  }

  async buildSwapData(
    quote: RebalanceQuote,
    trialRebalanceAmount: bigint,
    userAddress: string,
  ): Promise<string> {
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
        await this.contracts.getCollateralTokenAddress(),
      );
    const estimatedDebtInput =
      await this.contracts.core.convertFromBaseCurrencyToToken(
        collateralInBase,
        await this.contracts.getDebtTokenAddress(),
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
          tokenAddress: await this.contracts.getDebtTokenAddress(),
          amount: debtInputCap.toString(),
        },
      ],
      outputTokens: [
        {
          tokenAddress: await this.contracts.getCollateralTokenAddress(),
          proportion: 1,
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

    // Total debt needed = repay amount
    const totalDebtNeeded = debtAmountToRepay;
    const debtMetadata = await this.getDebtMetadata();
    const totalDebtNeededFormatted = formatTokenAmount(
      totalDebtNeeded,
      debtMetadata.decimals,
    );

    // Estimate required collateral input for the input cap
    const debtInBase =
      await this.contracts.core.convertFromTokenAmountToBaseCurrency(
        totalDebtNeeded,
        await this.contracts.getDebtTokenAddress(),
      );
    const estimatedCollateralInput =
      await this.contracts.core.convertFromBaseCurrencyToToken(
        debtInBase,
        await this.contracts.getCollateralTokenAddress(),
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
    });

    const quoteRequest = {
      chainId: this.config.network.chainId,
      inputTokens: [
        {
          tokenAddress: await this.contracts.getCollateralTokenAddress(),
          amount: collateralInputCap.toString(),
        },
      ],
      outputTokens: [
        {
          tokenAddress: await this.contracts.getDebtTokenAddress(),
          proportion: 1,
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