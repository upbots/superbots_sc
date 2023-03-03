const { program } = require("commander");
const { writeFileSync, createReadStream } = require("fs");
const csv = require("csv-parser");
const Web3 = require("web3");
require("dotenv").config({ path: "./.env" });

const ownerAddress = process.env.VAULT_FACTORY_V2_OWNER;
const ownerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;

const pkg = require("../build/artifacts/contracts/vault_factory_v2.sol/VaultFactoryV2.json");
const { abi: VaultFactoryV2Abi } = pkg;
const web3RpcUrl = "https://bsc-dataseed.binance.org";
const web3 = new Web3(web3RpcUrl);

function readCSV(path) {
  var csvPromise = new Promise(function (resolve, reject) {
    const results = [];
    createReadStream(path, { encoding: "utf8" })
      .pipe(csv())
      .on("headers", (headers) => {
        for (const header of headers) {
          if (header == "Fields" || header == "sub") continue;
          results[header] = [];
        }
      })
      .on("data", (data) => {
        for (const field in data) {
          if (field == "Fields" || field == "sub") continue;
          if (data["Fields"].startsWith("_feeParams")) {
            if (data["sub"].startsWith("pctDeposit")) {
              results[field].push([]);
            }
            results[field][results[field].length - 1].push(data[field]);
          } else if (data["Fields"].startsWith("_uniswapPath")) {
            if (data["sub"].startsWith("0")) {
              results[field].push([]);
            }
            if (data[field]) {
              results[field][results[field].length - 1].push(data[field]);
            }
          } else {
            results[field].push(data[field]);
          }
        }
      })
      .on("end", () => {
        resolve(results);
      });
  });
  return csvPromise;
}

async function generateVault(factoryAddress, vaultParam) {
  console.log(`Generating Vault - ${vaultParam[0]}`);
  const vaultFactory = new web3.eth.Contract(VaultFactoryV2Abi, factoryAddress);

  const gasPrice = await web3.eth.getGasPrice();

  const contractData = vaultFactory.methods
    .generateVault(...vaultParam)
    .encodeABI();

  const gasEstimate = await web3.eth.estimateGas({
    from: ownerAddress,
    to: factoryAddress,
    data: contractData,
  });

  const gas0 = Math.round(Number(gasEstimate) * 1.04);
  const gasPrice0 = Math.round(Number(gasPrice) * 1.1);
  const nonce = await web3.eth.getTransactionCount(ownerAddress);
  const signedTx = await web3.eth.accounts.signTransaction(
    {
      to: factoryAddress,
      data: contractData,
      gas: gas0,
      gasPrice: gasPrice0,
      nonce,
      chainId: Number(56),
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
  .command("params")
  .requiredOption("-i, --input <path>", "Parameters csv")
  .option("-n, --name <string>", "Vault Name")
  .action(async (options) => {
    const vaultParams = await readCSV(options.input);
    if (options.name) {
      console.log(vaultParams[options.name]);
    } else {
      console.log(vaultParams);
    }
  });

program
  .command("deploy")
  .requiredOption("-i, --input <path>", "Parameters csv")
  .requiredOption("-t, --factory <string>", "Vault Factory")
  .option("-n, --name <string>", "Vault Name")
  .action(async (options) => {
    const vaultParams = await readCSV(options.input);
    if (options.name) {
      await generateVault(options.factory, vaultParams[options.name]);
    } else {
      console.log(vaultParams);
      for (const property in vaultParams) {
        // console.log(vaultParams[property]);
        await generateVault(options.factory, vaultParams[property]);
        console.log("\n");
      }
    }
  });

program.parse();
