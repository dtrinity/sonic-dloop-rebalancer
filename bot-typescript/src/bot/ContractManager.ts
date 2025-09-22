import { ethers } from "ethers";

import { BotConfig } from "../config/types";

// ABI definitions for contracts
const IDLoopCoreABI = [
  "function getCurrentSubsidyBps() view returns (uint256)",
  "function getCurrentLeverageBps() view returns (uint256)",
  "function collateralToken() view returns (address)",
  "function debtToken() view returns (address)",
  "function convertFromTokenAmountToBaseCurrency(uint256 amount, address token) view returns (uint256)",
  "function convertFromBaseCurrencyToToken(uint256 amount, address token) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function getTotalCollateralAndDebtOfUserInBase(address user) view returns (uint256, uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function minDeviationBps() view returns (uint256)",
  "function targetLeverageBps() view returns (uint256)",
  "function setMinDeviationBps(uint256 _minDeviationBps) returns ()"
];

const IDLoopQuoterABI = [
  "function quoteRebalanceAmountToReachTargetLeverage(address dLoopCore) view returns (uint256, uint256, int8)"
];

const IIncreaseLeverageOdosABI = [
  "function increaseLeverage(uint256 rebalanceCollateralAmount, bytes swapData, address dLoopCore) returns (uint256)",
  "function odosRouter() view returns (address)",
  "function flashLender() view returns (address)",
  "function estimateFlashLoanSwapOutputCollateralAmount(uint256 rebalanceCollateralAmount) view returns (uint256)"
];

const IDecreaseLeverageOdosABI = [
  "function decreaseLeverage(uint256 rebalanceDebtAmount, bytes swapData, address dLoopCore) returns (uint256)",
  "function odosRouter() view returns (address)",
  "function flashLender() view returns (address)",
  "function estimateFlashLoanSwapOutputDebtAmount(uint256 rebalanceDebtAmount, address dLoopCore) view returns (uint256)"
];


const IFlashLenderABI = [
  "function maxFlashLoan(address token) view returns (uint256)",
  "function flashFee(address token, uint256 amount) view returns (uint256)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)"
];

// dLEND Pool ABI - only the functions we need for the donation attack
const IDLEND_POOL_ABI = [
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)"
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
  balanceOf(account: string): Promise<bigint>;
  getTotalCollateralAndDebtOfUserInBase(user: string): Promise<[bigint, bigint]>;
  approve(spender: string, amount: bigint): Promise<ethers.ContractTransactionResponse>;
  allowance(owner: string, spender: string): Promise<bigint>;
  minDeviationBps(): Promise<bigint>;
  targetLeverageBps(): Promise<bigint>;
  setMinDeviationBps(_minDeviationBps: bigint): Promise<ethers.ContractTransactionResponse>;
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
  estimateFlashLoanSwapOutputCollateralAmount(
    rebalanceCollateralAmount: bigint,
  ): Promise<bigint>;
}

export interface DecreaseLeverageContract {
  decreaseLeverage(
    rebalanceDebtAmount: bigint,
    swapData: string,
    dLoopCore: string,
  ): Promise<ethers.ContractTransactionResponse>;
  odosRouter(): Promise<string>;
  flashLender(): Promise<string>;
  estimateFlashLoanSwapOutputDebtAmount(
    rebalanceDebtAmount: bigint,
    dLoopCore: string,
  ): Promise<bigint>;
}

export interface FlashLenderContract {
  maxFlashLoan(token: string): Promise<bigint>;
  flashFee(token: string, amount: bigint): Promise<bigint>;
}

export interface ERC20Contract {
  approve(spender: string, amount: bigint): Promise<ethers.ContractTransactionResponse>;
  allowance(owner: string, spender: string): Promise<bigint>;
  balanceOf(account: string): Promise<bigint>;
}

export interface DLENDPoolContract {
  supply(
    asset: string,
    amount: bigint,
    onBehalfOf: string,
    referralCode: number
  ): Promise<ethers.ContractTransactionResponse>;
  getUserAccountData(user: string): Promise<[bigint, bigint, bigint, bigint, bigint, bigint]>;
}

export class ContractManager {
  public readonly provider: ethers.Provider;
  public readonly core: DLoopCoreContract;
  public readonly quoter: DLoopQuoterContract;
  public readonly increaseOdos: IncreaseLeverageContract;
  public readonly decreaseOdos: DecreaseLeverageContract;
  public readonly signer: ethers.Signer;
  private cachedCollateralToken?: string;
  private cachedDebtToken?: string;
  private cachedFlashLender?: FlashLenderContract;

  constructor(
    provider: ethers.Provider,
    private readonly _signer: ethers.Signer,
    private readonly config: BotConfig,
  ) {
    this.provider = provider;
    // Create contract instances with minimal ABIs
    this.core = new ethers.Contract(
      config.contracts.dloopCore,
      IDLoopCoreABI,
      _signer,
    ) as unknown as DLoopCoreContract;

    this.quoter = new ethers.Contract(
      config.contracts.dloopQuoter,
      IDLoopQuoterABI,
      provider,
    ) as unknown as DLoopQuoterContract;

    this.increaseOdos = new ethers.Contract(
      config.contracts.increaseOdos,
      IIncreaseLeverageOdosABI,
      _signer,
    ) as unknown as IncreaseLeverageContract;

    this.decreaseOdos = new ethers.Contract(
      config.contracts.decreaseOdos,
      IDecreaseLeverageOdosABI,
      _signer,
    ) as unknown as DecreaseLeverageContract;

    this.signer = _signer;
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

  async getCollateralToken(): Promise<ERC20Contract> {
    const collateralToken = new ethers.Contract(
        await this.core.collateralToken(),
        ERC20_ABI,
        this.signer,
      ) as unknown as ERC20Contract;
    return collateralToken;
  }

  async getDebtToken(): Promise<ERC20Contract> {
    const debtToken = new ethers.Contract(
      await this.core.debtToken(),
      ERC20_ABI,
      this.signer,
    ) as unknown as ERC20Contract
    return debtToken;
  }

  async getDLENDPool(): Promise<{ pool: DLENDPoolContract; poolAddress: string }> {
    // Add dLEND pool functions to the core ABI temporarily
    const dLENDPoolABI = [
      "function getLendingPoolAddress() view returns (address)",
    ];

    const coreWithDLEND = new ethers.Contract(
      this.config.contracts.dloopCore,
      [...IDLoopCoreABI, ...dLENDPoolABI],
      this.provider, // Use provider for view calls
    ) as any;

    const poolAddress = await coreWithDLEND.getLendingPoolAddress();

    const dLENDPool = new ethers.Contract(
      poolAddress,
      IDLEND_POOL_ABI,
      this.signer,
    ) as unknown as DLENDPoolContract;

    return { pool: dLENDPool, poolAddress };
  }
}