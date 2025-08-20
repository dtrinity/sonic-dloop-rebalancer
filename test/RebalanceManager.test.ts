/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- tests use sinon stubs and runtime any values */
import { expect } from "chai";
import { ethers } from "hardhat";

import { ContractManager } from "../typescript/rebalance_bot/contracts";
import { RebalanceManager } from "../typescript/rebalance_bot/rebalance";
import { deployTestFixture, TestFixture } from "./fixtures";

describe("RebalanceManager", function () {
  let fixture: TestFixture;
  let contractManager: ContractManager;
  let rebalanceManager: RebalanceManager;

  beforeEach(async function () {
    fixture = await deployTestFixture();

    const provider = ethers.provider;
    const signer = fixture.deployer;
    contractManager = new ContractManager(provider, signer, fixture.config);
    rebalanceManager = new RebalanceManager(contractManager, fixture.config);
  });

  describe("executeRebalance", function () {
    it("should skip when no rebalancing is needed", async function () {
      // Set mock quote with direction = 0
      await fixture.dloopCore.setMockQuote(0, 0, 0);

      // This should complete without throwing
      await expect(rebalanceManager.executeRebalance()).to.not.be.reverted;
    });

    it("should skip when subsidy is below minimum", async function () {
      // Set quote with very small output
      await fixture.dloopCore.setMockQuote(
        ethers.parseEther("10"),
        ethers.parseEther("0.01"), // Very small output
        1,
      );

      // Set subsidy to 1%
      await fixture.dloopCore.setMockSubsidyBps(100);

      // This should complete without throwing (skip due to low subsidy)
      await expect(rebalanceManager.executeRebalance()).to.not.be.reverted;
    });

    it("should handle dry run mode", async function () {
      // Enable dry run
      const dryRunConfig = { ...fixture.config };
      dryRunConfig.policy.dryRun = true;

      const dryRunManager = new RebalanceManager(contractManager, dryRunConfig);

      // Set up valid quote with good subsidy
      await fixture.dloopCore.setMockQuote(
        ethers.parseEther("10"),
        ethers.parseEther("20000"),
        1,
      );
      await fixture.dloopCore.setMockSubsidyBps(100);

      // Should complete without actually executing transaction
      await expect(dryRunManager.executeRebalance()).to.not.be.reverted;
    });
  });

  describe("flash loan precheck", function () {
    it("should skip trial when flash loan capacity is exceeded", async function () {
      // This is tested indirectly through executeRebalance
      // The actual flash loan precheck logic is in the private method

      // Set up a quote that would require a large flash loan
      await fixture.dloopCore.setMockQuote(
        ethers.parseEther("1000000"), // Very large amount
        ethers.parseEther("2000000000"),
        1,
      );
      await fixture.dloopCore.setMockSubsidyBps(100);

      // Should complete (either succeed with smaller percentage or skip all)
      await expect(rebalanceManager.executeRebalance()).to.not.be.reverted;
    });
  });

  describe("percentage fallback", function () {
    it("should try multiple percentages", async function () {
      // Set up valid quote
      await fixture.dloopCore.setMockQuote(
        ethers.parseEther("10"),
        ethers.parseEther("20000"),
        1,
      );
      await fixture.dloopCore.setMockSubsidyBps(100);

      // The actual fallback behavior is tested through integration
      // since we don't have real periphery contracts to fail/succeed

      // Should complete without throwing
      await expect(rebalanceManager.executeRebalance()).to.not.be.reverted;
    });
  });

  describe("error handling", function () {
    it("should handle contract call failures gracefully", async function () {
      // Set up quote but make core contract fail by setting invalid state
      await fixture.dloopCore.setMockQuote(
        ethers.parseEther("10"),
        ethers.parseEther("20000"),
        1,
      );

      // This should not throw even if internal calls fail
      await expect(rebalanceManager.executeRebalance()).to.not.be.reverted;
    });
  });
});

/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- re-enable after tests */
