import { expect } from "chai";
import sinon from "sinon";

import { QuoteManager } from "../src/bot/QuoteManager";
import * as erc20 from "../src/common/erc20";
import { BotConfig, RebalanceQuote } from "../src/config/types";

describe("QuoteManager", function () {
  let quoteManager: QuoteManager;
  let mockContracts: any;
  let mockConfig: BotConfig;

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
      core: {
        quoteRebalanceAmountToReachTargetLeverage: sinon.stub(),
        getCurrentSubsidyBps: sinon.stub(),
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

    // Create the QuoteManager instance
    quoteManager = new QuoteManager(mockContracts as any, mockConfig);
  });

  afterEach(function () {
    sinon.restore();
  });

  describe("getRebalanceQuote", function () {
    it("should return null when no rebalancing is needed", async function () {
      mockContracts.core.quoteRebalanceAmountToReachTargetLeverage.resolves([
        0n,
        0n,
        0,
      ]);

      const result = await quoteManager.getRebalanceQuote();

      expect(result).to.be.null;
    });

    it("should return a quote when rebalancing is needed", async function () {
      const mockResult: [bigint, bigint, number] = [
        1000000000000000000n,
        500000000000000000n,
        1,
      ];
      mockContracts.core.quoteRebalanceAmountToReachTargetLeverage.resolves(
        mockResult,
      );

      const result = await quoteManager.getRebalanceQuote();

      expect(result).to.not.be.null;
      expect((result as RebalanceQuote).inputTokenAmount).to.equal(
        1000000000000000000n,
      );
      expect((result as RebalanceQuote).estimatedOutputTokenAmount).to.equal(
        500000000000000000n,
      );
      expect((result as RebalanceQuote).direction).to.equal(1);
    });

    it("should throw error when core contract call fails", async function () {
      mockContracts.core.quoteRebalanceAmountToReachTargetLeverage.rejects(
        new Error("Contract error"),
      );

      try {
        await quoteManager.getRebalanceQuote();
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.equal("Contract error");
      }
    });
  });

  describe("checkSubsidyGate", function () {
    it("should allow rebalancing when no minimum subsidy is configured", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 500000000000000000n,
        direction: 1,
      };

      // No minSubsidyAmount for this token
      const configWithoutMinSubsidy = {
        ...mockConfig,
        policy: {
          ...mockConfig.policy,
          minSubsidyAmount: {},
        },
      };

      const quoteManagerWithoutMinSubsidy = new QuoteManager(
        mockContracts as any,
        configWithoutMinSubsidy,
      );
      mockContracts.core.getCurrentSubsidyBps.resolves(100n); // 1% subsidy

      const result =
        await quoteManagerWithoutMinSubsidy.checkSubsidyGate(mockQuote);

      expect(result).to.be.true;
    });

    it("should allow rebalancing when subsidy meets minimum requirement", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 100000000000000000000n, // 100 tokens
        direction: 1,
      };

      mockContracts.core.getCurrentSubsidyBps.resolves(100n); // 1% subsidy

      const result = await quoteManager.checkSubsidyGate(mockQuote);

      expect(result).to.be.true;
    });

    it("should reject rebalancing when subsidy is below minimum requirement", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 100000000000000000n, // 0.1 token
        direction: 1,
      };

      mockContracts.core.getCurrentSubsidyBps.resolves(100n); // 1% subsidy

      const result = await quoteManager.checkSubsidyGate(mockQuote);

      expect(result).to.be.false;
    });
  });

  describe("checkTrialSubsidyGate", function () {
    it("should allow trial when no minimum subsidy is configured", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 500000000000000000n,
        direction: 1,
      };

      const percentage = 0.5;

      // No minSubsidyAmount for this token
      const configWithoutMinSubsidy = {
        ...mockConfig,
        policy: {
          ...mockConfig.policy,
          minSubsidyAmount: {},
        },
      };

      const quoteManagerWithoutMinSubsidy = new QuoteManager(
        mockContracts as any,
        configWithoutMinSubsidy,
      );
      mockContracts.core.getCurrentSubsidyBps.resolves(100n); // 1% subsidy

      const result = await quoteManagerWithoutMinSubsidy.checkTrialSubsidyGate(
        mockQuote,
        percentage,
      );

      expect(result).to.be.true;
    });

    it("should allow trial when trial subsidy meets minimum requirement", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 200000000000000000000n, // 200 tokens
        direction: 1,
      };

      const percentage = 0.5; // 50% trial

      mockContracts.core.getCurrentSubsidyBps.resolves(100n); // 1% subsidy

      const result = await quoteManager.checkTrialSubsidyGate(
        mockQuote,
        percentage,
      );

      expect(result).to.be.true;
    });

    it("should reject trial when trial subsidy is below minimum requirement", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 10000000000000000000n, // 10 tokens
        direction: 1,
      };

      const percentage = 0.1; // 10% trial

      mockContracts.core.getCurrentSubsidyBps.resolves(100n); // 1% subsidy

      const result = await quoteManager.checkTrialSubsidyGate(
        mockQuote,
        percentage,
      );

      expect(result).to.be.false;
    });
  });

  afterEach(function () {
    sinon.restore();
  });
});
