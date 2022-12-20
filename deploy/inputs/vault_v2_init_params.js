const initParams = {
  56: [
    [
      "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", // quote token
      "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", // base token
      "0xDef1C0ded9bec7F1a1670819833240f027b25EfF", // aggregatorAddr
      "0x10ED43C718714eb63d5aA57B78B54704E256024E", // ubxnSwapRouter
      "0xc822Bb8f72C212f0F9477Ab064F3bdf116c193E6", // ubxnToken
      "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", // ubxnPairToken (paired token with UBXN)
      "0xcBb98864Ef56E9042e7d2efef76141f15731B82f", // quotePriceFeed
      "0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e", // basePriceFeed
      "1000000000000000000000000", // maxCap 1M
    ],
    [
      45, // pctDeposit
      100, // pctWithdraw
      250, // pctPerfBurning
      250, // pctPerfStakers
      500, // pctPerfAlgoDev
      500, // pctPerfUpbots
      1000, // pctPerfPartners
      8, // pctTradUpbots
      "0xeF729c381bCACFDb8fB5ccEf17079a5d9237ee64", // addrStakers
      "0xea5053bbc95bAeC37506993353Cfc0Ca6530C851", // addrAlgoDev
      "0xea5053bbc95bAeC37506993353Cfc0Ca6530C851", // addrUpbots
      "0xea5053bbc95bAeC37506993353Cfc0Ca6530C851", // addrPartner
    ],
  ],
  1: [
    [
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // quote token
      "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // base token
      "0xDef1C0ded9bec7F1a1670819833240f027b25EfF", // aggregatorAddr
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // ubxnPoolRouter
      "0x7A73839bd0e5cdED853cB01aa9773F8989381065", // ubxnToken
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // ubxnPairToken
      "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6", // quotePriceFeed
      "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // basePriceFeed
      "1000000000000000000000000000000000000", // maxCap
    ],
    [
      "45", // pctDeposit
      "100", // pctWithdraw
      "250", // pctPerfBurning
      "250", // pctPerfStakers
      "500", // pctPerfAlgoDev
      "500", // pctPerfUpbots
      "1000", // pctPerfPartners
      "8", // pctTradUpbots
      "0xeF729c381bCACFDb8fB5ccEf17079a5d9237ee64", // addrStakers
      "0xea5053bbc95bAeC37506993353Cfc0Ca6530C851", // addrAlgoDev
      "0xea5053bbc95bAeC37506993353Cfc0Ca6530C851", // addrUpbots
      "0xea5053bbc95bAeC37506993353Cfc0Ca6530C851", // addrPartner
    ],
  ],
};

module.exports = {
  initParams,
};
