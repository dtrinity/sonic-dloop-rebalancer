import { ContractsConfig, NetworkConfig, TokensConfig } from "./types";

// Sonic Mainnet Configuration
export const SONIC_MAINNET_CONFIG: {
  network: NetworkConfig;
  contracts: ContractsConfig;
  tokens: TokensConfig;
} = {
  network: {
    chainId: 1717, // Sonic mainnet chain ID
    rpcUrl: process.env.SONIC_MAINNET_RPC_URL || "",
    privateKey: process.env.PRIVATE_KEY,
  },
  contracts: {
    dloopCore:
      process.env.DLOOP_CORE_ADDRESS ||
      "0x0000000000000000000000000000000000000000",
    increaseOdos:
      process.env.INCREASE_ODOS_ADDRESS ||
      "0x0000000000000000000000000000000000000000",
    decreaseOdos:
      process.env.DECREASE_ODOS_ADDRESS ||
      "0x0000000000000000000000000000000000000000",
    odosRouter:
      process.env.ODOS_ROUTER_ADDRESS ||
      "0x0000000000000000000000000000000000000000",
    flashLender:
      process.env.FLASH_LENDER_ADDRESS ||
      "0x0000000000000000000000000000000000000000",
  },
  tokens: {
    collateral: {
      address:
        process.env.COLLATERAL_TOKEN_ADDRESS ||
        "0x0000000000000000000000000000000000000000",
      decimals: parseInt(process.env.COLLATERAL_TOKEN_DECIMALS || "18", 10),
      symbol: process.env.COLLATERAL_TOKEN_SYMBOL || "COLL",
    },
    debt: {
      address:
        process.env.DEBT_TOKEN_ADDRESS ||
        "0x0000000000000000000000000000000000000000",
      decimals: parseInt(process.env.DEBT_TOKEN_DECIMALS || "18", 10),
      symbol: process.env.DEBT_TOKEN_SYMBOL || "DEBT",
    },
  },
};
