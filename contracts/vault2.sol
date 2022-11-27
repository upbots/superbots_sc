// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/uniswapv2.sol";

import "hardhat/console.sol";

contract Vault2 is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    string public vaultName;

    address public immutable quoteToken;
    address public immutable baseToken;
    address public immutable aggregatorAddr;
    address public strategist;

    mapping(address => bool) public whiteList;

    uint256 public maxCap = 0;
    uint256 public position = 0; // 0: closed, 1: opened
    uint256 public soldAmount = 0;
    uint256 public profit = PERCENT_MAX;

    // path backward for the pancake
    address[] private pathBackward;
    address[] private pathForward;
    
    // addresses
    address public immutable mainRouter;
    address public immutable ubxtPoolRouter;
    address public immutable ubxtToken;
    address public immutable ubxtPairToken;

    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint256 private constant MAX_APPROVAL = (10 ** 18) * (10 ** 18);
    uint256 public constant SWAP_MIN = 10 ** 6;
    uint16 public constant PERCENT_MAX = 10000;

    // percent values for the fees
    bool public initialized = false;
    uint16 public pctDeposit = 45;
    uint16 public pctWithdraw = 100;
    uint16 public pctPerfBurning = 250;
    uint16 public pctPerfStakers = 250;
    uint16 public pctPerfAlgoDev = 500;
    uint16 public pctPerfUpbots = 500;
    uint16 public pctPerfPartners = 1000;
    uint16 public pctTradUpbots = 8;

    // address for the fees
    address public addrStakers;
    address public addrAlgoDev;
    address public addrUpbots;
    address public addrPartner;
    address public immutable addrFactory;
    
    // last block number
    mapping(address => uint) public lastBlockNumber;

    event Received(address, uint);
    event Initialized(uint16, uint16, uint16, uint16, uint16, address, address, address, address, uint256);
    event WhiteListAdded(address);
    event WhiteListRemoved(address);
    event TradeDone(uint256, uint256, uint256);
    event StrategistUpdated(address);

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    constructor(
        string memory _name,
        address _quoteToken,
        address _baseToken,
        address _strategist,
        address _aggregatorAddr,
        address _mainRouter,
        address _ubxtPoolRouter,
        address _ubxtToken,
        address _ubxtPairToken
    )
        ERC20(
            string(abi.encodePacked("xUBXT_", _name)), 
            string(abi.encodePacked("xUBXT_", _name))
        )
    {
        require(_quoteToken != address(0));
        require(_baseToken != address(0));
        require(_strategist != address(0));
        require(_aggregatorAddr != address(0));
        require(_mainRouter != address(0));
        require(_ubxtPoolRouter != address(0));
        require(_ubxtToken != address(0));
        require(_ubxtPairToken != address(0));

        vaultName = _name;
        quoteToken = _quoteToken;
        baseToken = _baseToken;
        aggregatorAddr = _aggregatorAddr;
        mainRouter = _mainRouter;
        ubxtPoolRouter = _ubxtPoolRouter;
        ubxtToken = _ubxtToken;
        ubxtPairToken = _ubxtPairToken;

        strategist = _strategist;
        addrFactory = msg.sender;

        pathBackward = new address[](2);
        pathBackward[0] = baseToken;
        pathBackward[1] = quoteToken;
        
        pathForward = new address[](2);
        pathForward[0] = quoteToken;
        pathForward[1] = baseToken;
        
        approveTokensForAggregator();
    }

    function initialize(
        uint16 _pctDeposit,
        uint16 _pctWithdraw,
        uint16 _pctTradUpbots,
        uint16 _pctPerfAlgoDev,
        uint16 _pctPerfPartner,
        address _addrStakers,
        address _addrAlgoDev,
        address _addrUpbots,
        address _addrPartner,
        uint256 _maxCap
    ) external {

        require(msg.sender == strategist, "Not strategist");
        require(!initialized, "already initialized");
        require(_pctDeposit < PERCENT_MAX, "invalid deposit fee");
        require(_pctWithdraw < PERCENT_MAX, "invalid withdraw fee");
        require(_pctTradUpbots < PERCENT_MAX, "invalid trade fee");
        require(_pctPerfAlgoDev < PERCENT_MAX, "invalid algo dev fee");
        require(_pctPerfPartner < PERCENT_MAX, "invalid partner fee");

        require(_addrStakers != address(0));
        require(_addrAlgoDev != address(0));
        require(_addrUpbots != address(0));

        pctDeposit = _pctDeposit;
        pctWithdraw = _pctWithdraw;
        pctTradUpbots = _pctTradUpbots;
        pctPerfAlgoDev = _pctPerfAlgoDev;
        pctPerfPartners = _pctPerfPartner;
        
        addrStakers = _addrStakers;
        addrAlgoDev = _addrAlgoDev;
        addrUpbots = _addrUpbots;
        addrPartner = _addrPartner;

        maxCap = _maxCap;

        initialized = true;

        emit Initialized(pctDeposit, pctWithdraw, pctTradUpbots, pctPerfAlgoDev, pctPerfPartners, addrStakers, addrAlgoDev, addrUpbots, addrPartner, maxCap);
    }

    function setStrategist(address _address) external {
        require(msg.sender == strategist, "Not strategist");
        require(_address != address(0), "invalid address");
        strategist = _address;
        emit StrategistUpdated(_address);
    }

    function addToWhiteList(address _address) external {
        require(msg.sender == strategist, "Not strategist");
        require(_address != address(0), "invalid address");
        whiteList[_address] = true;
        emit WhiteListAdded(_address);
    }

    function removeFromWhiteList(address _address) external {
        require(msg.sender == strategist, "Not strategist");
        require(_address != address(0), "invalid address");
        whiteList[_address] = false;
        emit WhiteListRemoved(_address);
    }

    function depositQuote(uint256 amount) external nonReentrant {

        require (initialized, "not initialized");
        require (block.number > lastBlockNumber[msg.sender], "allowed only one call per block");

        // 1. Check max cap
        uint256 _poolSize;
        uint256[] memory amounts = UniswapRouterV2(mainRouter).getAmountsOut(IERC20(baseToken).balanceOf(address(this)), pathBackward);
        _poolSize = amounts[1] + IERC20(quoteToken).balanceOf(address(this)); // get approximate pool size to compare with max cap
        require (maxCap == 0 || _poolSize + amount < maxCap, "The vault reached the max cap");

        // 2. transfer quote from sender to this vault
        uint256 _before = IERC20(quoteToken).balanceOf(address(this));
        IERC20(quoteToken).safeTransferFrom(msg.sender, address(this), amount);
        uint256 _after = IERC20(quoteToken).balanceOf(address(this));
        amount = _after - _before; // Additional check for deflationary tokens

        // 3. pay deposit fees
        amount = takeDepositFees(quoteToken, amount, true);

        // 4. swap Quote to Base if position is opened
        if (position == 1) {
            soldAmount = soldAmount + amount;

            _before = IERC20(baseToken).balanceOf(address(this));
            _swapUniswap(quoteToken, baseToken, amount);
            _after = IERC20(baseToken).balanceOf(address(this));
            amount = _after - _before;

            _poolSize = _before;
        }

        // 5. calculate share and send back xUBXT
        uint256 shares = 0;
        if (totalSupply() == 0) {
            shares = amount;
        }
        else {
            shares = amount * totalSupply() / _poolSize;
        }
        require (shares > 0, "failure in share calculation");
        _mint(msg.sender, shares);

        lastBlockNumber[msg.sender] = block.number;
    }

    function depositBase(uint256 amount) external nonReentrant {
        
        require (initialized, "not initialized");
        require (block.number > lastBlockNumber[msg.sender], "allowed only one call per block");

        // . Check max cap
        uint256 _poolSize;
        uint256[] memory amounts = UniswapRouterV2(mainRouter).getAmountsOut(IERC20(baseToken).balanceOf(address(this)), pathBackward);
        _poolSize = amounts[1] + IERC20(quoteToken).balanceOf(address(this)); // get approximate pool size to compare with max cap
        amounts = UniswapRouterV2(mainRouter).getAmountsOut(amount, pathBackward);
        require (maxCap == 0 || _poolSize + amounts[1] < maxCap, "The vault reached the max cap");

        // . transfer base from sender to this vault
        uint256 _before = IERC20(baseToken).balanceOf(address(this));
        IERC20(baseToken).safeTransferFrom(msg.sender, address(this), amount);
        uint256 _after = IERC20(baseToken).balanceOf(address(this));
        amount = _after - _before; // Additional check for deflationary tokens

        // 3. pay deposit fees
        amount = takeDepositFees(baseToken, amount, true);

        _poolSize = _before;
        
        // 4. swap Base to Quote if position is closed
        if (position == 0) {
            _before = IERC20(quoteToken).balanceOf(address(this));
            _swapUniswap(baseToken, quoteToken, amount);
            _after = IERC20(quoteToken).balanceOf(address(this));
            amount = _after - _before;

            _poolSize = _before;
        }

        // update soldAmount if position is opened
        if (position == 1) {
            amounts = UniswapRouterV2(mainRouter).getAmountsOut(amount, pathBackward);
            soldAmount = soldAmount + amounts[1]; // amount[1] is the deposit amount in quote token
        }

        // 5. calculate share and send back xUBXT
        uint256 shares = 0;
        if (totalSupply() == 0) {
            shares = amount;
        } else {
            shares = amount * totalSupply() / _poolSize;
        }
        require (shares > 0, "failure in share calculation");
        _mint(msg.sender, shares);

        lastBlockNumber[msg.sender] = block.number;
    }

    function withdraw(uint256 shares) external nonReentrant  {

        require (initialized, "not initialized");
        require (block.number > lastBlockNumber[msg.sender], "allowed only one call per block");
        require (shares <= balanceOf(msg.sender), "Invalid share amount");

        uint256 withdrawAmount;

        if (position == 0) {

            withdrawAmount = IERC20(quoteToken).balanceOf(address(this)) * shares / totalSupply();
            if (withdrawAmount > 0) {
                // pay withdraw fees
                withdrawAmount = takeDepositFees(quoteToken, withdrawAmount, false);
                IERC20(quoteToken).safeTransfer(msg.sender, withdrawAmount);
            }
        }

        if (position == 1) {

            withdrawAmount = IERC20(baseToken).balanceOf(address(this)) * shares / totalSupply();
            uint256[] memory amounts = UniswapRouterV2(mainRouter).getAmountsOut(withdrawAmount, pathBackward);
            
            uint256 thisSoldAmount = soldAmount * shares / totalSupply();
            uint256 _profit = profit * amounts[1] / thisSoldAmount;
            if (_profit > PERCENT_MAX) {

                uint256 profitAmount = withdrawAmount * (_profit - PERCENT_MAX) / _profit;
                uint256 feeAmount = takePerfFees(baseToken, profitAmount);
                withdrawAmount = withdrawAmount - feeAmount;
            }
            soldAmount = soldAmount - thisSoldAmount;
            
            if (withdrawAmount > 0) {
                // pay withdraw fees
                withdrawAmount = takeDepositFees(baseToken, withdrawAmount, false);
                IERC20(baseToken).safeTransfer(msg.sender, withdrawAmount);
            }
        }

        // burn these shares from the sender wallet
        _burn(msg.sender, shares);

        lastBlockNumber[msg.sender] = block.number;
    }

    function buyUniswap() external nonReentrant {
        
        require (initialized, "not initialized");
        require (block.number > lastBlockNumber[msg.sender], "allowed only one call per block");
        require(whiteList[msg.sender], "Not whitelisted");
        require(position == 0, "Not valid position");

        // 1. get the amount of quoteToken to trade
        uint256 amount = IERC20(quoteToken).balanceOf(address(this));
        require (amount > 0, "No enough amount");

        // 2. takeTradingFees
        amount = takeTradingFees(quoteToken, amount);

        // 3. save the quote amount as soldAmount
        soldAmount = amount;

        // 4. swap tokens to Base
        _swapUniswap(quoteToken, baseToken, amount);
        amount = IERC20(baseToken).balanceOf(address(this));

        // 5. update position
        position = 1;
        
        // 6. emit event
        emit TradeDone(position, soldAmount, amount);

        lastBlockNumber[msg.sender] = block.number;
    }

    function sellUniswap() external nonReentrant {
        
        require (initialized, "not initialized");
        require (block.number > lastBlockNumber[msg.sender], "allowed only one call per block");
        require(whiteList[msg.sender], "Not whitelisted");
        require(position == 1, "Not valid position");

        // 1. get the amount of baseToken to trade
        uint256 amount = IERC20(baseToken).balanceOf(address(this));
        require (amount > 0, "No enough amount");
        
        // 2. takeTradingFees
        amount = takeTradingFees(baseToken, amount);

        // 3. swap tokens to Quote and get the newly create quoteToken
        _swapUniswap(baseToken, quoteToken, amount);
        amount = IERC20(quoteToken).balanceOf(address(this));

        // 4. calculate the profit in percent
        profit = profit * amount / soldAmount;

        // 5. take performance fees in case of profit
        if (profit > PERCENT_MAX) {

            uint256 profitAmount = amount * (profit - PERCENT_MAX) / profit;
            takePerfFees(quoteToken, profitAmount);
            profit = PERCENT_MAX;
        }

        // 6. update soldAmount
        soldAmount = 0;

        // 7. update position
        position = 0;
        
        lastBlockNumber[msg.sender] = block.number;
    }

    function buy(bytes calldata swapCallData) external nonReentrant {
        
        require (initialized, "not initialized");
        require (block.number > lastBlockNumber[msg.sender], "allowed only one call per block");
        require(whiteList[msg.sender], "Not whitelisted");
        require(position == 0, "Not valid position");

        // 1. get the amount of quoteToken to trade
        uint256 amount = IERC20(quoteToken).balanceOf(address(this));
        require (amount > 0, "No enough quoteAmount");

        // 2. takeTradingFees
        amount = takeTradingFees(quoteToken, amount);

        // 3. get uniswap swap amount
        uint256[] memory expectedAmount = UniswapRouterV2(mainRouter).getAmountsOut(amount, pathForward);

        // 4. save the remaining to soldAmount
        soldAmount = amount;

        // 5. swap tokens to Base
        (bool success,) = aggregatorAddr.call(swapCallData);
        
        if (!success) {
            // Copy revert reason from call
            assembly {
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
        }

        // 6. check swapped amount
        amount = IERC20(baseToken).balanceOf(address(this));
        require (amount >= expectedAmount[1] * 90 / 100, "Swapped amount is not enough");

        // 7. update position
        position = 1;

        // 8. emit event
        emit TradeDone(1, soldAmount, amount);
        
        lastBlockNumber[msg.sender] = block.number;
    }

    function sell(bytes calldata swapCallData) external nonReentrant {
        
        require (initialized, "not initialized");
        require (block.number > lastBlockNumber[msg.sender], "allowed only one call per block");
        require(whiteList[msg.sender], "Not whitelisted");
        require(position == 1, "Not valid position");

        // 2. get the amount of baseToken to trade
        uint256 baseAmount = IERC20(baseToken).balanceOf(address(this));
        require (baseAmount > 0, "No enough baseAmount");

        // 3. calc base fee amount
        baseAmount = takeTradingFees(baseToken, baseAmount);

        // 3. calc min swapped amount
        uint256[] memory expectedAmount = UniswapRouterV2(mainRouter).getAmountsOut(baseAmount, pathBackward);

        // 4. swap tokens to Quote and get the newly create quoteToken
        (bool success,) = aggregatorAddr.call(swapCallData);
        
        if (!success) {
            // Copy revert reason from call
            assembly {
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
        }

        // 6. check swapped amount
        uint256 quoteAmount = IERC20(quoteToken).balanceOf(address(this));
        require (quoteAmount >= expectedAmount[1] * 90 / 100, "Swapped amount is not enough");
        
        // 5. calculate the profit in percent
        profit = profit * quoteAmount / soldAmount;

        // 6. take performance fees in case of profit
        if (profit > PERCENT_MAX) {

            uint256 profitAmount = quoteAmount * (profit - PERCENT_MAX) / profit;
            takePerfFees(quoteToken, profitAmount);
            profit = PERCENT_MAX;
        }

        // 7. update soldAmount
        soldAmount = 0;

        // 8. update position
        position = 0;

        // emit event
        emit TradeDone(0, baseAmount, quoteAmount);
        
        lastBlockNumber[msg.sender] = block.number;
    }

    function takeDepositFees(address token, uint256 amount, bool isDeposit) private returns(uint256) {
        
        if (amount == 0) {
            return 0;
        }

        if (addrPartner == address(0)) { // take fees when partner is provided
            return amount;
        }

        uint256 fees = amount * (isDeposit ? pctDeposit : pctWithdraw) / PERCENT_MAX;
        IERC20(token).safeTransfer(addrPartner, fees);
        return amount - fees;
    }
    
    function takeTradingFees(address token, uint256 amount) private returns(uint256) {
        if (amount == 0) {
            return 0;
        }

        // swap to UBXT
        uint256 fee = amount * pctTradUpbots / PERCENT_MAX;
        uint256 _before = IERC20(ubxtToken).balanceOf(address(this));
        _swapToUBXT(token, fee);
        uint256 _after = IERC20(ubxtToken).balanceOf(address(this));
        uint256 ubxtAmt = _after - _before;

        // transfer to company wallet
        IERC20(ubxtToken).safeTransfer(addrUpbots, ubxtAmt);
        
        // return remaining token amount 
        return amount - fee;
    }
    
    function takePerfFees(address token, uint256 amount) private returns(uint256) {
        if (amount == 0) {
            return 0;
        }

        // calculate fees
        uint256 burnAmount = amount * pctPerfBurning / PERCENT_MAX;
        uint256 stakersAmount = amount * pctPerfStakers / PERCENT_MAX;
        uint256 devAmount = amount * pctPerfAlgoDev / PERCENT_MAX;
        uint256 pctCompany = addrPartner != address(0) ? pctPerfPartners : pctPerfUpbots;
        address addrCompany = addrPartner != address(0) ? addrPartner : addrUpbots;
        uint256 companyAmount = amount * pctCompany / PERCENT_MAX;
        
        // swap to UBXT
        uint256 _total = stakersAmount + devAmount + burnAmount + companyAmount;

        uint256 _tokenBefore = IERC20(token).balanceOf(address(this));
        uint256 _before = IERC20(ubxtToken).balanceOf(address(this));
        _swapToUBXT(token, _total);
        uint256 _after = IERC20(ubxtToken).balanceOf(address(this));
        uint256 _tokenAfter = IERC20(baseToken).balanceOf(address(this));

        uint256 ubxtAmt = _after - _before;
        uint256 feeAmount = _tokenBefore - _tokenAfter;

        // calculate UBXT amounts
        stakersAmount = ubxtAmt * stakersAmount / _total;
        devAmount = ubxtAmt * devAmount / _total;
        companyAmount = ubxtAmt * companyAmount / _total;
        burnAmount = ubxtAmt - stakersAmount - devAmount - companyAmount;

        // Transfer
        IERC20(ubxtToken).safeTransfer(
            BURN_ADDRESS, // burn
            burnAmount
        );
        
        IERC20(ubxtToken).safeTransfer(
            addrStakers, // stakers
            stakersAmount
        );

        IERC20(ubxtToken).safeTransfer(
            addrAlgoDev, // algodev
            devAmount
        );

        IERC20(ubxtToken).safeTransfer(
            addrCompany, // company (upbots or partner)
            companyAmount
        );
        
        return feeAmount;
    }

    // *** internal functions ***

    function approveTokensForAggregator() internal {
        assert(IERC20(quoteToken).approve(aggregatorAddr, MAX_APPROVAL));
        assert(IERC20(baseToken).approve(aggregatorAddr, MAX_APPROVAL));
    }

    function _swapUniswap(
        address _from,
        address _to,
        uint256 _amount
    ) internal {
        // Swap with uniswap
        assert(IERC20(_from).approve(mainRouter, _amount));

        address[] memory path;

        path = new address[](2);
        path[0] = _from;
        path[1] = _to;

        uint256[] memory amountOutMins = UniswapRouterV2(mainRouter).getAmountsOut(
            _amount,
            path
        );

        uint256[] memory amounts = UniswapRouterV2(mainRouter).swapExactTokensForTokens(
            _amount,
            amountOutMins[1] * 90 / 100,
            path,
            address(this),
            block.timestamp + 60
        );

        require(amounts[0] > 0, "invalid swap result");
    }
    
    // _to is supposed to be UBXT
    // _from is quote token or base token (we assume quote token is USDC)
    function _swapToUBXT(
        address _from,
        uint256 _amount
    ) internal {

        // Swap with uniswap
        assert(IERC20(_from).approve(ubxtPoolRouter, _amount));

        address[] memory path;

        //from token could be one of quote, base, ubxtPair token.
        if (_from == ubxtPairToken) {
            path = new address[](2);
            path[0] = _from;
            path[1] = ubxtToken;
        } 
        else if (_from == quoteToken || ubxtPairToken == quoteToken) {
            path = new address[](3);
            path[0] = _from;
            path[1] = ubxtPairToken;
            path[2] = ubxtToken;
        }
        else {
            path = new address[](4);
            path[0] = _from;
            path[1] = quoteToken;
            path[2] = ubxtPairToken;
            path[3] = ubxtToken;
        }

        uint256[] memory amountOutMins = UniswapRouterV2(ubxtPoolRouter).getAmountsOut(
            _amount,
            path
        );

        uint256[] memory amounts = UniswapRouterV2(ubxtPoolRouter).swapExactTokensForTokens(
            _amount,
            amountOutMins[1] * 90 / 100,
            path,
            address(this),
            block.timestamp + 60
        );

        require(amounts[0] > 0, "invalid swap result");
    }

    function _beforeTokenTransfer(address , address , uint256 )
        internal virtual override
    {
        require (block.number > lastBlockNumber[msg.sender], "allowed only one call per block");
        lastBlockNumber[msg.sender] = block.number;
    }
}
