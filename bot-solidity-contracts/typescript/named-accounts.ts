import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config({ path: ".env" });

/**
 * Get the default private keys list for a specific network from the mnemonics in the `.env` file
 *
 * @param network - The network name
 * @returns A list of configured private keys for the network
 */
export function getEnvPrivateKeys(network: string): string[] {
  let pks: string[] = [];

  switch (network) {
    case "sonic_testnet":
      pks = [getPrivateKeyFromMnemonic(`testnet_deployer`), getPrivateKeyFromEnv(`testnet_deployer`)];
      break;
    case "sonic_mainnet":
      pks = [getPrivateKeyFromMnemonic(`mainnet_deployer`), getPrivateKeyFromEnv(`mainnet_deployer`)];
      break;
    default:
      throw new Error(`Unsupported network: ${network}`);
  }

  // Filter out Zero private keys
  pks = pks.filter((pk) => pk !== "0x0000000000000000000000000000000000000000000000000000000000000000");

  if (pks.length === 0) {
    console.log(`No private keys found for ${network} in the .env file`);
    return [];
  }

  // Make sure there is no duplicated private key
  const uniquePks = Array.from(new Set(pks));

  if (uniquePks.length !== pks.length) {
    throw new Error(`Duplicated private keys detected in the .env file`);
  }

  return pks;
}

/**
 * Get the private key by deriving it from the mnemonic in the `.env` file
 *
 * @param envNamePostfix - The postfix of the environment variable name (`MNEMONIC_<POSTFIX>`) in the `.env` file
 * @returns The default private key
 */
export function getPrivateKeyFromMnemonic(envNamePostfix: string): string {
  const mnemonicKey = "MNEMONIC_" + envNamePostfix.toUpperCase();
  const mnemonic = process.env[mnemonicKey];

  if (!mnemonic || mnemonic === "") {
    // We do not throw an error here to avoid blocking the localhost and local hardhat
    // as it will also need to initialize the hardhat.config.ts
    console.log(`${mnemonicKey} is not set in the .env file`);
    // Return a dummy private key in 32 bytes format to avoid breaking the compilation
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }

  const wallet = ethers.Wallet.fromMnemonic(mnemonic);
  return wallet.privateKey;
}


/**
 * Get the private key from the environment variable, mostly used for testing
 *
 * @param envNamePostfix - The postfix of the environment variable name (`PK_<POSTFIX>`) in the `.env` file
 * @returns The private key
 */
export function getPrivateKeyFromEnv(envNamePostfix: string): string {
  const envName = "PK_" + envNamePostfix.toUpperCase();
  const privateKey = process.env[envName];

  if (!privateKey || privateKey === "") {
    // Do not print because private keys are second class citizens, mostly used for testing
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }
  return privateKey;
}