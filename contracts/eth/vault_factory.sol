// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./vault.sol";

contract VaultFactoryETH is Ownable {
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
        address _strategist
    ) external onlyOwner {

        require(_quoteToken != address(0), "invalid quoteToken address");
        require(_baseToken != address(0), "invalid baseToken address");
        require(_strategist != address(0), "invalid strategist address");

        require (address(this).balance > LITTLE_BNB, "No enough fund");
        
        // 1. deploy a new vault
        VaultETH newVault = new VaultETH(
            _name,
            _quoteToken, 
            _baseToken,
            _strategist,
            0xDef1C0ded9bec7F1a1670819833240f027b25EfF
        );

        // 3. send some bnb for paraswap call
        (bool sent, ) = address(newVault).call{value: LITTLE_BNB}("");
        require(sent, "Failed to send Fund");

        // 4. emit event
        emit VaultGenerated(address(newVault));
    }
}