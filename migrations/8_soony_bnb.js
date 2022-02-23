const Vault = artifacts.require("Vault");

module.exports = async function (deployer) {
  const name="Sonny BNB";
  const tokenA = "0xe9e7cea3dedca5984780bafc599bd69add087d56"; // BUSD (mainnet)
  const tokenB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"; // WBNB (mainnet)
  const strategist = "0xC146C87c8E66719fa1E151d5A7D6dF9f0D3AD156";
  const percentDev = 500; // 500/10000
  const company = "0x2B6b2701d7F7b65BA2E1ec2d2dAa17d46B85A4fe";
  const stakers = "0x4d5fb87308a7b9c576a900e11f094628158627f6";
  const algoDev = "0x186D3F21fF43FD964c6142E228c10771CE3c5211";
  const maxCap = "5000000000000000000000000"
  await deployer.deploy(Vault, name, tokenA, tokenB, strategist, percentDev, company, stakers, algoDev, maxCap) // add parameters
};
