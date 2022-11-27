const contractName = "Vault";

const { sleep }  = require("../../utils/sleep")
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
      // param.percentDev,
      param.stakers,
      // param.algoDev,
      // param.company,
      // param.partner,
      param.percentDeposit,
      param.percentWithdraw,
      param.percentTradUpbots,
      param.maxCap
    ],
  })
  console.log(`${contractName} address:`, contract.address);

  if(isVerifying) {
    console.log(`Verifying ${contractName}, can take some time`)
    await sleep(VERIFY_DELAY);

    const contractAddress = contract.address; // "0x68bc4fe78431dc2c3baa2d4c0f8182990c384dfe";
    await run("verify:verify", {
        address: contractAddress,
        constructorArguments: [
          param.name,
          param.tokenA,
          param.tokenB,
          param.strategist,
          // param.percentDev,
          param.stakers,
          // param.algoDev,
          // param.company,
          // param.partner,
          param.percentDeposit,
          param.percentWithdraw,
          param.percentTradUpbots,          
          param.maxCap
        ],
        contract: "contracts/vault.sol:Vault"
    })
  }
};

module.exports = deployFunction;
module.exports.tags = [contractName];


// ***** Deploying *****
// npx hardhat deploy --network bsc --tags Vault
// npx hardhat deploy --network ropsten --tags Vault


// bsc: 0x6c4ccD5b9f9fb5364848489E651D22d2B33d91C4, 0xa25CDc2152908dBfd69cFC20734F19ade9a06b03