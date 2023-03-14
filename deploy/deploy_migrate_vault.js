const contractName = "MigrateVault";

const { sleep } = require("../utils/sleep");

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
    args: [],
  });
  console.log(`${contractName} address:`, contract.address);

  console.log(`Verifying ${contractName}, can take some time`);
  await sleep(VERIFY_DELAY);

  const contractAddress = contract.address;
  await run("verify:verify", {
    address: contractAddress,
    constructorArguments: [],
    contract: "contracts/migrate_vault.sol:MigrateVault",
  });
};

module.exports = deployFunction;
module.exports.tags = [contractName];

// ***** Deploying *****
// npx hardhat deploy --network mainnet --tags MigrateVault
