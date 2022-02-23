const HDWalletProvider = require('truffle-hdwallet-provider');
require('dotenv').config()

const privateKey = process.env.MNEMONIC;

module.exports = {
    contracts_directory: "./contracts",
    compilers: {
        solc: {
            version: "0.8.10",
            settings: {
                optimizer: {
                    enabled: true,
                    runs: 200   // Optimize for how many times you intend to run the code
                }
                //,evmVersion: <string> // Default: "istanbul"
            },
        }
    },
    plugins: [
      'truffle-plugin-verify'
    ],
    api_keys: {
        bscscan: process.env.BSCSCAN_APIKEY
    },
    networks: {
        mainnet: {
            provider: () => new HDWalletProvider(privateKey, `https://bsc-dataseed1.ninicoin.io`),
            network_id: 56,
	        gasPrice: 5000000000,
            confirmations: 3,
            timeoutBlocks: 200,
            skipDryRun: true,
            networkCheckTimeout: 100000
        },
        testnet: {
            provider: () => new HDWalletProvider(privateKey, `https://data-seed-prebsc-1-s2.binance.org:8545/`),
            network_id: 97,
	        gasPrice: 10000000000,
            confirmations: 3,
            timeoutBlocks: 200,
            skipDryRun: true,
            networkCheckTimeout: 100000
        },
        development: {
          host: "127.0.0.1",
          port: 8545,
          network_id: "*"
        }
    }
};
