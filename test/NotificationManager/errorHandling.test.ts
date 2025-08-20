/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- tests stub third-party libs and intentionally use any types */
import { expect } from "chai";
import sinon from "sinon";

describe("NotificationManager - error handling", function () {
  let webClientStub: any;
  let notificationManager: any;
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
    // Reset all stubs and clear module cache for complete isolation
    sinon.restore();
    delete require.cache[require.resolve("../../typescript/rebalance_bot/notification")];

    // Create a completely fresh mock WebClient for each test
    const postMessageStub = sinon.stub().resolves({ ok: true });
    webClientStub = {
      chat: {
        postMessage: postMessageStub,
      },
    } as any;

    consoleLogStub = sinon.stub(console, "log");
    consoleErrorStub = sinon.stub(console, "error");

    // Create notification manager with completely fresh dependencies
    const NotificationManagerClass = class extends (require("../../typescript/rebalance_bot/notification").NotificationManager) {
      constructor(config: any) {
        super(config);
        // Override the slackClient with our mock and ensure slackChannel is set
        (this as any).slackClient = webClientStub;
        (this as any).slackChannel = config.notifications.slack?.channel;
      }
    };

    notificationManager = new NotificationManagerClass(mockConfig);
  });

  afterEach(function () {
    sinon.restore();
  });

  it("should handle network failures gracefully", async function () {
    (webClientStub.chat as any).postMessage.rejects(
      new Error("Network timeout"),
    );

    // All notification methods should not throw
    await expect(notificationManager.notifySkipped("test")).to.not.be
      .rejected;
    await expect(notificationManager.notifyError("test")).to.not.be.rejected;

    // Should log errors but continue - check both console.error and console.log
    expect(consoleErrorStub.called || consoleLogStub.called).to.be.true;
  });

  it("should handle invalid Slack responses", async function () {
    (webClientStub.chat as any).postMessage.rejects(
      new Error("invalid_auth"),
    );

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

/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- re-enable after tests */
