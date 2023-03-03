const contractName = "VaultFactory";

const { sleep }  = require("../../utils/sleep")

const isVerifying = true;
const VERIFY_DELAY = 100000;

const deployFunction = async ({ getNamedAccounts, deployments, ethers, upgrades, run }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log(`${contractName} deploying...`);
  const contract = await deploy(`${contractName}`, {
    from: deployer,
    args: [],
  })
  console.log(`${contractName} address:`, contract.address);

  if(isVerifying) {
    console.log(`Verifying ${contractName}, can take some time`)
    await sleep(VERIFY_DELAY);
    await run("verify:verify", {
        address: contract.address,
        constructorArguments: [],
        contract: "contracts/vault_factory.sol:VaultFactory"
    })
  }
};

module.exports = deployFunction;
module.exports.tags = [contractName];


// ***** Deploying *****
// npx hardhat deploy --network bsc --tags VaultFactory
// npx hardhat deploy --network ropsten --tags VaultFactory


// bsc: 0x707222D01d0Fd1daa6C2Eaf623E15bE54cda3C05, 0x391208b0A29Be0C9B9B78c95b7e577Ff098211Dc
// 0x033deddC211232C6788E21116ed893Aaa2b892Fb  (new)
// 0xae07AFEAb77AF26FBC9f22886d2d5758a58CB959 (7.26)


// _name (string) : WT BNB

// _quoteToken (address) : 0xe9e7cea3dedca5984780bafc599bd69add087d56

// _baseToken (address) : 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c

// _strategist (address) : 0x43C9Ac8E33a11D1C75fCB70B89502dA78f69CCA7, 0xC12Fc1fCcB07aa658e5eAD56d385864a284eA31F

// _percentDev (uint256) : 500

// _company (address) : 0xAD3e4faC288bfa76d92210a25646c33de702174E

// _stakers (address) : 0x4D5Fb87308a7B9C576a900e11f094628158627F6

// _algoDev (address) : 0x81e1b56039f35F19f17d3C5dC9a3EDC6Ca1D6F4A

// _maxCap (uint256) : 5000000000000000000000000


// gnosis
// 0x71343dc51301171276A9B21aE034d90939E4061F


// owner:
// 0x43C9Ac8E33a11D1C75fCB70B89502dA78f69CCA7


/// deployed factory
/// 0xA4d28E0E22403d54B9780B82A5a143fB2eFB2245