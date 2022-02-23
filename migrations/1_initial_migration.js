const Vault = artifacts.require("Vault");

module.exports = async function (deployer) {
  const name="ETH-BUSD";
  // const tokenA = "0x4d955CEF4009f8409558C9666D0237BE22FDd6C2"; // belt (testnet)
  // const tokenB = "0x89adeed6d6e0aef67ad324e4f3424c8af2f98dc2"; // usdt (testnet)
  // const tokenA = "0xE0e514c71282b6f4e823703a39374Cf58dc3eA4f"; // belt (mainnet)
  // const tokenB = "0x55d398326f99059fF775485246999027B3197955"; // usdt (mainnet)
  const tokenA = "0xe9e7cea3dedca5984780bafc599bd69add087d56"; // BUSD (mainnet)
  const tokenB = "0x2170ed0880ac9a755fd29b2688956bd959f933f8"; // ETH (mainnet)
  const strategist = "0xC146C87c8E66719fa1E151d5A7D6dF9f0D3AD156";
  const percentDev = 500; // 500/10000
  const company = "0xC146C87c8E66719fa1E151d5A7D6dF9f0D3AD156";
  const stakers = "0xeF729c381bCACFDb8fB5ccEf17079a5d9237ee64";
  const algoDev = "0xea5053bbc95bAeC37506993353Cfc0Ca6530C851";
  const maxCap = "1000000000000000000000000000000000000"
  await deployer.deploy(Vault, name, tokenA, tokenB, strategist, percentDev, company, stakers, algoDev, maxCap) // add parameters
};
