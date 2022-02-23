const Vault = artifacts.require("MasterSuperVault");

module.exports = async function (deployer) {
  const name="MASTER VAULT";
//   const capitalToken = "0x8301f2213c0eed49a7e28ae4c3e91722919b8b47"; // BUSD (testnet)
  const capitalToken = "0xe9e7cea3dedca5984780bafc599bd69add087d56"; // BUSD (mainnet)
  const maxCap = "1000000000000000000000000000000000000";

  await deployer.deploy(Vault, name, capitalToken, maxCap) // add parameters
};
