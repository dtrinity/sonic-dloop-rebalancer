import { expect } from "chai";

import { sanitizeError, sanitizeForLogs } from "../typescript/common/sanitize";

describe("Sanitize", function () {
  describe("sanitizeForLogs", function () {
    it("should redact Slack bot tokens", function () {
      const message =
        "Failed to connect with token xoxb-1234567890-abcdefghijklmnop";
      const sanitized = sanitizeForLogs(message);
      expect(sanitized).to.equal(
        "Failed to connect with token xoxb-[REDACTED]",
      );
    });

    it("should redact Slack app tokens", function () {
      const message = "Using token xoxa-2-1234567890-abcdefghijklmnop";
      const sanitized = sanitizeForLogs(message);
      expect(sanitized).to.equal("Using token xoxa-[REDACTED]");
    });

    it("should redact Slack user tokens", function () {
      const message = "User token: xoxp-1234567890-abcdefghijklmnop-qrstuvwxyz";
      const sanitized = sanitizeForLogs(message);
      expect(sanitized).to.equal("User token: xoxp-[REDACTED]");
    });

    it("should redact private keys with context", function () {
      const testCases = [
        {
          input:
            "private key: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          expected: "private key: 0x[REDACTED]",
        },
        {
          input:
            "PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          expected: "PRIVATE_KEY=0x[REDACTED]",
        },
        {
          input:
            "key: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          expected: "key: 0x[REDACTED]",
        },
        {
          input:
            "private_key 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          expected: "private_key 0x[REDACTED]",
        },
      ];

      testCases.forEach((testCase) => {
        const sanitized = sanitizeForLogs(testCase.input);
        expect(sanitized).to.equal(
          testCase.expected,
          `Failed for input: ${testCase.input}`,
        );
      });
    });

    it("should redact 64-char hex strings in secret contexts", function () {
      const message =
        "Secret leaked: private 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const sanitized = sanitizeForLogs(message);
      expect(sanitized).to.equal("Secret leaked: private 0x[REDACTED]");
    });

    it("should NOT redact transaction hashes and other legitimate 64-char hex", function () {
      const testCases = [
        "Transaction hash: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "Block hash: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "Contract address: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      ];

      testCases.forEach((message) => {
        const sanitized = sanitizeForLogs(message);
        expect(sanitized).to.equal(message, `Should not redact: ${message}`);
      });
    });

    it("should handle multiple tokens in one message", function () {
      const message =
        "Tokens: xoxb-123-abc and xoxa-456-def with private key 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const sanitized = sanitizeForLogs(message);
      expect(sanitized).to.equal(
        "Tokens: xoxb-[REDACTED] and xoxa-[REDACTED] with private key 0x[REDACTED]",
      );
    });

    it("should handle messages without sensitive data", function () {
      const message = "Normal log message with no sensitive data";
      const sanitized = sanitizeForLogs(message);
      expect(sanitized).to.equal(message);
    });

    it("should handle empty and null inputs", function () {
      expect(sanitizeForLogs("")).to.equal("");
      expect(sanitizeForLogs("   ")).to.equal("   ");
    });

    it("should preserve message structure while redacting", function () {
      const message = `{
        "token": "xoxb-1234567890-abcdefghijklmnop",
        "privateKey": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "txHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
      }`;

      const sanitized = sanitizeForLogs(message);

      expect(sanitized).to.include("xoxb-[REDACTED]");
      expect(sanitized).to.include("0x[REDACTED]");
      expect(sanitized).to.include(
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      ); // TX hash preserved
      expect(sanitized).to.include('"token"');
      expect(sanitized).to.include('"privateKey"');
    });
  });

  describe("sanitizeError", function () {
    it("should sanitize Error objects", function () {
      const error = new Error(
        "Connection failed with token xoxb-1234567890-abcdefghijklmnop",
      );
      const sanitized = sanitizeError(error);
      expect(sanitized).to.equal(
        "Connection failed with token xoxb-[REDACTED]",
      );
    });

    it("should sanitize string errors", function () {
      const error =
        "Private key leaked: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const sanitized = sanitizeError(error);
      expect(sanitized).to.equal("Private key leaked: 0x[REDACTED]");
    });

    it("should handle non-string, non-Error inputs", function () {
      const error = { message: "Some object error" };
      const sanitized = sanitizeError(error);
      expect(sanitized).to.equal("[object Object]");
    });

    it("should handle null and undefined", function () {
      expect(sanitizeError(null)).to.equal("null");
      expect(sanitizeError(undefined)).to.equal("undefined");
    });
  });

  describe("edge cases", function () {
    it("should handle very long messages", function () {
      const longMessage =
        "x".repeat(10000) +
        "xoxb-1234567890-abcdefghijklmnop" +
        "y".repeat(10000);
      const sanitized = sanitizeForLogs(longMessage);
      expect(sanitized).to.include("xoxb-[REDACTED]");
      expect(sanitized.length).to.be.lessThan(longMessage.length);
    });

    it("should handle special characters and unicode", function () {
      const message =
        "🔑 Token: xoxb-1234567890-abcdefghijklmnop 中文 key: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const sanitized = sanitizeForLogs(message);
      expect(sanitized).to.equal(
        "🔑 Token: xoxb-[REDACTED] 中文 key: 0x[REDACTED]",
      );
    });

    it("should handle case insensitive private key contexts", function () {
      const testCases = [
        "PRIVATE KEY: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "Private Key: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "private KEY: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      ];

      testCases.forEach((message) => {
        const sanitized = sanitizeForLogs(message);
        expect(sanitized).to.include(
          "0x[REDACTED]",
          `Should redact case-insensitive: ${message}`,
        );
      });
    });

    it("should not break on malformed hex strings", function () {
      const message =
        "Invalid hex: 0x123 and valid token: xoxb-1234567890-abcdefghijklmnop";
      const sanitized = sanitizeForLogs(message);
      expect(sanitized).to.equal(
        "Invalid hex: 0x123 and valid token: xoxb-[REDACTED]",
      );
    });
  });
});
