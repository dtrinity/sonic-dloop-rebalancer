import { ethers } from "ethers";
import { SONIC_MAINNET_CONFIG } from "../src/config/networks/sonic_mainnet";
import { ContractManager } from "../src/bot/ContractManager";
import { OdosClient } from "../src/bot/OdosClient";
import { getTokenDecimals, getTokenSymbol, formatTokenAmountWithSymbol } from "../src/common/erc20";
import { logger } from "../src/common/log";
import { ONE_HUNDRED_PERCENT_BPS, ONE_PERCENT_BPS } from "../src/config/constants";

interface DepositParams {
  depositAmount: string; // Amount to deposit in human readable format (e.g., "100" for 100 tokens)
  slippageBps: bigint; // Slippage tolerance in basis points (e.g., 50 for 0.5%)
  receiver?: string; // Address to receive the shares, defaults to signer
}

const IDLoopDepositorOdosABI = [
  "function deposit(uint256 assets, address receiver, uint256 minOutputShares, bytes calldata debtTokenToCollateralSwapData, address dLoopCore) returns (uint256)",
  "function calculateMinOutputShares(uint256 depositAmount, uint256 slippageBps, address dLoopCore) view returns (uint256)",
  "function odosRouter() view returns (address)",
  "function flashLender() view returns (address)",
  "function estimateFlashLoanSwapOutputCollateralAmount(uint256 assets, uint256 minOutputShares, address dLoopCore) view returns (uint256)",
  "function setBreakPoint(uint256 _breakPoint)",
  "function breakPoint() view returns (uint256)"
];

export interface DLoopDepositorContract {
  getAddress(): Promise<string>;
  deposit(
    assets: bigint,
    receiver: string,
    minOutputShares: bigint,
    debtTokenToCollateralSwapData: string,
    dLoopCore: string,
  ): Promise<ethers.ContractTransactionResponse>;
  calculateMinOutputShares(
    depositAmount: bigint,
    slippageBps: bigint,
    dLoopCore: string,
  ): Promise<bigint>;
  odosRouter(): Promise<string>;
  flashLender(): Promise<string>;
  estimateFlashLoanSwapOutputCollateralAmount(
    assets: bigint,
    minOutputShares: bigint,
    dLoopCore: string,
  ): Promise<bigint>;
  setBreakPoint(breakPoint: bigint): Promise<ethers.ContractTransactionResponse>;
  breakPoint(): Promise<bigint>;
}

/**
 * Deposit collateral token via depositor.deposit() and check position
 */
async function depositAndCheckPosition(params: DepositParams): Promise<void> {
  const { depositAmount, slippageBps, receiver } = params;

  try {
    // Initialize contract manager
    const contractManager = await ContractManager.create(SONIC_MAINNET_CONFIG);

    // Get signer address
    const signerAddress = await contractManager.getSignerAddress();
    const receiverAddress = receiver || signerAddress;

    logger.info("Starting deposit process", {
      signer: signerAddress,
      receiver: receiverAddress,
      depositAmount,
      slippageBps,
    });

    const depositor = new ethers.Contract(
      "0xaE63d82b103a69CfC8c8Cc215FF02C1f5B604442",
      IDLoopDepositorOdosABI,
      contractManager.signer,
    ) as unknown as DLoopDepositorContract

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

    // Parse deposit amount
    const depositAmountBigInt = ethers.parseUnits(depositAmount, collateralMetadata.decimals);
    logger.info(`Parsed deposit amount: ${formatTokenAmountWithSymbol(depositAmountBigInt, collateralMetadata.decimals, collateralMetadata.symbol)}`);

    // Calculate min output shares
    const minOutputShares = await depositor.calculateMinOutputShares(
      depositAmountBigInt,
      BigInt(2 * ONE_PERCENT_BPS),
      SONIC_MAINNET_CONFIG.contracts.dloopCore
    );

    logger.info(`Calculated minimum output shares: ${minOutputShares}`);

    // Get current position before deposit
    const sharesBeforeDeposit = await contractManager.core.balanceOf(signerAddress);
    const [collateralBefore, debtBefore] = await contractManager.core.getTotalCollateralAndDebtOfUserInBase(signerAddress);

    logger.info("Position before deposit", {
      shares: sharesBeforeDeposit.toString(),
      collateralBase: collateralBefore.toString(),
      debtBase: debtBefore.toString(),
    });

    // Create Odos client for swap data
    const odosClient = new OdosClient(SONIC_MAINNET_CONFIG.network.odosApiUrl, SONIC_MAINNET_CONFIG.network.chainId);

    const estimatedFlashLoanSwapOutputCollateralAmount = await depositor.estimateFlashLoanSwapOutputCollateralAmount(
      depositAmountBigInt,
      minOutputShares,
      SONIC_MAINNET_CONFIG.contracts.dloopCore
    );

    const estimatedFlashLoanSwapOutputCollateralAmountNormalized = ethers.formatUnits(estimatedFlashLoanSwapOutputCollateralAmount, collateralMetadata.decimals);

    // The additional collateral amount is estimated based on the leverage
    // 3x means we need to deposit 2x more collateral, the principal amount is already 1x
    const estimatedInputDebtAmountNormalized = await odosClient.calculateInputAmount(
      estimatedFlashLoanSwapOutputCollateralAmountNormalized.toString(),
      debtTokenAddress,
      collateralTokenAddress,
      SONIC_MAINNET_CONFIG.network.chainId,
      Number(slippageBps) / ONE_PERCENT_BPS,
    ); // Rough estimate for 3x leverage

    const quoteRequest = {
      chainId: SONIC_MAINNET_CONFIG.network.chainId,
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

    // if (quoteResponse.outAmounts[0] !== estimatedFlashLoanSwapOutputCollateralAmount.toString()) {
    //   throw new Error(`Estimated flash loan swap output collateral amount does not match the quote response output amount: ${estimatedFlashLoanSwapOutputCollateralAmount.toString()} !== ${quoteResponse.outAmounts[0]}`);
    // }

    // Assemble transaction to get swap data
    const assembleRequest = {
      chainId: SONIC_MAINNET_CONFIG.network.chainId,
      liquidatorAccountAddress: signerAddress,
      collateralTokenAddress: collateralTokenAddress,
    };

    const assembledQuote = await odosClient.getAssembledQuote(
      await depositor.odosRouter(),
      contractManager.signer,
      odosClient,
      quoteResponse,
      assembleRequest,
      await depositor.getAddress()
    );

    // Extract swap data from the assembled transaction
    const swapData = assembledQuote.transaction.data;

    logger.info("Preparing deposit transaction", {
      assets: depositAmountBigInt.toString(),
      receiver: receiverAddress,
      minOutputShares: minOutputShares.toString(),
      dLoopCore: SONIC_MAINNET_CONFIG.contracts.dloopCore,
    });

    // Approve depositor to spend the collateral token if not enough allowance
    const depositorAddress = await depositor.getAddress();
    const collateralTokenContract = await contractManager.getCollateralToken();
    const allowance = await collateralTokenContract.allowance(signerAddress, depositorAddress);
    if (allowance < depositAmountBigInt) {
      const approveTx = await collateralTokenContract.approve(
        depositorAddress,
        depositAmountBigInt
      );
      logger.info(`Approving depositor ${depositorAddress} to spend the collateral token ${collateralTokenAddress}`, {
        txHash: approveTx.hash,
      });
      await approveTx.wait();
    } else {
      logger.info(`Already have enough allowance for depositor ${depositorAddress} to spend the collateral token ${collateralTokenAddress}`);
    }

    // Set breakpoint here
    // const breakPoint = 0n;

    // if (await depositor.breakPoint() !== breakPoint) {
    //   const setBreakPointTx = await depositor.setBreakPoint(breakPoint);
    //   logger.info("Set breakpoint transaction submitted", {
    //     txHash: setBreakPointTx.hash,
    //   });
    //   await setBreakPointTx.wait();
    // } else {
    //   logger.info(`Breakpoint is already set to ${breakPoint}`);
    // }

    // Execute deposit
    logger.info("Executing deposit transaction...");
    const depositTx = await depositor.deposit(
      depositAmountBigInt,
      receiverAddress,
      minOutputShares,
      swapData,
      SONIC_MAINNET_CONFIG.contracts.dloopCore
    );

    logger.info("Deposit transaction submitted", {
      txHash: depositTx.hash,
    });

    // Wait for transaction confirmation
    const receipt = await depositTx.wait();
    logger.info("Deposit transaction confirmed", {
      txHash: receipt!.hash,
      gasUsed: receipt!.gasUsed.toString(),
      blockNumber: receipt!.blockNumber,
    });

    // Check position after deposit
    const sharesAfterDeposit = await contractManager.core.balanceOf(receiverAddress);
    const [collateralAfter, debtAfter] = await contractManager.core.getTotalCollateralAndDebtOfUserInBase(receiverAddress);

    logger.info("Position after deposit", {
      shares: sharesAfterDeposit.toString(),
      collateralBase: collateralAfter.toString(),
      debtBase: debtAfter.toString(),
    });

    // Verify position was created
    const sharesIncrease = sharesAfterDeposit - sharesBeforeDeposit;
    const collateralIncrease = collateralAfter - collateralBefore;
    const debtIncrease = debtAfter - debtBefore;

    if (sharesIncrease > 0n) {
      logger.info("✅ Position successfully created!", {
        sharesIncrease: sharesIncrease.toString(),
        collateralIncrease: collateralIncrease.toString(),
        debtIncrease: debtIncrease.toString(),
      });

      // Format amounts for display
      const formattedCollateralIncrease = formatTokenAmountWithSymbol(
        collateralIncrease,
        collateralMetadata.decimals,
        collateralMetadata.symbol
      );
      const formattedDebtIncrease = formatTokenAmountWithSymbol(
        debtIncrease,
        debtMetadata.decimals,
        debtMetadata.symbol
      );

      logger.info("Position summary", {
        collateralAdded: formattedCollateralIncrease,
        debtAdded: formattedDebtIncrease,
        sharesReceived: sharesIncrease.toString(),
      });
    } else {
      logger.error("❌ Position creation failed - no shares increase detected", {
        sharesBefore: sharesBeforeDeposit.toString(),
        sharesAfter: sharesAfterDeposit.toString(),
      });
      throw new Error("Position creation failed - no shares were minted");
    }

  } catch (error) {
    console.error(error);
    logger.error("Deposit failed", {
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
  const depositParams: DepositParams = {
    depositAmount: "0.1",
    slippageBps: BigInt(0.5 * ONE_PERCENT_BPS), // 0.5% slippage
    // receiver: "0x..." // optional, defaults to signer
  };

  logger.info("Starting dLoop deposit script", depositParams);

  try {
    await depositAndCheckPosition(depositParams);
    logger.info("✅ Deposit script completed successfully!");
  } catch (error) {
    logger.error("❌ Deposit script failed", {
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

export { depositAndCheckPosition, DepositParams };
