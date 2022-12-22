// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./vault_v2.sol";

contract VaultFactory_V2 is Ownable {
    address public immutable aggregatorAddr;
    address public immutable ubxnSwapRouter;
    address public immutable ubxnToken;
    address public immutable ubxnPairToken;
    address public immutable quotePriceFeed;
    address public immutable basePriceFeed;
    address public immutable uniswapRouter;

    event VaultGenerated(address);

    constructor(
        address _aggregatorAddr,
        address _ubxnSwapRouter,
        address _ubxnToken,
        address _ubxnPairToken,
        address _quotePriceFeed,
        address _basePriceFeed,
        address _uniswapRouter
    ) {
        require(_aggregatorAddr != address(0), "invalid aggregator");
        require(_ubxnSwapRouter != address(0), "invalid router");
        require(_ubxnToken != address(0), "invalid token");
        require(_ubxnPairToken != address(0), "invalid pair");
        require(_quotePriceFeed != address(0), "invalid price feed");
        require(_basePriceFeed != address(0), "invalid price feed");
        require(_uniswapRouter != address(0), "invalid uni router");
        aggregatorAddr = _aggregatorAddr;
        ubxnSwapRouter = _ubxnSwapRouter;
        ubxnToken = _ubxnToken;
        ubxnPairToken = _ubxnPairToken;
        quotePriceFeed = _quotePriceFeed;
        basePriceFeed = _basePriceFeed;
        uniswapRouter = _uniswapRouter;
    }

    function generateVault(
        string memory _name,
        address _quoteToken,
        address _baseToken,
        address _strategist,
        uint256 _maxCap,
        address[] calldata _uniswapPath,
        FeeParams calldata _feeParams
    ) external onlyOwner returns (address) {
        require(_quoteToken != address(0));
        require(_baseToken != address(0));
        require(_strategist != address(0));
        require(_uniswapPath.length > 1);
        require(_uniswapPath[0] == _quoteToken);
        require(_uniswapPath[_uniswapPath.length - 1] == _baseToken);

        // deploy a new vault
        Vault_V2 newVault = new Vault_V2(_name, address(this));
        VaultParams memory vaultParams = VaultParams(
            _quoteToken,
            _baseToken,
            aggregatorAddr,
            uniswapRouter,
            _uniswapPath,
            ubxnSwapRouter,
            ubxnToken,
            ubxnPairToken,
            quotePriceFeed,
            basePriceFeed,
            _maxCap
        );
        newVault.initialize(vaultParams, _feeParams);
        newVault.setStrategist(_strategist);

        // emit event
        emit VaultGenerated(address(newVault));
        return address(newVault);
    }
}
