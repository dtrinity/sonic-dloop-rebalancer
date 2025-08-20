import { ethers } from "ethers";

/**
 * Format a token amount (bigint) into a human-readable string using the
 * specified number of decimals.
 *
 * @param amount - The token amount in smallest units (bigint).
 * @param decimals - Number of decimals for the token.
 * @returns The formatted token amount as a string.
 */
export function formatTokenAmount(amount: bigint, decimals: number): string {
  return ethers.formatUnits(amount, decimals);
}

/**
 * Parse a human-readable token amount string into the smallest unit (bigint)
 * using the provided decimals.
 *
 * @param amount - The human-readable token amount (e.g. "1.23").
 * @param decimals - Number of decimals for the token.
 * @returns The parsed amount as a bigint in smallest units.
 */
export function parseTokenAmount(amount: string, decimals: number): bigint {
  return ethers.parseUnits(amount, decimals);
}

/**
 * Format a token amount and append the token symbol.
 *
 * @param amount - The token amount in smallest units (bigint).
 * @param decimals - Number of decimals for the token.
 * @param symbol - Token symbol to append (e.g. "USDC").
 * @returns Formatted amount string with symbol appended.
 */
export function formatTokenAmountWithSymbol(
  amount: bigint,
  decimals: number,
  symbol: string,
): string {
  return `${formatTokenAmount(amount, decimals)} ${symbol}`;
}
