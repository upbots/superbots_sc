// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/uniswapv2.sol";

import "../interfaces/oneinch.sol";

contract VaultETH is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    string public vaultName;
    bool public isForPartner;

    address public quoteToken;
    address public baseToken;
    address public aggregatorAddr;

    mapping(address => bool) public whiteList;

    uint256 public maxCap = 0;
    uint256 public minDeposit = 10 ** 17;
    uint256 public position = 0; // 0: closed, 1: opened
    uint256 public soldAmount = 0;
    uint256 public profit = PERCENT_MAX;

    // path backward for the pancake
    address[] private pathBackward;
    address[] private pathForward;
    
    // addresses
    address public constant UNISWAP_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D; // mainnet v2 (uniswap router v2)
    address public constant SUSHISWAP_ROUTER = 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F; // mainnet v2 
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    address public constant UBXT = 0x8564653879a18C560E7C0Ea0E084c516C62F5653; // mainnet
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2; // mainnet

    uint256 private constant MAX_APPROVAL = (10 ** 18) * (10 ** 18);
    uint256 public constant SWAP_MIN = 10 ** 6;
    uint16 public constant PERCENT_MAX = 10000;

    // percent values for the fees
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
    address public addrFactory;

    // last block number
    mapping(address => uint) public lastBlockNumber;

    event Received(address, uint);
    event AddressesUpdated(address, address, address, address);
    event FeesUpdated(uint16, uint16, uint16, uint16, uint16);
    event CapLimitsUpdated(uint256, uint256);
    event WhiteListAdded(address);
    event WhiteListRemoved(address);
    event TradeDone(uint256, uint256, uint256);

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    constructor(
        string memory _name,
        address _quoteToken,
        address _baseToken,
        address _aggregatorAddr
    )
        ERC20(
            string(abi.encodePacked("xUBXT_", _name)), 
            string(abi.encodePacked("xUBXT_", _name))
        )
    {
        require(_quoteToken != address(0), "invalid quoteToken address");
        require(_baseToken != address(0), "invalid baseToken address");

        vaultName = _name;
        quoteToken = _quoteToken;
        baseToken = _baseToken;
        aggregatorAddr = _aggregatorAddr;

        isForPartner = false;
        whiteList[msg.sender] = true;
        addrFactory = msg.sender;

        pathBackward = new address[](2);
        pathBackward[0] = baseToken;
        pathBackward[1] = quoteToken;
        
        pathForward = new address[](2);
        pathForward[0] = quoteToken;
        pathForward[1] = baseToken;
        
        // allow tokens for oneinch token transfer proxy
        approveTokensForAggregator();
    }

    function updateFees(
        uint16 _pctDeposit,
        uint16 _pctWithdraw,
        uint16 _pctTradUpbots,
        uint16 _pctPerfAlgoDev,
        uint16 _pctPerfPartner
    ) external onlyOwner {

        require(_pctDeposit < PERCENT_MAX, "invalid deposit fee percentage");
        require(_pctWithdraw < PERCENT_MAX, "invalid withdraw fee percentage");
        require(_pctTradUpbots < PERCENT_MAX, "invalid trade fee percentage");
        require(_pctPerfAlgoDev < PERCENT_MAX, "invalid algo dev performance fee");
        require(_pctPerfPartner < PERCENT_MAX, "invalid partner fee");

        pctDeposit = _pctDeposit;
        pctWithdraw = _pctWithdraw;
        pctTradUpbots = _pctTradUpbots;
        pctPerfAlgoDev = _pctPerfAlgoDev;
        pctPerfPartners = _pctPerfPartner;
        
        emit FeesUpdated(pctDeposit, pctWithdraw, pctTradUpbots, pctPerfAlgoDev, pctPerfPartners);
    }

    function updateAddresses(
        address _addrStakers,
        address _addrAlgoDev,
        address _addrUpbots,
        address _addrPartner
    ) external onlyOwner {
        
        require(_addrStakers != address(0), "invalid stakers address");
        require(_addrAlgoDev != address(0), "invalid algo dev address");
        require(_addrUpbots != address(0), "invalid upbots address");

        addrStakers = _addrStakers;
        addrAlgoDev = _addrAlgoDev;
        addrUpbots = _addrUpbots;
        addrPartner = _addrPartner;

        isForPartner = _addrPartner != address(0);
        
        emit AddressesUpdated(addrStakers, addrAlgoDev, addrUpbots, addrPartner);
    }

    function updateCapLimits(
        uint256 _maxCap,
        uint256 _minDeposit
    ) external onlyOwner {
        
        maxCap = _maxCap;
        minDeposit = _minDeposit;

        emit CapLimitsUpdated(maxCap, minDeposit);
    }

    function addToWhiteList(address _address) external onlyOwner {
        require(_address != address(0), "invalid address");
        whiteList[_address] = true;
        emit WhiteListAdded(_address);
    }

    function removeFromWhiteList(address _address) external onlyOwner {
        require(_address != address(0), "invalid address");
        whiteList[_address] = false;
        emit WhiteListRemoved(_address);
    }

    function depositQuote(uint256 amount) external nonReentrant {

        require (block.number > lastBlockNumber[msg.sender], "allowed only one call per block");

        // 1. Check min deposit
        require (amount >= minDeposit, "invalid deposit amount");

        // 2. Check max cap
        uint256 _poolSize;
        uint256[] memory amounts = UniswapRouterV2(UNISWAP_ROUTER).getAmountsOut(IERC20(baseToken).balanceOf(address(this)), pathBackward);
        _poolSize = amounts[1] + IERC20(quoteToken).balanceOf(address(this)); // get approximate pool size to compare with max cap
        require (maxCap == 0 || _poolSize + amount < maxCap, "The vault reached the max cap");

        // 3. transfer quote from sender to this vault
        uint256 _before = IERC20(quoteToken).balanceOf(address(this));
        IERC20(quoteToken).safeTransferFrom(msg.sender, address(this), amount);
        uint256 _after = IERC20(quoteToken).balanceOf(address(this));
        amount = _after - _before; // Additional check for deflationary tokens

        // 4. pay deposit fees
        amount = takeDepositFees(quoteToken, amount, true);

        // 5. swap Quote to Base if position is opened
        if (position == 1) {
            soldAmount = soldAmount + amount;

            _before = IERC20(baseToken).balanceOf(address(this));
            _swapUniswap(quoteToken, baseToken, amount);
            _after = IERC20(baseToken).balanceOf(address(this));
            amount = _after - _before;

            _poolSize = _before;
        }

        // 6. calculate share and send back xUBXT
        uint256 shares = 0;
        if (totalSupply() == 0) {
            shares = amount;
        }
        else {
            shares = amount * totalSupply() / _poolSize;
        }
        _mint(msg.sender, shares);

        lastBlockNumber[msg.sender] = block.number;
    }

    function depositBase(uint256 amount) external nonReentrant {
        
        require (block.number > lastBlockNumber[msg.sender], "allowed only one call per block");

        // . Check min amount
        uint256[] memory amounts = UniswapRouterV2(UNISWAP_ROUTER).getAmountsOut(minDeposit, pathForward);
        require (amount >= amounts[1], "invalid deposit amount");

        // . Check max cap
        uint256 _poolSize;
        amounts = UniswapRouterV2(UNISWAP_ROUTER).getAmountsOut(IERC20(baseToken).balanceOf(address(this)), pathBackward);
        _poolSize = amounts[1] + IERC20(quoteToken).balanceOf(address(this)); // get approximate pool size to compare with max cap
        amounts = UniswapRouterV2(UNISWAP_ROUTER).getAmountsOut(amount, pathBackward);
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
            amounts = UniswapRouterV2(UNISWAP_ROUTER).getAmountsOut(amount, pathBackward);
            soldAmount = soldAmount + amounts[1]; // amount[1] is the deposit amount in quote token
        }

        // 5. calculate share and send back xUBXT
        uint256 shares = 0;
        if (totalSupply() == 0) {
            shares = amount;
        } else {
            shares = amount * totalSupply() / _poolSize;
        }
        _mint(msg.sender, shares);

        lastBlockNumber[msg.sender] = block.number;
    }

    function withdraw(uint256 shares) external nonReentrant  {

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
            uint256[] memory amounts = UniswapRouterV2(UNISWAP_ROUTER).getAmountsOut(withdrawAmount, pathBackward);
            
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
        
        require (block.number > lastBlockNumber[msg.sender], "allowed only one call per block");
        require(whiteList[msg.sender], "Not whitelisted");
        require(position == 0, "Not valid position");

        // 1. get the amount of quoteToken to trade
        uint256 amount = IERC20(quoteToken).balanceOf(address(this));
        require (amount > 0, "No enough quoteAmount");

        // 2. takeTradingFees
        amount = takeTradingFees(quoteToken, amount);

        // 3. get uniswap swap amount
        uint256[] memory expectedAmount = UniswapRouterV2(UNISWAP_ROUTER).getAmountsOut(amount, pathForward);

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
        
        require (block.number > lastBlockNumber[msg.sender], "allowed only one call per block");
        require(whiteList[msg.sender], "Not whitelisted");
        require(position == 1, "Not valid position");

        // 2. get the amount of baseToken to trade
        uint256 baseAmount = IERC20(baseToken).balanceOf(address(this));
        require (baseAmount > 0, "No enough baseAmount");

        // 3. calc base fee amount
        baseAmount = takeTradingFees(baseToken, baseAmount);

        // 3. calc min swapped amount
        uint256[] memory expectedAmount = UniswapRouterV2(UNISWAP_ROUTER).getAmountsOut(baseAmount, pathBackward);

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

        if (!isForPartner) {
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
        uint256 _before = IERC20(UBXT).balanceOf(address(this));
        _swapToUBXT(token, fee);
        uint256 _after = IERC20(UBXT).balanceOf(address(this));
        uint256 UBXTAmt = _after - _before;

        // transfer to company wallet
        IERC20(UBXT).safeTransfer(addrUpbots, UBXTAmt);
        
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
        uint256 pctCompany = isForPartner ? pctPerfPartners : pctPerfUpbots;
        address addrCompany = isForPartner ? addrPartner : addrUpbots;
        uint256 companyAmount = amount * pctCompany / PERCENT_MAX;
        
        // swap to UBXT
        uint256 _total = stakersAmount + devAmount + burnAmount + companyAmount;

        uint256 _tokenBefore = IERC20(token).balanceOf(address(this));
        uint256 _before = IERC20(UBXT).balanceOf(address(this));
        _swapToUBXT(token, _total);
        uint256 _after = IERC20(UBXT).balanceOf(address(this));
        uint256 _tokenAfter = IERC20(baseToken).balanceOf(address(this));

        uint256 UBXTAmt = _after - _before;
        uint256 feeAmount = _tokenBefore - _tokenAfter;

        // calculate UBXT amounts
        stakersAmount = UBXTAmt * stakersAmount / _total;
        devAmount = UBXTAmt * devAmount / _total;
        companyAmount = UBXTAmt * companyAmount / _total;
        burnAmount = UBXTAmt - stakersAmount - devAmount - companyAmount;

        // Transfer
        IERC20(UBXT).safeTransfer(
            BURN_ADDRESS, // burn
            burnAmount
        );
        
        IERC20(UBXT).safeTransfer(
            addrStakers, // stakers
            stakersAmount
        );

        IERC20(UBXT).safeTransfer(
            addrAlgoDev, // algodev
            devAmount
        );

        IERC20(UBXT).safeTransfer(
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
        require(_to != address(0));

        // Swap with uniswap
        assert(IERC20(_from).approve(UNISWAP_ROUTER, 0));
        assert(IERC20(_from).approve(UNISWAP_ROUTER, _amount));

        address[] memory path;

        path = new address[](2);
        path[0] = _from;
        path[1] = _to;

        uint256[] memory amountOutMins = UniswapRouterV2(UNISWAP_ROUTER).getAmountsOut(
            _amount,
            path
        );

        uint256[] memory amounts = UniswapRouterV2(UNISWAP_ROUTER).swapExactTokensForTokens(
            _amount,
            amountOutMins[1] * 90 / 100,
            path,
            address(this),
            block.timestamp + 60
        );

        require(amounts[0] > 0, "Not valid return amount in pancakeswap");
    }
    
    // _to is supposed to be UBXT
    // _from is quote token or base token (we assume quote token is USDC)
    function _swapToUBXT(
        address _from,
        uint256 _amount
    ) internal {

        // Swap with uniswap
        assert(IERC20(_from).approve(SUSHISWAP_ROUTER, 0));
        assert(IERC20(_from).approve(SUSHISWAP_ROUTER, _amount));

        address[] memory path;

        if (_from == WETH) {
            path = new address[](2);
            path[0] = _from;
            path[1] = UBXT;
        } 
        else if (_from == quoteToken) {
            path = new address[](3);
            path[0] = _from;
            path[1] = WETH;
            path[2] = UBXT;
        }
        else {
            path = new address[](4);
            path[0] = _from;
            path[1] = quoteToken;
            path[2] = WETH;
            path[3] = UBXT;
        }

        uint256[] memory amountOutMins = UniswapRouterV2(SUSHISWAP_ROUTER).getAmountsOut(
            _amount,
            path
        );

        uint256[] memory amounts = UniswapRouterV2(SUSHISWAP_ROUTER).swapExactTokensForTokens(
            _amount,
            amountOutMins[1] * 90 / 100,
            path,
            address(this),
            block.timestamp + 60
        );

        require(amounts[0] > 0, "Not valid return amount in pancakeswap");
    }

    function _beforeTokenTransfer(address , address , uint256 )
        internal virtual override
    {
        require (block.number > lastBlockNumber[msg.sender], "allowed only one call per block");
        lastBlockNumber[msg.sender] = block.number;
    }
}
