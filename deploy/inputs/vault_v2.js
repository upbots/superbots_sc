const params = [
  "WT-ETH", // name
  "0xC146C87c8E66719fa1E151d5A7D6dF9f0D3AD156", // strategist
];

const initParams = {
  56: [
    [
      "0xe9e7cea3dedca5984780bafc599bd69add087d56", // quote token
      "0x2170ed0880ac9a755fd29b2688956bd959f933f8", // base token
      "0xDef1C0ded9bec7F1a1670819833240f027b25EfF", // aggregatorAddr
      "0x10ED43C718714eb63d5aA57B78B54704E256024E", // mainRouter
      "0x10ED43C718714eb63d5aA57B78B54704E256024E", // ubxtPoolRouter
      "0xBbEB90cFb6FAFa1F69AA130B7341089AbeEF5811", // ubxtToken
      "0xe9e7cea3dedca5984780bafc599bd69add087d56", // ubxtPairToken
      "0xBbEB90cFb6FAFa1F69AA130B7341089AbeEF5811", // quotePriceFeed
      "0xBbEB90cFb6FAFa1F69AA130B7341089AbeEF5811", // basePriceFeed
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
  1: [
    [
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // quote token
      "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // base token
      "0xDef1C0ded9bec7F1a1670819833240f027b25EfF", // aggregatorAddr
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // mainRouter
      "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F", // ubxtPoolRouter
      "0x8564653879a18C560E7C0Ea0E084c516C62F5653", // ubxtToken
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // ubxtPairToken
      "0xBbEB90cFb6FAFa1F69AA130B7341089AbeEF5811", // quotePriceFeed
      "0xBbEB90cFb6FAFa1F69AA130B7341089AbeEF5811", // basePriceFeed
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
  params,
  initParams,
};
