// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

interface ISupervault {
    function poolSize() external view returns (uint256);

    function deposit(uint256 amount) external;

    function withdraw(uint256 shares) external;

    function capitalToken() external view returns (address);

    function balanceOf() external view returns (uint256);

    function transfer(address recipient, uint256 amount)
        external
        returns (bool);

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);

    function approve(address spender, uint256 amount) external returns (bool);

    function allowance(address owner, address spender)
        external
        view
        returns (uint256);
}
