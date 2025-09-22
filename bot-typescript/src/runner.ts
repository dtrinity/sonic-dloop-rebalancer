import { ContractManager } from "./bot/ContractManager";
import { RebalanceManager } from "./bot/RebalanceManager";
import { FileCache } from "./common/cache";
import { logger } from "./common/log";
import { getChainIdFromRpc } from "./common/network";
import { sanitizeError } from "./common/sanitize";
import { getConfig } from "./config/config";
import { IGNORE_DURATION_MS } from "./config/constants";

interface IgnoreEntry {
  timestamp: number;
  reason: string;
}

class RebalanceBotRunner {
  private config = getConfig();
  private contractManager?: ContractManager;
  private rebalanceManager?: RebalanceManager;
  private ignoreCache = new FileCache<{ [key: string]: IgnoreEntry }>(
    "ignoreMemory.json",
  );
  private isRunning = false;
  private chainId?: number;

  async initialize(): Promise<void> {
    // Get chainId from rpcUrl
    this.chainId = await getChainIdFromRpc(this.config.network.rpcUrl);

    logger.info("Initializing DLoop Rebalancer Bot", {
      network: this.chainId,
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
    const ignoreData = this.ignoreCache.load();

    if (!ignoreData) {
      return false;
    }

    const coreAddress = this.config.contracts.dloopCore;
    const entry = ignoreData[coreAddress];

    if (!entry) {
      return false;
    }

    // Ignore for configured duration after last entry
    const ignoreUntil = entry.timestamp + IGNORE_DURATION_MS;
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
    const ignoreData = this.ignoreCache.load() || {};
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
/**
 * Start the Rebalance bot: initialize resources and run the main loop.
 * This function is the primary entry point when the module is executed
 * directly (`node run.js`). It will start the bot and block until stopped.
 */
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

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason, promise) => {
    const errorMessage =
      reason instanceof Error ? reason.message : String(reason);
    logger.error("Unhandled promise rejection:", {
      reason: sanitizeError(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: promise.toString(),
    });

    // Don't exit immediately - let the bot continue running unless it's a critical error
    if (reason instanceof Error && errorMessage.includes("ECONNREFUSED")) {
      logger.error("Critical connection error detected, stopping bot");
      bot.stop();
    }
  });

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception:", {
      message: sanitizeError(error),
      stack: error.stack,
    });
    logger.error("Shutting down due to uncaught exception");
    bot.stop();
    process.exit(1);
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
