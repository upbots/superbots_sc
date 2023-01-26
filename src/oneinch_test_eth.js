const Web3 = require('web3');
const axios = require('axios');
const yesno = require('yesno');
const abiDecoder = require('abi-decoder');
require('dotenv').config()

const chainId = 1;
const web3RpcUrl = 'https://mainnet.infura.io/v3/91ee1f981ee149309bef06d796400ba9'
const vaultAddress = '0xe1fE82f61007eeB0d8091439E56610b3ee5f7E3a';
const walletAddress = '0xdBF6268917aACb48598042855A24c06E94C4FeCF'; // Set your wallet address
const privateKey = process.env.DEPLOYER_PRIVATE_KEY; // Set private key of your wallet. Be careful! Don't share this key to anyone!

const swapParams = {
    fromTokenAddress: '0x6b175474e89094c44da98b954eedeac495271d0f', // USDC
    toTokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    amount: '99550',
    fromAddress: vaultAddress, // '0x939E2C7C5B792958cdA319970d69b8483fE0BaB5',
    slippage: 1,
    disableEstimate: false,
    allowPartialFill: false,
};
// const swapParams = {
//   fromTokenAddress: '0x6b175474e89094c44da98b954eedeac495271d0f', // BUSD
//   toTokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // WBNB
//   amount: '142589186765765110',
//   fromAddress: walletAddress, // '0x939E2C7C5B792958cdA319970d69b8483fE0BaB5',
//   slippage: 1,
//   disableEstimate: false,
//   allowPartialFill: false,
// };

const apiBaseUrl = 'https://api.1inch.io/v4.0/' + chainId;
const web3 = new Web3(web3RpcUrl);

function apiRequestUrl(methodName, queryParams) {
    return apiBaseUrl + methodName + '?' + (new URLSearchParams(queryParams)).toString();
}

async function buildTxForSwap(swapParams) {
    const url = apiRequestUrl('/swap', swapParams);
    console.log(url)
    return axios.get(url)
    .then(res => res.data)
    .then(res => res.tx);
}

const pkg= require("../build/artifacts/contracts/eth/vault.sol/VaultETH.json");
const oneInchAbi = require("./one-inch-abi.json");
const {abi: VaultAbi} = pkg;

async function testSC() {
    abiDecoder.addABI(oneInchAbi);

    const gasPrice = await web3.eth.getGasPrice();
    console.log('started')
    
    const swapTransaction = await buildTxForSwap(swapParams);
    console.log('Transaction for swap: ', swapTransaction);

    
    const params = abiDecoder
    .decodeMethod(swapTransaction.data)
    console.log(JSON.stringify(params));

    const ok = await yesno({
        question: 'Do you want to send a transaction to exchange with 1inch router?'
    });
    
    // Before signing a transaction, make sure that all parameters in it are specified correctly
    if (!ok) {
        return false;
    }

    const vaultContract = new web3.eth.Contract(VaultAbi, vaultAddress);

    const contractData = vaultContract.methods
    .buyOneinchByParams(swapTransaction.data)
    .encodeABI();

    console.log('4');
    const gasEstimate = await web3.eth.estimateGas({
      from: walletAddress,
      to: vaultAddress,
      data: contractData,
    });

    console.log('5');
    const gas0 = Math.round(Number(gasEstimate) * 1.04);
    const gasPrice0 = Math.round(Number(gasPrice) * 1.1);
    const nonce = await web3.eth.getTransactionCount(
        walletAddress,
    );
    console.log('6');
    const signedTx = await web3.eth.accounts.signTransaction(
      {
        to: vaultAddress,
        data: contractData,
        gas: gas0,
        gasPrice: gasPrice0,
        nonce,
        chainId: Number(1),
      },
      privateKey,
    );

    console.log('7');
    return new Promise((resolve, reject) => {
      try {
        web3.eth
          .sendSignedTransaction(signedTx.rawTransaction)
          .on('transactionHash', (hash) => {
            console.log(`***---one-inch-vault-transactionHash: hash:${hash}`);
          })
          .on('error', (err) => {
            console.log(`***---one-inch-vault-error: hash:${err.message}`);
            reject(err);
          })
          .on('receipt', (receipt) => {
            console.log(
              `***---one-inch-vault-receipt: hash:${receipt.transactionHash}, status:${receipt.status}`,
            );
            resolve(receipt.transactionHash);
          });
      } catch (err) {
        console.log(`***---one-inch-vault-catch-error: ${err.message}`);
        reject(err);
      }
    });    
}
testSC();