import { ethers, TransactionReceipt } from "ethers";

// ERC20 ABI for fetching token metadata
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

/**
 * Fetch token decimals from the blockchain
 *
 * @param provider Ethers provider
 * @param tokenAddress Token contract address
 * @returns Token decimals
 */
export async function getTokenDecimals(
  provider: ethers.Provider,
  tokenAddress: string,
): Promise<number> {
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  return Number(await contract.decimals());
}

/**
 * Fetch token symbol from the blockchain
 *
 * @param provider Ethers provider
 * @param tokenAddress Token contract address
 * @returns Token symbol
 */
export async function getTokenSymbol(
  provider: ethers.Provider,
  tokenAddress: string,
): Promise<string> {
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  return await contract.symbol();
}

/**
 * Fetch token metadata (decimals and symbol) from the blockchain
 *
 * @param provider Ethers provider
 * @param tokenAddress Token contract address
 * @returns Token metadata
 */
export async function getTokenMetadata(
  provider: ethers.Provider,
  tokenAddress: string,
): Promise<{ decimals: number; symbol: string }> {
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const [decimals, symbol] = await Promise.all([
    contract.decimals(),
    contract.symbol(),
  ]);
  return { decimals, symbol };
}

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

/**
 * Approve the allowance if needed
 *
 * @param erc20TokenAddress - The address of the ERC20 token
 * @param spender - The address of the spender
 * @param amount - The amount of the allowance
 * @param ownerSigner - The signer
 * @returns The transaction receipt or null if the allowance is already approved
 */
export async function approveAllowanceIfNeeded(
  erc20TokenAddress: string,
  spender: string,
  amount: bigint,
  ownerSigner: ethers.Signer,
): Promise<TransactionReceipt | null> {
  const tokenContract = new ethers.Contract(
    erc20TokenAddress,
    [
      "function approve(address spender, uint256 amount) public returns (bool)",
      "function allowance(address owner, address spender) public view returns (uint256)",
    ],
    ownerSigner,
  );

  // Get the required allowance to be approved
  const allowance: bigint = await tokenContract.allowance(
    await ownerSigner.getAddress(),
    spender,
  );

  // If the allowance is less than the amount, approve the amount
  if (allowance < amount) {
    const approveTx = await tokenContract.approve(spender, amount);
    return await approveTx.wait();
  }

  return null;
}
