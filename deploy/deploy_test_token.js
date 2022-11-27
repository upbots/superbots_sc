const contractName = "TestToken";

const { sleep }  = require("../utils/sleep")

const isVerifying = true;
const VERIFY_DELAY = 100000;

const params = ["Test New UBXT2", "TNU2", "500000000000000000000000000"];

const deployFunction = async ({ getNamedAccounts, deployments, ethers, upgrades, run }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log(`${contractName} deploying...`);
  const contract = await deploy(`${contractName}`, {
    from: deployer,
    args: params,
  })
  console.log(`${contractName} address:`, contract.address);

  if(isVerifying) {
    console.log(`Verifying ${contractName}, can take some time`)
    await sleep(VERIFY_DELAY);
    await run("verify:verify", {
        address: contract.address,
        constructorArguments: params,
        contract: "contracts/test/test_token.sol:TestToken"
    })
  }
};

module.exports = deployFunction;
module.exports.tags = [contractName];


// ***** Deploying *****
// npx hardhat deploy --network bsc --tags TestToken

