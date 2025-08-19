import { ethers } from "ethers";

export function formatTokenAmount(amount: bigint, decimals: number): string {
  return ethers.formatUnits(amount, decimals);
}

export function parseTokenAmount(amount: string, decimals: number): bigint {
  return ethers.parseUnits(amount, decimals);
}

export function formatTokenAmountWithSymbol(
  amount: bigint,
  decimals: number,
  symbol: string,
): string {
  return `${formatTokenAmount(amount, decimals)} ${symbol}`;
}
