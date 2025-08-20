/* eslint-disable @typescript-eslint/no-unsafe-assignment -- fixtures create runtime objects from mocks */
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";

import { BotConfig } from "../config/types";

export interface TestFixture {
  deployer: SignerWithAddress;
  user: SignerWithAddress;
  collateralToken: any;
  debtToken: any;
  dloopCore: any;
  flashLender: any;
  odosRouter: any;
  config: BotConfig;
}

/**
 *
 */
export async function deployTestFixture(): Promise<TestFixture> {
  const [deployer, user] = await ethers.getSigners();

  // Deploy mock tokens
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const collateralToken = await MockERC20.deploy(
    "Mock WETH",
    "WETH",
    18,
    ethers.parseEther("1000000"), // 1M tokens
  );

  const debtToken = await MockERC20.deploy(
    "Mock dUSD",
    "dUSD",
    18,
    ethers.parseEther("1000000"), // 1M tokens
  );

  // Deploy mock flash lender
  const MockFlashLender = await ethers.getContractFactory("MockFlashLender");
  const flashLender = await MockFlashLender.deploy();

  // Deploy mock Odos router
  const MockOdosRouterV2 = await ethers.getContractFactory("MockOdosRouterV2");
  const odosRouter = await MockOdosRouterV2.deploy();

  // Deploy mock DLoop core
  const DLoopCoreMock = await ethers.getContractFactory("DLoopCoreMock");
  const dloopCore = await DLoopCoreMock.deploy(
    await collateralToken.getAddress(),
    await debtToken.getAddress(),
  );

  // Create test config
  const config: BotConfig = {
    network: {
      chainId: 31337,
      rpcUrl: "http://localhost:8545",
      privateKey: deployer.privateKey,
    },
    contracts: {
      dloopCore: await dloopCore.getAddress(),
      increaseOdos: ethers.ZeroAddress, // Will be set to deployed periphery addresses
      decreaseOdos: ethers.ZeroAddress, // Will be set to deployed periphery addresses
      odosRouter: await odosRouter.getAddress(),
      flashLender: await flashLender.getAddress(),
    },
    tokens: {
      collateral: {
        address: await collateralToken.getAddress(),
        decimals: 18,
        symbol: "WETH",
      },
      debt: {
        address: await debtToken.getAddress(),
        decimals: 18,
        symbol: "dUSD",
      },
    },
    policy: {
      rebalancePercentageList: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5],
      minSubsidyAmount: {
        [await collateralToken.getAddress()]: ethers
          .parseEther("0.1")
          .toString(),
        [await debtToken.getAddress()]: ethers.parseEther("0.1").toString(),
      },
      maxTxRetriesPerTrial: 3,
      loopIntervalSec: 60,
      dryRun: false,
    },
    notifications: {
      logLevel: "debug" as const,
    },
  };

  return {
    deployer,
    user,
    collateralToken,
    debtToken,
    dloopCore,
    flashLender,
    odosRouter,
    config,
  };
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment -- re-enable after fixtures */
