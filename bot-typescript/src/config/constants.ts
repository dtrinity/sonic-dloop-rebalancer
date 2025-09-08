// Constants for the DLoop Rebalancer Bot
// Reference: contracts/common/BasisPointConstants.sol
export const ONE_BPS_UNIT = 100; // 1 bps with 2 decimals
export const ONE_PERCENT_BPS = 100 * ONE_BPS_UNIT; // 1% in basis points
export const ONE_HUNDRED_PERCENT_BPS = 100 * ONE_PERCENT_BPS; // 100% in basis points

// Swap and slippage settings
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

// Exact-output swap input cap (basis points over estimated input)
// Trade-off: Higher values provide more routing flexibility but increase slippage risk
// Valid range: 10000-50000 (100%-500%)
export const DEFAULT_EXACT_OUT_INPUT_CAP_BPS = 15000; // 150%

/**
 * Get the slippage limit in basis points
 */
export function getSlippageLimitBps(): number {
  return DEFAULT_SLIPPAGE_LIMIT_BPS;
}

/**
 * Get the maximum price impact in basis points
 */
export function getMaxPriceImpactBps(): number {
  return MAX_PRICE_IMPACT_BPS;
}

/**
 * Get the HTTP timeout in milliseconds
 */
export function getHttpTimeoutMs(): number {
  return DEFAULT_HTTP_TIMEOUT_MS;
}

/**
 * Get the exact output input cap in basis points
 */
export function getExactOutInputCapBps(): number {
  return DEFAULT_EXACT_OUT_INPUT_CAP_BPS;
}
