// Constants for the DLoop Rebalancer Bot
export const ONE_HUNDRED_PERCENT_BPS = 10_000;

// Swap and slippage settings
export const DEFAULT_SLIPPAGE_BUFFER_BPS = 500; // 5% buffer for input estimation fallback
export const DEFAULT_SLIPPAGE_LIMIT_BPS = 100; // 1% slippage limit for Odos
export const MAX_PRICE_IMPACT_BPS = 1000; // 10% maximum price impact

// Flash loan safety
export const FLASH_LOAN_SAFETY_DIVISOR = 10n; // Periphery uses 1/10 of max flash loan

// Percentage precision for trial calculations
export const PERCENTAGE_PRECISION = 1_000_000_000n; // 9 decimal places

// Time constants
export const IGNORE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Retry and timeout settings
export const DEFAULT_RETRY_ATTEMPTS = 3;
export const DEFAULT_HTTP_TIMEOUT_MS = 10_000; // 10 seconds
export const DEFAULT_TX_RETRY_ATTEMPTS = 3;
export const RETRY_BASE_DELAY_MS = 1000; // Base delay for exponential backoff

// Environment variable overrides
export function getSlippageLimitBps(): number {
  const envValue = process.env.SLIPPAGE_LIMIT_BPS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 1000) {
      return parsed;
    }
  }
  return DEFAULT_SLIPPAGE_LIMIT_BPS;
}

export function getMaxPriceImpactBps(): number {
  const envValue = process.env.MAX_PRICE_IMPACT_BPS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 5000) {
      return parsed;
    }
  }
  return MAX_PRICE_IMPACT_BPS;
}

export function getHttpTimeoutMs(): number {
  const envValue = process.env.HTTP_TIMEOUT_MS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_HTTP_TIMEOUT_MS;
}