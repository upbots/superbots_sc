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
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // quote token (USDC)
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // base token (WETH)
    amount
  );
};

const buildSellData = async (amount) => {
  return await build0xData(
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // base token (WETH)
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // quote token (USDC)
    amount
  );
};

const buildZeroExData = async (isBuy, amount) => {
  const amountOut = isBuy
    ? BigNumber.from(amount).div(CUR_PRICE).mul(1e12)
    : BigNumber.from(amount).mul(CUR_PRICE).div(1e12);
  const transactionData = ZeroEx.interface.encodeFunctionData("swap", [
    isBuy,
    amount,
    amountOut,
  ]);
  return { data: transactionData, amountOut: amountOut };
};

const tradeOnVault = async (isBuy, token, VaultV2) => {
  const vaultBalance = BigNumber.from(await token.balanceOf(VaultV2.address));
  const swapAmount = vaultBalance.sub(vaultBalance.mul(8).div(10000));

  const transactionData = await buildZeroExData(isBuy, swapAmount.toString());
  if (!transactionData || !transactionData.data) {
    throw "0x api fetch error";
  }

  if (isBuy) {
    await VaultV2.buy(transactionData.data);
  } else {
    await VaultV2.sell(transactionData.data);
  }

  return transactionData.amountOut;
};

describe("VaultV2", function () {
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

    const UBXN = await ethers.getContractAt(
      "IERC20",
      "0x7A73839bd0e5cdED853cB01aa9773F8989381065"
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

    const uniswapFactory = await ethers.getContractFactory("Uniswap");
    const Uniswap = await uniswapFactory.deploy(bank.address, UBXN.address);
    await Uniswap.deployed();

    await BUSD.connect(bank).approve(Uniswap.address, APPROVE_MAX);
    await WETH.connect(bank).approve(Uniswap.address, APPROVE_MAX);
    await UBXN.connect(bank).approve(Uniswap.address, APPROVE_MAX);

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

    const vaultFactory = await ethers.getContractFactory("VaultV2");
    const VaultV2 = await vaultFactory.deploy("TEST", Owner.address);
    await VaultV2.deployed();

    await VaultV2.initialize(
      [
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // quote token (USDC)
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // base token (WETH)
        ZeroEx.address, // aggregatorAddr
        Uniswap.address, // uniswapRouter
        [
          "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        ],
        "0x7A73839bd0e5cdED853cB01aa9773F8989381065", // ubxnToken
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // ubxnPairToken
        QuotePrice.address, // quotePriceFeed
        BasePrice.address, // basePriceFeed
        "10000000000000", // maxCap
      ],
      initParams[1][1]
    );
    await VaultV2.addToWhiteList(Owner.address);
    await Owner.sendTransaction({
      to: bank.address,
      value: ethers.utils.parseEther("100"),
    });

    await BUSD.connect(bank).transfer(
      A.address,
      ethers.utils.parseUnits("1000000", 6)
    );
    await BUSD.connect(bank).transfer(
      B.address,
      ethers.utils.parseUnits("1000000", 6)
    );
    await BUSD.connect(bank).transfer(
      Owner.address,
      ethers.utils.parseUnits("1000000", 6)
    );
    await WETH.connect(bank).transfer(
      A.address,
      ethers.utils.parseEther("1000")
    );
    await WETH.connect(bank).transfer(
      B.address,
      ethers.utils.parseEther("1000")
    );

    const ubxnBank = await ethers.getImpersonatedSigner(
      "0x12ca989fce892bc77eeac6b4e2e609cb9050fcca"
    );
    await UBXN.connect(ubxnBank).transfer(
      bank.address,
      ethers.utils.parseEther("100000")
    );

    // Fixtures can return anything you consider useful for your tests
    return {
      VaultV2,
      Owner,
      A,
      B,
      bank,
      BUSD,
      WETH,
      QuotePrice,
      BasePrice,
      UBXN,
    };
  }

  async function vaultInOpenPosition() {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );
    // deposit
    const amount1 = ethers.utils.parseUnits("10000", 6);
    await BUSD.connect(Owner).approve(VaultV2.address, APPROVE_MAX);
    await VaultV2.connect(Owner).depositQuote(amount1, []);

    await tradeOnVault(true, BUSD, VaultV2);

    await VaultV2.connect(Owner).withdraw(
      await VaultV2.balanceOf(Owner.address)
    );

    return { VaultV2, Owner, A, B, bank, BUSD, WETH };
  }

  it("Should initialize", async function () {
    const [Owner] = await ethers.getSigners();
    const vaultFactory = await ethers.getContractFactory("VaultV2");
    const VaultV2 = await vaultFactory.deploy("TEST", Owner.address);
    await VaultV2.deployed();

    await expect(VaultV2.initialize(...initParams[1])).emit(
      VaultV2,
      "Initialized"
    );
  });

  it("Should deposit quote when in closed position", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    const amount = ethers.utils.parseUnits("10000", 6);
    await BUSD.connect(A).approve(VaultV2.address, APPROVE_MAX);
    await VaultV2.connect(A).depositQuote(amount);
    expect(await VaultV2.balanceOf(A.address)).equals(
      amount.sub(amount.mul(45).div(10000))
    );
  });

  it("Should withdraw when in closed position", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    const amount = ethers.utils.parseUnits("10000", 6);
    await BUSD.connect(A).approve(VaultV2.address, APPROVE_MAX);
    await VaultV2.connect(A).depositQuote(amount);

    const depositAmount = amount.sub(amount.mul(45).div(10000));
    const withdrawAmount = depositAmount.sub(depositAmount.mul(100).div(10000));
    const share = await VaultV2.balanceOf(A.address);

    const balanceBefore = BigNumber.from(await BUSD.balanceOf(A.address));
    await VaultV2.connect(A).withdraw(share);

    expect(await BUSD.balanceOf(A.address)).equals(
      balanceBefore.add(withdrawAmount)
    );
  });

  it("Check deposit and withdraw in quote in closed position", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );
    const amount1 = ethers.utils.parseUnits("40000", 6);
    const feeDeposit = amount1.mul(45).div(10000);
    const deposit1 = amount1.sub(feeDeposit);
    const feeWithdraw = deposit1.mul(100).div(10000);

    await BUSD.connect(A).approve(VaultV2.address, APPROVE_MAX);

    const balanceA = await BUSD.balanceOf(A.address);
    await VaultV2.connect(A).depositQuote(amount1);
    await VaultV2.connect(A).withdraw(await VaultV2.balanceOf(A.address));

    expect(await BUSD.balanceOf(A.address)).equal(
      BigNumber.from(balanceA).sub(feeDeposit).sub(feeWithdraw)
    );
  });

  it("Check share calculation of depositQuote in closed position", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    const amount1 = ethers.utils.parseUnits("10000", 6);
    const amount2 = amount1.mul(2);
    const amount3 = amount1.mul(2);
    await BUSD.connect(A).approve(VaultV2.address, APPROVE_MAX);
    await BUSD.connect(B).approve(VaultV2.address, APPROVE_MAX);
    await BUSD.connect(bank).approve(VaultV2.address, APPROVE_MAX);

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
      await VaultV2.connect(deposits[i].account).depositQuote(
        deposits[i].amount
      );
    }

    await VaultV2.connect(A).withdraw(await VaultV2.balanceOf(A.address));
    await VaultV2.connect(B).withdraw(await VaultV2.balanceOf(B.address));
    await VaultV2.connect(bank).withdraw(await VaultV2.balanceOf(bank.address));

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
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    // deposit
    const amount1 = ethers.utils.parseUnits("10000", 6);
    await BUSD.connect(A).approve(VaultV2.address, APPROVE_MAX);
    await VaultV2.connect(A).depositQuote(amount1, []);

    // open
    const vaultBalance = BigNumber.from(await BUSD.balanceOf(VaultV2.address));
    const swapAmount = vaultBalance.sub(vaultBalance.mul(8).div(10000));

    const wethAmount = ethers.utils.parseEther("100");

    const transactionData = await buildZeroExData(true, swapAmount);
    if (!transactionData || !transactionData.data) {
      throw "0x api fetch error";
    }

    await expect(VaultV2.buy(transactionData.data)).emit(VaultV2, "TradeDone");

    // close
    const vaultBalance2 = BigNumber.from(await WETH.balanceOf(VaultV2.address));
    const swapAmount2 = vaultBalance2.sub(vaultBalance2.mul(8).div(10000));

    const transactionData2 = await buildZeroExData(false, swapAmount2);
    if (!transactionData2 || !transactionData2.data) {
      throw "0x api fetch error";
    }
    await expect(VaultV2.sell(transactionData2.data)).emit(
      VaultV2,
      "TradeDone"
    );

    // withdraw
    await VaultV2.connect(A).withdraw(VaultV2.balanceOf(A.address));
    expect(await BUSD.balanceOf(VaultV2.address)).equal(0);
    expect(await WETH.balanceOf(VaultV2.address)).equal(0);
  }).timeout(200000);

  it("Check deposit and withdraw in base in open position", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      vaultInOpenPosition
    );
    const amount1 = ethers.utils.parseEther("400");
    const returnAmount = amount1
      .mul(10000 - 45)
      .div(10000)
      .mul(10000 - 100)
      .div(10000);

    await WETH.connect(B).approve(VaultV2.address, APPROVE_MAX);

    const balance = await WETH.balanceOf(B.address);
    await VaultV2.connect(B).depositBase(amount1);
    await VaultV2.connect(B).withdraw(await VaultV2.balanceOf(B.address));

    expect(await WETH.balanceOf(B.address)).equal(
      BigNumber.from(balance).sub(amount1).add(returnAmount)
    );
  }).timeout(200000);

  it("Check withdrawQuote in open position", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      vaultInOpenPosition
    );
    const amount1 = ethers.utils.parseEther("400");
    const returnAmount = amount1
      .mul(10000 - 45)
      .div(10000)
      .mul(CUR_PRICE)
      .div(BigNumber.from(10).pow(12))
      .mul(9850)
      .div(10000)
      .mul(10000 - 100)
      .div(10000);

    console.log(amount1.mul(10000 - 45).div(10000));
    console.log(
      amount1
        .mul(10000 - 45)
        .div(10000)
        .mul(CUR_PRICE)
        .div(BigNumber.from(10).pow(12))
        .mul(9850)
        .div(10000)
    );
    await WETH.connect(B).approve(VaultV2.address, APPROVE_MAX);

    const balance = await BUSD.balanceOf(B.address);
    await VaultV2.connect(B).depositBase(amount1);
    await VaultV2.connect(B).withdrawQuote(await VaultV2.balanceOf(B.address));
    const balance2 = await BUSD.balanceOf(B.address);

    expect(BigNumber.from(balance2).sub(balance)).equal(returnAmount);
  }).timeout(200000);

  it("Check share calculation of depositBase in open position", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      vaultInOpenPosition
    );

    const amount1 = ethers.utils.parseEther("100");
    const amount2 = ethers.utils.parseEther("200");
    const amount3 = ethers.utils.parseEther("300");
    await WETH.connect(A).approve(VaultV2.address, APPROVE_MAX);
    await WETH.connect(B).approve(VaultV2.address, APPROVE_MAX);
    await WETH.connect(bank).approve(VaultV2.address, APPROVE_MAX);

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
      await VaultV2.connect(deposits[i].account).depositBase(
        deposits[i].amount
      );
    }

    await VaultV2.connect(A).withdraw(await VaultV2.balanceOf(A.address));
    await VaultV2.connect(B).withdraw(await VaultV2.balanceOf(B.address));
    await VaultV2.connect(bank).withdraw(await VaultV2.balanceOf(bank.address));

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
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      vaultInOpenPosition
    );

    await BUSD.connect(A).approve(VaultV2.address, APPROVE_MAX);

    const amount1 = ethers.utils.parseUnits("10000", 6);
    const deposited = amount1.mul(10000 - 45).div(10000);

    const totalSupply = await VaultV2.totalSupply();
    const vaultBefore = BigNumber.from(await WETH.balanceOf(VaultV2.address));
    await VaultV2.connect(A).depositQuote(amount1);
    const vaultAfter = BigNumber.from(await WETH.balanceOf(VaultV2.address));
    const oraclePrice = await VaultV2.getDerivedPrice(true);
    const calc = deposited
      .mul(oraclePrice)
      .div(BigNumber.from(10).pow(18))
      .mul(9850)
      .div(10000);
    expect(vaultAfter.sub(vaultBefore)).equal(calc);
    const share = await VaultV2.balanceOf(A.address);
    const withdrawAmount = vaultAfter
      .mul(share)
      .div(BigNumber.from(share).add(totalSupply));

    const ABefore = BigNumber.from(await WETH.balanceOf(A.address));
    await VaultV2.connect(A).withdraw(await VaultV2.balanceOf(A.address));
    const AAfter = BigNumber.from(await WETH.balanceOf(A.address));

    expect(AAfter.sub(ABefore)).equal(
      withdrawAmount.sub(withdrawAmount.mul(100).div(10000))
    );
  }).timeout(200000);

  it("Check share calculation of depositBase in close position", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    await WETH.connect(A).approve(VaultV2.address, APPROVE_MAX);

    const amount1 = ethers.utils.parseEther("100");
    const deposited = amount1.mul(10000 - 45).div(10000);

    const vaultBefore = BigNumber.from(await BUSD.balanceOf(VaultV2.address));
    await VaultV2.connect(A).depositBase(amount1);
    const vaultAfter = BigNumber.from(await BUSD.balanceOf(VaultV2.address));
    const oraclePrice = await VaultV2.getDerivedPrice(false);
    const calc = deposited
      .mul(oraclePrice)
      .div(BigNumber.from(10).pow(18))
      .mul(9850)
      .div(10000);
    expect(vaultAfter.sub(vaultBefore).sub(calc).abs().toNumber()).lessThan(
      10000
    );

    const ABefore = BigNumber.from(await BUSD.balanceOf(A.address));
    await VaultV2.connect(A).withdraw(await VaultV2.balanceOf(A.address));
    const AAfter = BigNumber.from(await BUSD.balanceOf(A.address));

    expect(AAfter.sub(ABefore)).equal(
      vaultAfter
        .sub(vaultBefore)
        .mul(10000 - 100)
        .div(10000)
    );
  });

  it("Should trade 10 times", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );
    console.log(await BUSD.balanceOf(A.address));
    // deposit
    const amount1 = ethers.utils.parseUnits("10000", 6);
    await BUSD.connect(A).approve(VaultV2.address, APPROVE_MAX);
    await VaultV2.connect(A).depositQuote(amount1);

    await tradeOnVault(true, BUSD, VaultV2);
    await updatePrice(1500);
    await tradeOnVault(false, WETH, VaultV2);
    await updatePrice(1400);
    await tradeOnVault(true, BUSD, VaultV2);
    await updatePrice(1600);
    await tradeOnVault(false, WETH, VaultV2);
    await updatePrice(1500);
    await tradeOnVault(true, BUSD, VaultV2);
    await updatePrice(1300);
    await tradeOnVault(false, WETH, VaultV2);
    await updatePrice(1200);
    await tradeOnVault(true, BUSD, VaultV2);
    await updatePrice(1200);
    await tradeOnVault(false, WETH, VaultV2);

    await VaultV2.connect(A).withdraw(await VaultV2.balanceOf(A.address));
    const balanceAfter = await BUSD.balanceOf(A.address);
    console.log(balanceAfter);
  });

  it("Check perf fee share when the trade is profit", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );
    // deposit
    const amount1 = ethers.utils.parseUnits("10000", 6);
    await BUSD.connect(A).approve(VaultV2.address, APPROVE_MAX);
    await VaultV2.connect(A).depositQuote(amount1);

    const deposited = amount1.mul(10000 - 45).div(10000);
    await tradeOnVault(true, BUSD, VaultV2);
    const startAmount = await VaultV2.soldAmount();

    expect(startAmount, "soldAmount").equal(
      deposited.mul(10000 - 8).div(10000)
    );

    await updatePrice(1500);
    await tradeOnVault(false, WETH, VaultV2);

    const baseAmount = startAmount.div(1200);
    const endAmount = baseAmount.sub(baseAmount.mul(8).div(10000)).mul(1500);
    const profit = BigNumber.from(10000).mul(endAmount).div(startAmount);
    const profitAmount = endAmount.mul(profit - 10000).div(profit);
    const resultAmount = endAmount.sub(profitAmount.mul(2000).div(10000));

    const remaining = BigNumber.from(await BUSD.balanceOf(VaultV2.address));
    expect(remaining.sub(resultAmount).toNumber(), "result check").lessThan(
      100
    );
  });

  it("Check profit calculation in trades", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    const profitUpdate = (profit, price1, price2) => {
      return BigNumber.from(profit)
        .mul(BigNumber.from(price2).mul(9992).div(10000))
        .div(price1);
    };
    // deposit
    const amount1 = ethers.utils.parseUnits("10000", 6);
    await BUSD.connect(A).approve(VaultV2.address, APPROVE_MAX);
    await BUSD.connect(B).approve(VaultV2.address, APPROVE_MAX);
    await BUSD.connect(bank).approve(VaultV2.address, APPROVE_MAX);
    await VaultV2.connect(A).depositQuote(amount1);
    await VaultV2.connect(B).depositQuote(amount1.mul(2));
    await VaultV2.connect(bank).depositQuote(amount1.mul(3));

    let profit = 10000;
    await updatePrice(1200);
    await tradeOnVault(true, BUSD, VaultV2);
    await updatePrice(1150);
    await tradeOnVault(false, WETH, VaultV2);

    profit = profitUpdate(profit, 1200, 1150);
    expect(await VaultV2.profit(), "check1").equal(profit);

    await updatePrice(1100);
    await tradeOnVault(true, BUSD, VaultV2);
    await updatePrice(900);
    await tradeOnVault(false, WETH, VaultV2);

    profit = profitUpdate(profit, 1100, 900);
    expect(
      BigNumber.from(await VaultV2.profit())
        .sub(profit)
        .toNumber(),
      "check2"
    ).lessThan(5);

    await updatePrice(800);
    await tradeOnVault(true, BUSD, VaultV2);
    await updatePrice(1000);
    await tradeOnVault(false, WETH, VaultV2);

    profit = profitUpdate(profit, 800, 1000);
    expect(
      BigNumber.from(await VaultV2.profit())
        .sub(profit)
        .toNumber(),
      "check3"
    ).lessThan(5);

    await updatePrice(1100);
    await tradeOnVault(true, BUSD, VaultV2);
    await updatePrice(1500);
    await tradeOnVault(false, WETH, VaultV2);

    profit = profitUpdate(profit, 1100, 1500);
    expect(await VaultV2.profit(), "check4").equal(10000);
  });

  it("Should update strategist", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    await expect(VaultV2.connect(A).addToWhiteList(B.address)).revertedWith(
      "NS"
    );

    await expect(VaultV2.setStrategist(A.address))
      .emit(VaultV2, "StrategistUpdated")
      .withArgs(A.address);

    await expect(VaultV2.connect(A).addToWhiteList(B.address))
      .emit(VaultV2, "WhiteListAdded")
      .withArgs(B.address);
  });

  it("Should add/remove whitelist", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    expect(await VaultV2.whiteList(A.address)).equal(false);
    expect(await VaultV2.whiteList(B.address)).equal(false);

    await expect(VaultV2.addToWhiteList(B.address))
      .emit(VaultV2, "WhiteListAdded")
      .withArgs(B.address);

    await expect(VaultV2.addToWhiteList(A.address))
      .emit(VaultV2, "WhiteListAdded")
      .withArgs(A.address);

    expect(await VaultV2.whiteList(A.address)).equal(true);
    expect(await VaultV2.whiteList(B.address)).equal(true);
  });

  it("Check trading fee distribution", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH, UBXN } = await loadFixture(
      deploySCFixture
    );

    const amount1 = ethers.utils.parseUnits("10000", 6);
    await BUSD.connect(A).approve(VaultV2.address, APPROVE_MAX);
    await VaultV2.connect(A).depositQuote(amount1);

    const deposited = amount1.mul(10000 - 45).div(10000);
    const fee = deposited.mul(8).div(10000);
    const ubxnFee = fee.div(1000);

    const feeReceiver = "0xea5053bbc95bAeC37506993353Cfc0Ca6530C851";

    const ubxnBefore = await UBXN.balanceOf(feeReceiver);
    await updatePrice(1200);
    await tradeOnVault(true, BUSD, VaultV2);

    const ubxnAfter = await UBXN.balanceOf(feeReceiver);

    expect(BigNumber.from(ubxnAfter).sub(ubxnBefore)).equal(ubxnFee);
  });

  it("Check performance fee distribution", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH, UBXN } = await loadFixture(
      deploySCFixture
    );

    // deposit
    const amount1 = ethers.utils.parseUnits("10000", 6);
    await BUSD.connect(A).approve(VaultV2.address, APPROVE_MAX);
    await VaultV2.connect(A).depositQuote(amount1);

    await updatePrice(1200);
    await tradeOnVault(true, BUSD, VaultV2);
    await updatePrice(1500);

    const ubxnbefore1 = await UBXN.balanceOf(
      "0xeF729c381bCACFDb8fB5ccEf17079a5d9237ee64"
    );
    const ubxnbefore2 = await UBXN.balanceOf(
      "0xea5053bbc95bAeC37506993353Cfc0Ca6530C851"
    );
    const quoteAmount = await tradeOnVault(false, WETH, VaultV2);

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
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    const busdBefore = await BUSD.balanceOf(
      "0xea5053bbc95bAeC37506993353Cfc0Ca6530C851"
    );
    // deposit
    const amount1 = ethers.utils.parseUnits("10000", 6);
    await BUSD.connect(A).approve(VaultV2.address, APPROVE_MAX);
    await VaultV2.connect(A).depositQuote(amount1);
    const busdAfter = await BUSD.balanceOf(
      "0xea5053bbc95bAeC37506993353Cfc0Ca6530C851"
    );

    const fees = amount1.mul(45).div(10000);

    expect(BigNumber.from(busdAfter).sub(busdBefore)).equal(fees);

    const busdBefore1 = await BUSD.balanceOf(
      "0xea5053bbc95bAeC37506993353Cfc0Ca6530C851"
    );
    // deposit
    await BUSD.connect(A).approve(VaultV2.address, APPROVE_MAX);
    await VaultV2.connect(A).withdraw(await VaultV2.balanceOf(A.address));
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
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    // deposit
    const amount1 = ethers.utils.parseUnits("10000", 6);
    await BUSD.connect(A).approve(VaultV2.address, APPROVE_MAX);
    await VaultV2.connect(A).depositQuote(amount1);
    const deposited1 = amount1.mul(10000 - 45).div(10000);
    expect(await VaultV2.estimatedPoolSize()).equal(deposited1);

    const amount2 = ethers.utils.parseEther("100");
    await WETH.connect(A).approve(VaultV2.address, APPROVE_MAX);
    const deposited2 = amount2.mul(10000 - 45).div(10000);

    await VaultV2.connect(A).depositBase(amount2);
    expect(await VaultV2.estimatedPoolSize()).equal(
      deposited1.add(deposited2.mul(1200).div(1e12).mul(9850).div(10000))
    );
  });

  it("Check max cap", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    await BUSD.connect(bank).approve(VaultV2.address, APPROVE_MAX);
    await WETH.connect(bank).approve(VaultV2.address, APPROVE_MAX);
    // deposit
    const amount1 = ethers.utils.parseUnits("10000", 6);
    await VaultV2.connect(bank).depositQuote(amount1);

    await expect(
      VaultV2.connect(bank).depositQuote(amount1.mul(1000))
    ).revertedWith("MC");

    const amount2 = ethers.utils.parseEther("5000");
    const transactionData = await buildZeroExData(
      false,
      amount2.mul(10000 - 45).div(10000)
    );
    VaultV2.connect(bank).depositBase(amount2);
    await expect(VaultV2.connect(bank).depositBase(amount2)).revertedWith("MC");
  });

  it("Check estimated deposit", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    // deposit
    const amount1 = ethers.utils.parseUnits("10000", 6);
    await BUSD.connect(B).approve(VaultV2.address, APPROVE_MAX);
    await VaultV2.connect(B).depositQuote(amount1.mul(3));
    await BUSD.connect(A).approve(VaultV2.address, APPROVE_MAX);
    await VaultV2.connect(A).depositQuote(amount1);
    const deposited1 = amount1.mul(10000 - 45).div(10000);
    expect(await VaultV2.estimatedDeposit(A.address)).equal(deposited1);

    const amount2 = ethers.utils.parseEther("100");
    await WETH.connect(A).approve(VaultV2.address, APPROVE_MAX);
    const deposited2 = amount2.mul(10000 - 45).div(10000);

    await VaultV2.connect(A).depositBase(amount2);
    expect(await VaultV2.estimatedDeposit(A.address)).equal(
      deposited1.add(deposited2.mul(1200).div(1e12).mul(9850).div(10000))
    );
  });

  it("Should work without partner fee", async function () {
    const [Owner] = await ethers.getSigners();
    const vaultFactory = await ethers.getContractFactory("VaultV2");
    const VaultV2 = await vaultFactory.deploy("TEST", Owner.address);
    await VaultV2.deployed();

    let testParams = initParams[1];
    testParams[1][11] = ethers.constants.AddressZero;

    await expect(VaultV2.initialize(...testParams)).emit(
      VaultV2,
      "Initialized"
    );

    const bank = await ethers.getImpersonatedSigner(
      "0x8eb8a3b98659cce290402893d0123abb75e3ab28"
    );
    const BUSD = await ethers.getContractAt(
      "IERC20",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" // quote token (USDC)
    );

    const amount = ethers.utils.parseUnits("100000", 6);
    await BUSD.connect(bank).approve(VaultV2.address, amount);
    await VaultV2.connect(bank).depositQuote(amount);

    const before = await BUSD.balanceOf(bank.address);
    await VaultV2.connect(bank).withdraw(amount);
    const after = await BUSD.balanceOf(bank.address);

    expect(BigNumber.from(after).sub(before)).equal(amount);
  });
  it("Check getDerivedPrice", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    console.log(await VaultV2.getDerivedPrice(true));
    console.log(await VaultV2.getDerivedPrice(false));
  });
  it("Should update wallet addresses", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    await expect(VaultV2.connect(A).setAlgoDevAddress(B.address)).revertedWith(
      "NS"
    );
    await expect(VaultV2.connect(A).setUpbotsAddress(B.address)).revertedWith(
      "NS"
    );
    await expect(VaultV2.connect(A).setPartnerAddress(B.address)).revertedWith(
      "NS"
    );

    await VaultV2.connect(Owner).setAlgoDevAddress(B.address);
    await VaultV2.connect(Owner).setUpbotsAddress(bank.address);
    await VaultV2.connect(Owner).setPartnerAddress(A.address);

    const feeParams = await VaultV2.feeParams();

    expect(feeParams.addrAlgoDev).equal(B.address);
    expect(feeParams.addrUpbots).equal(bank.address);
    expect(feeParams.addrPartner).equal(A.address);
  });

  it("Should succeed to buy when there is 1.5% slippage", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );
    await updatePrice(1200);
    // deposit
    const amount1 = ethers.utils.parseUnits("10000", 6);
    await BUSD.connect(A).approve(VaultV2.address, APPROVE_MAX);
    await VaultV2.connect(A).depositQuote(amount1);

    const deposited = amount1.mul(10000 - 45).div(10000);

    const vaultBalance = BigNumber.from(await BUSD.balanceOf(VaultV2.address));
    const swapAmount = vaultBalance.sub(vaultBalance.mul(8).div(10000));

    const amountOut = BigNumber.from(swapAmount)
      .mul(BigNumber.from(10).pow(18))
      .div(CUR_PRICE)
      .div(1e6);
    const amountOut1 = amountOut.mul(985).div(1000);
    const transactionData = ZeroEx.interface.encodeFunctionData("swap", [
      true,
      swapAmount,
      amountOut1,
    ]);

    if (!transactionData) {
      throw "0x api fetch error";
    }

    await VaultV2.buy(transactionData);
  });

  it("Should succeed to buy when there is 1% slippage", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );
    await updatePrice(1200);
    // deposit
    const amount1 = ethers.utils.parseUnits("10000", 6);
    await BUSD.connect(A).approve(VaultV2.address, APPROVE_MAX);
    await VaultV2.connect(A).depositQuote(amount1);

    const deposited = amount1.mul(10000 - 45).div(10000);

    const vaultBalance = BigNumber.from(await BUSD.balanceOf(VaultV2.address));
    const swapAmount = vaultBalance.sub(vaultBalance.mul(8).div(10000));

    const amountOut = BigNumber.from(swapAmount)
      .mul(BigNumber.from(10).pow(18))
      .div(CUR_PRICE)
      .div(1e6);
    const amountOut1 = amountOut.mul(99).div(100);
    const transactionData = ZeroEx.interface.encodeFunctionData("swap", [
      true,
      swapAmount,
      amountOut1,
    ]);

    if (!transactionData) {
      throw "0x api fetch error";
    }

    await VaultV2.buy(transactionData);
  });

  it("Should fail to buy when there is 2% slippage", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );
    await updatePrice(1200);
    // deposit
    const amount1 = ethers.utils.parseUnits("10000", 6);
    await BUSD.connect(A).approve(VaultV2.address, APPROVE_MAX);
    await VaultV2.connect(A).depositQuote(amount1);

    const deposited = amount1.mul(10000 - 45).div(10000);

    const vaultBalance = BigNumber.from(await BUSD.balanceOf(VaultV2.address));
    const swapAmount = vaultBalance.sub(vaultBalance.mul(8).div(10000));

    const amountOut = BigNumber.from(swapAmount)
      .mul(BigNumber.from(10).pow(18))
      .div(CUR_PRICE)
      .div(1e6);
    const amountOut1 = amountOut.mul(98).div(100);
    const transactionData = ZeroEx.interface.encodeFunctionData("swap", [
      true,
      swapAmount,
      amountOut1,
    ]);

    if (!transactionData) {
      throw "0x api fetch error";
    }

    await expect(VaultV2.buy(transactionData)).revertedWith("IS");
  });

  it("Should succeed to sell when there is 4% slippage", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );
    await updatePrice(1200);
    // deposit
    const amount1 = ethers.utils.parseUnits("10000", 6);
    await BUSD.connect(A).approve(VaultV2.address, APPROVE_MAX);
    await VaultV2.connect(A).depositQuote(amount1);

    const deposited = amount1.mul(10000 - 45).div(10000);

    await tradeOnVault(true, BUSD, VaultV2);

    const vaultBalance = BigNumber.from(await WETH.balanceOf(VaultV2.address));
    const swapAmount = vaultBalance.sub(vaultBalance.mul(8).div(10000));

    const amountOut = BigNumber.from(swapAmount).mul(CUR_PRICE).div(1e12);
    const amountOut1 = amountOut.mul(96).div(100);
    const transactionData = ZeroEx.interface.encodeFunctionData("swap", [
      false,
      swapAmount,
      amountOut1,
    ]);

    if (!transactionData) {
      throw "0x api fetch error";
    }

    await VaultV2.sell(transactionData);
  });

  it("Should fail to sell when there is 6% slippage", async function () {
    const { VaultV2, Owner, A, B, bank, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );
    await updatePrice(1200);
    // deposit
    const amount1 = ethers.utils.parseUnits("10000", 6);
    await BUSD.connect(A).approve(VaultV2.address, APPROVE_MAX);
    await VaultV2.connect(A).depositQuote(amount1);

    const deposited = amount1.mul(10000 - 45).div(10000);

    await tradeOnVault(true, BUSD, VaultV2);

    const vaultBalance = BigNumber.from(await WETH.balanceOf(VaultV2.address));
    const swapAmount = vaultBalance.sub(vaultBalance.mul(8).div(10000));

    const amountOut = BigNumber.from(swapAmount).mul(CUR_PRICE).div(1e12);
    const amountOut1 = amountOut.mul(94).div(100);
    const transactionData = ZeroEx.interface.encodeFunctionData("swap", [
      false,
      swapAmount,
      amountOut1,
    ]);

    if (!transactionData) {
      throw "0x api fetch error";
    }

    await expect(VaultV2.sell(transactionData)).revertedWith("IS");
  });
});
