const contractName = "MasterSuperVault";

const { sleep }  = require("../utils/sleep")

const isVerifying = true;
const VERIFY_DELAY = 100000;

const name="MASTER SUPER VAULT";
const capitalToken = "0xe9e7cea3dedca5984780bafc599bd69add087d56"; // BUSD (mainnet)
const maxCap = "1000000000000000000000000000000000000";

const deployFunction = async ({ getNamedAccounts, deployments, ethers, upgrades, run }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log(`${contractName} deploying...`);
  const contract = await deploy(`${contractName}`, {
    from: deployer,
    args: [name, capitalToken, maxCap],
  })
  console.log(`${contractName} address:`, contract.address);

  if(isVerifying) {
    console.log(`Verifying ${contractName}, can take some time`)
    await sleep(VERIFY_DELAY);
    await run("verify:verify", {
        address: contract.address,
        constructorArguments: [name, capitalToken, maxCap],
        contract: "contracts/master_vault.sol:MasterSuperVault"
    })
  }
};

module.exports = deployFunction;
module.exports.tags = [contractName];


// ***** Deploying *****
// npx hardhat deploy --network bsc --tags MasterSuperVault
// npx hardhat deploy --network ropsten --tags MasterSuperVault


// bsc: 
// 0x00B8f6a25F69820146c6cE7D748A3450537D93D5 (07.26)