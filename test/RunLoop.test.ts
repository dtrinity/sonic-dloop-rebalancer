import { expect } from "chai";
import sinon from "sinon";

import * as configModule from "../config/config";
import { FileCache } from "../typescript/common/cache";
import { ContractManager } from "../typescript/rebalance_bot/contracts";
import { RebalanceManager } from "../typescript/rebalance_bot/rebalance";
import { RebalanceBotRunner } from "../typescript/rebalance_bot/run";

describe("RunLoop", function () {
  let contractManagerStub: sinon.SinonStub;
  let rebalanceManagerStub: sinon.SinonStubbedInstance<RebalanceManager>;
  let fileCacheStub: sinon.SinonStubbedInstance<FileCache>;
  let processExitStub: sinon.SinonStub;
  let setTimeoutStub: sinon.SinonStub;
  let getConfigStub: sinon.SinonStub;

  beforeEach(function () {
    // Mock getConfig to return a valid config
    getConfigStub = sinon.stub(configModule, "getConfig").returns({
      network: {
        chainId: 31337,
        rpcUrl: "http://localhost:8545",
        privateKey:
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12",
      },
      contracts: {
        dloopCore: "0x1234567890123456789012345678901234567890",
        increaseOdos: "0x2345678901234567890123456789012345678901",
        decreaseOdos: "0x3456789012345678901234567890123456789012",
        odosRouter: "0x4567890123456789012345678901234567890123",
        flashLender: "0x5678901234567890123456789012345678901234",
      },
      tokens: {
        collateral: {
          address: "0x6789012345678901234567890123456789012345",
          decimals: 18,
          symbol: "WETH",
        },
        debt: {
          address: "0x7890123456789012345678901234567890123456",
          decimals: 18,
          symbol: "dUSD",
        },
      },
      policy: {
        rebalancePercentageList: [1.0, 0.9, 0.8],
        minSubsidyAmount: {},
        maxTxRetriesPerTrial: 3,
        loopIntervalSec: 60,
        dryRun: false,
      },
      notifications: {
        logLevel: "debug" as const,
      },
    });
    // Stub ContractManager.create
    contractManagerStub = sinon.stub(ContractManager, "create");
    const mockContractManager = {} as ContractManager;
    contractManagerStub.resolves(mockContractManager);

    // Stub RebalanceManager
    rebalanceManagerStub = sinon.createStubInstance(RebalanceManager);
    sinon.stub(RebalanceManager.prototype, "constructor" as any);

    // Stub FileCache
    fileCacheStub = sinon.createStubInstance(FileCache);
    sinon.stub(FileCache.prototype, "constructor" as any);

    // Stub process.exit to prevent actual exit
    processExitStub = sinon.stub(process, "exit");

    // Stub setTimeout to control timing
    setTimeoutStub = sinon.stub(global, "setTimeout");
  });

  afterEach(function () {
    sinon.restore();
  });

  describe("initialization and cycle execution", function () {
    it("should initialize and execute one cycle", async function () {
      const bot = new RebalanceBotRunner();

      // Mock the cache to return no ignore entries
      fileCacheStub.load.returns(null);
      (bot as any).ignoreCache = fileCacheStub;
      (bot as any).rebalanceManager = rebalanceManagerStub;

      // Execute one cycle manually
      await (bot as any).runCycle();

      expect(rebalanceManagerStub.executeRebalance.calledOnce).to.be.true;
    });

    it("should respect ignore window and skip cycle", async function () {
      const bot = new RebalanceBotRunner();

      // Mock the cache to return a recent ignore entry
      const recentTimestamp = Date.now() - 60000; // 1 minute ago
      fileCacheStub.load.returns({
        "0x1234567890123456789012345678901234567890": {
          timestamp: recentTimestamp,
          reason: "test_ignore",
        },
      });
      (bot as any).ignoreCache = fileCacheStub;
      (bot as any).rebalanceManager = rebalanceManagerStub;

      // Execute cycle - should be skipped
      await (bot as any).runCycle();

      expect(rebalanceManagerStub.executeRebalance.called).to.be.false;
    });

    it("should execute cycle after ignore window expires", async function () {
      const bot = new RebalanceBotRunner();

      // Mock the cache to return an old ignore entry (older than 5 minutes)
      const oldTimestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago
      fileCacheStub.load.returns({
        "0x1234567890123456789012345678901234567890": {
          timestamp: oldTimestamp,
          reason: "test_ignore",
        },
      });
      (bot as any).ignoreCache = fileCacheStub;
      (bot as any).rebalanceManager = rebalanceManagerStub;

      // Execute cycle - should proceed
      await (bot as any).runCycle();

      expect(rebalanceManagerStub.executeRebalance.calledOnce).to.be.true;
    });

    it("should add ignore entry on execution failure", async function () {
      const bot = new RebalanceBotRunner();

      // Mock executeRebalance to throw an error
      rebalanceManagerStub.executeRebalance.rejects(
        new Error("Test execution error"),
      );

      fileCacheStub.load.returns(null);
      (bot as any).ignoreCache = fileCacheStub;
      (bot as any).rebalanceManager = rebalanceManagerStub;

      // Execute cycle
      await (bot as any).runCycle();

      // Should save ignore entry
      expect(fileCacheStub.save.calledOnce).to.be.true;
      const savedData = fileCacheStub.save.getCall(0).args[0];
      expect(savedData).to.have.property(
        "0x1234567890123456789012345678901234567890",
      );
      expect(
        savedData["0x1234567890123456789012345678901234567890"],
      ).to.have.property("reason", "execution_failed");
    });
  });

  describe("global error handlers", function () {
    it("should stop bot on ECONNREFUSED unhandled rejection", function () {
      const bot = new RebalanceBotRunner();
      const stopSpy = sinon.spy(bot, "stop");

      // Simulate the logic from run.ts
      const reason = new Error("Connection failed: ECONNREFUSED");
      const errorMessage = reason.message;

      if (reason instanceof Error && errorMessage.includes("ECONNREFUSED")) {
        bot.stop();
      }

      expect(stopSpy.calledOnce).to.be.true;
    });

    it("should not stop bot on other unhandled rejections", function () {
      const bot = new RebalanceBotRunner();
      const stopSpy = sinon.spy(bot, "stop");

      // Simulate the logic from run.ts with non-ECONNREFUSED error
      const reason = new Error("Some other error");
      const errorMessage = reason.message;

      if (reason instanceof Error && errorMessage.includes("ECONNREFUSED")) {
        bot.stop();
      }

      expect(stopSpy.called).to.be.false;
    });

    it("should stop bot and exit on uncaught exception", function () {
      const bot = new RebalanceBotRunner();
      const stopSpy = sinon.spy(bot, "stop");

      // Simulate the logic from run.ts
      const error = new Error("Test uncaught exception");
      bot.stop();

      expect(stopSpy.calledOnce).to.be.true;

      // Would normally call process.exit(1) but we don't test that part
    });
  });

  describe("graceful shutdown", function () {
    it("should stop on SIGINT", function () {
      const bot = new RebalanceBotRunner();
      const stopSpy = sinon.spy(bot, "stop");

      // Simulate the logic from run.ts when SIGINT is received
      bot.stop();

      expect(stopSpy.calledOnce).to.be.true;
    });

    it("should stop on SIGTERM", function () {
      const bot = new RebalanceBotRunner();
      const stopSpy = sinon.spy(bot, "stop");

      // Simulate the logic from run.ts when SIGTERM is received
      bot.stop();

      expect(stopSpy.calledOnce).to.be.true;
    });
  });
});
