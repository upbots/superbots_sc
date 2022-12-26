const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const axios = require("axios");

const { params } = require("../deploy/inputs/vault_v2");
const { initParams } = require("../deploy/inputs/vault_v2_init_params");

const APPROVE_MAX = "1000000000000000000000000000";
const BASE_0X_URL = "https://bsc.api.0x.org/swap/v1/quote";

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
      "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3"
    );
    const BUSD = await ethers.getContractAt(
      "IERC20",
      "0xe9e7cea3dedca5984780bafc599bd69add087d56"
    );

    const WETH = await ethers.getContractAt(
      "IERC20",
      "0x2170ed0880ac9a755fd29b2688956bd959f933f8"
    );

    const [Owner, A, B] = await ethers.getSigners();

    await Owner.sendTransaction({
      to: bank.address,
      value: ethers.utils.parseEther("100"),
    });

    BUSD.connect(bank).transfer(A.address, ethers.utils.parseEther("1000000"));
    BUSD.connect(bank).transfer(B.address, ethers.utils.parseEther("1000000"));
    BUSD.connect(bank).transfer(
      Owner.address,
      ethers.utils.parseEther("1000000")
    );
    WETH.connect(bank).transfer(A.address, ethers.utils.parseEther("1000"));
    WETH.connect(bank).transfer(B.address, ethers.utils.parseEther("1000"));

    const vfFactory = await ethers.getContractFactory("VaultFactoryV2");
    const VaultFactory = await vfFactory.deploy(
      "0xDef1C0ded9bec7F1a1670819833240f027b25EfF",
      "0xc822bb8f72c212f0f9477ab064f3bdf116c193e6",
      "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
      "0x10ED43C718714eb63d5aA57B78B54704E256024E"
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
        "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", // quote token
        "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", // base token
        "0xcBb98864Ef56E9042e7d2efef76141f15731B82f",
        "0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e",
        Owner.address,
        "10000000000000000000000000", // maxCap
        [
          "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
          "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
        ],
        initParams[56][1]
      )
    ).emit(VaultFactory, "VaultGenerated");
  });
});
