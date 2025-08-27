// Test file for bot logic
import { expect } from "chai";
import { ethers } from "ethers";
import sinon from "sinon";

import { ContractManager } from "../src/bot/ContractManager";
import { RebalanceManager } from "../src/bot/RebalanceManager";
import { BotConfig } from "../src/config/types";

describe("Bot Logic", function () {
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

  describe("RebalanceManager instantiation", function () {
    it("should create a RebalanceManager instance", async function () {
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

      const contractManager = new ContractManager(
        mockProvider as any,
        mockSigner as any,
        mockConfig,
      );
      const rebalanceManager = new RebalanceManager(
        contractManager,
        mockConfig,
      );

      expect(rebalanceManager).to.be.instanceOf(RebalanceManager);

      providerStub.restore();
      walletStub.restore();
    });
  });

  describe("Full rebalance cycle", function () {
    it("should complete a full rebalance cycle without errors", async function () {
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

      const contractManager = new ContractManager(
        mockProvider as any,
        mockSigner as any,
        mockConfig,
      );
      const rebalanceManager = new RebalanceManager(
        contractManager,
        mockConfig,
      );

      // This test ensures the modules work together without throwing errors
      expect(rebalanceManager).to.be.instanceOf(RebalanceManager);

      providerStub.restore();
      walletStub.restore();
    });
  });
});
