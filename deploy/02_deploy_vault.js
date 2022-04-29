const contractName = "Vault";

const { sleep }  = require("../utils/sleep")
const { params }  = require("../inputs/vault")
const param = params[1]

const isVerifying = true;
const VERIFY_DELAY = 100000;

const deployFunction = async ({ getNamedAccounts, deployments, ethers, upgrades, run }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log(`${contractName} deploying...`);
  const contract = await deploy(`${contractName}`, {
    from: deployer,
    args: [
      param.name,
      param.tokenA,
      param.tokenB,
      param.strategist,
      param.percentDev,
      param.company,
      param.stakers,
      param.algoDev,
      param.maxCap
    ],
  })
  console.log(`${contractName} address:`, contract.address);

  if(isVerifying) {
    console.log(`Verifying ${contractName}, can take some time`)
    await sleep(VERIFY_DELAY);
    await run("verify:verify", {
        address: contract.address,
        constructorArguments: [],
        contract: "contracts/vault.sol:Vault"
    })
  }
};

module.exports = deployFunction;
module.exports.tags = [contractName];


// ***** Deploying *****
// npx hardhat deploy --network bsc --tags Vault
// npx hardhat deploy --network ropsten --tags Vault


// bsc: 