/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- tests stub third-party libs and intentionally use any types */
import { expect } from "chai";
import sinon from "sinon";

import { RebalanceResult } from "../../config/types";

describe("NotificationManager - notifyRebalanceSuccess", function () {
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
    expect(payload.channel).to.equal("#test-channel");
    expect(payload.text).to.include("Rebalanced"); // Check for success message
    expect(payload.text).to.include("INC"); // Increase direction
    expect(payload.text).to.include("80%"); // Percentage
    expect(payload.text).to.include("5.0 WETH"); // Input amount formatted
    expect(payload.text).to.include("0xabcdef1234567890"); // TX hash
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

    const NotificationManagerClass = require("../../typescript/rebalance_bot/notification").NotificationManager;
    const notificationManagerNoSlack = new NotificationManagerClass(
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

/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- re-enable after tests */
