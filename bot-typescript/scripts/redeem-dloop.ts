import { ethers } from "ethers";
import { SONIC_MAINNET_CONFIG } from "../src/config/networks/sonic_mainnet";
import { ContractManager } from "../src/bot/ContractManager";
import { OdosClient } from "../src/bot/OdosClient";
import { getTokenDecimals, getTokenSymbol, formatTokenAmountWithSymbol } from "../src/common/erc20";
import { logger } from "../src/common/log";
import { ONE_HUNDRED_PERCENT_BPS, ONE_PERCENT_BPS } from "../src/config/constants";

interface RedeemParams {
  redeemSharesAmount: string; // Amount of shares to redeem in human readable format (e.g., "100" for 100 shares)
  slippageBps: bigint; // Slippage tolerance in basis points (e.g., 50 for 0.5%)
  receiver?: string; // Address to receive the assets, defaults to signer
}

const IDLoopRedeemerOdosABI = [
  "function redeem(uint256 shares, address receiver, uint256 minOutputCollateralAmount, bytes calldata collateralToDebtTokenSwapData, address dLoopCore) returns (uint256)",
  "function calculateMinOutputCollateral(uint256 shares, uint256 slippageBps, address dLoopCore) view returns (uint256)",
  "function odosRouter() view returns (address)",
  "function flashLender() view returns (address)",
];

export interface DLoopRedeemerContract {
  getAddress(): Promise<string>;
  redeem(
    shares: bigint,
    receiver: string,
    minOutputCollateralAmount: bigint,
    collateralToDebtTokenSwapData: string,
    dLoopCore: string,
  ): Promise<ethers.ContractTransactionResponse>;
  calculateMinOutputCollateral(
    shares: bigint,
    slippageBps: bigint,
    dLoopCore: string,
  ): Promise<bigint>;
  odosRouter(): Promise<string>;
  flashLender(): Promise<string>;
}

/**
 * Redeem shares via redeemer.redeem() and check position
 */
async function redeemAndCheckPosition(params: RedeemParams): Promise<void> {
  const { redeemSharesAmount, slippageBps, receiver } = params;

  try {
    // Initialize contract manager
    const contractManager = await ContractManager.create(SONIC_MAINNET_CONFIG);

    // Get signer address
    const signerAddress = await contractManager.getSignerAddress();
    const receiverAddress = receiver || signerAddress;

    logger.info("Starting redeem process", {
      signer: signerAddress,
      receiver: receiverAddress,
      redeemSharesAmount,
      slippageBps,
    });

    const redeemer = new ethers.Contract(
      "0x3Fe04e6Cbd38Bd4CA8f58Ccc8Bc6f18e9909926a",
      IDLoopRedeemerOdosABI,
      contractManager.signer,
    ) as unknown as DLoopRedeemerContract;

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

    // Parse redeem shares amount
    const redeemSharesBigInt = ethers.parseUnits(redeemSharesAmount, 18); // Shares are typically 18 decimals
    logger.info(`Parsed redeem shares amount: ${formatTokenAmountWithSymbol(redeemSharesBigInt, 18, "SHARES")}`);

    // Calculate min output collateral amount
    const minOutputCollateralAmount = await redeemer.calculateMinOutputCollateral(
      redeemSharesBigInt,
      slippageBps,
      SONIC_MAINNET_CONFIG.contracts.dloopCore
    );

    logger.info(`Calculated minimum output collateral amount: ${formatTokenAmountWithSymbol(minOutputCollateralAmount, collateralMetadata.decimals, collateralMetadata.symbol)}`);

    // Get current position before redeem
    const sharesBeforeRedeem = await contractManager.core.balanceOf(signerAddress);
    const [collateralBefore, debtBefore] = await contractManager.core.getTotalCollateralAndDebtOfUserInBase(signerAddress);

    logger.info("Position before redeem", {
      shares: sharesBeforeRedeem.toString(),
      collateralBase: collateralBefore.toString(),
      debtBase: debtBefore.toString(),
    });

    // Create Odos client for swap data
    const odosClient = new OdosClient(SONIC_MAINNET_CONFIG.network.odosApiUrl, SONIC_MAINNET_CONFIG.network.chainId);

    // For redeem, we need to swap collateral to debt tokens to repay the flash loan
    // We need to estimate how much collateral we'll get from redeeming the shares
    const estimatedCollateralOutput = await contractManager.core.convertFromBaseCurrencyToToken(
      minOutputCollateralAmount,
      collateralTokenAddress
    );

    // Convert bigint to human readable format for OdosClient
    const estimatedCollateralOutputFormatted = ethers.formatUnits(estimatedCollateralOutput, collateralMetadata.decimals);

    const quoteRequest = {
      chainId: SONIC_MAINNET_CONFIG.network.chainId,
      inputTokens: [{
        tokenAddress: collateralTokenAddress,
        amount: OdosClient.formatTokenAmount(estimatedCollateralOutputFormatted, collateralMetadata.decimals),
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
      chainId: SONIC_MAINNET_CONFIG.network.chainId,
      liquidatorAccountAddress: signerAddress,
      collateralTokenAddress: collateralTokenAddress,
    };

    const assembledQuote = await odosClient.getAssembledQuote(
      await redeemer.odosRouter(),
      contractManager.signer,
      odosClient,
      quoteResponse,
      assembleRequest,
      await redeemer.getAddress()
    );

    // Extract swap data from the assembled transaction
    const swapData = assembledQuote.transaction.data;

    logger.info("Preparing redeem transaction", {
      shares: redeemSharesBigInt.toString(),
      receiver: receiverAddress,
      minOutputCollateralAmount: minOutputCollateralAmount.toString(),
      dLoopCore: SONIC_MAINNET_CONFIG.contracts.dloopCore,
    });

    // Approve redeemer to spend shares if not enough allowance
    // Note: For ERC4626 vaults, shares are ERC20 tokens, so we need to approve the redeemer contract
    // to transfer shares from the signer to itself
    const redeemerAddress = await redeemer.getAddress();

    // Create a core contract instance with signer for approval
    const coreContractWithSigner = new ethers.Contract(
      SONIC_MAINNET_CONFIG.contracts.dloopCore,
      ["function approve(address spender, uint256 amount) returns (bool)", "function allowance(address owner, address spender) view returns (uint256)"],
      contractManager.signer
    );

    const allowance = await coreContractWithSigner.allowance(signerAddress, redeemerAddress);
    if (allowance < redeemSharesBigInt) {
      const approveTx = await coreContractWithSigner.approve(
        redeemerAddress,
        redeemSharesBigInt
      );
      logger.info(`Approving redeemer ${redeemerAddress} to spend shares from ${SONIC_MAINNET_CONFIG.contracts.dloopCore}`, {
        txHash: approveTx.hash,
      });
      await approveTx.wait();
    } else {
      logger.info(`Already have enough allowance for redeemer ${redeemerAddress} to spend shares from ${SONIC_MAINNET_CONFIG.contracts.dloopCore}`);
    }

    // Execute redeem
    logger.info("Executing redeem transaction...");
    const redeemTx = await redeemer.redeem(
      redeemSharesBigInt,
      receiverAddress,
      minOutputCollateralAmount,
      swapData,
      SONIC_MAINNET_CONFIG.contracts.dloopCore
    );

    logger.info("Redeem transaction submitted", {
      txHash: redeemTx.hash,
    });

    // Wait for transaction confirmation
    const receipt = await redeemTx.wait();
    logger.info("Redeem transaction confirmed", {
      txHash: receipt!.hash,
      gasUsed: receipt!.gasUsed.toString(),
      blockNumber: receipt!.blockNumber,
    });

    // Check position after redeem
    const sharesAfterRedeem = await contractManager.core.balanceOf(receiverAddress);
    const [collateralAfter, debtAfter] = await contractManager.core.getTotalCollateralAndDebtOfUserInBase(receiverAddress);

    logger.info("Position after redeem", {
      shares: sharesAfterRedeem.toString(),
      collateralBase: collateralAfter.toString(),
      debtBase: debtAfter.toString(),
    });

    // Verify position was updated
    const sharesDecrease = sharesBeforeRedeem - sharesAfterRedeem;
    const collateralDecrease = collateralBefore - collateralAfter;
    const debtDecrease = debtBefore - debtAfter;

    if (sharesDecrease > 0n) {
      logger.info("✅ Position successfully updated!", {
        sharesDecrease: sharesDecrease.toString(),
        collateralDecrease: collateralDecrease.toString(),
        debtDecrease: debtDecrease.toString(),
      });

      // Format amounts for display
      const formattedCollateralDecrease = formatTokenAmountWithSymbol(
        collateralDecrease,
        collateralMetadata.decimals,
        collateralMetadata.symbol
      );
      const formattedDebtDecrease = formatTokenAmountWithSymbol(
        debtDecrease,
        debtMetadata.decimals,
        debtMetadata.symbol
      );

      logger.info("Position summary", {
        collateralReceived: formattedCollateralDecrease,
        debtRepaid: formattedDebtDecrease,
        sharesRedeemed: sharesDecrease.toString(),
      });
    } else {
      logger.error("❌ Position update failed - no shares decrease detected", {
        sharesBefore: sharesBeforeRedeem.toString(),
        sharesAfter: sharesAfterRedeem.toString(),
      });
      throw new Error("Position update failed - no shares were redeemed");
    }

  } catch (error) {
    console.error(error);
    logger.error("Redeem failed", {
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
  const redeemParams: RedeemParams = {
    redeemSharesAmount: "0.01",
    slippageBps: BigInt(0.5 * ONE_PERCENT_BPS), // 0.5% slippage
    // receiver: "0x..." // optional, defaults to signer
  };

  logger.info("Starting dLoop redeem script", redeemParams);

  try {
    await redeemAndCheckPosition(redeemParams);
    logger.info("✅ Redeem script completed successfully!");
  } catch (error) {
    logger.error("❌ Redeem script failed", {
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

export { redeemAndCheckPosition, RedeemParams };
