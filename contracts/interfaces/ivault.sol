
pragma solidity 0.8.10;

interface IVault {
    
    function poolSize() external view returns (uint256);
    function depositQuote(uint256 amount) external;
    function depositBase(uint256 amount) external;
    function withdraw(uint256 shares) external;
    function quoteToken() external view returns (address);
    function baseToken() external view returns (address);
    function position() external view returns (uint256);
    function balanceOf() external view returns (uint256);
}