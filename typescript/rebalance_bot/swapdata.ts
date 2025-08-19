import { BotConfig, RebalanceQuote } from "../../config/types";
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

    // Estimate required debt input (with buffer for slippage)
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

    // Add 5% buffer for slippage
    const debtInputWithBuffer = (estimatedDebtInput * 105n) / 100n;
    const debtInputFormatted = formatTokenAmount(
      debtInputWithBuffer,
      this.config.tokens.debt.decimals,
    );

    logger.debug("Odos quote request for increase:", {
      inputToken: this.config.tokens.debt.symbol,
      inputAmount: debtInputFormatted,
      outputToken: this.config.tokens.collateral.symbol,
      outputAmount: collateralAmountOutFormatted,
    });

    const quoteRequest = {
      chainId: this.config.network.chainId,
      inputTokens: [
        {
          tokenAddress: this.config.tokens.debt.address,
          amount: debtInputWithBuffer.toString(),
        },
      ],
      outputTokens: [
        {
          tokenAddress: this.config.tokens.collateral.address,
          proportion: 1,
        },
      ],
      userAddr: userAddress,
      slippageLimitPercent: 1, // 1% slippage limit
    };

    const quote = await this.odosClient.getQuote(quoteRequest);

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

    // Estimate required collateral input (with buffer)
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

    // Add 5% buffer for slippage
    const collateralInputWithBuffer = (estimatedCollateralInput * 105n) / 100n;
    const collateralInputFormatted = formatTokenAmount(
      collateralInputWithBuffer,
      this.config.tokens.collateral.decimals,
    );

    logger.debug("Odos quote request for decrease:", {
      inputToken: this.config.tokens.collateral.symbol,
      inputAmount: collateralInputFormatted,
      outputToken: this.config.tokens.debt.symbol,
      outputAmount: totalDebtNeededFormatted,
      flashFee: formatTokenAmount(flashFee, this.config.tokens.debt.decimals),
    });

    const quoteRequest = {
      chainId: this.config.network.chainId,
      inputTokens: [
        {
          tokenAddress: this.config.tokens.collateral.address,
          amount: collateralInputWithBuffer.toString(),
        },
      ],
      outputTokens: [
        {
          tokenAddress: this.config.tokens.debt.address,
          proportion: 1,
        },
      ],
      userAddr: userAddress,
      slippageLimitPercent: 1, // 1% slippage limit
    };

    const quote = await this.odosClient.getQuote(quoteRequest);

    const assembleRequest = {
      userAddr: userAddress,
      pathId: quote.pathId,
      simulate: true,
    };

    const assembly = await this.odosClient.assembleTransaction(assembleRequest);

    return assembly.transaction.data;
  }
}
