const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const axios = require("axios");

const { params } = require("../deploy/inputs/vault_v2");
const { initParams } = require("../deploy/inputs/vault_v2_init_params");

const APPROVE_MAX = "1000000000000000000000000000";
const BASE_0X_URL = "https://api.0x.org/swap/v1/quote";

let CUR_PRICE = 1200;
let ZeroEx, BasePrice, QuotePrice;

const updatePrice = async (price) => {
  CUR_PRICE = price;
  await BasePrice.setPrice(price * 1e8);
};

const build0xData = async (tokenFrom, tokenTo, amount) => {
  try {
    const transaction = await axios
      .get(
        `${BASE_0X_URL}?sellToken=${tokenFrom}&buyToken=${tokenTo}&sellAmount=${amount}`
      )
      .then((res) => res.data);
    return transaction;
  } catch (e) {
    return null;
  }
};

const buildBuyData = async (amount) => {
  return await build0xData(
    "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
    "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
    amount
  );
};

const buildSellData = async (amount) => {
  return await build0xData(
    "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
    "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
    amount
  );
};

const buildZeroExData = async (isBuy, amount) => {
  const amountOut = isBuy
    ? BigNumber.from(amount).div(CUR_PRICE)
    : BigNumber.from(amount).mul(CUR_PRICE);
  const transactionData = ZeroEx.interface.encodeFunctionData("swap", [
    isBuy,
    amount,
    amountOut,
  ]);
  return { data: transactionData, amountOut: amountOut };
};

const tradeOnVault = async (isBuy, token, Vault_V2) => {
  const vaultBalance = BigNumber.from(await token.balanceOf(Vault_V2.address));
  const swapAmount = vaultBalance.sub(vaultBalance.mul(8).div(10000));

  const transactionData = await buildZeroExData(isBuy, swapAmount.toString());
  if (!transactionData || !transactionData.data) {
    throw "0x api fetch error";
  }

  if (isBuy) {
    await Vault_V2.buy(transactionData.data);
  } else {
    await Vault_V2.sell(transactionData.data);
  }

  return transactionData.amountOut;
};

describe("VaultFactoryV2", function () {
  async function deploySCFixture() {
    const bank = await ethers.getImpersonatedSigner(
      "0x8eb8a3b98659cce290402893d0123abb75e3ab28"
    );
    const BUSD = await ethers.getContractAt(
      "IERC20",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" // quote token (USDC)
    );

    const WETH = await ethers.getContractAt(
      "IERC20",
      "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" // base token (WETH)
    );

    const [Owner, A, B] = await ethers.getSigners();

    await Owner.sendTransaction({
      to: bank.address,
      value: ethers.utils.parseEther("100"),
    });

    BUSD.connect(bank).transfer(
      A.address,
      ethers.utils.parseUnits("1000000", 6)
    );
    BUSD.connect(bank).transfer(
      B.address,
      ethers.utils.parseUnits("1000000", 6)
    );
    BUSD.connect(bank).transfer(
      Owner.address,
      ethers.utils.parseUnits("1000000", 6)
    );
    WETH.connect(bank).transfer(A.address, ethers.utils.parseEther("1000"));
    WETH.connect(bank).transfer(B.address, ethers.utils.parseEther("1000"));

    const vfFactory = await ethers.getContractFactory("VaultFactoryV2");
    const VaultFactory = await vfFactory.deploy(
      "0xDef1C0ded9bec7F1a1670819833240f027b25EfF", // aggregator
      "0x7A73839bd0e5cdED853cB01aa9773F8989381065", // ubxnToken
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // ubxnPairToken
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" // uniswapRouter
    );
    await VaultFactory.deployed();

    // Fixtures can return anything you consider useful for your tests
    return {
      Owner,
      A,
      B,
      bank,
      BUSD,
      WETH,
      VaultFactory,
    };
  }

  it("Should deploy", async function () {
    const { VaultFactory, Owner, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );
  });

  it("Should generate vault", async function () {
    const { VaultFactory, Owner, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );
    await expect(
      VaultFactory.generateVault(
        "WT-ETH",
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // quote token (USDC)
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // base token (WETH)
        "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6", // quotePriceFeed
        "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // basePriceFeed
        Owner.address,
        "10000000000000", // maxCap
        [
          "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        ],
        initParams[1][1]
      )
    ).emit(VaultFactory, "VaultGenerated");
  });
});
