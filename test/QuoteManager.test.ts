import { expect } from "chai";
import { ethers } from "hardhat";

import { ContractManager } from "../typescript/rebalance_bot/contracts";
import { QuoteManager } from "../typescript/rebalance_bot/quote";
import { deployTestFixture, TestFixture } from "./fixtures";

describe("QuoteManager", function () {
  let fixture: TestFixture;
  let contractManager: ContractManager;
  let quoteManager: QuoteManager;

  beforeEach(async function () {
    fixture = await deployTestFixture();

    const provider = ethers.provider;
    const signer = fixture.deployer;
    contractManager = new ContractManager(provider, signer, fixture.config);
    quoteManager = new QuoteManager(contractManager, fixture.config);
  });

  describe("getRebalanceQuote", function () {
    it("should return quote when rebalancing is needed", async function () {
      // Set mock quote with direction = 1 (increase leverage)
      await fixture.dloopCore.setMockQuote(
        ethers.parseEther("10"), // input: 10 WETH
        ethers.parseEther("20000"), // output: 20000 dUSD
        1, // direction: increase
      );

      const quote = await quoteManager.getRebalanceQuote();

      expect(quote).to.not.be.null;
      expect(quote!.inputTokenAmount).to.equal(ethers.parseEther("10"));
      expect(quote!.estimatedOutputTokenAmount).to.equal(
        ethers.parseEther("20000"),
      );
      expect(quote!.direction).to.equal(1);
    });

    it("should return null when no rebalancing is needed", async function () {
      // Set mock quote with direction = 0 (no rebalancing)
      await fixture.dloopCore.setMockQuote(
        0, // input: 0
        0, // output: 0
        0, // direction: no rebalancing
      );

      const quote = await quoteManager.getRebalanceQuote();
      expect(quote).to.be.null;
    });

    it("should return null when input amount is zero", async function () {
      // Set mock quote with zero input
      await fixture.dloopCore.setMockQuote(
        0, // input: 0
        ethers.parseEther("1000"), // output: 1000 dUSD
        1, // direction: increase
      );

      const quote = await quoteManager.getRebalanceQuote();
      expect(quote).to.be.null;
    });
  });

  describe("checkSubsidyGate", function () {
    it("should allow rebalancing when subsidy is above minimum", async function () {
      // Set up a quote for increase leverage (output token is debt)
      const quote = {
        inputTokenAmount: ethers.parseEther("10"),
        estimatedOutputTokenAmount: ethers.parseEther("20000"),
        direction: 1,
      };

      // Set subsidy to 1% (100 bps)
      await fixture.dloopCore.setMockSubsidyBps(100);

      // Expected subsidy = 20000 * 100 / 10000 = 200 dUSD
      // Minimum subsidy = 0.1 dUSD (set in fixture)
      // 200 > 0.1, so should allow

      const allowed = await quoteManager.checkSubsidyGate(quote);
      expect(allowed).to.be.true;
    });

    it("should reject rebalancing when subsidy is below minimum", async function () {
      const quote = {
        inputTokenAmount: ethers.parseEther("10"),
        estimatedOutputTokenAmount: ethers.parseEther("1"), // Very small output
        direction: 1,
      };

      // Set subsidy to 1% (100 bps)
      await fixture.dloopCore.setMockSubsidyBps(100);

      // Expected subsidy = 1 * 100 / 10000 = 0.01 dUSD
      // Minimum subsidy = 0.1 dUSD (set in fixture)
      // 0.01 < 0.1, so should reject

      const allowed = await quoteManager.checkSubsidyGate(quote);
      expect(allowed).to.be.false;
    });

    it("should allow rebalancing when no minimum subsidy is configured", async function () {
      // Create config without minimum subsidy for the output token
      const configWithoutMinSubsidy = { ...fixture.config };
      configWithoutMinSubsidy.policy.minSubsidyAmount = {};

      const quoteManagerWithoutMin = new QuoteManager(
        contractManager,
        configWithoutMinSubsidy,
      );

      const quote = {
        inputTokenAmount: ethers.parseEther("10"),
        estimatedOutputTokenAmount: ethers.parseEther("1"),
        direction: 1,
      };

      await fixture.dloopCore.setMockSubsidyBps(100);

      const allowed = await quoteManagerWithoutMin.checkSubsidyGate(quote);
      expect(allowed).to.be.true;
    });

    it("should handle decrease leverage direction (collateral output)", async function () {
      const quote = {
        inputTokenAmount: ethers.parseEther("1000"), // 1000 dUSD
        estimatedOutputTokenAmount: ethers.parseEther("0.5"), // 0.5 WETH
        direction: -1, // decrease leverage, output is collateral
      };

      // Set subsidy to 2% (200 bps)
      await fixture.dloopCore.setMockSubsidyBps(200);

      // Expected subsidy = 0.5 * 200 / 10000 = 0.01 WETH
      // Minimum subsidy = 0.1 WETH (set in fixture)
      // 0.01 < 0.1, so should reject

      const allowed = await quoteManager.checkSubsidyGate(quote);
      expect(allowed).to.be.false;
    });
  });
});
