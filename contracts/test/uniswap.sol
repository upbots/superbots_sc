// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Uniswap {
    address public immutable bank;
    address public immutable ubxn;

    constructor(address _bank, address _ubxn) {
        bank = _bank;
        ubxn = _ubxn;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        if (path[path.length - 1] == ubxn) {
            IERC20(path[0]).transferFrom(msg.sender, bank, amountIn);
            IERC20(path[path.length - 1]).transferFrom(
                bank,
                msg.sender,
                amountIn / 1000
            );
            amounts = new uint256[](2);
            amounts[0] = amountIn;
            amounts[1] = 3000000000000000000;
        } else {
            IERC20(path[0]).transferFrom(msg.sender, bank, amountIn);
            IERC20(path[path.length - 1]).transferFrom(
                bank,
                msg.sender,
                amountOutMin
            );
            amounts = new uint256[](2);
            amounts[0] = amountIn;
            amounts[1] = amountOutMin;
        }
    }
}
