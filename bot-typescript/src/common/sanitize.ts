/**
 * Sanitize error for logging (remove sensitive information)
 *
 * @param error Error object or message
 * @returns Sanitized error message
 */
export function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeForLogs(error.message);
  }
  return sanitizeForLogs(String(error));
}

/**
 * Sanitize string for logs (remove sensitive information)
 *
 * @param input Input string
 * @returns Sanitized string
 */
export function sanitizeForLogs(input: string): string {
  // Remove private keys
  let sanitized = input.replace(/0x[a-fA-F0-9]{64}/g, "[PRIVATE_KEY]");

  // Remove other sensitive patterns as needed
  // Example: sanitized = sanitized.replace(/password=\w+/g, "password=[REDACTED]");

  return sanitized;
}
