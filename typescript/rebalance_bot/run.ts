import { getConfig } from "../../config/config";
import { logger } from "../common/log";
import { FileCache } from "../common/cache";
import { ContractManager } from "./contracts";
import { RebalanceManager } from "./rebalance";

interface IgnoreEntry {
  timestamp: number;
  reason: string;
}

class RebalanceBotRunner {
  private config = getConfig();
  private contractManager?: ContractManager;
  private rebalanceManager?: RebalanceManager;
  private ignoreCache = new FileCache("ignoreMemory.json");
  private isRunning = false;

  async initialize(): Promise<void> {
    logger.info("Initializing DLoop Rebalancer Bot", {
      network: this.config.network.chainId,
      core: this.config.contracts.dloopCore,
      dryRun: this.config.policy.dryRun || false,
    });

    this.contractManager = await ContractManager.create(this.config);
    this.rebalanceManager = new RebalanceManager(
      this.contractManager,
      this.config,
    );

    logger.info("Bot initialized successfully");
  }

  async start(): Promise<void> {
    if (!this.rebalanceManager) {
      throw new Error("Bot not initialized. Call initialize() first.");
    }

    this.isRunning = true;
    logger.info(
      `Starting bot loop with ${this.config.policy.loopIntervalSec}s interval`,
    );

    while (this.isRunning) {
      try {
        await this.runCycle();
      } catch (error) {
        logger.error("Bot cycle failed:", error);
      }

      if (this.isRunning) {
        logger.debug(
          `Sleeping for ${this.config.policy.loopIntervalSec} seconds`,
        );
        await this.sleep(this.config.policy.loopIntervalSec * 1000);
      }
    }

    logger.info("Bot stopped");
  }

  stop(): void {
    logger.info("Stopping bot...");
    this.isRunning = false;
  }

  private async runCycle(): Promise<void> {
    logger.debug("Starting rebalance cycle");

    // Check if we should skip this cycle due to recent ignore
    if (this.shouldIgnoreCycle()) {
      logger.debug("Skipping cycle due to recent ignore entry");
      return;
    }

    try {
      await this.rebalanceManager!.executeRebalance();
    } catch (error) {
      logger.error("Rebalance execution failed:", error);

      // Add ignore entry to prevent spam
      this.addIgnoreEntry("execution_failed");
    }
  }

  private shouldIgnoreCycle(): boolean {
    const ignoreData = this.ignoreCache.load<{ [key: string]: IgnoreEntry }>();
    if (!ignoreData) {
      return false;
    }

    const coreAddress = this.config.contracts.dloopCore;
    const entry = ignoreData[coreAddress];

    if (!entry) {
      return false;
    }

    // Ignore for 5 minutes after last entry
    const ignoreUntil = entry.timestamp + 5 * 60 * 1000;
    const now = Date.now();

    if (now < ignoreUntil) {
      logger.debug(
        `Ignoring until ${new Date(ignoreUntil).toISOString()}, reason: ${entry.reason}`,
      );
      return true;
    }

    return false;
  }

  private addIgnoreEntry(reason: string): void {
    const ignoreData =
      this.ignoreCache.load<{ [key: string]: IgnoreEntry }>() || {};
    const coreAddress = this.config.contracts.dloopCore;

    ignoreData[coreAddress] = {
      timestamp: Date.now(),
      reason,
    };

    this.ignoreCache.save(ignoreData);
    logger.debug(`Added ignore entry for ${coreAddress}: ${reason}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Main entry point
async function main(): Promise<void> {
  const bot = new RebalanceBotRunner();

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    logger.info("Received SIGINT, shutting down gracefully...");
    bot.stop();
  });

  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM, shutting down gracefully...");
    bot.stop();
  });

  try {
    await bot.initialize();
    await bot.start();
  } catch (error) {
    logger.error("Bot failed to start:", error);
    process.exit(1);
  }
}

// Run the bot if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    logger.error("Unhandled error:", error);
    process.exit(1);
  });
}

export { RebalanceBotRunner };
