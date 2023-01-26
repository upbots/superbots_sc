const contractName = "SupervaultV2";

const { sleep } = require("../utils/sleep");
const { params } = require("./inputs/supervault_v2.js");

const VERIFY_DELAY = 100000;
const deployFunction = async ({
  getNamedAccounts,
  deployments,
  getChainId,
  run,
}) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId();

  console.log(`${contractName} deploying...`);
  const contract = await deploy(`${contractName}`, {
    from: deployer,
    args: ["SupervaultV2"],
  });
  console.log(`${contractName} address:`, contract.address);

  console.log(`Verifying ${contractName}, can take some time`);
  await sleep(VERIFY_DELAY);

  const contractAddress = contract.address;
  await run("verify:verify", {
    address: contractAddress,
    constructorArguments: ["SupervaultV2"],
    contract: "contracts/supervault_v2.sol:SupervaultV2",
  });
};

module.exports = deployFunction;
module.exports.tags = [contractName];

// ***** Deploying *****
// npx hardhat deploy --network mainnet --tags SupervaultV2
