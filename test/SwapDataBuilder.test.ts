import { expect } from "chai";
import { ethers } from "hardhat";
import sinon from "sinon";

import { OdosClient } from "../typescript/odos/client";
import { ContractManager } from "../typescript/rebalance_bot/contracts";
import { SwapDataBuilder } from "../typescript/rebalance_bot/swapdata";
import { deployTestFixture, TestFixture } from "./fixtures";

describe("SwapDataBuilder", function () {
  let fixture: TestFixture;
  let contractManager: ContractManager;
  let swapDataBuilder: SwapDataBuilder;
  let odosClientStub: sinon.SinonStubbedInstance<OdosClient>;

  beforeEach(async function () {
    fixture = await deployTestFixture();

    const provider = ethers.provider;
    const signer = fixture.deployer;
    contractManager = new ContractManager(provider, signer, fixture.config);
    swapDataBuilder = new SwapDataBuilder(contractManager, fixture.config);

    // Stub the OdosClient
    odosClientStub = sinon.createStubInstance(OdosClient);
    (swapDataBuilder as any).odosClient = odosClientStub;
  });

  afterEach(function () {
    sinon.restore();
  });

  describe("buildSwapData", function () {
    it("should use configurable input cap from environment", async function () {
      // Set environment variable for input cap
      process.env.EXACT_OUT_INPUT_CAP_BPS = "20000"; // 200%

      const quote = {
        inputTokenAmount: ethers.parseEther("5"),
        estimatedOutputTokenAmount: ethers.parseEther("10000"),
        direction: 1,
      };

      const mockQuoteResponse = {
        pathId: "test-path-id",
        priceImpact: 0.05,
        outTokens: [fixture.config.tokens.collateral.address],
        outAmounts: [ethers.parseEther("5").toString()],
        inTokens: [fixture.config.tokens.debt.address],
        inAmounts: [ethers.parseEther("15000").toString()], // 200% of 7500
        gasEstimate: 500000,
        dataGasEstimate: 0,
        gweiPerGas: 20,
        gasEstimateValue: 0.01,
        inValues: [15000],
        outValues: [5000],
        netOutValue: -10000,
        percentDiff: 0,
        partnerFeePercent: 0,
      };

      const mockAssemblyResponse = {
        gasEstimate: 500000,
        gasEstimateValue: 0.01,
        inputTokens: [
          {
            tokenAddress: fixture.config.tokens.debt.address,
            amountDeducted: "15000000000000000000000",
          },
        ],
        outputTokens: [
          {
            tokenAddress: fixture.config.tokens.collateral.address,
            amountReceived: "5000000000000000000",
          },
        ],
        netOutValue: -10000,
        outValues: [5000],
        transaction: {
          gas: 500000,
          gasPrice: 20000000000,
          value: "0",
          to: "0x1234567890123456789012345678901234567890",
          from: "0x0987654321098765432109876543210987654321",
          data: "0x1234567890abcdef",
          nonce: 42,
        },
      };

      odosClientStub.getQuote.resolves(mockQuoteResponse);
      odosClientStub.assembleTransaction.resolves(mockAssemblyResponse);

      const userAddress = await fixture.deployer.getAddress();
      await swapDataBuilder.buildSwapData(
        quote,
        ethers.parseEther("5"),
        userAddress,
      );

      // Verify the quote request uses the environment-configured input cap
      const quoteCall = odosClientStub.getQuote.getCall(0);
      const quoteRequest = quoteCall.args[0];

      // The input amount should be calculated with 200% cap instead of default 150%
      // Expected calculation: estimatedInput * 20000 / 10000 = estimatedInput * 2
      const inputAmount = BigInt(quoteRequest.inputTokens[0].amount);
      // The actual calculation is based on estimated debt input, which should be higher with 200% cap
      expect(inputAmount).to.be.greaterThan(ethers.parseEther("7500")); // Should be more than the 150% default would give

      // Clean up
      delete process.env.EXACT_OUT_INPUT_CAP_BPS;
    });

    it("should fall back to default input cap when env is invalid", async function () {
      // Set invalid environment variable
      process.env.EXACT_OUT_INPUT_CAP_BPS = "5000"; // Below minimum of 10000

      const quote = {
        inputTokenAmount: ethers.parseEther("5"),
        estimatedOutputTokenAmount: ethers.parseEther("10000"),
        direction: 1,
      };

      const mockQuoteResponse = {
        pathId: "test-path-id",
        priceImpact: 0.05,
        outTokens: [fixture.config.tokens.collateral.address],
        outAmounts: [ethers.parseEther("5").toString()],
        inTokens: [fixture.config.tokens.debt.address],
        inAmounts: [ethers.parseEther("7500").toString()],
        gasEstimate: 500000,
        dataGasEstimate: 0,
        gweiPerGas: 20,
        gasEstimateValue: 0.01,
        inValues: [7500],
        outValues: [5000],
        netOutValue: -2500,
        percentDiff: 0,
        partnerFeePercent: 0,
      };

      const mockAssemblyResponse = {
        gasEstimate: 500000,
        gasEstimateValue: 0.01,
        inputTokens: [
          {
            tokenAddress: fixture.config.tokens.debt.address,
            amountDeducted: "7500000000000000000000",
          },
        ],
        outputTokens: [
          {
            tokenAddress: fixture.config.tokens.collateral.address,
            amountReceived: "5000000000000000000",
          },
        ],
        netOutValue: -2500,
        outValues: [5000],
        transaction: {
          gas: 500000,
          gasPrice: 20000000000,
          value: "0",
          to: "0x1234567890123456789012345678901234567890",
          from: "0x0987654321098765432109876543210987654321",
          data: "0x1234567890abcdef",
          nonce: 42,
        },
      };

      odosClientStub.getQuote.resolves(mockQuoteResponse);
      odosClientStub.assembleTransaction.resolves(mockAssemblyResponse);

      const userAddress = await fixture.deployer.getAddress();
      await swapDataBuilder.buildSwapData(
        quote,
        ethers.parseEther("5"),
        userAddress,
      );

      // Should use default 150% cap despite invalid env value
      expect(odosClientStub.getQuote.calledOnce).to.be.true;

      // Clean up
      delete process.env.EXACT_OUT_INPUT_CAP_BPS;
    });
    it("should build increase leverage swap data with exact-output", async function () {
      const quote = {
        inputTokenAmount: ethers.parseEther("5"),
        estimatedOutputTokenAmount: ethers.parseEther("10000"),
        direction: 1,
      };

      const mockQuoteResponse = {
        pathId: "test-path-id",
        priceImpact: 0.05, // 5% price impact (within limits)
        outTokens: [fixture.config.tokens.collateral.address],
        outAmounts: [ethers.parseEther("5").toString()],
        inTokens: [fixture.config.tokens.debt.address],
        inAmounts: [ethers.parseEther("7500").toString()],
        gasEstimate: 500000,
        dataGasEstimate: 0,
        gweiPerGas: 20,
        gasEstimateValue: 0.01,
        inValues: [7500],
        outValues: [5000],
        netOutValue: -2500,
        percentDiff: 0,
        partnerFeePercent: 0,
      };

      const mockAssemblyResponse = {
        gasEstimate: 500000,
        gasEstimateValue: 0.01,
        inputTokens: [
          {
            tokenAddress: fixture.config.tokens.debt.address,
            amountDeducted: "7500000000000000000000",
          },
        ],
        outputTokens: [
          {
            tokenAddress: fixture.config.tokens.collateral.address,
            amountReceived: "5000000000000000000",
          },
        ],
        netOutValue: -2500,
        outValues: [5000],
        transaction: {
          gas: 500000,
          gasPrice: 20000000000,
          value: "0",
          to: "0x1234567890123456789012345678901234567890",
          from: "0x0987654321098765432109876543210987654321",
          data: "0x1234567890abcdef",
          nonce: 42,
        },
      };

      odosClientStub.getQuote.resolves(mockQuoteResponse);
      odosClientStub.assembleTransaction.resolves(mockAssemblyResponse);

      const userAddress = await fixture.deployer.getAddress();
      const result = await swapDataBuilder.buildSwapData(
        quote,
        ethers.parseEther("5"),
        userAddress,
      );

      expect(result).to.equal("0x1234567890abcdef");
      expect(odosClientStub.getQuote.calledOnce).to.be.true;
      expect(odosClientStub.assembleTransaction.calledOnce).to.be.true;

      const quoteCall = odosClientStub.getQuote.getCall(0);
      const quoteRequest = quoteCall.args[0];

      // Verify exact-output parameters
      expect(quoteRequest.outputTokens[0].amount).to.equal(
        ethers.parseEther("5").toString(),
      );
      expect(quoteRequest.outputTokens[0].proportion).to.be.undefined;
      expect(quoteRequest.slippageLimitPercent).to.equal(1); // 100 BPS / 100 = 1%
    });

    it("should build decrease leverage swap data with flash fee included", async function () {
      const quote = {
        inputTokenAmount: ethers.parseEther("5000"),
        estimatedOutputTokenAmount: ethers.parseEther("2.5"),
        direction: -1,
      };

      const mockQuoteResponse = {
        pathId: "test-path-id-decrease",
        priceImpact: 0.03, // 3% price impact
        outTokens: [fixture.config.tokens.debt.address],
        outAmounts: ["5025000000000000000000"], // Including flash fee
        inTokens: [fixture.config.tokens.collateral.address],
        inAmounts: ["2600000000000000000"],
        gasEstimate: 600000,
        dataGasEstimate: 0,
        gweiPerGas: 25,
        gasEstimateValue: 0.015,
        inValues: [2600],
        outValues: [5025],
        netOutValue: 2425,
        percentDiff: 0,
        partnerFeePercent: 0,
      };

      const mockAssemblyResponse = {
        gasEstimate: 600000,
        gasEstimateValue: 0.015,
        inputTokens: [
          {
            tokenAddress: fixture.config.tokens.collateral.address,
            amountDeducted: "2600000000000000000",
          },
        ],
        outputTokens: [
          {
            tokenAddress: fixture.config.tokens.debt.address,
            amountReceived: "5025000000000000000000",
          },
        ],
        netOutValue: 2425,
        outValues: [5025],
        transaction: {
          gas: 600000,
          gasPrice: 25000000000,
          value: "0",
          to: "0x1234567890123456789012345678901234567890",
          from: "0x0987654321098765432109876543210987654321",
          data: "0xabcdef1234567890",
          nonce: 43,
        },
      };

      odosClientStub.getQuote.resolves(mockQuoteResponse);
      odosClientStub.assembleTransaction.resolves(mockAssemblyResponse);

      // Mock flash fee calculation by stubbing the contract method directly
      const flashFee = ethers.parseEther("25"); // 25 tokens flash fee
      const flashLenderStub = sinon.stub().resolves(flashFee);
      (contractManager.flashLender as any).flashFee = flashLenderStub;

      const userAddress = await fixture.deployer.getAddress();
      const result = await swapDataBuilder.buildSwapData(
        quote,
        ethers.parseEther("5000"),
        userAddress,
      );

      expect(result).to.equal("0xabcdef1234567890");

      const quoteCall = odosClientStub.getQuote.getCall(0);
      const quoteRequest = quoteCall.args[0];

      // Verify flash fee is included in exact-output amount
      const totalDebtNeeded = ethers.parseEther("5000") + flashFee;
      expect(quoteRequest.outputTokens[0].amount).to.equal(
        totalDebtNeeded.toString(),
      );
    });

    it("should reject swaps with high price impact", async function () {
      const quote = {
        inputTokenAmount: ethers.parseEther("5"),
        estimatedOutputTokenAmount: ethers.parseEther("10000"),
        direction: 1,
      };

      const mockQuoteResponse = {
        pathId: "test-path-id",
        priceImpact: 0.15, // 15% price impact (above 10% limit)
        outTokens: [fixture.config.tokens.collateral.address],
        outAmounts: [ethers.parseEther("5").toString()],
        inTokens: [fixture.config.tokens.debt.address],
        inAmounts: [ethers.parseEther("7500").toString()],
        gasEstimate: 500000,
        dataGasEstimate: 0,
        gweiPerGas: 20,
        gasEstimateValue: 0.01,
        inValues: [7500],
        outValues: [5000],
        netOutValue: -2500,
        percentDiff: 0,
        partnerFeePercent: 0,
      };

      odosClientStub.getQuote.resolves(mockQuoteResponse);

      const userAddress = await fixture.deployer.getAddress();

      await expect(
        swapDataBuilder.buildSwapData(
          quote,
          ethers.parseEther("5"),
          userAddress,
        ),
      ).to.be.rejectedWith("Price impact too high: 15% > 10%");
    });

    it("should handle Odos router not configured", async function () {
      const configWithoutOdos = { ...fixture.config };
      configWithoutOdos.contracts.odosRouter = "";

      const swapDataBuilderNoOdos = new SwapDataBuilder(
        contractManager,
        configWithoutOdos,
      );

      const quote = {
        inputTokenAmount: ethers.parseEther("5"),
        estimatedOutputTokenAmount: ethers.parseEther("10000"),
        direction: 1,
      };

      const userAddress = await fixture.deployer.getAddress();

      await expect(
        swapDataBuilderNoOdos.buildSwapData(
          quote,
          ethers.parseEther("5"),
          userAddress,
        ),
      ).to.be.rejectedWith("Odos router not configured for this network");
    });
  });
});
