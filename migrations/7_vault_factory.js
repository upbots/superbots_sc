const Vault = artifacts.require("VaultFactory");

module.exports = async function (deployer) {
  await deployer.deploy(Vault)
};
