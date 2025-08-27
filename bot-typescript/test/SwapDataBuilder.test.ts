import { expect } from "chai";
import sinon from "sinon";

import { SwapDataBuilder } from "../src/bot/SwapDataBuilder";
import { BotConfig, RebalanceQuote } from "../src/config/types";

describe("SwapDataBuilder", function () {
  let swapDataBuilder: SwapDataBuilder;
  let mockContracts: any;
  let mockConfig: BotConfig;
  let mockOdosClient: any;

  beforeEach(function () {
    // Create mock contracts
    mockContracts = {
      core: {
        convertFromTokenAmountToBaseCurrency: sinon.stub(),
        convertFromBaseCurrencyToToken: sinon.stub(),
      },
      flashLender: {
        flashFee: sinon.stub(),
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
          symbol: "COL",
          decimals: 18,
        },
        debt: {
          address: "0x6666666666666666666666666666666666666666",
          symbol: "DEBT",
          decimals: 18,
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

    // Create the SwapDataBuilder instance
    swapDataBuilder = new SwapDataBuilder(mockContracts as any, mockConfig);

    // Replace internal OdosClient with mock
    mockOdosClient = {
      getQuote: sinon.stub(),
      assembleTransaction: sinon.stub(),
    };
    (swapDataBuilder as any).odosClient = mockOdosClient;
  });

  afterEach(function () {
    sinon.restore();
  });

  describe("buildSwapData", function () {
    it("should throw error when Odos router is not configured", async function () {
      const configWithoutOdosRouter = {
        ...mockConfig,
        contracts: {
          ...mockConfig.contracts,
          odosRouter: undefined as any,
        },
      };

      const swapDataBuilderWithoutRouter = new SwapDataBuilder(
        mockContracts as any,
        configWithoutOdosRouter,
      );

      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 500000000000000000n,
        direction: 1,
      };

      try {
        await swapDataBuilderWithoutRouter.buildSwapData(
          mockQuote,
          500000000000000000n,
          "0x1234567890123456789012345678901234567890",
        );
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.equal(
          "Odos router not configured for this network",
        );
      }
    });

    it("should build swap data for increase leverage", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 500000000000000000n,
        direction: 1, // Increase
      };

      const trialAmount = 500000000000000000n;
      const userAddress = "0x1234567890123456789012345678901234567890";

      mockContracts.core.convertFromTokenAmountToBaseCurrency.resolves(
        1000000000000000000n,
      );
      mockContracts.core.convertFromBaseCurrencyToToken.resolves(
        500000000000000000n,
      );

      const mockQuoteResponse = {
        pathId: "path123",
        priceImpact: 0.01, // 1%
        inTokens: ["0x6666666666666666666666666666666666666666"],
        inAmounts: ["1000000000000000000"],
        outTokens: ["0x5555555555555555555555555555555555555555"],
        outAmounts: ["500000000000000000"],
      };

      const mockAssemblyResponse = {
        transaction: {
          data: "0xabcdef123456",
          to: "0x1111111111111111111111111111111111111111",
          value: "0",
        },
        simulation: {
          isSuccess: true,
        },
      };

      mockOdosClient.getQuote.resolves(mockQuoteResponse);
      mockOdosClient.assembleTransaction.resolves(mockAssemblyResponse);

      const result = await swapDataBuilder.buildSwapData(
        mockQuote,
        trialAmount,
        userAddress,
      );

      expect(result).to.equal("0xabcdef123456");
      expect(mockOdosClient.getQuote.calledOnce).to.be.true;
      expect(mockOdosClient.assembleTransaction.calledOnce).to.be.true;
    });

    it("should build swap data for decrease leverage", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 500000000000000000n,
        direction: -1, // Decrease
      };

      const trialAmount = 500000000000000000n;
      const userAddress = "0x1234567890123456789012345678901234567890";

      mockContracts.flashLender.flashFee.resolves(10000000000000000n); // 0.01 tokens
      mockContracts.core.convertFromTokenAmountToBaseCurrency.resolves(
        1000000000000000000n,
      );
      mockContracts.core.convertFromBaseCurrencyToToken.resolves(
        500000000000000000n,
      );

      const mockQuoteResponse = {
        pathId: "path123",
        priceImpact: 0.01, // 1%
        inTokens: ["0x5555555555555555555555555555555555555555"],
        inAmounts: ["1000000000000000000"],
        outTokens: ["0x6666666666666666666666666666666666666666"],
        outAmounts: ["510000000000000000"], // 0.5 tokens + 0.01 flash fee
      };

      const mockAssemblyResponse = {
        transaction: {
          data: "0xabcdef123456",
          to: "0x1111111111111111111111111111111111111111",
          value: "0",
        },
        simulation: {
          isSuccess: true,
        },
      };

      mockOdosClient.getQuote.resolves(mockQuoteResponse);
      mockOdosClient.assembleTransaction.resolves(mockAssemblyResponse);

      const result = await swapDataBuilder.buildSwapData(
        mockQuote,
        trialAmount,
        userAddress,
      );

      expect(result).to.equal("0xabcdef123456");
      expect(mockOdosClient.getQuote.calledOnce).to.be.true;
      expect(mockOdosClient.assembleTransaction.calledOnce).to.be.true;
    });

    it("should throw error when price impact is too high", async function () {
      const mockQuote: RebalanceQuote = {
        inputTokenAmount: 1000000000000000000n,
        estimatedOutputTokenAmount: 500000000000000000n,
        direction: 1, // Increase
      };

      const trialAmount = 500000000000000000n;
      const userAddress = "0x1234567890123456789012345678901234567890";

      mockContracts.core.convertFromTokenAmountToBaseCurrency.resolves(
        1000000000000000000n,
      );
      mockContracts.core.convertFromBaseCurrencyToToken.resolves(
        500000000000000000n,
      );

      const mockQuoteResponse = {
        pathId: "path123",
        priceImpact: 0.1001, // Just over 10% - too high
        inTokens: ["0x6666666666666666666666666666666666666666"],
        inAmounts: ["1000000000000000000"],
        outTokens: ["0x5555555555555555555555555555555555555555"],
        outAmounts: ["500000000000000000"],
      };

      mockOdosClient.getQuote.resolves(mockQuoteResponse);

      try {
        await swapDataBuilder.buildSwapData(
          mockQuote,
          trialAmount,
          userAddress,
        );
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.include("Price impact too high");
      }
    });
  });
});
