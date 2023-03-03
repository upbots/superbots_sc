const Web3 = require('web3');
const axios = require('axios');
const yesno = require('yesno');
const abiDecoder = require('abi-decoder');

const chainId = 56;
const web3RpcUrl = 'https://bsc-dataseed.binance.org';
const vaultAddress = '0x6f073b79a7e59547cd3f0472606b1e349049a5e7';
const walletAddress = '0x6f073b79a7e59547cd3f0472606b1e349049a5e7'; // Set your wallet address
const privateKey = 'feffa1734dd0bf417038c63b8d7bc3df94a723c021aff6cc844743ccc1dd133e'; // Set private key of your wallet. Be careful! Don't share this key to anyone!

const swapParams = {
    fromTokenAddress: '0xe9e7cea3dedca5984780bafc599bd69add087d56', // BUSD
    toTokenAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    amount: '8613000000000000',
    fromAddress: vaultAddress, // '0x939E2C7C5B792958cdA319970d69b8483fE0BaB5',
    slippage: 1,
    disableEstimate: false,
    allowPartialFill: false,
};

const broadcastApiUrl = 'https://tx-gateway.1inch.io/v1.1/' + chainId + '/broadcast';
const apiBaseUrl = 'https://api.1inch.io/v4.0/' + chainId;
const web3 = new Web3(web3RpcUrl);

function apiRequestUrl(methodName, queryParams) {
    return apiBaseUrl + methodName + '?' + (new URLSearchParams(queryParams)).toString();
}

// check allowance
async function checkAllowance(tokenAddress, walletAddress) {
    return axios.get(apiRequestUrl('/approve/allowance', {tokenAddress, walletAddress}))
        .then(res => res.data)
        .then(res => res.allowance);
}

// approve
async function broadCastRawTransaction(rawTransaction) {
    return axios.post(broadcastApiUrl,
    {
    rawTransaction
    },
    {
        headers: {'Content-Type': 'application/json'}
    }
    )
    .then(res => res.data)
    .then(res => {
        return res.transactionHash;
    });    
}

async function signAndSendTransaction(transaction) {
    const {rawTransaction} = await web3.eth.accounts.signTransaction(transaction, privateKey);

    return await broadCastRawTransaction(rawTransaction);
}

async function buildTxForApproveTradeWithRouter(tokenAddress, amount) {
    const url = apiRequestUrl(
        '/approve/transaction',
        amount ? {tokenAddress, amount} : {tokenAddress}
    );

    const transaction = await axios.get(url).then(res => res.data);

    const gasLimit = await web3.eth.estimateGas({
        ...transaction,
        from: walletAddress
    });

    return {
        ...transaction,
        gas: gasLimit
    };
}

async function buildTxForSwap(swapParams) {
    const url = apiRequestUrl('/swap', swapParams);
    console.log('----buildTxForSwap-url:', url)
    return axios.get(url)
    .then(res => res.data)
    .then(res => res.tx);
}

async function test() {
    // @0@@@@@ check allowance
    const allowance = await checkAllowance(swapParams.fromTokenAddress, walletAddress);
    console.log('Allowance: ', allowance);

    // @1@@@@@ approve
    // // First, let's build the body of the transaction
    // const transactionForSign = await buildTxForApproveTradeWithRouter(swapParams.fromTokenAddress);
    // console.log('Transaction for approve: ', transactionForSign);

    // const ok = await yesno({
    //     question: 'Do you want to send a transaction to approve trade with 1inch router?'
    // });

    // // Before signing a transaction, make sure that all parameters in it are specified correctly
    // if (!ok) {
    //     return false;
    // }

    // // Send a transaction and get its hash
    // const approveTxHash = await signAndSendTransaction(transactionForSign);

    // console.log('Approve tx hash: ', approveTxHash);

    // @3@@@@@ Swap
    // First, let's build the body of the transaction
    const swapTransaction = await buildTxForSwap(swapParams);
    console.log('Transaction for swap: ', swapTransaction);
    
    const ok = await yesno({
        question: 'Do you want to send a transaction to exchange with 1inch router?'
    });
    
    // Before signing a transaction, make sure that all parameters in it are specified correctly
    if (!ok) {
        return false;
    }
    
    // Send a transaction and get its hash
    const swapTxHash = await signAndSendTransaction(swapTransaction);
    console.log('Swap transaction hash: ', swapTxHash);    
}
// test();

const pkg= require("../build/artifacts/contracts/vault.sol/Vault.json");
const oneInchAbi = require("./one-inch-abi.json");
const {abi: VaultAbi} = pkg;

async function testSC() {
    abiDecoder.addABI(oneInchAbi);
    
    // @0@@@@@ check allowance
    const allowance = await checkAllowance(swapParams.fromTokenAddress, walletAddress);
    console.log('Allowance: ', allowance);

    const swapTransaction = await buildTxForSwap(swapParams);
    console.log('Transaction for swap: ', swapTransaction);

    const params = abiDecoder
    .decodeMethod(swapTransaction.data)
    .params.map(({ value }) => value);
    console.log('--buyParams:', params);

    const ok = await yesno({
        question: 'Do you want to send a transaction to exchange with 1inch router?'
    });
    

    // Before signing a transaction, make sure that all parameters in it are specified correctly
    if (!ok) {
        return false;
    }

    const vaultContract = new web3.eth.Contract(VaultAbi, vaultAddress);

    // const receipt = await vaultContract.methods.buyOneinchByParams(params[0], params[1], params[2]).send({ from: walletAddress });
    // console.log('TX receipt', receipt);    

    // // Send a transaction and get its hash
    // const swapTxHash = await signAndSendTransaction(swapTransaction);
    // console.log('Swap transaction hash: ', swapTxHash);


    //////////////////////////////////////////////////////////    
    const gasPrice = await web3.eth.getGasPrice();

    const contractData = vaultContract.methods
      .sellOneinchByParams(params[0], params[1], params[2])
      .encodeABI();

    const gasEstimate = await web3.eth.estimateGas({
      from: walletAddress,
      to: vaultAddress,
      data: contractData,
    });

    const gas0 = Math.round(Number(gasEstimate) * 1.04);
    const gasPrice0 = Math.round(Number(gasPrice) * 1.1);
    const nonce = await web3.eth.getTransactionCount(
        walletAddress,
    );
    const signedTx = await web3.eth.accounts.signTransaction(
      {
        to: vaultAddress,
        data: contractData,
        gas: gas0,
        gasPrice: gasPrice0,
        nonce,
        chainId: Number(56),
      },
      privateKey,
    );

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