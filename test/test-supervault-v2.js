const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const axios = require("axios");

const { params } = require("../deploy/inputs/vault_v2");
const { initParams } = require("../deploy/inputs/vault_v2_init_params");

const { params: supervaultParams } = require("../deploy/inputs/supervault_v2");

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

describe("SupervaultV2", function () {
  async function increaseTime(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    const blockCount = seconds / 3;
    await ethers.provider.send("hardhat_mine", [
      `0x${blockCount.toString(16)}`,
    ]);
  }

  async function deployVault(Owner) {
    const vaultFactory = await ethers.getContractFactory("VaultV2");
    const Vault_V2 = await vaultFactory.deploy("TEST", Owner.address);
    await Vault_V2.deployed();

    await Vault_V2.initialize(...initParams[56]);
    return Vault_V2;
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

    const Vaults = [];
    for (let i = 0; i < 5; i++) {
      Vaults[i] = await deployVault(Owner);
    }

    const supervaultFactory = await ethers.getContractFactory("SupervaultV2");
    const Supervault_V2 = await supervaultFactory.deploy(
      "Supervault",
      BUSD.address,
      ethers.utils.parseEther("1000000"),
      Vaults.map((vault) => vault.address),
      [0, 1]
    );
    await Supervault_V2.deployed();

    // Fixtures can return anything you consider useful for your tests
    return {
      Owner,
      A,
      B,
      bank,
      BUSD,
      WETH,
      Vaults,
      Supervault_V2,
    };
  }

  it("Should deploy", async function () {
    const { Vaults, Supervault_V2, Owner, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    expect(await Supervault_V2.activeVaults(0)).equal(0);
    expect(await Supervault_V2.activeVaults(1)).equal(1);
    // expect(await Supervault_V2.activeVaults(2)).equal(2);

    expect(await Supervault_V2.vaults(0)).equal(Vaults[0].address);
    expect(await Supervault_V2.vaults(1)).equal(Vaults[1].address);
    expect(await Supervault_V2.vaults(2)).equal(Vaults[2].address);
    expect(await Supervault_V2.vaults(3)).equal(Vaults[3].address);
    expect(await Supervault_V2.vaults(4)).equal(Vaults[4].address);
  });

  it.only("Should deploy real", async function () {
    const supervaultFactory = await ethers.getContractFactory("SupervaultV2");
    const Supervault_V2 = await supervaultFactory.deploy("Supervault");
    await Supervault_V2.deployed();
    await Supervault_V2.initialize(...supervaultParams);
  }).timeout(1000000);

  it("Should deposit and withdraw", async function () {
    const { Vaults, Supervault_V2, Owner, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    const amount1 = ethers.utils.parseEther("10000");
    await BUSD.connect(Owner).approve(Supervault_V2.address, APPROVE_MAX);
    await Supervault_V2.connect(Owner).deposit(amount1);
    const deposited = amount1.mul(10000 - 45).div(10000);

    expect(await Supervault_V2.estimatedPoolSize()).equal(deposited);

    const before = await BUSD.balanceOf(Owner.address);
    await Supervault_V2.connect(Owner).withdraw(
      await Supervault_V2.balanceOf(Owner.address)
    );
    const after = await BUSD.balanceOf(Owner.address);
    expect(BigNumber.from(after).sub(before)).equal(
      deposited.mul(10000 - 100).div(10000)
    );
  });

  it("Check update vaults", async function () {
    const { Vaults, Supervault_V2, Owner, BUSD, WETH } = await loadFixture(
      deploySCFixture
    );

    const amount1 = ethers.utils.parseEther("10000");
    await BUSD.connect(Owner).approve(Supervault_V2.address, APPROVE_MAX);
    await Supervault_V2.connect(Owner).deposit(amount1);

    const poolSize1 = await Supervault_V2.estimatedPoolSize();
    await expect(Supervault_V2.connect(Owner).updateVaults([2, 3, 4]))
      .emit(Supervault_V2, "ActiveVaultsUpdated")
      .withArgs([2, 3, 4]);

    const estPoolSize1 = BigNumber.from(poolSize1)
      .mul(10000 - 100)
      .div(10000)
      .mul(10000 - 45)
      .div(10000);

    const poolSize2 = await Supervault_V2.estimatedPoolSize();
    expect(estPoolSize1).equal(poolSize2);

    for (let i = 0; i < 5; i++) {
      console.log(await BUSD.balanceOf(Vaults[i].address));
    }
  }).timeout(100000);

  it("Check estimatedPoolSize", async function () {});

  it("Check deposit and withdraw with 3 users", async function () {});
});
