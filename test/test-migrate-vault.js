const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const axios = require("axios");

const APPROVE_MAX = "1000000000000000000000000000";

const vault_address_v1 = [
  "0x6f073b79a7e59547cd3f0472606b1e349049a5e7", // wt bnb
  "0x99ef199afae20f4efb30f420c6c401fac3137e4d", // eth infinity
];
const vault_address_v2 = [
  "0x2bc462dc57d5284eb6d1efc16cc458f4a3b081fd", // wt bnb
  "0xc480a9855032378d215ebbc075f22da6d7d83c87", // eth infinity
];
const vault_address_v2_usdc = [
  "0xed1c8ecb7fa87bfa8c94b80f6c9ef1c40b7fe8d7", // wt bnb
  "0xfc0da0ce9f96110045e92a8fe69877673b0bcad1", // sonny btc
];

const BASE_0X_URL = "https://bsc.api.0x.org/swap/v1/quote";
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

describe("MigrateVault", function () {
  async function deploySCFixture() {
    const bank = await ethers.getImpersonatedSigner(
      "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3"
    );
    const BUSD = await ethers.getContractAt(
      "IERC20",
      "0xe9e7cea3dedca5984780bafc599bd69add087d56"
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

    const migrateVaultFactory = await ethers.getContractFactory("MigrateVault");
    const MigrateVault = await migrateVaultFactory.deploy();
    await MigrateVault.deployed();

    const vaults_v1 = await Promise.all(
      vault_address_v1.map((address) => ethers.getContractAt("Vault", address))
    );
    const vaults_v2 = await Promise.all(
      vault_address_v2.map((address) =>
        ethers.getContractAt("VaultV2", address)
      )
    );
    const vaults_v2_usdc = await Promise.all(
      vault_address_v2_usdc.map((address) =>
        ethers.getContractAt("VaultV2", address)
      )
    );

    // Fixtures can return anything you consider useful for your tests
    return {
      Owner,
      A,
      B,
      BUSD,
      MigrateVault,
      vaults_v1,
      vaults_v2,
      vaults_v2_usdc,
    };
  }

  it("Should add vault", async function () {
    const { MigrateVault, Owner, BUSD, vaults_v1, vaults_v2, vaults_v2_usdc } =
      await loadFixture(deploySCFixture);
    await MigrateVault.addVault(vaults_v1[0].address, 1);
    await MigrateVault.addVault(vaults_v2[1].address, 2);
    await MigrateVault.addVault(vaults_v2_usdc[0].address, 2);

    expect(await MigrateVault.vaultList(vaults_v1[0].address)).equal(1);
    expect(await MigrateVault.vaultList(vaults_v2[1].address)).equal(2);
    expect(await MigrateVault.vaultList(vaults_v2_usdc[0].address)).equal(2);
  });

  it("Should add vaults", async function () {
    const { MigrateVault, Owner, BUSD, vaults_v1, vaults_v2, vaults_v2_usdc } =
      await loadFixture(deploySCFixture);
    await MigrateVault.addVaults(
      [vaults_v1[0].address, vaults_v2[1].address, vaults_v2_usdc[0].address],
      [1, 2, 2]
    );

    expect(await MigrateVault.vaultList(vaults_v1[0].address)).equal(1);
    expect(await MigrateVault.vaultList(vaults_v2[1].address)).equal(2);
    expect(await MigrateVault.vaultList(vaults_v2_usdc[0].address)).equal(2);
  });

  it("Should migrate with quote token", async function () {
    const {
      MigrateVault,
      Owner,
      BUSD,
      A,
      vaults_v1,
      vaults_v2,
      vaults_v2_usdc,
    } = await loadFixture(deploySCFixture);
    await MigrateVault.addVaults(
      [vaults_v1[0].address, vaults_v2[0].address, vaults_v2_usdc[0].address],
      [1, 2, 2]
    );

    await BUSD.connect(A).approve(vaults_v1[0].address, APPROVE_MAX);
    await vaults_v1[0]
      .connect(A)
      .depositQuote(ethers.utils.parseEther("10000"));
    const shares = await vaults_v1[0].balanceOf(A.address);
    console.log(shares);

    await vaults_v1[0].connect(A).approve(MigrateVault.address, APPROVE_MAX);
    await MigrateVault.connect(A).migrate(
      vaults_v1[0].address,
      vaults_v2[0].address,
      shares
    );

    const shares2 = await vaults_v2[0].balanceOf(A.address);
    console.log(shares2);

    await vaults_v2[0].connect(A).approve(MigrateVault.address, APPROVE_MAX);
    await MigrateVault.connect(A).migrate(
      vaults_v2[0].address,
      vaults_v2_usdc[0].address,
      shares2
    );

    const shares3 = await vaults_v2_usdc[0].balanceOf(A.address);
    console.log(shares3);

    // const before = await BUSD.balanceOf(A.address);
    // await vaults_v2[0].connect(A).withdraw(shares2);
    // const after = await BUSD.balanceOf(A.address);
    // console.log(BigNumber.from(after).sub(before));
  }).timeout(200000);

  it.only("Should migrate with base token", async function () {
    const {
      MigrateVault,
      Owner,
      BUSD,
      A,
      vaults_v1,
      vaults_v2,
      vaults_v2_usdc,
    } = await loadFixture(deploySCFixture);
    await MigrateVault.addVaults(
      [vaults_v1[0].address, vaults_v2[0].address, vaults_v2_usdc[0].address],
      [1, 2, 2]
    );

    await BUSD.connect(A).approve(vaults_v1[0].address, APPROVE_MAX);
    await vaults_v1[0]
      .connect(A)
      .depositQuote(ethers.utils.parseEther("10000"));
    const shares = await vaults_v1[0].balanceOf(A.address);
    console.log(shares);

    await vaults_v1[0].connect(A).approve(MigrateVault.address, APPROVE_MAX);
    await MigrateVault.connect(A).migrate(
      vaults_v1[0].address,
      vaults_v2[0].address,
      shares
    );
    console.log("111");
    const busdBalance = await BUSD.balanceOf(vaults_v2[0].address);
    console.log("111");
    const WBNB = await ethers.getContractAt(
      "IERC20",
      "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"
    );
    console.log("111");
    const zeroex = await build0xData(
      BUSD.address,
      WBNB.address,
      BigNumber.from(busdBalance).mul(9992).div(10000)
    );
    console.log("111");
    const botwallet = await ethers.getImpersonatedSigner(
      "0xDA8E9d5b4d410bB3EB7F03ABd1CA90A0E9b92763"
    );
    console.log("111");
    const amtquote = await BUSD.balanceOf(vaults_v2[0].address);
    console.log("111");
    const amtbase = await WBNB.balanceOf(vaults_v2[0].address);
    console.log("111");
    console.log(zeroex);
    await vaults_v2[0].connect(botwallet).buy(zeroex.data);
    console.log("111");
    const amtquote2 = await BUSD.balanceOf(vaults_v2[0].address);
    console.log("111");
    const amtbase2 = await WBNB.balanceOf(vaults_v2[0].address);
    console.log("111");
    console.log(BigNumber.from(amtquote2).sub(amtquote));
    console.log("111");
    console.log(BigNumber.from(amtbase2).sub(amtbase));
    console.log("111");
    const shares2 = await vaults_v2[0].balanceOf(A.address);
    console.log(shares2);

    await vaults_v2[0].connect(A).approve(MigrateVault.address, APPROVE_MAX);
    await MigrateVault.connect(A).migrate(
      vaults_v2[0].address,
      vaults_v2_usdc[0].address,
      shares2
    );

    const shares3 = await vaults_v2_usdc[0].balanceOf(A.address);
    console.log(shares3);

    // const before = await BUSD.balanceOf(A.address);
    // await vaults_v2[0].connect(A).withdraw(shares2);
    // const after = await BUSD.balanceOf(A.address);
    // console.log(BigNumber.from(after).sub(before));
  }).timeout(200000);
});
