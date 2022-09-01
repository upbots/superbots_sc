const contractName = "MasterSuperVaultETH";

const { sleep }  = require("../utils/sleep")

const isVerifying = true;
const VERIFY_DELAY = 100000;

const name="MASTER SUPER VAULT";
const capitalToken = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // BUSD (mainnet)
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
        contract: "contracts/eth/master_vault.sol:MasterSuperVaultETH"
    })
  }
};

module.exports = deployFunction;
module.exports.tags = [contractName];


// ***** Deploying *****
// npx hardhat deploy --network bsc --tags MasterSuperVaultETH
// npx hardhat deploy --network ropsten --tags MasterSuperVaultETH


// bsc: 
// 0x00B8f6a25F69820146c6cE7D748A3450537D93D5 (07.26)