/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- tests stub third-party libs and intentionally use any types */
import { expect } from "chai";
import sinon from "sinon";

describe("NotificationManager - notifyRebalanceFailure", function () {
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

  it("should send failure notification when it's the last trial", async function () {
    await notificationManager.notifyRebalanceFailure(
      1,
      0.8,
      "Insufficient liquidity",
      true,
    );

    expect((webClientStub.chat as any).postMessage.calledOnce).to.be.true;
    const payload = (webClientStub.chat as any).postMessage.getCall(0)
      .args[0];
    expect(payload.text).to.include("Failed");
    expect(payload.text).to.include("INC");
    expect(payload.text).to.include("80%");
    expect(payload.text).to.include("Insufficient liquidity");
  });

  it("should not send Slack notification for non-final failures", async function () {
    await notificationManager.notifyRebalanceFailure(
      1,
      0.8,
      "Insufficient liquidity",
      false,
    );

    expect((webClientStub.chat as any).postMessage.called).to.be.false;
  });

  it("should indicate when it's the last trial", async function () {
    await notificationManager.notifyRebalanceFailure(
      -1,
      0.1,
      "Price impact too high",
      true,
    );

    const payload = (webClientStub.chat as any).postMessage.getCall(0)
      .args[0];
    expect(payload.text).to.include("DEC");
    expect(payload.text).to.include("10%");
    expect(payload.text).to.include("all trials exhausted");
  });
});

/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- re-enable after tests */
