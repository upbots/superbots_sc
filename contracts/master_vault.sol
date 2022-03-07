// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/uniswapv2.sol";
import "./interfaces/ivault.sol";

contract MasterSuperVault is ERC20, Ownable {
    mapping(address => bool) public whiteList;

    address public capitalToken;

    uint256 public maxCap = 0;
    
    address public constant pancakeRouter = 0x10ED43C718714eb63d5aA57B78B54704E256024E; // mainnet v2

    address public constant wbnb = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c; // mainnet

    address public constant ubxt = 0xBbEB90cFb6FAFa1F69AA130B7341089AbeEF5811; // mainnet

    uint public constant VAULT_COUNT = 5;

    address [] public vaults;

    string public vaultName;

    event Received(address, uint);
    event ParameterUpdated(uint256);

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
    
    constructor(
        string memory _name, 
        address _capitalToken,
        uint256 _maxCap
    )
        ERC20(
            string(abi.encodePacked("xUBXT_", _name)), 
            string(abi.encodePacked("xUBXT_", _name))
        )
    {
        require(_capitalToken != address(0));

        capitalToken = _capitalToken;
        vaultName = _name;
        maxCap = _maxCap;

        whiteList[msg.sender] = true;
    }

    function setParameters(
        uint256 _maxCap
    ) public onlyOwner {
        
        maxCap = _maxCap;

        emit ParameterUpdated(maxCap);
    }

    // Send remanining BNB (used for paraswap integration) to other wallet
    function fundTransfer(address receiver, uint256 amount) public onlyOwner {
        
        require(receiver != address(0));

        payable(receiver).transfer(amount);
    }

    function poolSize() public view returns (uint256) {

        if (vaults.length < VAULT_COUNT) return 0;

        uint256[] memory amounts;
        address[] memory path = new address[](3);    
        path[1] = wbnb;
        path[2] = capitalToken;    

        uint256 _poolSize = 0;

        for (uint i = 0; i < VAULT_COUNT; i++) {
            uint256 shares = IERC20(vaults[i]).balanceOf(msg.sender);
            uint256 subPoolSize = IVault(vaults[i]).poolSize() * shares / IERC20(vaults[i]).totalSupply();
            path[0] = IVault(vaults[i]).quoteToken();
            amounts = UniswapRouterV2(pancakeRouter).getAmountsOut(subPoolSize, path);

            _poolSize = _poolSize + amounts[2];
        }

        return _poolSize;
    }

    function deposit(uint256 amount) public {

        require (vaults.length == VAULT_COUNT, "vaults are not updated yet.");

        // 1. Check max cap
        require (maxCap == 0 || totalSupply() + amount < maxCap, "The vault reached the max cap");

        // 2. receive funds
        IERC20(capitalToken).transferFrom(msg.sender, address(this), amount);
        amount = IERC20(capitalToken).balanceOf(address(this));

        // 3. divide, swap to each quote token and deposit to the vaults
        uint256 subAmount = amount / VAULT_COUNT;
        for (uint i = 0; i < VAULT_COUNT; i++) {
            depositToVault(vaults[i], subAmount);
        }
        
        // 4. mint tokens for shares
        uint256 shares = 0;
        if (totalSupply() == 0) {
            shares = amount;
        }
        else {
            shares = amount * totalSupply() / poolSize();
        }
        _mint(msg.sender, shares);
    }

    function withdraw(uint256 shares) public  {

        require (vaults.length == VAULT_COUNT);
        require (shares <= balanceOf(msg.sender), "invalid share amount");

        // 1. iterate vaults, calculate partial shares, withdraw, swap to capital token
        for (uint i = 0; i < VAULT_COUNT; i++) {
            uint subShare = IERC20(vaults[i]).balanceOf(address(this)) * shares / totalSupply();
            withdrawFromVault(vaults[i], subShare);
        }

        // 2. transfer capital to the user
        if (IERC20(capitalToken).balanceOf(address(this)) > 0) {
            IERC20(capitalToken).transfer(msg.sender, IERC20(capitalToken).balanceOf(address(this)));
        }

        // 3. burn share tokens
        _burn(msg.sender, shares);
    }

    function updateVaults(address[] memory _vaults) public {

        // 1. check array length and zero address
        require (_vaults.length == VAULT_COUNT);
        require (_vaults[0] != address(0));
        require (_vaults[1] != address(0));
        require (_vaults[2] != address(0));
        require (_vaults[3] != address(0));
        require (_vaults[4] != address(0));

        // 2. Check if this is the initial update
        if (vaults.length < VAULT_COUNT) {
            vaults = _vaults;
            return;
        }

        // 3. withdraw all funds and swap back to capital token (it could be no quote token in some cases)
        for (uint i = 0; i < VAULT_COUNT; i++) {
            withdrawFromVault(vaults[i], IERC20(vaults[i]).balanceOf(address(this)));
        }

        // 4. update vaults addresses
        vaults = _vaults;
        
        // 5. divide, swap and deposit funds to each vault
        uint256 amount = IERC20(capitalToken).balanceOf(address(this)) / VAULT_COUNT;
        for (uint i = 0; i < VAULT_COUNT; i++) {
            depositToVault(vaults[i], amount);
        }
    }

    function addToWhiteList(address _address) public onlyOwner {
        whiteList[_address] = true;
    }

    function removeFromWhiteList(address _address) public onlyOwner {
        whiteList[_address] = false;
    }

    function isWhitelisted(address _address) public view returns(bool) {
        return whiteList[_address];
    }

    // *** internal functions ***

    function depositToVault(address vault, uint256 amount) internal {

        require(vault != address(0));

        if (amount == 0) {
            return;
        }

        // 1. get quote token of the vault
        address quoteToken = IVault(vault).quoteToken();

        // 2. swap to quote token
        uint256 _before = IERC20(quoteToken).balanceOf(address(this));
        _swapPancakeswap(capitalToken, quoteToken, amount);
        uint256 _after = IERC20(quoteToken).balanceOf(address(this));
        amount = _after - _before;

        // 3. deposit
        IERC20(quoteToken).approve(vault, amount);
        IVault(vault).depositQuote(amount);
    }

    function withdrawFromVault(address vault, uint256 shares) internal {

        require(vault != address(0));

        if (shares == 0) {
            return;
        }

        // 1. get withdraw token (position: 0 => quote token, 1 => base token)
        
        address withdrawToken;
        if (IVault(vault).position() == 0 ) {
            withdrawToken = IVault(vault).quoteToken();
        }
        else {
            withdrawToken = IVault(vault).baseToken();
        }

        // 2. withdraw from vault
        uint256 _before = IERC20(withdrawToken).balanceOf(address(this));
        IVault(vault).withdraw(shares);
        uint256 _after = IERC20(withdrawToken).balanceOf(address(this));
        uint256 amount = _after - _before;

        // 3. swap to capital token
        if (amount > 0) {
            _swapPancakeswap(withdrawToken, capitalToken, amount);
        }
    }

    function _swapPancakeswap(
        address _from,
        address _to,
        uint256 _amount
    ) internal {
        require(_to != address(0));

        // Swap with uniswap
        IERC20(_from).approve(pancakeRouter, 0);
        IERC20(_from).approve(pancakeRouter, _amount);

        address[] memory path;

        path = new address[](2);
        path[0] = _from;
        path[1] = _to;

        uint256[] memory amounts = UniswapRouterV2(pancakeRouter).swapExactTokensForTokens(
            _amount,
            0,
            path,
            address(this),
            block.timestamp + 60
        );

        require(amounts[0] > 0);
    }

}
