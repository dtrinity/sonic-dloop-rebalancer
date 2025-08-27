import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import "solidity-coverage";
import { HardhatUserConfig } from "hardhat/config";
import { SONIC_MAINNET_CONFIG } from "./config/networks/sonic_mainnet";
import { SONIC_TESTNET_CONFIG } from "./config/networks/sonic_testnet";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
    },
    sonic_mainnet: {
      url: SONIC_MAINNET_CONFIG.network.rpcUrl,
      accounts: SONIC_MAINNET_CONFIG.network.privateKey ? [SONIC_MAINNET_CONFIG.network.privateKey] : [],
    },
    sonic_testnet: {
      url: SONIC_TESTNET_CONFIG.network.rpcUrl,
      accounts: SONIC_TESTNET_CONFIG.network.privateKey ? [SONIC_TESTNET_CONFIG.network.privateKey] : [],
    },
  },
  etherscan: {
    apiKey: SONIC_MAINNET_CONFIG.blockExplorer.apiKey,
  },
  gasReporter: {
    enabled: false,
    currency: "USD",
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
};

export default config;