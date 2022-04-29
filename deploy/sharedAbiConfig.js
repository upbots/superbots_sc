const ownDeployedContracts = {
};

// Add external contract addresses like DAI below
const externalContracts = {
  mainnet: {},
  rinkeby: {},
  ropsten: {},
};

module.exports = {
  mainnet: { ...ownDeployedContracts, ...externalContracts.mainnet },
  rinkeby: { ...ownDeployedContracts, ...externalContracts.rinkeby },
  ropsten: { ...ownDeployedContracts, ...externalContracts.ropsten },
};
