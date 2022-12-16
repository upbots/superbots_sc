// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

contract ChainlinkPriceFeed {
    int256 public _answer = 0;

    constructor(int256 answer) {
        _answer = answer;
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function description() external pure returns (string memory) {
        return "OK";
    }

    function version() external pure returns (uint256) {
        return 0;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (0, _answer, 0, 0, 0);
    }

    function setPrice(int256 price) external {
        _answer = price;
    }
}
