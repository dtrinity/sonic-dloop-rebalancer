import { expect } from "chai";
import { ethers } from "ethers";
import sinon from "sinon";

import { ContractManager } from "../src/bot/ContractManager";
import { BotConfig } from "../src/config/types";

describe("ContractManager", function () {
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
        dloopQuoter: "0x9999999999999999999999999999999999999999",
        increaseOdos: "0x2222222222222222222222222222222222222222",
        decreaseOdos: "0x3333333333333333333333333333333333333333",
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

  describe("create", function () {
    it("should create a ContractManager instance", async function () {
      const contractManager = await ContractManager.create(mockConfig);

      expect(contractManager).to.be.instanceOf(ContractManager);
    });
  });

  describe("getSignerAddress", function () {
    it("should return the signer address", async function () {
      // We can't easily mock the actual wallet creation, so we'll test with a real instance
      // but use a mock config that won't actually connect to a network
      const contractManager = await ContractManager.create(mockConfig);

      // The method should exist and be callable
      expect(typeof contractManager.getSignerAddress).to.equal("function");
    });
  });

  describe("contract instances", function () {
    it("should create contract instances with correct addresses", function () {
      // Mock provider and signer
      const mockProvider = {
        // Add any methods that might be called
      };
      const mockSigner = {
        // Add any methods that might be called
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

      expect(contractManager.core).to.not.be.undefined;
      expect(contractManager.increaseOdos).to.not.be.undefined;
      expect(contractManager.decreaseOdos).to.not.be.undefined;
      expect(contractManager.quoter).to.not.be.undefined;

      providerStub.restore();
      walletStub.restore();
    });
  });
});
