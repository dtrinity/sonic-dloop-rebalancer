import { ethers } from "ethers";

import { logger } from "./log";

/**
 * Get chainId from an RPC provider by making a network request
 *
 * @param rpcUrl - The RPC URL to connect to
 * @returns Promise<number> - The chain ID of the network
 * @throws Error if unable to retrieve chainId from the RPC provider
 */
export async function getChainIdFromRpc(rpcUrl: string): Promise<number> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();
    return Number(network.chainId);
  } catch (error) {
    logger.error("Failed to get chainId from RPC provider:", error);
    throw new Error(`Unable to retrieve chainId from RPC URL: ${rpcUrl}`);
  }
}
