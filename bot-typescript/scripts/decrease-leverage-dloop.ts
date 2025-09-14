import { ethers } from "ethers";
import { ContractManager } from "../src/bot/ContractManager";
import { OdosClient } from "../src/bot/OdosClient";
import { getTokenDecimals, getTokenSymbol, formatTokenAmountWithSymbol } from "../src/common/erc20";
import { logger } from "../src/common/log";
import { ONE_PERCENT_BPS } from "../src/config/constants";
import { getConfig } from "../src/config/config";

interface DecreaseLeverageParams {
  targetMinDeviationBps: string; // Target minimum deviation in basis points
  slippageBps: bigint; // Slippage tolerance in basis points (e.g., 50 for 0.5%)
}


/**
 * Decrease leverage via decreaseLeverageContract.decreaseLeverage() and check position
 */
async function decreaseLeverageAndCheckPosition(params: DecreaseLeverageParams): Promise<void> {
  const { targetMinDeviationBps, slippageBps } = params;

  try {
    const config = getConfig();

    // Initialize contract manager
    const contractManager = await ContractManager.create(config);

    // Get signer address
    const signerAddress = await contractManager.getSignerAddress();

    logger.info("Starting decrease leverage process", {
      signer: signerAddress,
      targetMinDeviationBps,
      slippageBps,
    });

    // Step 1: Check and set minDeviationBps if needed
    const currentMinDeviationBps = await contractManager.core.minDeviationBps();
    const targetMinDeviationBpsBigInt = ethers.parseUnits(targetMinDeviationBps, 0); // Already in bps

    logger.info("Checking minDeviationBps", {
      current: currentMinDeviationBps.toString(),
      target: targetMinDeviationBpsBigInt.toString(),
    });

    if (currentMinDeviationBps !== targetMinDeviationBpsBigInt) {
      logger.info("Setting minDeviationBps to target value");
      const setMinDeviationTx = await contractManager.core.setMinDeviationBps(targetMinDeviationBpsBigInt);
      logger.info("setMinDeviationBps transaction submitted", {
        txHash: setMinDeviationTx.hash,
      });
      await setMinDeviationTx.wait(3);
      logger.info("minDeviationBps updated successfully");
    } else {
      logger.info("minDeviationBps already matches target value");
    }

    // Step 2: Fetch and print current leverage
    const currentLeverageBps = await contractManager.core.getCurrentLeverageBps();
    const targetLeverageBps = await contractManager.core.targetLeverageBps();

    logger.info("Current vault leverage", {
      currentLeverageBps: currentLeverageBps.toString(),
      targetLeverageBps: targetLeverageBps.toString(),
      currentLeveragePercent: (Number(currentLeverageBps) / 100).toFixed(2) + "%",
      targetLeveragePercent: (Number(targetLeverageBps) / 100).toFixed(2) + "%",
    });

    // Step 3: Call quoter.quoteRebalanceAmountToReachTargetLeverage()
    const [inputTokenAmount, estimatedOutputTokenAmount, direction] = await contractManager.quoter.quoteRebalanceAmountToReachTargetLeverage(
      config.contracts.dloopCore
    );

    logger.info("Quoter response", {
      inputTokenAmount: inputTokenAmount.toString(),
      estimatedOutputTokenAmount: estimatedOutputTokenAmount.toString(),
      direction,
    });

    if (Number(direction) !== -1) {
      throw new Error(`Invalid rebalance direction: expected -1 (decrease leverage), got ${direction}`);
    }

    // Get token addresses
    const collateralTokenAddress = await contractManager.getCollateralTokenAddress();
    const debtTokenAddress = await contractManager.getDebtTokenAddress();

    logger.info("Token addresses retrieved", {
      collateralToken: collateralTokenAddress,
      debtToken: debtTokenAddress,
    });

    // Get token metadata for display
    const provider = contractManager.provider;
    const [collateralMetadata, debtMetadata] = await Promise.all([
      getTokenMetadata(provider, collateralTokenAddress),
      getTokenMetadata(provider, debtTokenAddress),
    ]);

    logger.info("Token metadata retrieved", {
      collateral: `${collateralMetadata.symbol} (${collateralMetadata.decimals} decimals)`,
      debt: `${debtMetadata.symbol} (${debtMetadata.decimals} decimals)`,
    });

    // Step 4: Use Odos quote logic and estimateFlashLoanSwapOutputDebtAmount to calculate swap data
    const decreaseLeverageContract = contractManager.decreaseOdos;

    const estimatedFlashLoanSwapOutputDebtAmount = await decreaseLeverageContract.estimateFlashLoanSwapOutputDebtAmount(
      inputTokenAmount,
      config.contracts.dloopCore
    );

    logger.info("Estimated flash loan swap output debt amount", {
      amount: formatTokenAmountWithSymbol(estimatedFlashLoanSwapOutputDebtAmount, debtMetadata.decimals, debtMetadata.symbol),
    });

    // Create Odos client for swap data
    const odosClient = new OdosClient(config.network.odosApiUrl, config.network.chainId);

    const estimatedInputCollateralAmountNormalized = await odosClient.calculateInputAmount(
      ethers.formatUnits(estimatedFlashLoanSwapOutputDebtAmount, debtMetadata.decimals),
      collateralTokenAddress,
      debtTokenAddress,
      config.network.chainId,
      0.0005,
    );

    logger.info("Estimated input collateral amount for swap", {
      amount: estimatedInputCollateralAmountNormalized,
    });

    const quoteRequest = {
      chainId: config.network.chainId,
      inputTokens: [{
        tokenAddress: collateralTokenAddress,
        amount: OdosClient.formatTokenAmount(estimatedInputCollateralAmountNormalized, collateralMetadata.decimals),
      }],
      outputTokens: [{
        tokenAddress: debtTokenAddress,
        proportion: 1,
      }],
      userAddr: signerAddress,
      slippageLimitPercent: (Number(slippageBps) / ONE_PERCENT_BPS), // Convert bps to percent
      disableRFQs: true,
      compact: true
    };

    logger.info("Requesting Odos quote for swap data", quoteRequest);

    const quoteResponse = await odosClient.getQuote(quoteRequest);
    logger.info("Odos quote received", {
      pathId: quoteResponse.pathId,
      inAmounts: quoteResponse.inAmounts,
      outAmounts: quoteResponse.outAmounts,
    });

    // Assemble transaction to get swap data
    const assembleRequest = {
      chainId: config.network.chainId,
      liquidatorAccountAddress: signerAddress,
      collateralTokenAddress: collateralTokenAddress,
    };

    const assembledQuote = await odosClient.getAssembledQuote(
      await decreaseLeverageContract.odosRouter(),
      contractManager.signer,
      odosClient,
      quoteResponse,
      assembleRequest,
      config.contracts.decreaseOdos
    );

    // Extract swap data from the assembled transaction
    const swapData = assembledQuote.transaction.data;

    // Step 5: Call decreaseLeverageContract.decreaseLeverage()
    logger.info("Preparing decrease leverage transaction", {
      rebalanceDebtAmount: inputTokenAmount.toString(),
      dLoopCore: config.contracts.dloopCore,
    });

    logger.info("Executing decrease leverage transaction...");
    const decreaseLeverageTx = await decreaseLeverageContract.decreaseLeverage(
      inputTokenAmount,
      swapData,
      config.contracts.dloopCore
    );

    logger.info("Decrease leverage transaction submitted", {
      txHash: decreaseLeverageTx.hash,
    });

    // Wait for transaction confirmation
    const receipt = await decreaseLeverageTx.wait(3);
    logger.info("Decrease leverage transaction confirmed", {
      txHash: receipt!.hash,
      gasUsed: receipt!.gasUsed.toString(),
      blockNumber: receipt!.blockNumber,
    });

    // Step 6: Check current leverage again and verify it decreased but not below target
    const leverageAfterDecrease = await contractManager.core.getCurrentLeverageBps();

    logger.info("Leverage after decrease", {
      leverageBps: leverageAfterDecrease.toString(),
      leveragePercent: (Number(leverageAfterDecrease) / 100).toFixed(2) + "%",
    });

    // Verify leverage decreased but not below target
    if (leverageAfterDecrease >= currentLeverageBps) {
      logger.error("❌ Leverage did not decrease!", {
        leverageBefore: currentLeverageBps.toString(),
        leverageAfter: leverageAfterDecrease.toString(),
      });
      throw new Error("Leverage did not decrease as expected");
    }

    if (leverageAfterDecrease < targetLeverageBps) {
      logger.warn("⚠️ Leverage decreased below target", {
        targetLeverageBps: targetLeverageBps.toString(),
        actualLeverageBps: leverageAfterDecrease.toString(),
      });
    } else {
      logger.info("✅ Leverage successfully decreased and is at or above target", {
        leverageBefore: (Number(currentLeverageBps) / 100).toFixed(2) + "%",
        leverageAfter: (Number(leverageAfterDecrease) / 100).toFixed(2) + "%",
        targetLeverage: (Number(targetLeverageBps) / 100).toFixed(2) + "%",
      });
    }

  } catch (error) {
    console.error(error);
    logger.error("Decrease leverage failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Helper function to get token metadata
 */
async function getTokenMetadata(
  provider: ethers.Provider,
  tokenAddress: string
): Promise<{ decimals: number; symbol: string }> {
  const [decimals, symbol] = await Promise.all([
    getTokenDecimals(provider, tokenAddress),
    getTokenSymbol(provider, tokenAddress),
  ]);
  return { decimals, symbol };
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  // Default parameters - can be modified as needed
  const decreaseLeverageParams: DecreaseLeverageParams = {
    targetMinDeviationBps: "100", // 1% minimum deviation
    slippageBps: BigInt(0.5 * ONE_PERCENT_BPS), // 0.5% slippage
  };

  logger.info("Starting dLoop decrease leverage script", decreaseLeverageParams);

  try {
    await decreaseLeverageAndCheckPosition(decreaseLeverageParams);
    logger.info("✅ Decrease leverage script completed successfully!");
  } catch (error) {
    logger.error("❌ Decrease leverage script failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

export { decreaseLeverageAndCheckPosition, DecreaseLeverageParams };
