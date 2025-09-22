import { ethers } from "ethers";
import { ContractManager } from "../src/bot/ContractManager";
import { OdosClient } from "../src/bot/OdosClient";
import { getTokenDecimals, getTokenSymbol, formatTokenAmountWithSymbol } from "../src/common/erc20";
import { logger } from "../src/common/log";
import { ONE_HUNDRED_PERCENT_BPS, ONE_PERCENT_BPS } from "../src/config/constants";
import { getConfig } from "../src/config/config";

interface IncreaseLeverageParams {
  targetMinDeviationBps: string; // Target minimum deviation in basis points
  slippageBps: bigint; // Slippage tolerance in basis points (e.g., 50 for 0.5%)
}

/**
 * Increase leverage via increaseLeverageContract.increaseLeverage() and check position
 */
async function increaseLeverageAndCheckPosition(params: IncreaseLeverageParams): Promise<void> {
  const { targetMinDeviationBps, slippageBps } = params;

  try {
    const config = getConfig();

    // Initialize contract manager
    const contractManager = await ContractManager.create(config);

    // Get signer address
    const signerAddress = await contractManager.getSignerAddress();

    logger.info("Starting increase leverage process", {
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

    if (Number(direction) !== 1) {
      throw new Error(`Invalid rebalance direction: expected 1 (increase leverage), got ${direction}`);
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

    // Step 4: Use Odos quote logic and estimateFlashLoanSwapOutputCollateralAmount to calculate swap data
    const increaseLeverageContract = contractManager.increaseOdos;

    // For increase leverage, estimateFlashLoanSwapOutputCollateralAmount just returns the input amount
    const estimatedFlashLoanSwapOutputCollateralAmount = await increaseLeverageContract.estimateFlashLoanSwapOutputCollateralAmount(
      inputTokenAmount
    );

    logger.info("Estimated flash loan swap output collateral amount", {
      amount: formatTokenAmountWithSymbol(estimatedFlashLoanSwapOutputCollateralAmount, collateralMetadata.decimals, collateralMetadata.symbol),
    });

    // Create Odos client for swap data
    const odosClient = new OdosClient(config.network.odosApiUrl, config.network.chainId);

    // For increase leverage, we need to swap debt tokens to collateral tokens
    // We want to know how much debt we need to input to get the required collateral amount
    const estimatedInputDebtAmountNormalized = await odosClient.calculateInputAmount(
      ethers.formatUnits(estimatedFlashLoanSwapOutputCollateralAmount, collateralMetadata.decimals),
      debtTokenAddress,
      collateralTokenAddress,
      config.network.chainId,
      0.0001,
    );

    logger.info("Estimated input debt amount for swap", {
      amount: estimatedInputDebtAmountNormalized,
    });

    const quoteRequest = {
      chainId: config.network.chainId,
      inputTokens: [{
        tokenAddress: debtTokenAddress,
        amount: OdosClient.formatTokenAmount(estimatedInputDebtAmountNormalized, debtMetadata.decimals),
      }],
      outputTokens: [{
        tokenAddress: collateralTokenAddress,
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
      await increaseLeverageContract.odosRouter(),
      contractManager.signer,
      odosClient,
      quoteResponse,
      assembleRequest,
      config.contracts.increaseOdos
    );

    // Extract swap data from the assembled transaction
    const swapData = assembledQuote.transaction.data;

    // Step 5: Call increaseLeverageContract.increaseLeverage()

    // Get current position before increase leverage
    const [sharesBeforeIncrease, collateralBefore, debtBefore] = await Promise.all([
      contractManager.core.balanceOf(signerAddress),
      (await contractManager.getCollateralToken()).balanceOf(signerAddress),
      (await contractManager.getDebtToken()).balanceOf(signerAddress),
    ]);

    logger.info("Position before increase leverage", {
      shares: sharesBeforeIncrease.toString(),
      collateral: formatTokenAmountWithSymbol(collateralBefore, collateralMetadata.decimals, collateralMetadata.symbol),
      debt: formatTokenAmountWithSymbol(debtBefore, debtMetadata.decimals, debtMetadata.symbol),
    });

    logger.info("Preparing increase leverage transaction", {
      rebalanceCollateralAmount: inputTokenAmount.toString(),
      dLoopCore: config.contracts.dloopCore,
    });

    logger.info("Executing increase leverage transaction...");
    const increaseLeverageTx = await increaseLeverageContract.increaseLeverage(
      inputTokenAmount,
      swapData,
      config.contracts.dloopCore
    );

    logger.info("Increase leverage transaction submitted", {
      txHash: increaseLeverageTx.hash,
    });

    // Wait for transaction confirmation
    const receipt = await increaseLeverageTx.wait(3);
    logger.info("Increase leverage transaction confirmed", {
      txHash: receipt!.hash,
      gasUsed: receipt!.gasUsed.toString(),
      blockNumber: receipt!.blockNumber,
    });

    // Check position after increase leverage
    const [sharesAfterIncrease, collateralAfter, debtAfter] = await Promise.all([
      contractManager.core.balanceOf(signerAddress),
      (await contractManager.getCollateralToken()).balanceOf(signerAddress),
      (await contractManager.getDebtToken()).balanceOf(signerAddress),
    ]);

    logger.info("Position after increase leverage", {
      shares: sharesAfterIncrease.toString(),
      collateral: formatTokenAmountWithSymbol(collateralAfter, collateralMetadata.decimals, collateralMetadata.symbol),
      debt: formatTokenAmountWithSymbol(debtAfter, debtMetadata.decimals, debtMetadata.symbol),
    });

    // Verify position was updated
    const sharesChange = sharesAfterIncrease - sharesBeforeIncrease;
    const collateralChange = collateralAfter - collateralBefore;
    const debtChange = debtAfter - debtBefore;

    logger.info("Position changes after increase leverage", {
      sharesChange: sharesChange.toString(),
      collateralChange: formatTokenAmountWithSymbol(
        collateralChange,
        collateralMetadata.decimals,
        collateralMetadata.symbol
      ),
      debtChange: formatTokenAmountWithSymbol(
        debtChange,
        debtMetadata.decimals,
        debtMetadata.symbol
      ),
    });

    // Step 6: Check current leverage again and verify it increased but not exceeding target
    const leverageAfterIncrease = await contractManager.core.getCurrentLeverageBps();

    logger.info("Leverage after increase", {
      leverageBps: leverageAfterIncrease.toString(),
      leveragePercent: (Number(leverageAfterIncrease) / 100).toFixed(2) + "%",
    });

    // Verify leverage increased but not above target
    if (leverageAfterIncrease <= currentLeverageBps) {
      logger.error("❌ Leverage did not increase!", {
        leverageBefore: currentLeverageBps.toString(),
        leverageAfter: leverageAfterIncrease.toString(),
      });
      throw new Error("Leverage did not increase as expected");
    }

    if (leverageAfterIncrease > targetLeverageBps) {
      logger.warn("⚠️ Leverage increased above target", {
        targetLeverageBps: targetLeverageBps.toString(),
        actualLeverageBps: leverageAfterIncrease.toString(),
      });
    } else {
      logger.info("✅ Leverage successfully increased and is at or below target", {
        leverageBefore: (Number(currentLeverageBps) / 100).toFixed(2) + "%",
        leverageAfter: (Number(leverageAfterIncrease) / 100).toFixed(2) + "%",
        targetLeverage: (Number(targetLeverageBps) / 100).toFixed(2) + "%",
      });
    }

  } catch (error) {
    console.error(error);
    logger.error("Increase leverage failed", {
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
  const increaseLeverageParams: IncreaseLeverageParams = {
    targetMinDeviationBps: "0", // 1% minimum deviation
    slippageBps: BigInt(0.1 * ONE_PERCENT_BPS), // 0.5% slippage
  };

  logger.info("Starting dLoop increase leverage script", increaseLeverageParams);

  try {
    await increaseLeverageAndCheckPosition(increaseLeverageParams);
    logger.info("✅ Increase leverage script completed successfully!");
  } catch (error) {
    logger.error("❌ Increase leverage script failed", {
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

export { increaseLeverageAndCheckPosition, IncreaseLeverageParams };
