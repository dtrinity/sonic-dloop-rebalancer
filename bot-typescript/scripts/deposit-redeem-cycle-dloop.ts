import { ethers } from "ethers";
import { ContractManager } from "../src/bot/ContractManager";
import { OdosClient } from "../src/bot/OdosClient";
import { formatTokenAmountWithSymbol, getTokenDecimals } from "../src/common/erc20";
import { logger } from "../src/common/log";
import { ONE_PERCENT_BPS } from "../src/config/constants";
import { IDLoopDepositorOdosABI, DLoopDepositorContract } from "./deposit-dloop";
import { IDLoopRedeemerOdosABI, DLoopRedeemerContract } from "./redeem-dloop";
import { getConfig } from "../src/config/config";

async function depositWithDepositor(depositContractAddress: string, depositAmount: string): Promise<{
  collateralSpent: number;
  sharesReceived: number;
  debtLeftoverReceived: number;
  depositTxHash: string;
}> {

  try {
    const config = getConfig();
    // Initialize contract manager
    const contractManager = await ContractManager.create(config);

    // Get signer address
    const signerAddress = await contractManager.getSignerAddress();

    logger.info("Starting deposit process", {
      signer: signerAddress,
      depositAmount,
      depositContractAddress,
    });

    const depositor = new ethers.Contract(
      depositContractAddress,
      IDLoopDepositorOdosABI,
      contractManager.signer,
    ) as unknown as DLoopDepositorContract;

    // Get token addresses
    const collateralTokenAddress = await contractManager.getCollateralTokenAddress();
    const debtTokenAddress = await contractManager.getDebtTokenAddress();

    // Get token metadata for display
    const provider = contractManager.provider;
    const [collateralMetadata, debtMetadata] = await Promise.all([
      getTokenMetadata(provider, collateralTokenAddress),
      getTokenMetadata(provider, debtTokenAddress),
    ]);

    // Parse deposit amount
    const depositAmountBigInt = ethers.parseUnits(depositAmount, collateralMetadata.decimals);
    logger.info(`Parsed deposit amount: ${formatTokenAmountWithSymbol(depositAmountBigInt, collateralMetadata.decimals, collateralMetadata.symbol)}`);

    // Calculate min output shares with 2.5% slippage
    const minOutputShares = await depositor.calculateMinOutputShares(
      depositAmountBigInt,
      BigInt(2.5 * ONE_PERCENT_BPS),
      config.contracts.dloopCore
    );

    logger.info(`Calculated minimum output shares: ${minOutputShares}`);

    // Get current balances before deposit
    const sharesBeforeDeposit = await contractManager.core.balanceOf(signerAddress);

    // Get token balances before deposit
    const collateralTokenContractDeposit = new ethers.Contract(collateralTokenAddress, ["function balanceOf(address) view returns (uint256)"], contractManager.provider);
    const debtTokenContractDeposit = new ethers.Contract(debtTokenAddress, ["function balanceOf(address) view returns (uint256)"], contractManager.provider);
    const collateralTokenBalanceBefore = await collateralTokenContractDeposit.balanceOf(signerAddress);
    const debtTokenBalanceBefore = await debtTokenContractDeposit.balanceOf(signerAddress);

    // Create Odos client for swap data
    const odosClient = new OdosClient(config.network.odosApiUrl, config.network.chainId);

    const estimatedFlashLoanSwapOutputCollateralAmount = await depositor.estimateFlashLoanSwapOutputCollateralAmount(
      depositAmountBigInt,
      minOutputShares,
      config.contracts.dloopCore
    );

    const estimatedFlashLoanSwapOutputCollateralAmountNormalized = ethers.formatUnits(estimatedFlashLoanSwapOutputCollateralAmount, collateralMetadata.decimals);

    // Calculate input debt amount for 3x leverage
    const estimatedInputDebtAmountNormalized = await odosClient.calculateInputAmount(
      estimatedFlashLoanSwapOutputCollateralAmountNormalized.toString(),
      debtTokenAddress,
      collateralTokenAddress,
      config.network.chainId,
      0.5,
    );

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
      slippageLimitPercent: 0.5, // 0.5% slippage
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
      receiver: signerAddress,
      minOutputShares: minOutputShares.toString(),
      dLoopCore: config.contracts.dloopCore,
    });

    // Approve depositor to spend the collateral token if not enough allowance
    const depositorAddress = await depositor.getAddress();
    const collateralTokenContract = await contractManager.getCollateralToken();
    const allowance = await collateralTokenContract.allowance(signerAddress, depositorAddress);
    if (allowance < depositAmountBigInt) {
      const approveTx = await collateralTokenContract.approve(
        depositorAddress,
        ethers.MaxUint256
      );
      logger.info(`Approving depositor ${depositorAddress} to spend the collateral token ${collateralTokenAddress}`, {
        txHash: approveTx.hash,
      });
      await approveTx.wait();
    } else {
      logger.info(`Already have enough allowance for depositor ${depositorAddress} to spend the collateral token ${collateralTokenAddress}`);
    }

    // Execute deposit
    logger.info("Executing deposit transaction...");
    const depositTx = await depositor.deposit(
      depositAmountBigInt,
      signerAddress,
      minOutputShares,
      swapData,
      config.contracts.dloopCore
    );

    logger.info("Deposit transaction submitted", {
      txHash: depositTx.hash,
    });

    // Wait for transaction confirmation
    const receipt = await depositTx.wait(3);
    logger.info("Deposit transaction confirmed", {
      txHash: receipt!.hash,
      gasUsed: receipt!.gasUsed.toString(),
      blockNumber: receipt!.blockNumber,
    });

    // Check balances after deposit
    const sharesAfterDeposit = await contractManager.core.balanceOf(signerAddress);
    const collateralTokenBalanceAfter = await collateralTokenContractDeposit.balanceOf(signerAddress);
    const debtTokenBalanceAfter = await debtTokenContractDeposit.balanceOf(signerAddress);

    // Calculate actual token balance changes
    const collateralTokenBalanceChange = BigInt(collateralTokenBalanceBefore) - BigInt(collateralTokenBalanceAfter);
    const debtTokenBalanceChange = BigInt(debtTokenBalanceAfter) - BigInt(debtTokenBalanceBefore);
    const sharesBalanceChange = BigInt(sharesAfterDeposit) - BigInt(sharesBeforeDeposit);

    // The actual collateral spent is the change in user's collateral token balance
    const collateralSpent = collateralTokenBalanceChange;
    // The actual shares received is the change in user's share balance
    const sharesReceived = sharesBalanceChange;
    // Leftover debt received (if any) is the change in debt token balance
    const debtLeftoverReceived = debtTokenBalanceChange; // Usually no leftover debt in deposits

    logger.info("Deposit completed successfully", {
      sharesReceived: sharesReceived.toString(),
      collateralSpent: collateralSpent.toString(),
      debtLeftoverReceived: debtLeftoverReceived.toString(),
      depositTxHash: depositTx.hash,
    });

    return {
      collateralSpent: Number(ethers.formatUnits(collateralSpent, collateralMetadata.decimals)),
      sharesReceived: Number(ethers.formatUnits(sharesReceived, await getTokenDecimals(contractManager.provider, config.contracts.dloopCore))),
      debtLeftoverReceived: Number(ethers.formatUnits(debtLeftoverReceived, debtMetadata.decimals)),
      depositTxHash: depositTx.hash,
    };

  } catch (error) {
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
  provider: any,
  tokenAddress: string
): Promise<{ decimals: number; symbol: string }> {
  const { getTokenDecimals, getTokenSymbol } = require("../src/common/erc20");
  const [decimals, symbol] = await Promise.all([
    getTokenDecimals(provider, tokenAddress),
    getTokenSymbol(provider, tokenAddress),
  ]);
  return { decimals, symbol };
}

async function redeemWithRedeemer(redeemContractAddress: string, sharesToRedeem: bigint): Promise<{
  sharesRedeemed: number;
  collateralLeftoverReceived: number;
  debtLeftoverReceived: number;
  redeemTxHash: string;
}> {

  try {
    const config = getConfig();
    // Initialize contract manager
    const contractManager = await ContractManager.create(config);

    // Get signer address
    const signerAddress = await contractManager.getSignerAddress();

    logger.info("Starting redeem process", {
      signer: signerAddress,
      sharesToRedeem: sharesToRedeem.toString(),
      redeemContractAddress,
    });

    const redeemer = new ethers.Contract(
      redeemContractAddress,
      IDLoopRedeemerOdosABI,
      contractManager.signer,
    ) as unknown as DLoopRedeemerContract;

    // Get token addresses
    const collateralTokenAddress = await contractManager.getCollateralTokenAddress();
    const debtTokenAddress = await contractManager.getDebtTokenAddress();

    // Get token metadata for display
    const provider = contractManager.provider;
    const [collateralMetadata, debtMetadata] = await Promise.all([
      getTokenMetadata(provider, collateralTokenAddress),
      getTokenMetadata(provider, debtTokenAddress),
    ]);

    logger.info(`Parsed redeem shares amount: ${formatTokenAmountWithSymbol(sharesToRedeem, 18, "SHARES")}`);

    const estimateFlashLoanSwapOutputDebtAmount = await redeemer.estimateFlashLoanSwapOutputDebtAmount(
      sharesToRedeem,
      config.contracts.dloopCore
    );
    logger.info(`Estimated flash loan swap output debt amount: ${formatTokenAmountWithSymbol(estimateFlashLoanSwapOutputDebtAmount, debtMetadata.decimals, debtMetadata.symbol)}`);

    // Get current balances before redeem
    const sharesBeforeRedeem = await contractManager.core.balanceOf(signerAddress);

    // Get token balances before redeem
    const collateralTokenContractRedeem = new ethers.Contract(collateralTokenAddress, ["function balanceOf(address) view returns (uint256)"], contractManager.provider);
    const debtTokenContractRedeem = new ethers.Contract(debtTokenAddress, ["function balanceOf(address) view returns (uint256)"], contractManager.provider);
    const collateralTokenBalanceBefore = await collateralTokenContractRedeem.balanceOf(signerAddress);
    const debtTokenBalanceBefore = await debtTokenContractRedeem.balanceOf(signerAddress);

    // Create Odos client for swap data
    const odosClient = new OdosClient(config.network.odosApiUrl, config.network.chainId);

    const estimateFlashLoanSwapOutputDebtAmountNormalized = ethers.formatUnits(estimateFlashLoanSwapOutputDebtAmount, debtMetadata.decimals);

    const estimatedInputCollateralAmountNormalized = await odosClient.calculateInputAmount(
      estimateFlashLoanSwapOutputDebtAmountNormalized,
      collateralTokenAddress,
      debtTokenAddress,
      config.network.chainId,
      0.0005,
    );

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
      slippageLimitPercent: 0.5, // 0.5% slippage
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
      await redeemer.odosRouter(),
      contractManager.signer,
      odosClient,
      quoteResponse,
      assembleRequest,
      await redeemer.getAddress()
    );

    // Extract swap data from the assembled transaction
    const swapData = assembledQuote.transaction.data;

    const minOutputCollateralAmount = await redeemer.calculateMinOutputCollateral(
      sharesToRedeem,
      BigInt(0.1 * ONE_PERCENT_BPS),
      config.contracts.dloopCore
    );

    logger.info("Preparing redeem transaction", {
      shares: sharesToRedeem.toString(),
      receiver: signerAddress,
      minOutputCollateralAmount: minOutputCollateralAmount.toString(),
      dLoopCore: config.contracts.dloopCore,
    });

    // Approve redeemer to spend shares if not enough allowance
    const redeemerAddress = await redeemer.getAddress();

    // Create a core contract instance with signer for approval
    const coreContractWithSigner = new ethers.Contract(
      config.contracts.dloopCore,
      ["function approve(address spender, uint256 amount) returns (bool)", "function allowance(address owner, address spender) view returns (uint256)"],
      contractManager.signer
    );

    const allowance = await coreContractWithSigner.allowance(signerAddress, redeemerAddress);
    if (allowance < sharesToRedeem) {
      const approveTx = await coreContractWithSigner.approve(
        redeemerAddress,
        ethers.MaxUint256
      );
      logger.info(`Approving redeemer ${redeemerAddress} to spend shares from ${config.contracts.dloopCore}`, {
        txHash: approveTx.hash,
      });
      await approveTx.wait();
    } else {
      logger.info(`Already have enough allowance for redeemer ${redeemerAddress} to spend shares from ${config.contracts.dloopCore}`);
    }

    logger.info(`Calculated minimum output collateral amount: ${formatTokenAmountWithSymbol(minOutputCollateralAmount, collateralMetadata.decimals, collateralMetadata.symbol)}`);

    // Execute redeem
    logger.info("Executing redeem transaction...");
    const redeemTx = await redeemer.redeem(
      sharesToRedeem,
      signerAddress,
      minOutputCollateralAmount,
      swapData,
      config.contracts.dloopCore
    );

    logger.info("Redeem transaction submitted", {
      txHash: redeemTx.hash,
    });

    // Wait for transaction confirmation
    const receipt = await redeemTx.wait(3);
    logger.info("Redeem transaction confirmed", {
      txHash: receipt!.hash,
      gasUsed: receipt!.gasUsed.toString(),
      blockNumber: receipt!.blockNumber,
    });

    // Check balances after redeem
    const sharesAfterRedeem = await contractManager.core.balanceOf(signerAddress);
    const collateralTokenBalanceAfter = await collateralTokenContractRedeem.balanceOf(signerAddress);
    const debtTokenBalanceAfter = await debtTokenContractRedeem.balanceOf(signerAddress);

    // Calculate actual token balance changes
    const sharesBalanceChange = BigInt(sharesBeforeRedeem) - BigInt(sharesAfterRedeem);
    const collateralTokenBalanceChange = BigInt(collateralTokenBalanceAfter) - BigInt(collateralTokenBalanceBefore);
    const debtTokenBalanceChange = BigInt(debtTokenBalanceAfter) - BigInt(debtTokenBalanceBefore);

    // The actual shares redeemed is the change in user's share balance
    const sharesRedeemed = sharesBalanceChange;
    // The actual collateral received is the change in user's collateral token balance
    const collateralLeftoverReceived = collateralTokenBalanceChange > 0n ? collateralTokenBalanceChange : 0n;
    // The actual debt received is the change in user's debt token balance
    const debtLeftoverReceived = debtTokenBalanceChange > 0n ? debtTokenBalanceChange : 0n;

    logger.info("Redeem completed successfully", {
      sharesRedeemed: sharesRedeemed.toString(),
      collateralLeftoverReceived: collateralLeftoverReceived.toString(),
      debtLeftoverReceived: debtLeftoverReceived.toString(),
      redeemTxHash: redeemTx.hash,
    });

    return {
      sharesRedeemed: Number(ethers.formatUnits(sharesRedeemed, await getTokenDecimals(contractManager.provider, config.contracts.dloopCore))),
      collateralLeftoverReceived: Number(ethers.formatUnits(collateralLeftoverReceived, collateralMetadata.decimals)),
      debtLeftoverReceived: Number(ethers.formatUnits(debtLeftoverReceived, debtMetadata.decimals)),
      redeemTxHash: redeemTx.hash,
    };

  } catch (error) {
    logger.error("Redeem failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

async function main() {
  const depositContractAddress = "0xE63df550dB85170fE6293D49d22121bE50f19b3a";
  const redeemContractAddress = "0x0373d0ae1A68C7b2Bd2b62B4C9eeeeaa5831290d";
  const depositAmount = "0.1"

  const depositResult = await depositWithDepositor(depositContractAddress, depositAmount);

  const config = getConfig();
  const contractManager = await ContractManager.create(config);
  const sharesReceived = ethers.parseUnits(depositResult.sharesReceived.toString(), await getTokenDecimals(contractManager.provider, config.contracts.dloopCore));

  const redeemResult = await redeemWithRedeemer(redeemContractAddress, sharesReceived);

  console.log("===============================================================");
  console.log("**** Deposit Result ****");
  console.log("---------------------------------------------------------------");
  console.log("Target collateral amount     :", depositAmount);
  console.log("Collateral spent             :", depositResult.collateralSpent);
  console.log("Shares received              :", depositResult.sharesReceived);
  console.log("Debt leftover received       :", depositResult.debtLeftoverReceived);
  console.log("Deposit transaction hash     :", depositResult.depositTxHash);
  console.log("===============================================================");
  console.log("");
  console.log("===============================================================");
  console.log("**** Redeem Result ****");
  console.log("---------------------------------------------------------------");
  console.log("Shares redeemed              :", redeemResult.sharesRedeemed);
  console.log("Collateral leftover received :", redeemResult.collateralLeftoverReceived);
  console.log("Debt leftover received       :", redeemResult.debtLeftoverReceived);
  console.log("Redeem transaction hash      :", redeemResult.redeemTxHash);
  console.log("===============================================================");
  console.log("");

  const totalColletaralReceivedAfterAll = redeemResult.collateralLeftoverReceived;
  const totalLeftOverDebtReceivedAfterAll = depositResult.debtLeftoverReceived + redeemResult.debtLeftoverReceived;

  const odosClient = new OdosClient(config.network.odosApiUrl, config.network.chainId);
  const totalLeftOverDebtReceivedAfterAllInCollateralUnit = await odosClient.quoteOutputAmount(
    config.network.chainId,
    await contractManager.getDebtTokenAddress(),
    await contractManager.getCollateralTokenAddress(),
    totalLeftOverDebtReceivedAfterAll.toString(),
  );

  const returnPercentage = (totalColletaralReceivedAfterAll + Number(totalLeftOverDebtReceivedAfterAllInCollateralUnit)) / depositResult.collateralSpent;

  console.log("Total collateral received after all                        :", totalColletaralReceivedAfterAll);
  console.log("Total left over debt received after all                    :", totalLeftOverDebtReceivedAfterAll);
  console.log("Total left over debt received after all in collateral unit :", totalLeftOverDebtReceivedAfterAllInCollateralUnit);
  console.log("Return percentage                                          :", ((returnPercentage - 1) * 100).toFixed(6));
}

main();