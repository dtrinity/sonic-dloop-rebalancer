/**
 * Sanitizes sensitive information from log messages and notifications
 */

/**
 * Sanitizes a message by redacting sensitive information
 *
 * @param message The message to sanitize
 * @returns The sanitized message with sensitive data redacted
 */
export function sanitizeForLogs(message: string): string {
  let sanitized = message;

  // Redact Slack tokens (xoxb-, xoxa-, xoxp- followed by alphanumeric and dashes)
  sanitized = sanitized.replace(
    /xox[bap]-[A-Za-z0-9-]+/g,
    (match) => `${match.substring(0, 4)}-[REDACTED]`,
  );

  // Redact 64-character hex strings that look like private keys
  // Only redact if preceded by common prefixes to avoid false positives
  sanitized = sanitized.replace(
    /(private[_\s]*key[:\s]*|key[:\s]*|PRIVATE_KEY[:\s]*=?)0x([0-9a-fA-F]{64})\b/gi,
    "$10x[REDACTED]",
  );

  // Also catch bare 64-char hex strings in error contexts
  sanitized = sanitized.replace(
    /\b0x([0-9a-fA-F]{64})\b/g,
    (match, hexPart, offset, string) => {
      // Check if this looks like it might be a private key context
      const before = string
        .substring(Math.max(0, offset - 50), offset)
        .toLowerCase();

      if (
        before.includes("private") ||
        before.includes("key") ||
        before.includes("secret")
      ) {
        return "0x[REDACTED]";
      }
      return match; // Keep other 64-char hex (like transaction hashes)
    },
  );

  return sanitized;
}

/**
 * Sanitizes an error object for logging
 *
 * @param error The error to sanitize
 * @returns A sanitized error message
 */
export function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return sanitizeForLogs(message);
}
