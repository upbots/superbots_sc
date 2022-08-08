// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./vault.sol";

contract VaultFactory is Ownable {

    uint256 private constant MAX = (10 ** 18) * (10 ** 18);
    uint256 private constant LITTLE_BNB = 10 ** 16; // 0.01 BNB
    
    address public addrGenerator;

    event Received(address, uint);
    event VaultGenerated(address);
    event SuperVaultGenerated(address);

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
    
    constructor() {
        addrGenerator = msg.sender;
    }

    function setGeneratorAddress(address _generator) public onlyOwner {
        require(_generator != address(0),"generator address zero");
        addrGenerator = _generator;
    }

    function generateVault(
        string memory _name,
        address _quoteToken, 
        address _baseToken,
        address _strategist,
        address _addrStakers, 
        uint16 _pctDeposit,
        uint16 _pctWithdraw,
        uint16 _pctTradUpbots,
        uint256 _maxCap
    ) public {

        require(msg.sender == addrGenerator, "The caller isn't generator.");

        require(_quoteToken != address(0));
        require(_baseToken != address(0));
        require(_strategist != address(0));

        require(_addrStakers != address(0));

        require (address(this).balance > LITTLE_BNB, "Put some BNB to this smart contract to give to the generated vaults");
        
        // 1. deploy a new vault
        Vault newVault = new Vault(
            _name,
            _quoteToken, 
            _baseToken, 
            address(this), 
            _addrStakers,
            _pctDeposit,
            _pctWithdraw,
            _pctTradUpbots,
            _maxCap);
        
        // 3. allow tokens for oneinch token transfer proxy
        newVault.approveTokensForOneinch(0x1111111254fb6c44bAC0beD2854e76F90643097d, MAX);

        // 4. set strategist
        newVault.setStrategist(_strategist);

        // 5. send some bnb for paraswap call
        // payable(newVault).transfer(LITTLE_BNB);
        (bool sent, ) = address(newVault).call{value: LITTLE_BNB}("");
        require(sent, "Failed to send Fund");

        // 6. emit event
        emit VaultGenerated(address(newVault));
    }
}