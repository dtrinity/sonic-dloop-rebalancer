export const SONIC_MAINNET_CONFIG = {
  chainId: 1717, // Sonic mainnet chain ID
  name: "sonic_mainnet",

  contracts: {
    // External protocol contracts your bot interacts with
    dloopCore: process.env.DLOOP_CORE_ADDRESS || "0x0000000000000000000000000000000000000000",
    increaseOdos: process.env.INCREASE_ODOS_ADDRESS || "0x0000000000000000000000000000000000000000",
    decreaseOdos: process.env.DECREASE_ODOS_ADDRESS || "0x0000000000000000000000000000000000000000",
    odosRouter: process.env.ODOS_ROUTER_ADDRESS || "0x0000000000000000000000000000000000000000",
    flashLender: process.env.FLASH_LENDER_ADDRESS || "0x0000000000000000000000000000000000000000",

    // Your deployed contracts (update after deployment)
    yourBotContract: "0x0000000000000000000000000000000000000000",
  },

  deployment: {
    gasPrice: "auto",
    confirmations: 1,
  },

  blockExplorer: {
    name: "Sonic Explorer",
    url: "https://sonicscan.org",
    apiURL: "https://api.sonicscan.org",
    apiKey: process.env.SONICSCAN_API_KEY || "",
  },
};

export default SONIC_MAINNET_CONFIG;