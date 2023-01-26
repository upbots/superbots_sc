const contractName = "VaultV2";

const { sleep } = require("../utils/sleep");
const { params } = require("./inputs/vault_v2_sb_series");

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

  for (const param of params) {
    console.log(`${param[0]} deploying...`);
    const contract = await deploy(`${contractName}`, {
      from: deployer,
      args: param,
    });
    console.log(`${contractName} address:`, contract.address);
  }
};

module.exports = deployFunction;
module.exports.tags = ["SB_Series"];

// ***** Deploying *****
// npx hardhat deploy --network mainnet --tags SB_Series
