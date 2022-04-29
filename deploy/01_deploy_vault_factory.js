const contractName = "VaultFactory";

const { sleep }  = require("../utils/sleep")

const isVerifying = true;
const VERIFY_DELAY = 100000;

const deployFunction = async ({ getNamedAccounts, deployments, ethers, upgrades, run }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log(`${contractName} deploying...`);
  const contract = await deploy(`${contractName}`, {
    from: deployer,
    args: [],
  })
  console.log(`${contractName} address:`, contract.address);

  if(isVerifying) {
    console.log(`Verifying ${contractName}, can take some time`)
    await sleep(VERIFY_DELAY);
    await run("verify:verify", {
        address: contract.address,
        constructorArguments: [],
        contract: "contracts/vault_factory.sol:VaultFactory"
    })
  }
};

module.exports = deployFunction;
module.exports.tags = [contractName];


// ***** Deploying *****
// npx hardhat deploy --network bsc --tags VaultFactory
// npx hardhat deploy --network ropsten --tags VaultFactory


// bsc: 