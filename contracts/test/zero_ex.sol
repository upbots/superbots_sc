// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ZeroEx {
    int256 public answer = 0;
    address public immutable bank;
    address public immutable quoteToken;
    address public immutable baseToken;

    constructor(
        address _bank,
        address _quoteToken,
        address _baseToken
    ) {
        bank = _bank;
        quoteToken = _quoteToken;
        baseToken = _baseToken;
    }

    function swap(
        bool isBuy,
        uint256 amountSell,
        uint256 amountBuy
    ) external {
        if (isBuy) {
            IERC20(quoteToken).transferFrom(msg.sender, bank, amountSell);
            IERC20(baseToken).transferFrom(bank, msg.sender, amountBuy);
        } else {
            IERC20(baseToken).transferFrom(msg.sender, bank, amountSell);
            IERC20(quoteToken).transferFrom(bank, msg.sender, amountBuy);
        }
    }
}
