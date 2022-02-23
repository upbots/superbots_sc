const Vault = artifacts.require("Vault");

module.exports = async function (deployer) {
  const name="WT-BNB";
  const tokenA = "0xe9e7cea3dedca5984780bafc599bd69add087d56"; // BUSD (mainnet)
  const tokenB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"; // WBNB (mainnet)
  const strategist = "0xC146C87c8E66719fa1E151d5A7D6dF9f0D3AD156";
  const percentDev = 500; // 500/10000
  const company = "0xC146C87c8E66719fa1E151d5A7D6dF9f0D3AD156";
  const stakers = "0xeF729c381bCACFDb8fB5ccEf17079a5d9237ee64";
  const algoDev = "0xea5053bbc95bAeC37506993353Cfc0Ca6530C851";
  const maxCap = "1000000000000000000000000000000000000"
  await deployer.deploy(Vault, name, tokenA, tokenB, strategist, percentDev, company, stakers, algoDev, maxCap) // add parameters
};
