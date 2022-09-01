const Web3 = require('web3');
const axios = require('axios');
const yesno = require('yesno');
const abiDecoder = require('abi-decoder');
require('dotenv').config()

const chainId = 1;
const web3RpcUrl = `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`;
const vaultAddress = '0xe1fE82f61007eeB0d8091439E56610b3ee5f7E3a';
const walletAddress = '0xdBF6268917aACb48598042855A24c06E94C4FeCF'; // Set your wallet address
const privateKey = process.env.DEPLOYER_PRIVATE_KEY; // Set private key of your wallet. Be careful! Don't share this key to anyone!

// const swapParams = {
//     fromTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // BUSD
//     toTokenAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WBNB
//     amount: '165301',
//     fromAddress: vaultAddress, // '0x939E2C7C5B792958cdA319970d69b8483fE0BaB5',
//     slippage: 1,
//     disableEstimate: false,
//     allowPartialFill: false,
// };
const swapParams = {
  fromTokenAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // BUSD
  toTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // WBNB
  amount: '101101279278938',
  fromAddress: vaultAddress, // '0x939E2C7C5B792958cdA319970d69b8483fE0BaB5',
  slippage: 1,
  disableEstimate: false,
  allowPartialFill: false,
};

const apiBaseUrl = 'https://api.1inch.io/v4.0/' + chainId;
const web3 = new Web3(web3RpcUrl);

function apiRequestUrl(methodName, queryParams) {
    return apiBaseUrl + methodName + '?' + (new URLSearchParams(queryParams)).toString();
}

async function buildTxForSwap(swapParams) {
    const url = apiRequestUrl('/swap', swapParams);
    return axios.get(url)
    .then(res => res.data)
    .then(res => res.tx);
}

const pkg= require("../build/artifacts/contracts/vault.sol/Vault.json");
const oneInchAbi = require("./one-inch-abi.json");
const {abi: VaultAbi} = pkg;

async function testSC() {
    abiDecoder.addABI(oneInchAbi);

    const gasPrice = await web3.eth.getGasPrice();
    console.log('started')
    
    const swapTransaction = await buildTxForSwap(swapParams);
    console.log('Transaction for swap: ', swapTransaction);

    const ok = await yesno({
        question: 'Do you want to send a transaction to exchange with 1inch router?'
    });
    
    // Before signing a transaction, make sure that all parameters in it are specified correctly
    if (!ok) {
        return false;
    }

    const vaultContract = new web3.eth.Contract(VaultAbi, vaultAddress);

    const contractData = vaultContract.methods
    .sellOneinchByParams(swapTransaction.data)
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