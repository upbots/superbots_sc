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
let ZeroEx, BasePrice;

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

describe("Vault_V2", function () {
  async function increaseTime(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    const blockCount = seconds / 3;
    await ethers.provider.send("hardhat_mine", [
      `0x${blockCount.toString(16)}`,
    ]);
  }

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

    const zeroExFactory = await ethers.getContractFactory("ZeroEx");
    ZeroEx = await zeroExFactory.deploy(
      bank.address,
      BUSD.address,
      WETH.address
    );
    await ZeroEx.deployed();

    await BUSD.connect(bank).approve(ZeroEx.address, APPROVE_MAX);
    await WETH.connect(bank).approve(ZeroEx.address, APPROVE_MAX);

    const quotePriceFactory = await ethers.getContractFactory(
      "ChainlinkPriceFeed"
    );
    const QuotePrice = await quotePriceFactory.deploy(100000000);
    await QuotePrice.deployed();

    const basePriceFactory = await ethers.getContractFactory(
      "ChainlinkPriceFeed"
    );
    BasePrice = await basePriceFactory.deploy(120000000000);
    await BasePrice.deployed();

    const vaultFactory = await ethers.getContractFactory("Vault_V2");
    const Vault_V2 = await vaultFactory.deploy("TEST", Owner.address);
    await Vault_V2.deployed();

    await Vault_V2.initialize(
      [
        "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", // quote token
        "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", // base token
        ZeroEx.address, // aggregatorAddr
        "0x10ED43C718714eb63d5aA57B78B54704E256024E", // ubxnSwapRouter
        "0xc822Bb8f72C212f0F9477Ab064F3bdf116c193E6", // ubxnToken
        "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", // ubxnPairToken (paired token with UBXN)
        QuotePrice.address, // quotePriceFeed
        BasePrice.address, // basePriceFeed
        "1000000000000000000000000", // maxCap
      ],
      initParams[56][1]
    );
    await Vault_V2.addToWhiteList(Owner.address);
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
    // Fixtures can return anything you consider useful for your tests
    return {
      Vault_V2,
      Owner,
      A,
      B,
      bank,
      BUSD,
      WETH,
      QuotePrice,
      BasePrice,
    };
  }

  async function vaultInOpenPosition() {
    const { Vault_V2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );
    // deposit
    const amount1 = ethers.utils.parseEther("10000");
    await BUSD.connect(Owner).approve(Vault_V2.address, APPROVE_MAX);
    await Vault_V2.connect(Owner).depositQuote(amount1, []);

    await tradeOnVault(true, BUSD, Vault_V2);

    return { Vault_V2, Owner, A, B, bank, BUSD, WETH };
  }

  it("Should initialize", async function () {
    const [Owner] = await ethers.getSigners();
    const vaultFactory = await ethers.getContractFactory("Vault_V2");
    const Vault_V2 = await vaultFactory.deploy("TEST", Owner.address);
    await Vault_V2.deployed();

    await expect(Vault_V2.initialize(...initParams[56]))
      .emit(Vault_V2, "Initialized")
      .withArgs(...initParams[56]);
  });

  it("Should deposit quote when in closed position", async function () {
    const { Vault_V2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    const amount = ethers.utils.parseEther("10000");
    await BUSD.connect(A).approve(Vault_V2.address, APPROVE_MAX);
    await Vault_V2.connect(A).depositQuote(amount, []);
    expect(await Vault_V2.balanceOf(A.address)).equals(
      amount.sub(amount.mul(45).div(10000))
    );
  });

  it("Should withdraw when in closed position", async function () {
    const { Vault_V2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    const amount = ethers.utils.parseEther("10000");
    await BUSD.connect(A).approve(Vault_V2.address, APPROVE_MAX);
    await Vault_V2.connect(A).depositQuote(amount, []);

    const depositAmount = amount.sub(amount.mul(45).div(10000));
    const withdrawAmount = depositAmount.sub(depositAmount.mul(100).div(10000));
    const share = await Vault_V2.balanceOf(A.address);

    const balanceBefore = BigNumber.from(await BUSD.balanceOf(A.address));
    await Vault_V2.connect(A).withdraw(share);

    expect(await BUSD.balanceOf(A.address)).equals(
      balanceBefore.add(withdrawAmount)
    );
  });

  it("Check deposit and withdraw in quote in closed position", async function () {
    const { Vault_V2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );
    const amount1 = ethers.utils.parseEther("40000");
    const feeDeposit = amount1.mul(45).div(10000);
    const deposit1 = amount1.sub(feeDeposit);
    const feeWithdraw = deposit1.mul(100).div(10000);

    await BUSD.connect(A).approve(Vault_V2.address, APPROVE_MAX);

    const balanceA = await BUSD.balanceOf(A.address);
    await Vault_V2.connect(A).depositQuote(amount1, []);
    await Vault_V2.connect(A).withdraw(await Vault_V2.balanceOf(A.address));

    expect(await BUSD.balanceOf(A.address)).equal(
      BigNumber.from(balanceA).sub(feeDeposit).sub(feeWithdraw)
    );
  });

  it("Check share calculation of depositQuote in closed position", async function () {
    const { Vault_V2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    const amount1 = ethers.utils.parseEther("10000");
    const amount2 = ethers.utils.parseEther("20000");
    const amount3 = ethers.utils.parseEther("30000");
    await BUSD.connect(A).approve(Vault_V2.address, APPROVE_MAX);
    await BUSD.connect(B).approve(Vault_V2.address, APPROVE_MAX);
    await BUSD.connect(bank).approve(Vault_V2.address, APPROVE_MAX);

    const deposits = [
      { account: A, amount: amount1 },
      { account: B, amount: amount2 },
      { account: A, amount: amount2 },
      { account: bank, amount: amount3 },
      { account: B, amount: amount1 },
      { account: bank, amount: amount1 },
      { account: A, amount: amount1 },
    ];

    const depositA = deposits
      .filter((item) => item.account === A)
      .reduce((acc, cur) => acc.add(cur.amount), BigNumber.from(0));
    const depositB = deposits
      .filter((item) => item.account === B)
      .reduce((acc, cur) => acc.add(cur.amount), BigNumber.from(0));
    const depositBank = deposits
      .filter((item) => item.account === bank)
      .reduce((acc, cur) => acc.add(cur.amount), BigNumber.from(0));

    const returnA = depositA
      .mul(10000 - 45)
      .div(10000)
      .mul(10000 - 100)
      .div(10000);
    const returnB = depositB
      .mul(10000 - 45)
      .div(10000)
      .mul(10000 - 100)
      .div(10000);
    const returnBank = depositBank
      .mul(10000 - 45)
      .div(10000)
      .mul(10000 - 100)
      .div(10000);

    const balanceA = await BUSD.balanceOf(A.address);
    const balanceB = await BUSD.balanceOf(B.address);
    const balanceBank = await BUSD.balanceOf(bank.address);

    for (let i = 0; i < deposits.length; i++) {
      await Vault_V2.connect(deposits[i].account).depositQuote(
        deposits[i].amount,
        []
      );
    }

    await Vault_V2.connect(A).withdraw(await Vault_V2.balanceOf(A.address));
    await Vault_V2.connect(B).withdraw(await Vault_V2.balanceOf(B.address));
    await Vault_V2.connect(bank).withdraw(
      await Vault_V2.balanceOf(bank.address)
    );

    expect(await BUSD.balanceOf(A.address), "A").equal(
      BigNumber.from(balanceA).sub(depositA.sub(returnA))
    );
    expect(await BUSD.balanceOf(B.address), "B").equal(
      BigNumber.from(balanceB).sub(depositB.sub(returnB))
    );
    expect(await BUSD.balanceOf(bank.address), "Bank").equal(
      BigNumber.from(balanceBank).sub(depositBank.sub(returnBank))
    );
  });

  it("Should open/close position", async function () {
    const { Vault_V2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    // deposit
    const amount1 = ethers.utils.parseEther("10000");
    await BUSD.connect(A).approve(Vault_V2.address, APPROVE_MAX);
    await Vault_V2.connect(A).depositQuote(amount1, []);

    // open
    const vaultBalance = BigNumber.from(await BUSD.balanceOf(Vault_V2.address));
    const swapAmount = vaultBalance.sub(vaultBalance.mul(8).div(10000));

    const wethAmount = ethers.utils.parseEther("100");

    const transactionData = await buildZeroExData(true, swapAmount);
    if (!transactionData || !transactionData.data) {
      throw "0x api fetch error";
    }

    await expect(Vault_V2.buy(transactionData.data)).emit(
      Vault_V2,
      "TradeDone"
    );

    // close
    const vaultBalance2 = BigNumber.from(
      await WETH.balanceOf(Vault_V2.address)
    );
    const swapAmount2 = vaultBalance2.sub(vaultBalance2.mul(8).div(10000));

    const transactionData2 = await buildZeroExData(false, swapAmount2);
    if (!transactionData2 || !transactionData2.data) {
      throw "0x api fetch error";
    }
    await expect(Vault_V2.sell(transactionData2.data)).emit(
      Vault_V2,
      "TradeDone"
    );

    // withdraw
    await Vault_V2.connect(A).withdraw(Vault_V2.balanceOf(A.address));
    expect(await BUSD.balanceOf(Vault_V2.address)).equal(0);
    expect(await WETH.balanceOf(Vault_V2.address)).equal(0);
  }).timeout(200000);

  it("Check deposit and withdraw in base in open position", async function () {
    const { Vault_V2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      vaultInOpenPosition
    );
    const amount1 = ethers.utils.parseEther("400");
    const returnAmount = amount1
      .mul(10000 - 45)
      .div(10000)
      .mul(10000 - 100)
      .div(10000);

    await WETH.connect(B).approve(Vault_V2.address, APPROVE_MAX);

    const balance = await WETH.balanceOf(B.address);
    await Vault_V2.connect(B).depositBase(amount1, []);
    await Vault_V2.connect(B).withdraw(await Vault_V2.balanceOf(B.address));

    expect(await WETH.balanceOf(B.address)).equal(
      BigNumber.from(balance).sub(amount1).add(returnAmount)
    );
  }).timeout(200000);

  it("Check share calculation of depositBase in open position", async function () {
    const { Vault_V2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      vaultInOpenPosition
    );

    const amount1 = ethers.utils.parseEther("100");
    const amount2 = ethers.utils.parseEther("200");
    const amount3 = ethers.utils.parseEther("300");
    await WETH.connect(A).approve(Vault_V2.address, APPROVE_MAX);
    await WETH.connect(B).approve(Vault_V2.address, APPROVE_MAX);
    await WETH.connect(bank).approve(Vault_V2.address, APPROVE_MAX);

    const deposits = [
      { account: A, amount: amount1 },
      { account: B, amount: amount2 },
      { account: A, amount: amount2 },
      { account: bank, amount: amount3 },
      { account: B, amount: amount1 },
      { account: bank, amount: amount1 },
      { account: A, amount: amount1 },
    ];

    const depositA = deposits
      .filter((item) => item.account === A)
      .reduce((acc, cur) => acc.add(cur.amount), BigNumber.from(0));
    const depositB = deposits
      .filter((item) => item.account === B)
      .reduce((acc, cur) => acc.add(cur.amount), BigNumber.from(0));
    const depositBank = deposits
      .filter((item) => item.account === bank)
      .reduce((acc, cur) => acc.add(cur.amount), BigNumber.from(0));

    const returnA = depositA
      .mul(10000 - 45)
      .div(10000)
      .mul(10000 - 100)
      .div(10000);
    const returnB = depositB
      .mul(10000 - 45)
      .div(10000)
      .mul(10000 - 100)
      .div(10000);
    const returnBank = depositBank
      .mul(10000 - 45)
      .div(10000)
      .mul(10000 - 100)
      .div(10000);

    const balanceA = await WETH.balanceOf(A.address);
    const balanceB = await WETH.balanceOf(B.address);
    const balanceBank = await WETH.balanceOf(bank.address);

    for (let i = 0; i < deposits.length; i++) {
      await Vault_V2.connect(deposits[i].account).depositBase(
        deposits[i].amount,
        []
      );
    }

    await Vault_V2.connect(A).withdraw(await Vault_V2.balanceOf(A.address));
    await Vault_V2.connect(B).withdraw(await Vault_V2.balanceOf(B.address));
    await Vault_V2.connect(bank).withdraw(
      await Vault_V2.balanceOf(bank.address)
    );

    expect(await WETH.balanceOf(A.address), "A").equal(
      BigNumber.from(balanceA).sub(depositA.sub(returnA))
    );
    expect(await WETH.balanceOf(B.address), "B").equal(
      BigNumber.from(balanceB).sub(depositB.sub(returnB))
    );
    expect(await WETH.balanceOf(bank.address), "Bank").equal(
      BigNumber.from(balanceBank).sub(depositBank.sub(returnBank))
    );
  }).timeout(200000);

  it("Check share calculation of depositQuote in open position", async function () {
    const { Vault_V2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      vaultInOpenPosition
    );

    await BUSD.connect(A).approve(Vault_V2.address, APPROVE_MAX);

    const amount1 = ethers.utils.parseEther("10000");
    const deposited = amount1.mul(10000 - 45).div(10000);

    const transactionData = await buildZeroExData(true, deposited);

    const vaultBefore = BigNumber.from(await WETH.balanceOf(Vault_V2.address));
    await Vault_V2.connect(A).depositQuote(amount1, transactionData.data);
    const vaultAfter = BigNumber.from(await WETH.balanceOf(Vault_V2.address));
    expect(vaultAfter.sub(vaultBefore)).equal(deposited.div(CUR_PRICE));

    const ABefore = BigNumber.from(await WETH.balanceOf(A.address));
    await Vault_V2.connect(A).withdraw(await Vault_V2.balanceOf(A.address));
    const AAfter = BigNumber.from(await WETH.balanceOf(A.address));

    expect(AAfter.sub(ABefore)).equal(
      vaultAfter
        .sub(vaultBefore)
        .mul(10000 - 100)
        .div(10000)
    );
  });

  it("Check share calculation of depositBase in close position", async function () {
    const { Vault_V2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    await WETH.connect(A).approve(Vault_V2.address, APPROVE_MAX);

    const amount1 = ethers.utils.parseEther("100");
    const deposited = amount1.mul(10000 - 45).div(10000);

    const transactionData = await buildZeroExData(false, deposited);

    const vaultBefore = BigNumber.from(await BUSD.balanceOf(Vault_V2.address));
    await Vault_V2.connect(A).depositBase(amount1, transactionData.data);
    const vaultAfter = BigNumber.from(await BUSD.balanceOf(Vault_V2.address));
    expect(vaultAfter.sub(vaultBefore)).equal(deposited.mul(CUR_PRICE));

    const ABefore = BigNumber.from(await BUSD.balanceOf(A.address));
    await Vault_V2.connect(A).withdraw(await Vault_V2.balanceOf(A.address));
    const AAfter = BigNumber.from(await BUSD.balanceOf(A.address));

    expect(AAfter.sub(ABefore)).equal(
      vaultAfter
        .sub(vaultBefore)
        .mul(10000 - 100)
        .div(10000)
    );
  });

  it("Should trade 10 times", async function () {
    const { Vault_V2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );
    // deposit
    const amount1 = ethers.utils.parseEther("10000");
    await BUSD.connect(A).approve(Vault_V2.address, APPROVE_MAX);
    await Vault_V2.connect(A).depositQuote(amount1, []);

    await tradeOnVault(true, BUSD, Vault_V2);
    await updatePrice(1500);
    await tradeOnVault(false, WETH, Vault_V2);
    await updatePrice(1400);
    await tradeOnVault(true, BUSD, Vault_V2);
    await updatePrice(1600);
    await tradeOnVault(false, WETH, Vault_V2);
    await updatePrice(1500);
    await tradeOnVault(true, BUSD, Vault_V2);
    await updatePrice(1300);
    await tradeOnVault(false, WETH, Vault_V2);
    await updatePrice(1200);
    await tradeOnVault(true, BUSD, Vault_V2);
    await updatePrice(1200);
    await tradeOnVault(false, WETH, Vault_V2);

    await Vault_V2.connect(A).withdraw(await Vault_V2.balanceOf(A.address));
    const balanceAfter = await BUSD.balanceOf(A.address);
    console.log(balanceAfter);
  });

  it("Check perf fee share when the trade is profit", async function () {
    const { Vault_V2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );
    // deposit
    const amount1 = ethers.utils.parseEther("10000");
    await BUSD.connect(A).approve(Vault_V2.address, APPROVE_MAX);
    await Vault_V2.connect(A).depositQuote(amount1, []);

    const deposited = amount1.mul(10000 - 45).div(10000);
    await tradeOnVault(true, BUSD, Vault_V2);
    const startAmount = await Vault_V2.soldAmount();

    expect(startAmount, "soldAmount").equal(
      deposited.mul(10000 - 8).div(10000)
    );

    await updatePrice(1500);
    await tradeOnVault(false, WETH, Vault_V2);

    const baseAmount = startAmount.div(1200);
    const endAmount = baseAmount.sub(baseAmount.mul(8).div(10000)).mul(1500);
    const profit = BigNumber.from(10000).mul(endAmount).div(startAmount);
    const profitAmount = endAmount.mul(profit - 10000).div(profit);
    const resultAmount = endAmount.sub(profitAmount.mul(2000).div(10000));

    const remaining = BigNumber.from(await BUSD.balanceOf(Vault_V2.address));
    expect(remaining.sub(resultAmount).toNumber(), "result check").lessThan(
      100
    );
  });

  it("Check profit calculation in trades", async function () {
    const { Vault_V2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    const profitUpdate = (profit, price1, price2) => {
      return BigNumber.from(profit)
        .mul(BigNumber.from(price2).mul(9992).div(10000))
        .div(price1);
    };
    // deposit
    const amount1 = ethers.utils.parseEther("10000");
    await BUSD.connect(A).approve(Vault_V2.address, APPROVE_MAX);
    await BUSD.connect(B).approve(Vault_V2.address, APPROVE_MAX);
    await BUSD.connect(bank).approve(Vault_V2.address, APPROVE_MAX);
    await Vault_V2.connect(A).depositQuote(amount1, []);
    await Vault_V2.connect(B).depositQuote(amount1.mul(2), []);
    await Vault_V2.connect(bank).depositQuote(amount1.mul(3), []);

    let profit = 10000;
    await updatePrice(1200);
    await tradeOnVault(true, BUSD, Vault_V2);
    await updatePrice(1150);
    await tradeOnVault(false, WETH, Vault_V2);

    profit = profitUpdate(profit, 1200, 1150);
    expect(await Vault_V2.profit(), "check1").equal(profit);

    await updatePrice(1100);
    await tradeOnVault(true, BUSD, Vault_V2);
    await updatePrice(900);
    await tradeOnVault(false, WETH, Vault_V2);

    profit = profitUpdate(profit, 1100, 900);
    expect(
      BigNumber.from(await Vault_V2.profit())
        .sub(profit)
        .toNumber(),
      "check2"
    ).lessThan(5);

    await updatePrice(800);
    await tradeOnVault(true, BUSD, Vault_V2);
    await updatePrice(1000);
    await tradeOnVault(false, WETH, Vault_V2);

    profit = profitUpdate(profit, 800, 1000);
    expect(
      BigNumber.from(await Vault_V2.profit())
        .sub(profit)
        .toNumber(),
      "check3"
    ).lessThan(5);

    await updatePrice(1100);
    await tradeOnVault(true, BUSD, Vault_V2);
    await updatePrice(1500);
    await tradeOnVault(false, WETH, Vault_V2);

    profit = profitUpdate(profit, 1100, 1500);
    expect(await Vault_V2.profit(), "check4").equal(10000);
  });

  it("Should update strategist", async function () {
    const { Vault_V2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    await expect(Vault_V2.connect(A).addToWhiteList(B.address)).revertedWith(
      "Not strategist"
    );

    await expect(Vault_V2.setStrategist(A.address))
      .emit(Vault_V2, "StrategistUpdated")
      .withArgs(A.address);

    await expect(Vault_V2.connect(A).addToWhiteList(B.address))
      .emit(Vault_V2, "WhiteListAdded")
      .withArgs(B.address);
  });

  it("Should add/remove whitelist", async function () {
    const { Vault_V2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    expect(await Vault_V2.whiteList(A.address)).equal(false);
    expect(await Vault_V2.whiteList(B.address)).equal(false);

    await expect(Vault_V2.addToWhiteList(B.address))
      .emit(Vault_V2, "WhiteListAdded")
      .withArgs(B.address);

    await expect(Vault_V2.addToWhiteList(A.address))
      .emit(Vault_V2, "WhiteListAdded")
      .withArgs(A.address);

    expect(await Vault_V2.whiteList(A.address)).equal(true);
    expect(await Vault_V2.whiteList(B.address)).equal(true);
  });

  it("Check trading fee distribution", async function () {
    const { Vault_V2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    const amount1 = ethers.utils.parseEther("10000");
    await BUSD.connect(A).approve(Vault_V2.address, APPROVE_MAX);
    await Vault_V2.connect(A).depositQuote(amount1, []);

    const deposited = amount1.mul(10000 - 45).div(10000);
    const fee = deposited.mul(8).div(10000);

    const pancake = await ethers.getContractAt(
      "UniswapRouterV2",
      "0x10ED43C718714eb63d5aA57B78B54704E256024E"
    );

    const UBXN = await ethers.getContractAt(
      "IERC20",
      "0xc822Bb8f72C212f0F9477Ab064F3bdf116c193E6"
    );

    const feeReceiver = "0xea5053bbc95bAeC37506993353Cfc0Ca6530C851";

    const amounts = await pancake.getAmountsOut(fee, [
      BUSD.address,
      UBXN.address,
    ]);

    const ubxnBefore = await UBXN.balanceOf(feeReceiver);
    await updatePrice(1200);
    await tradeOnVault(true, BUSD, Vault_V2);

    const ubxnAfter = await UBXN.balanceOf(feeReceiver);

    expect(BigNumber.from(ubxnAfter).sub(ubxnBefore)).equal(amounts[1]);
  });

  it("Check performance fee distribution", async function () {
    const { Vault_V2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    const UBXN = await ethers.getContractAt(
      "IERC20",
      "0xc822Bb8f72C212f0F9477Ab064F3bdf116c193E6"
    );

    // deposit
    const amount1 = ethers.utils.parseEther("10000");
    await BUSD.connect(A).approve(Vault_V2.address, APPROVE_MAX);
    await Vault_V2.connect(A).depositQuote(amount1, []);

    await updatePrice(1200);
    await tradeOnVault(true, BUSD, Vault_V2);
    await updatePrice(1500);

    const ubxnbefore1 = await UBXN.balanceOf(
      "0xeF729c381bCACFDb8fB5ccEf17079a5d9237ee64"
    );
    const ubxnbefore2 = await UBXN.balanceOf(
      "0xea5053bbc95bAeC37506993353Cfc0Ca6530C851"
    );
    const quoteAmount = await tradeOnVault(false, WETH, Vault_V2);

    const ubxnAfter1 = await UBXN.balanceOf(
      "0xeF729c381bCACFDb8fB5ccEf17079a5d9237ee64"
    );
    const ubxnAfter2 = await UBXN.balanceOf(
      "0xeF729c381bCACFDb8fB5ccEf17079a5d9237ee64"
    );

    expect(
      BigNumber.from(ubxnAfter1).sub(ubxnbefore1).isZero(),
      "check1"
    ).equal(false);

    expect(
      BigNumber.from(ubxnAfter2).sub(ubxnbefore2).isZero(),
      "check2"
    ).equal(false);
  });

  it("Check deposit/withdraw fees for partner", async function () {
    const { Vault_V2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    const busdBefore = await BUSD.balanceOf(
      "0xea5053bbc95bAeC37506993353Cfc0Ca6530C851"
    );
    // deposit
    const amount1 = ethers.utils.parseEther("10000");
    await BUSD.connect(A).approve(Vault_V2.address, APPROVE_MAX);
    await Vault_V2.connect(A).depositQuote(amount1, []);
    const busdAfter = await BUSD.balanceOf(
      "0xea5053bbc95bAeC37506993353Cfc0Ca6530C851"
    );

    const fees = amount1.mul(45).div(10000);

    expect(BigNumber.from(busdAfter).sub(busdBefore)).equal(fees);

    const busdBefore1 = await BUSD.balanceOf(
      "0xea5053bbc95bAeC37506993353Cfc0Ca6530C851"
    );
    // deposit
    await BUSD.connect(A).approve(Vault_V2.address, APPROVE_MAX);
    await Vault_V2.connect(A).withdraw(await Vault_V2.balanceOf(A.address));
    const busdAfter1 = await BUSD.balanceOf(
      "0xea5053bbc95bAeC37506993353Cfc0Ca6530C851"
    );

    const fees2 = amount1
      .mul(10000 - 45)
      .div(10000)
      .mul(100)
      .div(10000);

    expect(BigNumber.from(busdAfter1).sub(busdBefore1)).equal(fees2);
  });

  it("Check estimated pool size", async function () {
    const { Vault_V2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    // deposit
    const amount1 = ethers.utils.parseEther("10000");
    await BUSD.connect(A).approve(Vault_V2.address, APPROVE_MAX);
    await Vault_V2.connect(A).depositQuote(amount1, []);
    const deposited1 = amount1.mul(10000 - 45).div(10000);
    expect(await Vault_V2.estimatedPoolSize()).equal(deposited1);

    const amount2 = ethers.utils.parseEther("100");
    await WETH.connect(A).approve(Vault_V2.address, APPROVE_MAX);
    const deposited2 = amount2.mul(10000 - 45).div(10000);

    const transactionData = await buildZeroExData(false, deposited2);
    await Vault_V2.connect(A).depositBase(amount2, transactionData.data);
    expect(await Vault_V2.estimatedPoolSize()).equal(
      deposited1.add(deposited2.mul(1200))
    );
  });

  it.only("Check max cap", async function () {
    const { Vault_V2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    await BUSD.connect(bank).approve(Vault_V2.address, APPROVE_MAX);
    await WETH.connect(bank).approve(Vault_V2.address, APPROVE_MAX);
    // deposit
    const amount1 = ethers.utils.parseEther("10000");
    await Vault_V2.connect(bank).depositQuote(amount1, []);

    await expect(
      Vault_V2.connect(bank).depositQuote(amount1.mul(1000), [])
    ).revertedWith("The vault reached the max cap");

    const amount2 = ethers.utils.parseEther("5000");
    const transactionData = await buildZeroExData(
      false,
      amount2.mul(10000 - 45).div(10000)
    );
    Vault_V2.connect(bank).depositBase(amount2, transactionData.data);
    await expect(
      Vault_V2.connect(bank).depositBase(amount2, transactionData.data)
    ).revertedWith("The vault reached the max cap");
  });
});
