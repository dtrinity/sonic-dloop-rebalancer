/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- tests stub third-party libs and intentionally use any types */
import { WebClient } from "@slack/web-api";
import { expect } from "chai";
import sinon from "sinon";

import { RebalanceResult } from "../config/types";
import { NotificationManager } from "../typescript/rebalance_bot/notification";

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

    // Create notification manager first (this will set up slackClient/slackChannel based on config)
    notificationManager = new NotificationManager(mockConfig);

    // Ensure slackChannel is properly set
    (notificationManager as any).slackChannel =
      mockConfig.notifications.slack?.channel;

    // Now inject our stubbed WebClient
    (notificationManager as any).slackClient = webClientStub;

    // Create a proper stub for postMessage and assign it correctly
    const postMessageStub = sinon.stub().resolves({ ok: true });
    (webClientStub as any).chat = {};
    (webClientStub as any).chat.postMessage = postMessageStub;

    // Create a spy on the sendSlackMessage method to track calls
    // For most tests, make it resolve successfully
    const sendSlackMessageStub = sinon.stub(notificationManager as any, 'sendSlackMessage').resolves();

    consoleLogStub = sinon.stub(console, "log");
    consoleErrorStub = sinon.stub(console, "error");
  });

  afterEach(function () {
    // Only restore console stubs, keep Slack client stubs
    consoleLogStub.restore();
    consoleErrorStub.restore();
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

      const sendSlackMessageStub = (notificationManager as any).sendSlackMessage;
      expect(sendSlackMessageStub.calledOnce).to.be.true;
      const call = sendSlackMessageStub.getCall(0);
      expect(call.args[0]).to.include("Rebalanced"); // Check for success message
      expect(call.args[0]).to.include("INC"); // Increase direction
      expect(call.args[0]).to.include("80%"); // Percentage
      expect(call.args[0]).to.include("5.0 WETH"); // Input amount formatted
      expect(call.args[0]).to.include("0xabcdef1234567890"); // TX hash
    });

    it("should handle Slack errors gracefully", async function () {
      const result: RebalanceResult = {
        success: true,
        direction: -1,
        percentage: 0.9,
        inputAmount: BigInt("5000000000000000000000"), // 5000 dUSD
        txHash: "0xabcdef1234567890",
      };

      (webClientStub.chat as any).postMessage.rejects(
        new Error("Slack API error"),
      );

      // Should not throw
      await expect(notificationManager.notifyRebalanceSuccess(result)).to.not.be
        .rejected;

      // Should log the error
      expect(consoleLogStub.called).to.be.true;
    });

    it("should work without Slack configuration", async function () {
      const configWithoutSlack = { ...mockConfig };
      configWithoutSlack.notifications.slack = {
        token: "",
        channel: "",
      };

      const notificationManagerNoSlack = new NotificationManager(
        configWithoutSlack,
      );

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
      await notificationManager.notifyRebalanceFailure(
        1,
        0.8,
        "Insufficient liquidity",
        true,
      );

      const sendSlackMessageStub = (notificationManager as any).sendSlackMessage;
      expect(sendSlackMessageStub.calledOnce).to.be.true;
      const call = sendSlackMessageStub.getCall(0);
      expect(call.args[0]).to.include("Failed");
      expect(call.args[0]).to.include("INC");
      expect(call.args[0]).to.include("80%");
      expect(call.args[0]).to.include("Insufficient liquidity");
    });

    it("should not send Slack notification for non-final failures", async function () {
      await notificationManager.notifyRebalanceFailure(
        1,
        0.8,
        "Insufficient liquidity",
        false,
      );

      const sendSlackMessageStub = (notificationManager as any).sendSlackMessage;
      expect(sendSlackMessageStub.called).to.be.false;
    });

    it("should indicate when it's the last trial", async function () {
      await notificationManager.notifyRebalanceFailure(
        -1,
        0.1,
        "Price impact too high",
        true,
      );

      const sendSlackMessageStub = (notificationManager as any).sendSlackMessage;
      expect(sendSlackMessageStub.calledOnce).to.be.true;
      const call = sendSlackMessageStub.getCall(0);
      expect(call.args[0]).to.include("DEC");
      expect(call.args[0]).to.include("10%");
      expect(call.args[0]).to.include("all trials exhausted");
    });
  });

  describe("notifySkipped", function () {
    it("should send skip notification", async function () {
      await notificationManager.notifySkipped("No rebalancing needed");

      const sendSlackMessageStub = (notificationManager as any).sendSlackMessage;
      expect(sendSlackMessageStub.calledOnce).to.be.true;
      const call = sendSlackMessageStub.getCall(0);
      expect(call.args[0]).to.include("Skipped");
      expect(call.args[0]).to.include("No rebalancing needed");
    });
  });

  describe("notifyError", function () {
    it("should send error notification", async function () {
      await notificationManager.notifyError("Failed to get quote");

      const sendSlackMessageStub = (notificationManager as any).sendSlackMessage;
      expect(sendSlackMessageStub.calledOnce).to.be.true;
      const call = sendSlackMessageStub.getCall(0);
      expect(call.args[0]).to.include("Bot error");
      expect(call.args[0]).to.include("Failed to get quote");
    });

    it("should sanitize error messages", async function () {
      const sensitiveError =
        "Connection failed with key: xoxb-secret-token-123";
      await notificationManager.notifyError(sensitiveError);

      const payload = (webClientStub.chat as any).postMessage.getCall(0)
        .args[0];
      // The message should be sanitized now
      expect(payload.text).to.include("Connection failed");
      expect(payload.text).to.include("xoxb-[REDACTED]");
      expect(payload.text).to.not.include("xoxb-secret-token-123");
    });
  });

  describe("message sanitization", function () {
    it("should sanitize Slack tokens in error messages", async function () {
      const sensitiveError =
        "Connection failed with token xoxb-1234567890-abcdefghijklmnop";
      await notificationManager.notifyError(sensitiveError);

      const sendSlackMessageStub = (notificationManager as any).sendSlackMessage;
      expect(sendSlackMessageStub.calledOnce).to.be.true;
      const call = sendSlackMessageStub.getCall(0);
      expect(call.args[0]).to.include("xoxb-[REDACTED]");
      expect(call.args[0]).to.not.include("xoxb-1234567890-abcdefghijklmnop");
    });

    it("should sanitize private keys in failure messages", async function () {
      const sensitiveError =
        "Transaction failed: private key 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef exposed";
      await notificationManager.notifyRebalanceFailure(
        1,
        0.8,
        sensitiveError,
        true,
      );

      const sendSlackMessageStub = (notificationManager as any).sendSlackMessage;
      expect(sendSlackMessageStub.calledOnce).to.be.true;
      const call = sendSlackMessageStub.getCall(0);
      expect(call.args[0]).to.include("0x[REDACTED]");
      expect(call.args[0]).to.not.include(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      );
    });

    it("should sanitize sensitive data in skip messages", async function () {
      const sensitiveReason =
        "Config error: PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef is invalid";
      await notificationManager.notifySkipped(sensitiveReason);

      const sendSlackMessageStub = (notificationManager as any).sendSlackMessage;
      expect(sendSlackMessageStub.calledOnce).to.be.true;
      const call = sendSlackMessageStub.getCall(0);
      expect(call.args[0]).to.include("0x[REDACTED]");
      expect(call.args[0]).to.not.include(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      );
    });

    it("should preserve transaction hashes in success messages", async function () {
      const result: RebalanceResult = {
        success: true,
        direction: 1,
        percentage: 0.8,
        inputAmount: BigInt("5000000000000000000"), // 5 WETH
        txHash:
          "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890", // Valid tx hash
      };

      await notificationManager.notifyRebalanceSuccess(result);

      const sendSlackMessageStub = (notificationManager as any).sendSlackMessage;
      expect(sendSlackMessageStub.calledOnce).to.be.true;
      const call = sendSlackMessageStub.getCall(0);
      // Transaction hash should be preserved (not redacted)
      expect(call.args[0]).to.include(
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      );
    });

    it("should handle messages with multiple sensitive values", async function () {
      const complexError =
        "Auth failed: token xoxb-123-abc, key: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef, user token xoxa-456-def";
      await notificationManager.notifyError(complexError);

      const sendSlackMessageStub = (notificationManager as any).sendSlackMessage;
      expect(sendSlackMessageStub.calledOnce).to.be.true;
      const call = sendSlackMessageStub.getCall(0);
      expect(call.args[0]).to.include("xoxb-[REDACTED]");
      expect(call.args[0]).to.include("xoxa-[REDACTED]");
      expect(call.args[0]).to.include("0x[REDACTED]");
      expect(call.args[0]).to.not.include("xoxb-123-abc");
      expect(call.args[0]).to.not.include("xoxa-456-def");
      expect(call.args[0]).to.not.include(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      );
    });
  });

  describe("error handling", function () {
    it("should handle network failures gracefully", async function () {
      (webClientStub.chat as any).postMessage.rejects(
        new Error("Network timeout"),
      );

      // All notification methods should not throw
      await expect(notificationManager.notifySkipped("test")).to.not.be
        .rejected;
      await expect(notificationManager.notifyError("test")).to.not.be.rejected;

      // Should log errors but continue
      expect(consoleErrorStub.called).to.be.true;
    });

    it("should handle invalid Slack responses", async function () {
      // Make sendSlackMessage reject to test error handling
      const sendSlackMessageStub = (notificationManager as any).sendSlackMessage;
      sendSlackMessageStub.rejects(new Error("invalid_auth"));

      await notificationManager.notifySkipped("test");

      // Should log the error
      expect(consoleLogStub.called).to.be.true;
      const errorCall = consoleLogStub
        .getCalls()
        .find(
          (call) =>
            call.args[0].includes("ERROR") &&
            call.args[0].includes("Failed to send Slack message"),
        );
      expect(errorCall).to.not.be.undefined;
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

      // Check that sendSlackMessage was called
      const sendSlackMessageStub = (notificationManager as any).sendSlackMessage;
      expect(sendSlackMessageStub.calledOnce).to.be.true;
      const call = sendSlackMessageStub.getCall(0);
      expect(call.args[0]).to.include("1.5 WETH");
      expect(call.args[0]).to.include("2500.0 dUSD");
    });

    it("should handle very large numbers", async function () {
      const result: RebalanceResult = {
        success: true,
        direction: -1,
        percentage: 1.0,
        inputAmount: BigInt("999999999999999999999999"), // Very large number
        outputAmount: BigInt("1000000000000000000000"), // 1000 dUSD
        txHash: "0xtest",
      };

      await notificationManager.notifyRebalanceSuccess(result);

      // Check that sendSlackMessage was called
      const sendSlackMessageSpy = (notificationManager as any).sendSlackMessage;
      expect(sendSlackMessageSpy.calledOnce).to.be.true;

      // Check that it was called with the right message content
      const call = sendSlackMessageSpy.getCall(0);
      expect(call.args[0]).to.include("dUSD");
    });
  });
});

/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- re-enable after tests */
