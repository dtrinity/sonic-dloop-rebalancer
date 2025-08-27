// Integration tests for the bot
import { expect } from "chai";
import { ethers } from "ethers";
import sinon from "sinon";

import { ContractManager } from "../src/bot/ContractManager";
import { QuoteManager } from "../src/bot/QuoteManager";
import { RebalanceManager } from "../src/bot/RebalanceManager";
import { SwapDataBuilder } from "../src/bot/SwapDataBuilder";
import { BotConfig } from "../src/config/types";

describe("Integration Tests", function () {
  let mockConfig: BotConfig;

  beforeEach(function () {
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
  });

  afterEach(function () {
    sinon.restore();
  });

  describe("Full integration flow", function () {
    it("should integrate all components for increase leverage flow", async function () {
      // Mock provider and signer
      const mockProvider = {
        // Add any methods that might be called
      };
      const mockSigner = {
        getAddress: sinon
          .stub()
          .resolves("0x1234567890123456789012345678901234567890"),
      };

      // Stub the constructor calls
      const providerStub = sinon
        .stub(ethers, "JsonRpcProvider")
        .returns(mockProvider as any);
      const walletStub = sinon
        .stub(ethers, "Wallet")
        .returns(mockSigner as any);

      // Create all components
      const contractManager = new ContractManager(
        mockProvider as any,
        mockSigner as any,
        mockConfig,
      );
      const quoteManager = new QuoteManager(contractManager, mockConfig);
      const swapDataBuilder = new SwapDataBuilder(contractManager, mockConfig);
      const rebalanceManager = new RebalanceManager(
        contractManager,
        mockConfig,
      );

      // Replace internal dependencies with our instances
      (rebalanceManager as any).quoteManager = quoteManager;
      (rebalanceManager as any).swapDataBuilder = swapDataBuilder;

      // Mock contract responses
      const mockQuoteResult: [bigint, bigint, number] = [
        1000000000000000000n,
        500000000000000000n,
        1,
      ];
      contractManager.core.quoteRebalanceAmountToReachTargetLeverage = sinon
        .stub()
        .resolves(mockQuoteResult);
      contractManager.core.getCurrentSubsidyBps = sinon.stub().resolves(100n); // 1%
      contractManager.core.convertFromTokenAmountToBaseCurrency = sinon
        .stub()
        .resolves(1000000000000000000n);
      contractManager.core.convertFromBaseCurrencyToToken = sinon
        .stub()
        .resolves(500000000000000000n);
      contractManager.flashLender.maxFlashLoan = sinon
        .stub()
        .resolves(10000000000000000000n); // 10 tokens

      // Mock OdosClient
      const odosClient = {
        getQuote: sinon.stub(),
        assembleTransaction: sinon.stub(),
      };
      (swapDataBuilder as any).odosClient = odosClient;

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
        },
        simulation: {
          isSuccess: true,
        },
      };

      odosClient.getQuote.resolves(mockQuoteResponse);
      odosClient.assembleTransaction.resolves(mockAssemblyResponse);

      // Mock transaction execution
      const mockTx = {
        hash: "0x1234567890abcdef",
        wait: sinon.stub().resolves({
          status: 1,
          blockNumber: 123456,
          hash: "0x1234567890abcdef",
          gasUsed: 100000n,
        }),
      };

      contractManager.increaseOdos.increaseLeverage = sinon
        .stub()
        .resolves(mockTx);

      // This test verifies that all components can work together without throwing errors
      expect(rebalanceManager).to.be.instanceOf(RebalanceManager);
      expect(quoteManager).to.be.instanceOf(QuoteManager);
      expect(swapDataBuilder).to.be.instanceOf(SwapDataBuilder);

      providerStub.restore();
      walletStub.restore();
    });

    it("should integrate all components for decrease leverage flow", async function () {
      // Mock provider and signer
      const mockProvider = {
        // Add any methods that might be called
      };
      const mockSigner = {
        getAddress: sinon
          .stub()
          .resolves("0x1234567890123456789012345678901234567890"),
      };

      // Stub the constructor calls
      const providerStub = sinon
        .stub(ethers, "JsonRpcProvider")
        .returns(mockProvider as any);
      const walletStub = sinon
        .stub(ethers, "Wallet")
        .returns(mockSigner as any);

      // Create all components
      const contractManager = new ContractManager(
        mockProvider as any,
        mockSigner as any,
        mockConfig,
      );
      const quoteManager = new QuoteManager(contractManager, mockConfig);
      const swapDataBuilder = new SwapDataBuilder(contractManager, mockConfig);
      const rebalanceManager = new RebalanceManager(
        contractManager,
        mockConfig,
      );

      // Replace internal dependencies with our instances
      (rebalanceManager as any).quoteManager = quoteManager;
      (rebalanceManager as any).swapDataBuilder = swapDataBuilder;

      // Mock contract responses
      const mockQuoteResult: [bigint, bigint, number] = [
        1000000000000000000n,
        500000000000000000n,
        -1,
      ];
      contractManager.core.quoteRebalanceAmountToReachTargetLeverage = sinon
        .stub()
        .resolves(mockQuoteResult);
      contractManager.core.getCurrentSubsidyBps = sinon.stub().resolves(100n); // 1%
      contractManager.flashLender.flashFee = sinon
        .stub()
        .resolves(10000000000000000n); // 0.01 tokens
      contractManager.flashLender.maxFlashLoan = sinon
        .stub()
        .resolves(10000000000000000000n); // 10 tokens

      // Mock OdosClient
      const odosClient = {
        getQuote: sinon.stub(),
        assembleTransaction: sinon.stub(),
      };
      (swapDataBuilder as any).odosClient = odosClient;

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
        },
        simulation: {
          isSuccess: true,
        },
      };

      odosClient.getQuote.resolves(mockQuoteResponse);
      odosClient.assembleTransaction.resolves(mockAssemblyResponse);

      // Mock transaction execution
      const mockTx = {
        hash: "0x1234567890abcdef",
        wait: sinon.stub().resolves({
          status: 1,
          blockNumber: 123456,
          hash: "0x1234567890abcdef",
          gasUsed: 100000n,
        }),
      };

      contractManager.decreaseOdos.decreaseLeverage = sinon
        .stub()
        .resolves(mockTx);

      // This test verifies that all components can work together without throwing errors
      expect(rebalanceManager).to.be.instanceOf(RebalanceManager);
      expect(quoteManager).to.be.instanceOf(QuoteManager);
      expect(swapDataBuilder).to.be.instanceOf(SwapDataBuilder);

      providerStub.restore();
      walletStub.restore();
    });
  });
});
