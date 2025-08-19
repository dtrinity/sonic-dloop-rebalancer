import { ethers } from "ethers";
import { BotConfig } from "../../config/types";

// Use untyped ethers.Contract instances to avoid type issues without typechain.
// Call sites will cast to `any` for specific method invocations.
export type DLoopCoreContract = ethers.Contract;
export type IncreaseLeverageContract = ethers.Contract;
export type DecreaseLeverageContract = ethers.Contract;
export type FlashLenderContract = ethers.Contract;

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
    this.core = new ethers.Contract(
      config.contracts.dloopCore,
      [
        "function quoteRebalanceAmountToReachTargetLeverage() external view returns (uint256, uint256, int8)",
        "function getCurrentSubsidyBps() external view returns (uint256)",
        "function getCurrentLeverageBps() external view returns (uint256)",
        "function collateralToken() external view returns (address)",
        "function debtToken() external view returns (address)",
        "function convertFromTokenAmountToBaseCurrency(uint256, address) external view returns (uint256)",
        "function convertFromBaseCurrencyToToken(uint256, address) external view returns (uint256)",
      ],
      provider,
    ) as DLoopCoreContract;

    this.increaseOdos = new ethers.Contract(
      config.contracts.increaseOdos,
      [
        "function increaseLeverage(uint256, bytes, address) external returns (uint256)",
      ],
      signer,
    ) as IncreaseLeverageContract;

    this.decreaseOdos = new ethers.Contract(
      config.contracts.decreaseOdos,
      [
        "function decreaseLeverage(uint256, bytes, address) external returns (uint256)",
      ],
      signer,
    ) as DecreaseLeverageContract;

    this.flashLender = new ethers.Contract(
      config.contracts.flashLender,
      [
        "function maxFlashLoan(address) external view returns (uint256)",
        "function flashFee(address, uint256) external view returns (uint256)",
      ],
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
