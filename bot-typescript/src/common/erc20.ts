import { ethers } from "ethers";

/**
 * Format a token amount with its symbol for display
 *
 * @param amount Token amount in base units
 * @param decimals Token decimals
 * @param symbol Token symbol
 * @returns Formatted string like "1.234567890123456789 COLL"
 */
export function formatTokenAmountWithSymbol(
  amount: bigint,
  decimals: number,
  symbol: string,
): string {
  return `${formatTokenAmount(amount, decimals)} ${symbol}`;
}

/**
 * Format a token amount for display
 *
 * @param amount Token amount in base units
 * @param decimals Token decimals
 * @returns Formatted string like "1.234567890123456789"
 */
export function formatTokenAmount(amount: bigint, decimals: number): string {
  return ethers.formatUnits(amount, decimals);
}

/**
 * Parse a token amount from string to base units
 *
 * @param amount Formatted amount string
 * @param decimals Token decimals
 * @returns Token amount in base units
 */
export function parseTokenAmount(amount: string, decimals: number): bigint {
  return ethers.parseUnits(amount, decimals);
}
