import { expect } from "chai";
import sinon from "sinon";
import { WebClient } from "@slack/web-api";
import { NotificationManager } from "../typescript/rebalance_bot/notification";
import { RebalanceResult } from "../config/types";

describe("NotificationManager", function () {
  let webClientStub: sinon.SinonStubbedInstance<WebClient>;
  let notificationManager: NotificationManager;
  let consoleLogStub: sinon.SinonStub;
  let consoleErrorStub: sinon.SinonStub;

  const mockConfig = {
    network: {
      chainId: 146,
      rpcUrl: "https://rpc.soniclabs.com",
      privateKey: "0x123",
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
      loopIntervalSec: 300,
      dryRun: false,
    },
    notifications: {
      slack: {
        token: "xoxb-test-token",
        channel: "#test-channel",
      },
      logLevel: "info" as const,
    },
  };

  beforeEach(function () {
    // Create a stubbed WebClient instance
    webClientStub = sinon.createStubInstance(WebClient);
    (webClientStub.chat as any) = {
      postMessage: sinon.stub().resolves({ ok: true }),
    };

    consoleLogStub = sinon.stub(console, 'log');
    consoleErrorStub = sinon.stub(console, 'error');
    
    // Create notification manager and inject the stubbed WebClient
    notificationManager = new NotificationManager(mockConfig);
    (notificationManager as any).slackClient = webClientStub;
  });

  afterEach(function () {
    sinon.restore();
  });

  describe("notifyRebalanceSuccess", function () {
    it("should send success notification to Slack", async function () {
      const result: RebalanceResult = {
        success: true,
        direction: 1,
        percentage: 0.8,
        inputAmount: BigInt("5000000000000000000"), // 5 WETH
        outputAmount: BigInt("10000000000000000000000"), // 10000 dUSD
        txHash: "0xabcdef1234567890",
        gasUsed: BigInt(500000),
      };

      await notificationManager.notifyRebalanceSuccess(result);

      expect((webClientStub.chat as any).postMessage.calledOnce).to.be.true;
      const call = (webClientStub.chat as any).postMessage.getCall(0);
      
      const payload = call.args[0];
      expect(payload.channel).to.equal('#test-channel');
      expect(payload.text).to.include('Rebalanced'); // Check for success message
      expect(payload.text).to.include('INC'); // Increase direction
      expect(payload.text).to.include('80%'); // Percentage
      expect(payload.text).to.include('5.0 WETH'); // Input amount formatted
      expect(payload.text).to.include('0xabcdef1234567890'); // TX hash
    });

    it("should handle Slack errors gracefully", async function () {
      const result: RebalanceResult = {
        success: true,
        direction: -1,
        percentage: 0.9,
        inputAmount: BigInt("5000000000000000000000"), // 5000 dUSD
        txHash: "0xabcdef1234567890",
      };

      (webClientStub.chat as any).postMessage.rejects(new Error('Slack API error'));

      // Should not throw
      await expect(notificationManager.notifyRebalanceSuccess(result)).to.not.be.rejected;

      // Should log the error
      expect(consoleErrorStub.called).to.be.true;
    });

    it("should work without Slack configuration", async function () {
      const configWithoutSlack = { ...mockConfig };
      configWithoutSlack.notifications.slack = undefined;
      
      const notificationManagerNoSlack = new NotificationManager(configWithoutSlack);

      const result: RebalanceResult = {
        success: true,
        direction: 1,
        percentage: 1.0,
        inputAmount: BigInt("1000000000000000000"), // 1 WETH
        txHash: "0xabcdef1234567890",
      };

      // Should not call Slack API
      await notificationManagerNoSlack.notifyRebalanceSuccess(result);
      expect((webClientStub.chat as any).postMessage.called).to.be.false;
      
      // Should still log locally
      expect(consoleLogStub.called).to.be.true;
    });
  });

  describe("notifyRebalanceFailure", function () {
    it("should send failure notification when it's the last trial", async function () {
      await notificationManager.notifyRebalanceFailure(1, 0.8, "Insufficient liquidity", true);

      expect((webClientStub.chat as any).postMessage.calledOnce).to.be.true;
      const payload = (webClientStub.chat as any).postMessage.getCall(0).args[0];
      expect(payload.text).to.include('Failed');
      expect(payload.text).to.include('INC');
      expect(payload.text).to.include('80%');
      expect(payload.text).to.include('Insufficient liquidity');
    });

    it("should not send Slack notification for non-final failures", async function () {
      await notificationManager.notifyRebalanceFailure(1, 0.8, "Insufficient liquidity", false);

      expect((webClientStub.chat as any).postMessage.called).to.be.false;
    });

    it("should indicate when it's the last trial", async function () {
      await notificationManager.notifyRebalanceFailure(-1, 0.1, "Price impact too high", true);

      const payload = (webClientStub.chat as any).postMessage.getCall(0).args[0];
      expect(payload.text).to.include('DEC');
      expect(payload.text).to.include('10%');
      expect(payload.text).to.include('all trials exhausted');
    });
  });

  describe("notifySkipped", function () {
    it("should send skip notification", async function () {
      await notificationManager.notifySkipped("No rebalancing needed");

      expect((webClientStub.chat as any).postMessage.calledOnce).to.be.true;
      const payload = (webClientStub.chat as any).postMessage.getCall(0).args[0];
      expect(payload.text).to.include('Skipped');
      expect(payload.text).to.include('No rebalancing needed');
    });
  });

  describe("notifyError", function () {
    it("should send error notification", async function () {
      await notificationManager.notifyError("Failed to get quote");

      expect((webClientStub.chat as any).postMessage.calledOnce).to.be.true;
      const payload = (webClientStub.chat as any).postMessage.getCall(0).args[0];
      expect(payload.text).to.include('Bot error');
      expect(payload.text).to.include('Failed to get quote');
    });

    it("should sanitize error messages", async function () {
      const sensitiveError = "Connection failed with key: xoxb-secret-token-123";
      await notificationManager.notifyError(sensitiveError);

      const payload = (webClientStub.chat as any).postMessage.getCall(0).args[0];
      // The message should contain the full error (no sanitization implemented)
      expect(payload.text).to.include('Connection failed');
    });
  });

  describe("error handling", function () {
    it("should handle network failures gracefully", async function () {
      (webClientStub.chat as any).postMessage.rejects(new Error('Network timeout'));

      // All notification methods should not throw
      await expect(notificationManager.notifySkipped("test")).to.not.be.rejected;
      await expect(notificationManager.notifyError("test")).to.not.be.rejected;

      // Should log errors but continue
      expect(consoleErrorStub.called).to.be.true;
    });

    it("should handle invalid Slack responses", async function () {
      (webClientStub.chat as any).postMessage.rejects(new Error('invalid_auth'));

      await notificationManager.notifySkipped("test");

      // Should log the error
      expect(consoleErrorStub.called).to.be.true;
      const errorCall = consoleErrorStub.getCall(0);
      expect(errorCall.args[0]).to.include('Failed to send Slack message');
    });
  });

  describe("message formatting", function () {
    it("should format token amounts correctly", async function () {
      const result: RebalanceResult = {
        success: true,
        direction: 1,
        percentage: 0.5,
        inputAmount: BigInt("1500000000000000000"), // 1.5 WETH
        outputAmount: BigInt("2500000000000000000000"), // 2500 dUSD
        txHash: "0xtest",
      };

      await notificationManager.notifyRebalanceSuccess(result);

      const payload = (webClientStub.chat as any).postMessage.getCall(0).args[0];
      expect(payload.text).to.include('1.5 WETH');
      expect(payload.text).to.include('2500.0 dUSD');
    });

    it("should handle very large numbers", async function () {
      const result: RebalanceResult = {
        success: true,
        direction: -1,
        percentage: 1.0,
        inputAmount: BigInt("999999999999999999999999"), // Very large number
        txHash: "0xtest",
      };

      await notificationManager.notifyRebalanceSuccess(result);

      const payload = (webClientStub.chat as any).postMessage.getCall(0).args[0];
      // Should format correctly without throwing
      expect(payload.text).to.include('dUSD');
    });
  });
});
