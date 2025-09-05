import { ethers } from "ethers";

import { BotConfig } from "../config/types";

// ABI definitions for contracts
const IDLoopCoreABI = [
  "function getCurrentSubsidyBps() view returns (uint256)",
  "function getCurrentLeverageBps() view returns (uint256)",
  "function collateralToken() view returns (address)",
  "function debtToken() view returns (address)",
  "function convertFromTokenAmountToBaseCurrency(uint256 amount, address token) view returns (uint256)",
  "function convertFromBaseCurrencyToToken(uint256 amount, address token) view returns (uint256)"
];

const IDLoopQuoterABI = [
  "function quoteRebalanceAmountToReachTargetLeverage(address dLoopCore) view returns (uint256, uint256, int8)"
];

const IIncreaseLeverageOdosABI = [
  "function increaseLeverage(uint256 rebalanceCollateralAmount, bytes swapData, address dLoopCore) returns (uint256)",
  "function odosRouter() view returns (address)",
  "function flashLender() view returns (address)"
];

const IDecreaseLeverageOdosABI = [
  "function decreaseLeverage(uint256 rebalanceDebtAmount, bytes swapData, address dLoopCore) returns (uint256)",
  "function odosRouter() view returns (address)",
  "function flashLender() view returns (address)"
];

const IFlashLenderABI = [
  "function maxFlashLoan(address token) view returns (uint256)",
  "function flashFee(address token, uint256 amount) view returns (uint256)"
];

// Typed contract interfaces for better type safety
export interface DLoopCoreContract {
  getCurrentSubsidyBps(): Promise<bigint>;
  getCurrentLeverageBps(): Promise<bigint>;
  collateralToken(): Promise<string>;
  debtToken(): Promise<string>;
  convertFromTokenAmountToBaseCurrency(
    amount: bigint,
    token: string,
  ): Promise<bigint>;
  convertFromBaseCurrencyToToken(
    amount: bigint,
    token: string,
  ): Promise<bigint>;
}

export interface DLoopQuoterContract {
  quoteRebalanceAmountToReachTargetLeverage(dLoopCore: string): Promise<
    [bigint, bigint, number]
  >;
}

export interface IncreaseLeverageContract {
  increaseLeverage(
    rebalanceCollateralAmount: bigint,
    swapData: string,
    dLoopCore: string,
  ): Promise<ethers.ContractTransactionResponse>;
  odosRouter(): Promise<string>;
  flashLender(): Promise<string>;
}

export interface DecreaseLeverageContract {
  decreaseLeverage(
    rebalanceDebtAmount: bigint,
    swapData: string,
    dLoopCore: string,
  ): Promise<ethers.ContractTransactionResponse>;
  odosRouter(): Promise<string>;
  flashLender(): Promise<string>;
}

export interface FlashLenderContract {
  maxFlashLoan(token: string): Promise<bigint>;
  flashFee(token: string, amount: bigint): Promise<bigint>;
}

export class ContractManager {
  public readonly provider: ethers.Provider;
  public readonly core: DLoopCoreContract;
  public readonly quoter: DLoopQuoterContract;
  public readonly increaseOdos: IncreaseLeverageContract;
  public readonly decreaseOdos: DecreaseLeverageContract;
  private cachedCollateralToken?: string;
  private cachedDebtToken?: string;
  private cachedFlashLender?: FlashLenderContract;

  constructor(
    provider: ethers.Provider,
    private readonly signer: ethers.Signer,
    private readonly config: BotConfig,
  ) {
    this.provider = provider;
    // Create contract instances with minimal ABIs
    this.core = new ethers.Contract(
      config.contracts.dloopCore,
      IDLoopCoreABI,
      provider,
    ) as unknown as DLoopCoreContract;

    this.quoter = new ethers.Contract(
      config.contracts.dloopQuoter,
      IDLoopQuoterABI,
      provider,
    ) as unknown as DLoopQuoterContract;

    this.increaseOdos = new ethers.Contract(
      config.contracts.increaseOdos,
      IIncreaseLeverageOdosABI,
      signer,
    ) as unknown as IncreaseLeverageContract;

    this.decreaseOdos = new ethers.Contract(
      config.contracts.decreaseOdos,
      IDecreaseLeverageOdosABI,
      signer,
    ) as unknown as DecreaseLeverageContract;
  }

  static async create(config: BotConfig): Promise<ContractManager> {
    const provider = new ethers.JsonRpcProvider(config.network.rpcUrl);
    const signer = new ethers.Wallet(config.network.privateKey!, provider);

    return new ContractManager(provider, signer, config);
  }

  async getSignerAddress(): Promise<string> {
    return await (this.signer as ethers.Signer).getAddress();
  }

  async getCollateralTokenAddress(): Promise<string> {
    if (!this.cachedCollateralToken) {
      this.cachedCollateralToken = await this.core.collateralToken();
    }
    return this.cachedCollateralToken;
  }

  async getDebtTokenAddress(): Promise<string> {
    if (!this.cachedDebtToken) {
      this.cachedDebtToken = await this.core.debtToken();
    }
    return this.cachedDebtToken;
  }

  async getFlashLender(): Promise<FlashLenderContract> {
    if (this.cachedFlashLender) {
      return this.cachedFlashLender;
    }

    let flashLenderAddress: string | undefined;
    try {
      flashLenderAddress = await this.increaseOdos.flashLender();
    } catch {}

    if (!flashLenderAddress || flashLenderAddress === ethers.ZeroAddress) {
      try {
        flashLenderAddress = await this.decreaseOdos.flashLender();
      } catch {}
    }

    if (!flashLenderAddress || flashLenderAddress === ethers.ZeroAddress) {
      throw new Error("Unable to resolve flash lender address from periphery contracts");
    }

    this.cachedFlashLender = new ethers.Contract(
      flashLenderAddress,
      IFlashLenderABI,
      this.provider,
    ) as unknown as FlashLenderContract;

    return this.cachedFlashLender;
  }
}