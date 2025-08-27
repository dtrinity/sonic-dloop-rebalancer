import { ethers } from "ethers";

import { BotConfig } from "../config/types";
import { IDLoopCore__factory } from "../../../bot-solidity-contracts/typechain-types/factories/IDLoopCore__factory";
import { IIncreaseLeverageOdos__factory } from "../../../bot-solidity-contracts/typechain-types/factories/IIncreaseLeverageOdos__factory";
import { IDecreaseLeverageOdos__factory } from "../../../bot-solidity-contracts/typechain-types/factories/IDecreaseLeverageOdos__factory";
import { IFlashLender__factory } from "../../../bot-solidity-contracts/typechain-types/factories/IFlashLender__factory";

// Typed contract interfaces for better type safety
export interface DLoopCoreContract extends ethers.Contract {
  quoteRebalanceAmountToReachTargetLeverage(): Promise<
    [bigint, bigint, number]
  >;
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

export interface IncreaseLeverageContract extends ethers.Contract {
  increaseLeverage(
    rebalanceCollateralAmount: bigint,
    swapData: string,
    dLoopCore: string,
  ): Promise<ethers.ContractTransactionResponse>;
}

export interface DecreaseLeverageContract extends ethers.Contract {
  decreaseLeverage(
    rebalanceDebtAmount: bigint,
    swapData: string,
    dLoopCore: string,
  ): Promise<ethers.ContractTransactionResponse>;
}

export interface FlashLenderContract extends ethers.Contract {
  maxFlashLoan(token: string): Promise<bigint>;
  flashFee(token: string, amount: bigint): Promise<bigint>;
}

export class ContractManager {
  public readonly core: DLoopCoreContract;
  public readonly increaseOdos: IncreaseLeverageContract;
  public readonly decreaseOdos: DecreaseLeverageContract;
  public readonly flashLender: FlashLenderContract;

  constructor(
    private readonly provider: ethers.Provider,
    private readonly signer: ethers.Signer,
    private readonly config: BotConfig,
  ) {
    // Create contract instances with minimal ABIs
    this.core = IDLoopCore__factory.connect(
      config.contracts.dloopCore,
      provider,
    ) as DLoopCoreContract;

    this.increaseOdos = IIncreaseLeverageOdos__factory.connect(
      config.contracts.increaseOdos,
      signer,
    ) as IncreaseLeverageContract;

    this.decreaseOdos = IDecreaseLeverageOdos__factory.connect(
      config.contracts.decreaseOdos,
      signer,
    ) as DecreaseLeverageContract;

    this.flashLender = IFlashLender__factory.connect(
      config.contracts.flashLender,
      provider,
    ) as FlashLenderContract;
  }

  static async create(config: BotConfig): Promise<ContractManager> {
    const provider = new ethers.JsonRpcProvider(config.network.rpcUrl);
    const signer = new ethers.Wallet(config.network.privateKey!, provider);

    return new ContractManager(provider, signer, config);
  }

  async getSignerAddress(): Promise<string> {
    return await (this.signer as ethers.Signer).getAddress();
  }
}