const { program } = require("commander");
const { writeFileSync, createReadStream } = require("fs");
const csv = require("csv-parser");
const Web3 = require("web3");
require("dotenv").config({ path: "./.env" });

const ownerAddress = process.env.VAULT_FACTORY_V2_OWNER;
const ownerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;

const pkg = require("../build/artifacts/contracts/vault_v2.sol/VaultV2.json");
const { initParams } = require("../deploy/inputs/vault_v2_init_params");
const { abi: VaultV2Abi } = pkg;
const web3RpcUrl = `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`;
const web3 = new Web3(web3RpcUrl);

async function deployVault(address, vaultParam) {
  console.log(`Generating Vault`);
  const vault = new web3.eth.Contract(VaultV2Abi, address);

  const gasPrice = await web3.eth.getGasPrice();

  const contractData = vault.methods.initialize(...vaultParam).encodeABI();

  const gasEstimate = await web3.eth.estimateGas({
    from: ownerAddress,
    to: address,
    data: contractData,
  });

  const gas0 = Math.round(Number(gasEstimate) * 1.04);
  const gasPrice0 = Math.round(Number(gasPrice) * 1.1);
  const nonce = await web3.eth.getTransactionCount(ownerAddress);
  const signedTx = await web3.eth.accounts.signTransaction(
    {
      to: address,
      data: contractData,
      gas: gas0,
      gasPrice: gasPrice0,
      nonce,
      chainId: Number(1),
    },
    ownerPrivateKey
  );

  return new Promise((resolve, reject) => {
    try {
      web3.eth
        .sendSignedTransaction(signedTx.rawTransaction)
        .on("transactionHash", (hash) => {
          console.log(`---vault-transactionHash: hash:${hash}`);
        })
        .on("error", (err) => {
          console.log(`---vault-error: hash:${err.message}`);
          reject(err);
        })
        .on("receipt", (receipt) => {
          console.log(
            `---vault-receipt: hash:${receipt.transactionHash}, status:${receipt.status}`
          );
          resolve(receipt.transactionHash);
        });
    } catch (err) {
      console.log(`***---one-inch-vault-catch-error: ${err.message}`);
      reject(err);
    }
  });
}

program
  .command("deploy")
  .requiredOption("-i, --input <address>", "address")
  .action(async (options) => {
    const address = options.input;

    await deployVault(address, initParams[1]);
  });

program.parse();
