const contractName = "UbxtSeller";

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
        contract: "contracts/ubxt_seller.sol:UbxtSeller"
    })
  }
};

module.exports = deployFunction;
module.exports.tags = [contractName];


// ***** Deploying *****
// npx hardhat deploy --network bsc --tags UbxtSeller
// npx hardhat deploy --network ropsten --tags UbxtSeller


// bsc: 
// 0x00B8f6a25F69820146c6cE7D748A3450537D93D5 (07.26)