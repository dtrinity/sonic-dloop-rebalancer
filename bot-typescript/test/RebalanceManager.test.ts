import { expect } from "chai";
import sinon from "sinon";

import { RebalanceManager } from "../src/bot/RebalanceManager";
import * as erc20 from "../src/common/erc20";
import {
  BotConfig,
  RebalanceQuote,
  RebalanceResult,
} from "../src/config/types";

describe("RebalanceManager", function () {
  let rebalanceManager: RebalanceManager;
  let mockContracts: any;
  let mockConfig: BotConfig;
  let mockQuoteManager: any;
  let mockSwapDataBuilder: any;
  let mockNotificationManager: any;

  beforeEach(function () {
    // Mock the getTokenMetadata function
    sinon
      .stub(erc20, "getTokenMetadata")
      .callsFake(async (provider: any, tokenAddress: string) => {
        if (tokenAddress === "0x5555555555555555555555555555555555555555") {
          return { decimals: 18, symbol: "COL" };
        } else if (
          tokenAddress === "0x6666666666666666666666666666666666666666"
        ) {
          return { decimals: 18, symbol: "DEBT" };
        }
        throw new Error(`Unknown token address: ${tokenAddress}`);
      });

    // Create mock contracts
    mockContracts = {
      getSignerAddress: sinon
        .stub()
        .resolves("0x1234567890123456789012345678901234567890"),
      core: {
        convertFromTokenAmountToBaseCurrency: sinon.stub(),
        convertFromBaseCurrencyToToken: sinon.stub(),
        getCurrentSubsidyBps: sinon.stub(),
      },
      flashLender: {
        maxFlashLoan: sinon.stub(),
        flashFee: sinon.stub(),
      },
      increaseOdos: {
        increaseLeverage: sinon.stub(),
      },
      decreaseOdos: {
        decreaseLeverage: sinon.stub(),
      },
      provider: {
        // Mock provider if needed
      },
    };

    // Create mock config
    mockConfig = {
      network: {
        chainId: 1,
        rpcUrl: "http://localhost:8545",
        odosApiUrl: "https://api.odos.xyz",
        privateKey:
          "0x1234567890123456789012345678901234567890123456789012345678901234",
      },
      contracts: {
        dloopCore: "0x1111111111111111111111111111111111111111",
        increaseOdos: "0x2222222222222222222222222222222222222222",
        decreaseOdos: "0x3333333333333333333333333333333333333333",
        flashLender: "0x4444444444444444444444444444444444444444",
        odosRouter: "0x7777777777777777777777777777777777777777",
      },
      tokens: {
        collateral: {
          address: "0x5555555555555555555555555555555555555555",
        },
        debt: {
          address: "0x6666666666666666666666666666666666666666",
        },
      },
      policy: {
        rebalancePercentageList: [0.1, 0.5, 1.0],
        dryRun: false,
        maxTxRetriesPerTrial: 3,
        loopIntervalSec: 30,
        minSubsidyAmount: {
          "0x6666666666666666666666666666666666666666": "1000000000000000000", // 1 DEBT
        },
      },
      notifications: {
        logLevel: "info",
      },
    };

    // Create the RebalanceManager instance
    rebalanceManager = new RebalanceManager(mockContracts as any, mockConfig);

    // Replace internal dependencies with mocks
    mockQuoteManager = {
      getRebalanceQuote: sinon.stub(),
      checkSubsidyGate: sinon.stub(),
      checkTrialSubsidyGate: sinon.stub(),
    };
    mockSwapDataBuilder = {
      buildSwapData: sinon.stub(),
    };
    mockNotificationManager = {
      notifySkipped: sinon.stub(),
      notifyRebalanceSuccess: sinon.stub(),
      notifyError: sinon.stub(),
      notifyRebalanceFailure: sinon.stub(),
    };

    (rebalanceManager as any).quoteManager = mockQuoteManager;
    (rebalanceManager as any).swapDataBuilder = mockSwapDataBuilder;
    (rebalanceManager as any).notificationManager = mockNotificationManager;
  });

  afterEach(function () {
    sinon.restore();
  });

  describe("executeRebalance", function () {
    it("should skip rebalancing when no quote is returned", async function () {
      mockQuoteManager.getRebalanceQuote.resolves(null);

      await rebalanceManager.executeRebalance();

      expect(mockQuoteManager.getRebalanceQuote.calledOnce).to.be.true;
      expect(mockNotificationManager.notifySkipped.calledOnce).to.be.true;
      expect(mockNotificationManager.notifySkipped.firstCall.args[0]).to.equal(
        "No rebalancing needed",
      );
    });

    it("should skip rebalancing when subsidy check fails", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 500000000000000000n,
        direction: 1,
      };

      mockQuoteManager.getRebalanceQuote.resolves(mockQuote);
      mockQuoteManager.checkSubsidyGate.resolves(false);

      await rebalanceManager.executeRebalance();

      expect(mockQuoteManager.getRebalanceQuote.calledOnce).to.be.true;
      expect(mockQuoteManager.checkSubsidyGate.calledOnce).to.be.true;
      expect(mockNotificationManager.notifySkipped.calledOnce).to.be.true;
      expect(mockNotificationManager.notifySkipped.firstCall.args[0]).to.equal(
        "Subsidy below minimum threshold",
      );
    });

    it("should execute rebalance successfully when all checks pass", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 500000000000000000n,
        direction: 1,
      };

      const mockResult: RebalanceResult = {
        success: true,
        direction: 1,
        percentage: 0.5,
        inputAmount: 500000000000000000n,
        txHash: "0x1234567890abcdef",
      };

      mockQuoteManager.getRebalanceQuote.resolves(mockQuote);
      mockQuoteManager.checkSubsidyGate.resolves(true);
      (rebalanceManager as any).executeRebalanceWithFallback = sinon
        .stub()
        .resolves(mockResult);

      await rebalanceManager.executeRebalance();

      expect(mockQuoteManager.getRebalanceQuote.calledOnce).to.be.true;
      expect(mockQuoteManager.checkSubsidyGate.calledOnce).to.be.true;
      expect((rebalanceManager as any).executeRebalanceWithFallback.calledOnce)
        .to.be.true;
      expect(mockNotificationManager.notifyRebalanceSuccess.calledOnce).to.be
        .true;
    });

    it("should notify error when all trials fail", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 500000000000000000n,
        direction: 1,
      };

      const mockResult: RebalanceResult = {
        success: false,
        direction: 1,
        percentage: 0,
        inputAmount: 0n,
        error: "All trials failed",
      };

      mockQuoteManager.getRebalanceQuote.resolves(mockQuote);
      mockQuoteManager.checkSubsidyGate.resolves(true);
      (rebalanceManager as any).executeRebalanceWithFallback = sinon
        .stub()
        .resolves(mockResult);

      await rebalanceManager.executeRebalance();

      expect(mockNotificationManager.notifyError.calledOnce).to.be.true;
    });
  });

  describe("executeRebalanceWithFallback", function () {
    it("should skip trials with zero amount", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 0n,
        estimatedOutputTokenAmount: 0n,
        direction: 1,
      };

      const result = await (
        rebalanceManager as any
      ).executeRebalanceWithFallback(mockQuote);

      expect(result.success).to.be.false;
      expect(result.error).to.equal("All trials failed");
    });

    it("should skip trial when subsidy check fails", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 500000000000000000n,
        direction: 1,
      };

      mockQuoteManager.checkTrialSubsidyGate.resolves(false);

      const result = await (
        rebalanceManager as any
      ).executeRebalanceWithFallback(mockQuote);

      expect(result.success).to.be.false;
      expect(result.error).to.equal("All trials failed");
    });

    it("should skip trial when flash loan availability check fails", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 500000000000000000n,
        direction: 1,
      };

      mockQuoteManager.checkTrialSubsidyGate.resolves(true);
      (rebalanceManager as any).checkFlashLoanAvailability = sinon
        .stub()
        .resolves(false);

      const result = await (
        rebalanceManager as any
      ).executeRebalanceWithFallback(mockQuote);

      expect(result.success).to.be.false;
      expect(result.error).to.equal("All trials failed");
    });

    it("should return successful result when trial succeeds", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 500000000000000000n,
        direction: 1,
      };

      const mockResult: RebalanceResult = {
        success: true,
        direction: 1,
        percentage: 0.5,
        inputAmount: 500000000000000000n,
        txHash: "0x1234567890abcdef",
      };

      mockQuoteManager.checkTrialSubsidyGate.resolves(true);
      (rebalanceManager as any).checkFlashLoanAvailability = sinon
        .stub()
        .resolves(true);
      mockSwapDataBuilder.buildSwapData.resolves("0xabcdef");
      (rebalanceManager as any).executeTrial = sinon
        .stub()
        .resolves(mockResult);

      const result = await (
        rebalanceManager as any
      ).executeRebalanceWithFallback(mockQuote);

      expect(result.success).to.be.true;
      expect(result.txHash).to.equal("0x1234567890abcdef");
    });
  });

  describe("calculateTrialAmount", function () {
    it("should correctly calculate trial amounts", function () {
      const inputAmount = 1000000000000000000n; // 1 token
      const percentage = 0.5; // 50%

      const result = (rebalanceManager as any).calculateTrialAmount(
        inputAmount,
        percentage,
      );

      expect(result).to.equal(500000000000000000n); // 0.5 tokens
    });
  });

  describe("checkFlashLoanAvailability", function () {
    it("should check flash loan availability for increase leverage", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 500000000000000000n,
        direction: 1, // Increase
      };

      const trialAmount = 500000000000000000n;

      mockContracts.core.convertFromTokenAmountToBaseCurrency.resolves(
        1000000000000000000n,
      );
      mockContracts.core.convertFromBaseCurrencyToToken.resolves(
        500000000000000000n,
      );
      mockContracts.flashLender.maxFlashLoan.resolves(10000000000000000000n); // 10 tokens

      const result = await (rebalanceManager as any).checkFlashLoanAvailability(
        mockQuote,
        trialAmount,
      );

      expect(result).to.be.true;
    });

    it("should check flash loan availability for decrease leverage", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 500000000000000000n,
        direction: -1, // Decrease
      };

      const trialAmount = 500000000000000000n;

      mockContracts.flashLender.maxFlashLoan.resolves(10000000000000000000n); // 10 tokens

      const result = await (rebalanceManager as any).checkFlashLoanAvailability(
        mockQuote,
        trialAmount,
      );

      expect(result).to.be.true;
    });

    it("should return false when flash loan capacity is exceeded", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 500000000000000000n,
        direction: 1, // Increase
      };

      const trialAmount = 500000000000000000n;

      mockContracts.core.convertFromTokenAmountToBaseCurrency.resolves(
        1000000000000000000n,
      );
      mockContracts.core.convertFromBaseCurrencyToToken.resolves(
        500000000000000000n,
      );
      mockContracts.flashLender.maxFlashLoan.resolves(100000000000000000n); // 0.1 tokens (too small)

      const result = await (rebalanceManager as any).checkFlashLoanAvailability(
        mockQuote,
        trialAmount,
      );

      expect(result).to.be.false;
    });
  });

  describe("executeTrial", function () {
    it("should return success result in dry run mode", async function () {
      // Override config for dry run
      const dryRunConfig = {
        ...mockConfig,
        policy: {
          ...mockConfig.policy,
          dryRun: true,
        },
      };
      const dryRunManager = new RebalanceManager(
        mockContracts as any,
        dryRunConfig,
      );

      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 500000000000000000n,
        direction: 1,
      };

      const trialAmount = 500000000000000000n;
      const swapData = "0xabcdef";
      const percentage = 0.5;

      const result = await (dryRunManager as any).executeTrial(
        mockQuote,
        trialAmount,
        swapData,
        percentage,
      );

      expect(result.success).to.be.true;
      expect(result.txHash).to.equal(
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      );
    });

    it("should execute increase leverage transaction successfully", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 500000000000000000n,
        direction: 1, // Increase
      };

      const trialAmount = 500000000000000000n;
      const swapData = "0xabcdef";
      const percentage = 0.5;

      const mockTx = {
        hash: "0x1234567890abcdef",
        wait: sinon.stub().resolves({
          status: 1,
          blockNumber: 123456,
          hash: "0x1234567890abcdef",
          gasUsed: 100000n,
        }),
      };

      mockContracts.increaseOdos.increaseLeverage.resolves(mockTx);

      const result = await (rebalanceManager as any).executeTrial(
        mockQuote,
        trialAmount,
        swapData,
        percentage,
      );

      expect(result.success).to.be.true;
      expect(result.txHash).to.equal("0x1234567890abcdef");
      expect(mockContracts.increaseOdos.increaseLeverage.calledOnce).to.be.true;
    });

    it("should execute decrease leverage transaction successfully", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 500000000000000000n,
        direction: -1, // Decrease
      };

      const trialAmount = 500000000000000000n;
      const swapData = "0xabcdef";
      const percentage = 0.5;

      const mockTx = {
        hash: "0x1234567890abcdef",
        wait: sinon.stub().resolves({
          status: 1,
          blockNumber: 123456,
          hash: "0x1234567890abcdef",
          gasUsed: 100000n,
        }),
      };

      mockContracts.decreaseOdos.decreaseLeverage.resolves(mockTx);

      const result = await (rebalanceManager as any).executeTrial(
        mockQuote,
        trialAmount,
        swapData,
        percentage,
      );

      expect(result.success).to.be.true;
      expect(result.txHash).to.equal("0x1234567890abcdef");
      expect(mockContracts.decreaseOdos.decreaseLeverage.calledOnce).to.be.true;
    });
  });

  afterEach(function () {
    sinon.restore();
  });
});
