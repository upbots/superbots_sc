// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./vault.sol";

contract VaultFactory is Ownable {

    uint256 private constant MAX = (10 ** 18) * (10 ** 18);
    uint256 private constant LITTLE_BNB = 10 ** 16; // 0.01 BNB
    
    event Received(address, uint);
    event VaultGenerated(address);

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
    
    function generateVault(
        string memory _name, 
        address _quoteToken, 
        address _baseToken, 
        address _strategist, 
        uint16 _percentDev, 
        address _company, 
        address _stakers, 
        address _algoDev,
        uint256 _maxCap
    ) public onlyOwner {

        require(_quoteToken != address(0));
        require(_baseToken != address(0));
        require(_strategist != address(0));
        require(_company != address(0));
        require(_stakers != address(0));
        require(_algoDev != address(0));
        require (address(this).balance > LITTLE_BNB, "Put some BNB to this smart contract to give to the generated vaults");
        
        // 1. deploy a new vault
        Vault newVault = new Vault(
            _name, 
            _quoteToken, 
            _baseToken, 
            address(this), 
            _percentDev, 
            _company, 
            _stakers, 
            _algoDev, 
            _maxCap);
        
        // 2. allow tokens for paraswap token transfer proxy
        newVault.approveTokensForParaswap(0x216B4B4Ba9F3e719726886d34a177484278Bfcae, MAX);

        // 3. allow tokens for oneinch token transfer proxy
        newVault.approveTokensForOneinch(0x1111111254fb6c44bAC0beD2854e76F90643097d, MAX);

        // 4. set strategist
        newVault.setStrategist(_strategist);

        // 5. send some bnb for paraswap call
        payable(newVault).transfer(LITTLE_BNB);

        // 6. emit event
        emit VaultGenerated(address(newVault));
    }
}