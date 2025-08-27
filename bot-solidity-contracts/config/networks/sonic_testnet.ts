export const SONIC_TESTNET_CONFIG = {
  chainId: 64165, // Sonic testnet chain ID
  name: "sonic_testnet",

  contracts: {
    // External protocol contracts your bot interacts with
    dloopCore: "0x0000000000000000000000000000000000000000",
    increaseOdos: "0x0000000000000000000000000000000000000000",
    decreaseOdos: "0x0000000000000000000000000000000000000000",
    odosRouter: "0x0000000000000000000000000000000000000000",
    flashLender: "0x0000000000000000000000000000000000000000",

    // Your deployed contracts (update after deployment)
    yourBotContract: "0x0000000000000000000000000000000000000000",
  },

  deployment: {
    gasPrice: "auto",
    confirmations: 1,
  },

  blockExplorer: {
    name: "Sonic Testnet Explorer",
    url: "https://testnet.sonicscan.org",
    apiURL: "https://api.testnet.sonicscan.org",
    apiKey: "",
  },
};

export default SONIC_TESTNET_CONFIG;