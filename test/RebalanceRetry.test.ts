import { expect } from "chai";
import { ethers } from "hardhat";
import sinon from "sinon";

import { ContractManager } from "../typescript/rebalance_bot/contracts";
import { RebalanceManager } from "../typescript/rebalance_bot/rebalance";
import { deployTestFixture, TestFixture } from "./fixtures";

describe("RebalanceRetry", function () {
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

  afterEach(function () {
    sinon.restore();
  });

  describe("retryTransaction", function () {
    it("should treat ECONNREFUSED as retryable error", async function () {
      const retryTransaction = (rebalanceManager as any).retryTransaction.bind(
        rebalanceManager,
      );

      let callCount = 0;

      const mockOperation = async () => {
        callCount++;

        if (callCount === 1) {
          throw new Error("Connection failed: ECONNREFUSED");
        }
        return "success";
      };

      const result = await retryTransaction(mockOperation, "test operation", 3);

      expect(result).to.equal("success");
      expect(callCount).to.equal(2); // First call failed, second succeeded
    });

    it("should treat 'connection refused' as retryable error", async function () {
      const retryTransaction = (rebalanceManager as any).retryTransaction.bind(
        rebalanceManager,
      );

      let callCount = 0;

      const mockOperation = async () => {
        callCount++;

        if (callCount === 1) {
          throw new Error("Network error: connection refused");
        }
        return "success";
      };

      const result = await retryTransaction(mockOperation, "test operation", 3);

      expect(result).to.equal("success");
      expect(callCount).to.equal(2);
    });

    it("should retry up to maxRetries for ECONNREFUSED", async function () {
      const retryTransaction = (rebalanceManager as any).retryTransaction.bind(
        rebalanceManager,
      );

      let callCount = 0;

      const mockOperation = async () => {
        callCount++;
        throw new Error("ECONNREFUSED: Connection refused");
      };

      try {
        await retryTransaction(mockOperation, "test operation", 3);
        expect.fail("Should have thrown after max retries");
      } catch (error) {
        expect(error.message).to.include("ECONNREFUSED");
        expect(callCount).to.equal(3); // All 3 attempts made
      }
    });

    it("should not retry non-retryable errors", async function () {
      const retryTransaction = (rebalanceManager as any).retryTransaction.bind(
        rebalanceManager,
      );

      let callCount = 0;

      const mockOperation = async () => {
        callCount++;
        throw new Error("Invalid transaction");
      };

      try {
        await retryTransaction(mockOperation, "test operation", 3);
        expect.fail("Should have thrown immediately");
      } catch (error) {
        expect(error.message).to.equal("Invalid transaction");
        expect(callCount).to.equal(1); // Only one attempt made
      }
    });

    it("should respect exponential backoff timing", async function () {
      const retryTransaction = (rebalanceManager as any).retryTransaction.bind(
        rebalanceManager,
      );

      const delays: number[] = [];
      const originalSetTimeout = setTimeout;

      // Mock setTimeout to capture delays
      const setTimeoutStub = sinon
        .stub(global, "setTimeout")
        .callsFake((callback: any, delay: number) => {
          delays.push(delay);
          return originalSetTimeout(callback, 0); // Execute immediately for test
        });

      let callCount = 0;

      const mockOperation = async () => {
        callCount++;

        if (callCount <= 2) {
          throw new Error("ECONNREFUSED");
        }
        return "success";
      };

      await retryTransaction(mockOperation, "test operation", 3);

      // Should have 2 delays: 1000ms, 2000ms (exponential backoff)
      expect(delays).to.have.length(2);
      expect(delays[0]).to.equal(1000); // First retry delay
      expect(delays[1]).to.equal(2000); // Second retry delay

      setTimeoutStub.restore();
    });

    it("should handle mixed retryable and non-retryable errors", async function () {
      const retryTransaction = (rebalanceManager as any).retryTransaction.bind(
        rebalanceManager,
      );

      const testCases = [
        { error: "nonce too low", shouldRetry: true },
        { error: "replacement transaction underpriced", shouldRetry: true },
        { error: "rate limit exceeded", shouldRetry: true },
        { error: "timeout occurred", shouldRetry: true },
        { error: "network error", shouldRetry: true },
        { error: "server error 500", shouldRetry: true },
        { error: "ECONNREFUSED", shouldRetry: true },
        { error: "connection refused", shouldRetry: true },
        { error: "insufficient funds", shouldRetry: false },
        { error: "invalid signature", shouldRetry: false },
      ];

      for (const testCase of testCases) {
        let callCount = 0;

        const mockOperation = async () => {
          callCount++;
          throw new Error(testCase.error);
        };

        try {
          await retryTransaction(mockOperation, "test operation", 2);
          expect.fail(`Should have thrown for error: ${testCase.error}`);
        } catch (error) {
          if (testCase.shouldRetry) {
            expect(callCount).to.equal(
              2,
              `Should retry for: ${testCase.error}`,
            );
          } else {
            expect(callCount).to.equal(
              1,
              `Should not retry for: ${testCase.error}`,
            );
          }
        }
      }
    });
  });

  describe("transaction execution retry integration", function () {
    it("should use retry logic in executeTrial", async function () {
      // Set up a mock quote that would trigger increase leverage
      const quote = {
        inputTokenAmount: ethers.parseEther("1"),
        estimatedOutputTokenAmount: ethers.parseEther("2000"),
        direction: 1,
      };

      // Mock the increase leverage contract to fail first, then succeed
      let callCount = 0;
      const mockIncreaseLeverage = sinon.stub().callsFake(() => {
        callCount++;

        if (callCount === 1) {
          throw new Error("ECONNREFUSED: Connection refused");
        }
        return Promise.resolve({
          hash: "0x1234567890abcdef",
          wait: () =>
            Promise.resolve({
              status: 1,
              blockNumber: 12345,
              hash: "0x1234567890abcdef",
              gasUsed: BigInt(500000),
            }),
        });
      });

      (contractManager.increaseOdos as any).increaseLeverage =
        mockIncreaseLeverage;

      // Mock swap data builder to return valid data
      const swapDataBuilderStub = sinon.stub(
        (rebalanceManager as any).swapDataBuilder,
        "buildSwapData",
      );
      swapDataBuilderStub.resolves("0xswapdata");

      const result = await (rebalanceManager as any).executeTrial(
        quote,
        ethers.parseEther("1"),
        "0xswapdata",
        1.0,
      );

      expect(result.success).to.be.true;
      expect(callCount).to.equal(2); // First call failed, second succeeded
      expect(result.txHash).to.equal("0x1234567890abcdef");
    });
  });
});
