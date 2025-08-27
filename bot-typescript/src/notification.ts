import { WebClient } from "@slack/web-api";
import { ethers } from "ethers";

import { formatTokenAmountWithSymbol, getTokenMetadata } from "./common/erc20";
import { logger } from "./common/log";
import { sanitizeForLogs } from "./common/sanitize";
import { BotConfig, RebalanceResult } from "./config/types";

export class NotificationManager {
  private slackClient?: WebClient;
  private slackChannel?: string;

  constructor(
    private readonly config: BotConfig,
    private readonly provider: ethers.Provider,
  ) {
    if (config.notifications.slack) {
      this.slackClient = new WebClient(config.notifications.slack.token);
      this.slackChannel = config.notifications.slack.channel;
    }
  }

  async notifyRebalanceSuccess(result: RebalanceResult): Promise<void> {
    const direction = result.direction === 1 ? "INC" : "DEC";
    const inputTokenAddress =
      result.direction === 1
        ? this.config.tokens.collateral.address
        : this.config.tokens.debt.address;
    const outputTokenAddress =
      result.direction === 1
        ? this.config.tokens.debt.address
        : this.config.tokens.collateral.address;

    const [inputTokenMetadata, outputTokenMetadata] = await Promise.all([
      getTokenMetadata(this.provider, inputTokenAddress),
      result.outputAmount
        ? getTokenMetadata(this.provider, outputTokenAddress)
        : Promise.resolve(null),
    ]);

    const inputAmountFormatted = formatTokenAmountWithSymbol(
      result.inputAmount,
      inputTokenMetadata.decimals,
      inputTokenMetadata.symbol,
    );

    const outputAmountFormatted =
      result.outputAmount && outputTokenMetadata
        ? formatTokenAmountWithSymbol(
            result.outputAmount,
            outputTokenMetadata.decimals,
            outputTokenMetadata.symbol,
          )
        : "unknown";

    const message =
      `✅ Rebalanced core=${this.config.contracts.dloopCore.slice(0, 8)}... ` +
      `dir=${direction} p=${(result.percentage * 100).toFixed(0)}% ` +
      `input=${inputAmountFormatted} output=${outputAmountFormatted} ` +
      `tx=${result.txHash} gas=${result.gasUsed?.toString() || "unknown"}`;

    logger.info(message);
    await this.sendSlackMessage(sanitizeForLogs(message));
  }

  async notifyRebalanceFailure(
    direction: number,
    percentage: number,
    error: string,
    isLastTrial: boolean,
  ): Promise<void> {
    const dirStr = direction === 1 ? "INC" : "DEC";
    const message =
      `❌ Failed dir=${dirStr} p=${(percentage * 100).toFixed(0)}% ` +
      `reason=${error.slice(0, 100)}${error.length > 100 ? "..." : ""} ` +
      `${isLastTrial ? "all trials exhausted" : "trying next..."}`;

    logger.warn(message);

    if (isLastTrial) {
      await this.sendSlackMessage(sanitizeForLogs(message));
    }
  }

  async notifySkipped(reason: string): Promise<void> {
    const message = `⏭️ Skipped rebalancing: ${reason}`;
    logger.info(message);
    await this.sendSlackMessage(sanitizeForLogs(message));
  }

  async notifyError(error: string): Promise<void> {
    const message = `🚨 Bot error: ${error}`;
    logger.error(message);
    await this.sendSlackMessage(sanitizeForLogs(message));
  }

  private async sendSlackMessage(message: string): Promise<void> {
    if (!this.slackClient || !this.slackChannel) {
      return;
    }

    try {
      await this.slackClient.chat.postMessage({
        channel: this.slackChannel,
        text: message,
      });
    } catch (error) {
      logger.error("Failed to send Slack message:", error);
    }
  }
}
