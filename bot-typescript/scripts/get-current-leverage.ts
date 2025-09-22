import { ethers } from "ethers";
import { ContractManager } from "../src/bot/ContractManager";
import { getTokenDecimals, getTokenSymbol, formatTokenAmountWithSymbol } from "../src/common/erc20";
import { logger } from "../src/common/log";
import { getConfig } from "../src/config/config";
import { ONE_PERCENT_BPS } from "../src/config/constants";

interface GetLeverageParams {
  showPosition?: boolean; // Whether to show detailed position information
}

/**
 * Get current leverage and position information from the Core vault
 */
async function getCurrentLeverage(params: GetLeverageParams = {}): Promise<{
  currentLeverageBps: bigint;
  targetLeverageBps: bigint;
  currentLeveragePercent: string;
  targetLeveragePercent: string;
  position?: {
    shares: string;
    collateral: string;
    debt: string;
  };
}> {
  const { showPosition = true } = params;

  try {
    const config = getConfig();

    // Initialize contract manager
    const contractManager = await ContractManager.create(config);

    // Get signer address
    const signerAddress = await contractManager.getSignerAddress();

    logger.info("Getting current leverage information", {
      signer: signerAddress,
    });

    // Get current and target leverage
    const [currentLeverageBps, targetLeverageBps] = await Promise.all([
      contractManager.core.getCurrentLeverageBps(),
      contractManager.core.targetLeverageBps(),
    ]);

    const currentLeveragePercent = (Number(currentLeverageBps) / ONE_PERCENT_BPS).toFixed(5) + "%";
    const targetLeveragePercent = (Number(targetLeverageBps) / ONE_PERCENT_BPS).toFixed(5) + "%";

    logger.info("Vault leverage information", {
      currentLeverageBps: currentLeverageBps.toString(),
      targetLeverageBps: targetLeverageBps.toString(),
      currentLeveragePercent,
      targetLeveragePercent,
    });

    let positionInfo;

    if (showPosition) {
      // Get token addresses and metadata for detailed position info
      const [collateralTokenAddress, debtTokenAddress] = await Promise.all([
        contractManager.getCollateralTokenAddress(),
        contractManager.getDebtTokenAddress(),
      ]);

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

      // Get position details
      const [shares, collateralBalance, debtBalance] = await Promise.all([
        contractManager.core.balanceOf(signerAddress),
        (await contractManager.getCollateralToken()).balanceOf(signerAddress),
        (await contractManager.getDebtToken()).balanceOf(signerAddress),
      ]);

      const formattedCollateral = formatTokenAmountWithSymbol(
        collateralBalance,
        collateralMetadata.decimals,
        collateralMetadata.symbol
      );
      const formattedDebt = formatTokenAmountWithSymbol(
        debtBalance,
        debtMetadata.decimals,
        debtMetadata.symbol
      );

      positionInfo = {
        shares: shares.toString(),
        collateral: formattedCollateral,
        debt: formattedDebt,
      };

      logger.info("Current position", {
        shares: positionInfo.shares,
        collateral: positionInfo.collateral,
        debt: positionInfo.debt,
      });

      // Calculate leverage deviation
      const deviation = Number(currentLeverageBps) - Number(targetLeverageBps);
      const deviationPercent = (deviation / 100).toFixed(2) + "%";

      logger.info("Leverage analysis", {
        deviationBps: deviation.toString(),
        deviationPercent,
        status: deviation === 0 ? "At target" : deviation > 0 ? "Above target" : "Below target",
      });
    }

    return {
      currentLeverageBps,
      targetLeverageBps,
      currentLeveragePercent,
      targetLeveragePercent,
      position: positionInfo,
    };

  } catch (error) {
    console.error(error);
    logger.error("Failed to get current leverage", {
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
  const params: GetLeverageParams = {
    showPosition: true, // Show detailed position by default
  };

  logger.info("Starting get current leverage script", params);

  try {
    const leverageInfo = await getCurrentLeverage(params);

    // Display summary
    console.log("\n=== Vault Leverage Summary ===");
    console.log(`Current Leverage: ${leverageInfo.currentLeveragePercent}`);
    console.log(`Target Leverage:  ${leverageInfo.targetLeveragePercent}`);

    if (leverageInfo.position) {
      console.log("\n=== Current Position ===");
      console.log(`Shares: ${leverageInfo.position.shares}`);
      console.log(`Collateral: ${leverageInfo.position.collateral}`);
      console.log(`Debt: ${leverageInfo.position.debt}`);
    }

    logger.info("✅ Get current leverage script completed successfully!");
  } catch (error) {
    logger.error("❌ Get current leverage script failed", {
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

export { getCurrentLeverage, GetLeverageParams };
