// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./interfaces/uniswapv2.sol";
import "./interfaces/iparaswap.sol";

import "./interfaces/oneinch.sol";

contract Vault is ERC20 {
    string public vaultName;
    bool public isForPartner;

    address public quoteToken;
    address public baseToken;

    address public strategist;
    mapping(address => bool) public whiteList;

    uint256 public maxCap = 0;
    uint256 public position = 0; // 0: closed, 1: opened
    uint256 public soldAmount = 0;
    uint256 public profit = percentMax;

    // path backward for the pancake
    address[] private pathBackward;

    // 1inch
    address public oneInchRouterAddr;

    address public constant burnAddress = 0x000000000000000000000000000000000000dEaD;

    address public constant pancakeRouter = 0x10ED43C718714eb63d5aA57B78B54704E256024E; // mainnet v2

    address public constant wbnb = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c; // mainnet

    address public constant ubxt = 0xBbEB90cFb6FAFa1F69AA130B7341089AbeEF5811; // mainnet

    uint256 public constant SWAP_MIN = 10 ** 6;

    uint16 public constant percentMax = 10000;

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

    event Received(address, uint);
    event ParameterUpdated(address, address, address, address, uint16, uint16, uint256);

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    constructor(
        string memory _name,
        address _quoteToken, 
        address _baseToken, 
        address _strategist,
        address _addrStakers,
        uint16 _pctDeposit,
        uint16 _pctWithdraw,
        uint16 _pctTradUpbots,
        uint256 _maxCap
    )
        ERC20(
            string(abi.encodePacked("xUBXT_", _name)), 
            string(abi.encodePacked("xUBXT_", _name))
        )
    {
        require(_quoteToken != address(0), "Please provide valid address");
        require(_baseToken != address(0), "Please provide valid address");
        require(_strategist != address(0), "Please provide valid address");
        require(_addrStakers != address(0), "Please provide valid address");

        vaultName = _name;

        addrStakers = _addrStakers;
        
        pctDeposit = _pctDeposit < percentMax ? _pctDeposit : pctDeposit;
        pctWithdraw = _pctWithdraw < percentMax ? _pctWithdraw : pctWithdraw;
        pctTradUpbots = _pctTradUpbots < percentMax ? _pctTradUpbots : pctTradUpbots;

        maxCap = _maxCap;

        isForPartner = false;

        strategist = _strategist;
        whiteList[_strategist] = true;

        quoteToken = _quoteToken;
        baseToken = _baseToken;


        pathBackward = new address[](2);
        pathBackward[0] = baseToken;
        pathBackward[1] = quoteToken;

        oneInchRouterAddr = 0x1111111254fb6c44bAC0beD2854e76F90643097d;
    }

    function setParameters(
        address _addrStakers,
        address _addrAlgoDev,
        address _addrUpbots,
        address _addrPartner,        
        uint16 _pctPerfAlgoDev,
        uint16 _pctPerfPartner,
        uint256 _maxCap
    ) public  {
        
        require(_addrUpbots != address(0), "Please provide valid address");
        require(_addrStakers != address(0), "Please provide valid address");
        require(_addrAlgoDev != address(0), "Please provide valid address");
        require(msg.sender == strategist, "Not strategist");

        addrStakers = _addrStakers;
        addrAlgoDev = _addrAlgoDev;
        addrUpbots = _addrUpbots;
        addrPartner = _addrPartner;
        
        pctPerfAlgoDev = _pctPerfAlgoDev < percentMax ? _pctPerfAlgoDev : pctPerfAlgoDev;
        pctPerfPartners = _pctPerfPartner  < percentMax ? _pctPerfPartner : pctPerfPartners;

        maxCap = _maxCap;

        isForPartner = _addrPartner != address(0);

        emit ParameterUpdated(addrStakers, addrAlgoDev, addrUpbots, addrPartner, pctPerfAlgoDev, pctPerfPartners, maxCap);
    }

    function poolSize() public view returns (uint256) {
        return
            (IERC20(quoteToken).balanceOf(address(this)) + _calculateQuoteFromBase());
    }

    function addToWhiteList(address _address) public {
        require(msg.sender == strategist, "Not strategist");
        whiteList[_address] = true;
    }

    function removeFromWhiteList(address _address) public {
        require(msg.sender == strategist, "Not strategist");
        whiteList[_address] = false;
    }

    function isWhitelisted(address _address) public view returns(bool) {
        return whiteList[_address];
    }

    function setStrategist(address _address) public {
        require(_address != address(0), "Please provide valid address");
        require(msg.sender == strategist, "Not strategist");
        whiteList[_address] = true;
        strategist = _address;
    }

    function setPartnerAddress(address _address) public {
        require(_address != address(0), "Please provide valid address");
        require(msg.sender == strategist, "Not strategist");
        addrPartner = _address;
    }

    function approveTokensForOneinch(address oneinch, uint256 amount) public {

        require(msg.sender == strategist, "Not strategist");
        require(oneinch != address(0), "Please provide valid address");
        IERC20(quoteToken).approve(oneinch, amount);
        IERC20(baseToken).approve(oneinch, amount);
    }

    function resetTrade() public {
        
        require(msg.sender == strategist, "Not strategist");

        // 1. swap all baseToken to quoteToken
        uint256 amount = IERC20(baseToken).balanceOf(address(this));
        if (amount > 10**6) {
            _swapPancakeswap(baseToken, quoteToken, amount);
        }

        // 2. reset profit calculation
        profit = percentMax;
        soldAmount = 0;

        // 3. reset position
        position = 0;
    }

    function resetTradeOneinch(bytes memory swapCalldata) public {
        
        require(msg.sender == strategist, "Not strategist");

        // 1. swap all baseToken to quoteToken
        (bool success,) = oneInchRouterAddr.call(swapCalldata);
        
        if (!success) {
            // Copy revert reason from call
            assembly {
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
        }

        // 2. reset profit calculation
        profit = percentMax;
        soldAmount = 0;

        // 3. reset position
        position = 0;
    }

    function depositQuote(uint256 amount) public {

        // 1. Check max cap
        uint256 _pool = poolSize();
        require (maxCap == 0 || _pool + amount < maxCap, "The vault reached the max cap");

        // 2. transfer quote from sender to this vault
        uint256 _before = IERC20(quoteToken).balanceOf(address(this));
        IERC20(quoteToken).transferFrom(msg.sender, address(this), amount);
        uint256 _after = IERC20(quoteToken).balanceOf(address(this));
        amount = _after - _before; // Additional check for deflationary tokens

        // 3. pay deposit fees
        amount = takeDepositFees(quoteToken, amount);

        // 4. swap Quote to Base if position is opened
        if (position == 1) {
            soldAmount = soldAmount + amount;

            _before = IERC20(baseToken).balanceOf(address(this));
            _swapPancakeswap(quoteToken, baseToken, amount);
            _after = IERC20(baseToken).balanceOf(address(this));
            amount = _after - _before;

            _pool = _before;
        }

        // 5. calculate share and send back xUBXT
        uint256 shares = 0;
        if (totalSupply() == 0) {
            shares = amount;
        }
        else {
            shares = amount * totalSupply() / _pool;
        }
        _mint(msg.sender, shares);
    }

    function depositBase(uint256 amount) public {

        // 1. Check max cap
        uint256 _pool = poolSize();
        uint256[] memory amounts = UniswapRouterV2(pancakeRouter).getAmountsOut(amount, pathBackward);
        uint256 expectedQuote = amounts[amounts.length - 1];
        require (maxCap == 0 || _pool + expectedQuote < maxCap, "The vault reached the max cap");

        // 2. transfer base from sender to this vault
        uint256 _before = IERC20(baseToken).balanceOf(address(this));
        IERC20(baseToken).transferFrom(msg.sender, address(this), amount);
        uint256 _after = IERC20(baseToken).balanceOf(address(this));
        amount = _after - _before; // Additional check for deflationary tokens

        // 3. pay deposit fees
        amount = takeWithdrawFees(baseToken, amount);

        _pool = _before;
        // 4. swap Base to Quote if position is closed
        if (position == 0) {
            _before = IERC20(quoteToken).balanceOf(address(this));
            _swapPancakeswap(baseToken, quoteToken, amount);
            _after = IERC20(quoteToken).balanceOf(address(this));
            amount = _after - _before;

            _pool = _before;
        }

        // update soldAmount if position is opened
        if (position == 1) {
            soldAmount = soldAmount + expectedQuote;
        }

        // 5. calculate share and send back xUBXT
        uint256 shares = 0;
        if (totalSupply() == 0) {
            shares = amount;
        } else {
            shares = amount * totalSupply() / _pool;
        }
        _mint(msg.sender, shares);
    }

    function withdraw(uint256 shares) public  {

        require (shares <= balanceOf(msg.sender), "invalid share amount");

        if (position == 0) {

            uint256 amountQuote = IERC20(quoteToken).balanceOf(address(this)) * shares / totalSupply();
            if (amountQuote > 0) {
                // pay withdraw fees
                amountQuote = takeWithdrawFees(quoteToken, amountQuote);
                IERC20(quoteToken).transfer(msg.sender, amountQuote);
            }
        }

        if (position == 1) {

            uint256 amountBase = IERC20(baseToken).balanceOf(address(this)) * shares / totalSupply();
            uint256[] memory amounts = UniswapRouterV2(pancakeRouter).getAmountsOut(amountBase, pathBackward);
            
            uint256 thisSoldAmount = soldAmount * shares / totalSupply();
            uint256 _profit = profit * amounts[amounts.length - 1] / thisSoldAmount;
            if (_profit > percentMax) {

                uint256 profitAmount = amountBase * (_profit - percentMax) / _profit;
                uint256 feeAmount = takePerfFeesFromBaseToken(profitAmount);
                amountBase = amountBase - feeAmount;
            }
            soldAmount = soldAmount - thisSoldAmount;
            
            if (amountBase > 0) {
                // pay withdraw fees
                amountBase = takeWithdrawFees(baseToken, amountBase);
                IERC20(baseToken).transfer(msg.sender, amountBase);
            }
        }

        // burn these shares from the sender wallet
        _burn(msg.sender, shares);

    }

    function buy() public {
        // 0. check whitelist
        require(isWhitelisted(msg.sender), "Not whitelisted");

        // 1. Check if the vault is in closed position
        require(position == 0, "The vault is already in open position");

        // 2. get the amount of quoteToken to trade
        uint256 amount = IERC20(quoteToken).balanceOf(address(this));
        require (amount > 0, "No enough balance to trade");

        // 3. takeTradingFees
        amount = takeTradingFees(quoteToken, amount);

        // 4. save the remaining to soldAmount
        soldAmount = amount;

        // 5. swap tokens to B
        _swapPancakeswap(quoteToken, baseToken, amount);

        // 6. update position
        position = 1;
    }

    function sell() public {
        // 0. check whitelist
        require(isWhitelisted(msg.sender), "Not whitelisted");

        // 1. check if the vault is in open position
        require(position == 1, "The vault is in closed position");

        // 2. get the amount of baseToken to trade
        uint256 amount = IERC20(baseToken).balanceOf(address(this));

        if (amount > 0) {

            // 3. takeUpbotsFee
            amount = takeTradingFees(baseToken, amount);

            // 3. swap tokens to Quote and get the newly create quoteToken
            uint256 _before = IERC20(quoteToken).balanceOf(address(this));
            _swapPancakeswap(baseToken, quoteToken, amount);
            uint256 _after = IERC20(quoteToken).balanceOf(address(this));
            amount = _after - _before;

            // 4. calculate the profit in percent
            profit = profit * amount / soldAmount;

            // 5. take performance fees in case of profit
            if (profit > percentMax) {

                uint256 profitAmount = amount * (profit - percentMax) / profit;
                takePerfFees(profitAmount);
                profit = percentMax;
            }
        }

        // 6. update soldAmount
        soldAmount = 0;

        // 7. update position
        position = 0;
    }

    function buyOneinchByParams(
        IOneInchAggregationExecutor oneInchCaller,
        OneInchSwapDescription calldata oneInchDesc,
        bytes calldata oneInchData
    ) public {
        // 0. check whitelist
        require(isWhitelisted(msg.sender), "Not whitelisted");

        require(oneInchRouterAddr != address(0), "Please provide valid address");
        require(oneInchDesc.dstReceiver == address(this), "The destination address isn't vault SC");

        // 1. Check if the vault is in closed position
        require(position == 0, "The vault is already in open position");

        // 2. get the amount of quoteToken to trade
        uint256 amount = IERC20(quoteToken).balanceOf(address(this));
        require (amount > 0, "No enough balance to trade");
        require(amount >= oneInchDesc.amount, "The swapping amount is small than vault amount");
        require(amount - oneInchDesc.amount < amount*5/100, "The different of swapping amount is greater than 5 percent");

        // 3. takeTradingFees
        amount = takeTradingFees(quoteToken, amount);

        // 4. save the remaining to soldAmount
        soldAmount = amount;

        // 5. swap tokens to B
        IOneInchAggregationRouterV4 oneInchRouterV4 = IOneInchAggregationRouterV4(oneInchRouterAddr);
        (uint256 returnAmount, uint256 gasLeft) = oneInchRouterV4.swap(oneInchCaller, oneInchDesc, oneInchData);
        
        if (returnAmount == 0) {
            // Copy revert reason from call
            assembly {
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
        }

        // 6. update position
        position = 1;
    }

    function sellOneinchByParams(
        IOneInchAggregationExecutor oneInchCaller,
        OneInchSwapDescription calldata oneInchDesc,
        bytes calldata oneInchData
    ) public {
        
        // 0. check whitelist
        require(isWhitelisted(msg.sender), "Not whitelisted");

        require(oneInchRouterAddr != address(0), "Please provide valid address");
        require(oneInchDesc.dstReceiver == address(this), "The destination address isn't vault SC");

        // 1. check if the vault is in open position
        require(position == 1, "The vault is in closed position");

        // 2. get the amount of baseToken to trade
        uint256 amount = IERC20(baseToken).balanceOf(address(this));

        require (amount > 0, "No enough balance to trade");
        require(amount >= oneInchDesc.amount, "The swapping amount is low than vault amount");
        require(amount - oneInchDesc.amount < amount*5/100, "The different of swapping amount is greater than 5 percent");

        // 3. takeUpbotsFee
        amount = takeTradingFees(baseToken, amount);

        // 3. swap tokens to Quote and get the newly create quoteToken
        uint256 _before = IERC20(quoteToken).balanceOf(address(this));
        IOneInchAggregationRouterV4 oneInchRouterV4 = IOneInchAggregationRouterV4(oneInchRouterAddr);
        (uint256 returnAmount, uint256 gasLeft) = oneInchRouterV4.swap(oneInchCaller, oneInchDesc, oneInchData);

        if (returnAmount == 0) {
            // Copy revert reason from call
            assembly {
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
        }
        uint256 _after = IERC20(quoteToken).balanceOf(address(this));
        amount = _after - _before;

        // 4. calculate the profit in percent
        profit = profit * amount / soldAmount;

        // 5. take performance fees in case of profit
        if (profit > percentMax) {

            uint256 profitAmount = amount * (profit - percentMax) / profit;
            takePerfFees(profitAmount);
            profit = percentMax;
        }

        // 6. update soldAmount
        soldAmount = 0;

        // 7. update position
        position = 0;
    }

    function takeDepositFees(address token, uint256 amount) private returns(uint256) {
        
        if (amount == 0) {
            return 0;
        }

        if (!isForPartner) {
            return amount;
        }

        uint256 fees = amount * pctDeposit / percentMax;
        IERC20(token).transfer(addrPartner, fees);
        return amount - fees;
    }
    
    function takeWithdrawFees(address token, uint256 amount) private returns(uint256) {
        
        if (amount == 0) {
            return 0;
        }

        if (!isForPartner) {
            return amount;
        }

        uint256 fees = amount * pctWithdraw / percentMax;
        IERC20(token).transfer(addrPartner, fees);
        return amount - fees;
    }

    function takeTradingFees(address token, uint256 amount) private returns(uint256) {
        
        if (amount == 0) {
            return 0;
        }

        // calculate fee
        uint256 fee = amount * pctTradUpbots / percentMax;

        // swap to UBXT
        uint256 _before = IERC20(ubxt).balanceOf(address(this));
        _swapPancakeswap(token, ubxt, fee);
        uint256 _after = IERC20(ubxt).balanceOf(address(this));
        uint256 ubxtAmt = _after - _before;

        // transfer to company wallet
        IERC20(ubxt).transfer(addrUpbots, ubxtAmt);
        
        // return remaining token amount 
        return amount - fee;
    }
    
    function takePerfFees(uint256 amount) private {

        if (amount == 0) {
            return ;
        }

        // calculate fees
        uint256 burnAmount = amount * pctPerfBurning / percentMax;
        uint256 stakersAmount = amount * pctPerfStakers / percentMax;
        uint256 devAmount = amount * pctPerfAlgoDev / percentMax;
        uint256 pctCompany = isForPartner ? pctPerfPartners : pctPerfUpbots;
        address addrCompany = isForPartner ? addrPartner : addrUpbots;
        uint256 companyAmount = amount * pctCompany / percentMax;
        
        // swap to UBXT
        uint256 _total = stakersAmount + devAmount + burnAmount + companyAmount;
        uint256 _before = IERC20(ubxt).balanceOf(address(this));
        _swapPancakeswap(quoteToken, ubxt, _total);
        uint256 _after = IERC20(ubxt).balanceOf(address(this));
        uint256 ubxtAmt = _after - _before;

        // calculate UBXT amounts
        stakersAmount = ubxtAmt * stakersAmount / _total;
        devAmount = ubxtAmt * devAmount / _total;
        companyAmount = ubxtAmt * companyAmount / _total;
        burnAmount = ubxtAmt - stakersAmount - devAmount - companyAmount;

        // Transfer
        IERC20(ubxt).transfer(
            burnAddress, // burn
            burnAmount
        );
        
        IERC20(ubxt).transfer(
            addrStakers, // stakers
            stakersAmount
        );

        IERC20(ubxt).transfer(
            addrAlgoDev, // algodev
            devAmount
        );

        IERC20(ubxt).transfer(
            addrCompany, // company (upbots or partner)
            companyAmount
        );
    }

    function takePerfFeesFromBaseToken(uint256 amount) private returns(uint256) {

        if (amount == 0) {
            return 0;
        }

        // calculate fees
        uint256 burnAmount = amount * pctPerfBurning / percentMax;
        uint256 stakersAmount = amount * pctPerfStakers / percentMax;
        uint256 devAmount = amount * pctPerfAlgoDev / percentMax;
        
        // swap to UBXT
        uint256 _total = stakersAmount + devAmount + burnAmount;
        uint256 _before = IERC20(ubxt).balanceOf(address(this));
        uint256 _tokenbBefore = IERC20(baseToken).balanceOf(address(this));
        _swapPancakeswap(baseToken, ubxt, _total);
        uint256 _after = IERC20(ubxt).balanceOf(address(this));
        uint256 _tokenbAfter = IERC20(baseToken).balanceOf(address(this));
        
        uint256 ubxtAmt = _after - _before;
        uint256 feeAmount = _tokenbBefore - _tokenbAfter;

        // calculate UBXT amounts
        stakersAmount = ubxtAmt * stakersAmount / _total;
        devAmount = ubxtAmt * devAmount / _total;
        burnAmount = ubxtAmt - stakersAmount - devAmount;

        // Transfer
        IERC20(ubxt).transfer(
            address(0), // burn
            burnAmount
        );
        
        IERC20(ubxt).transfer(
            addrStakers,
            stakersAmount
        );

        IERC20(ubxt).transfer(
            addrAlgoDev,
            devAmount
        );

        return feeAmount;
    }

    // *** internal functions ***

    function _calculateQuoteFromBase() internal view returns(uint256) {
        
        uint256 amountBase = IERC20(baseToken).balanceOf(address(this));

        if (amountBase < SWAP_MIN) {
            return 0;
        }
        uint256[] memory amounts = UniswapRouterV2(pancakeRouter).getAmountsOut(amountBase, pathBackward);
        return amounts[amounts.length - 1];
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

        if (_from == quoteToken || _to == quoteToken) {
            path = new address[](2);
            path[0] = _from;
            path[1] = _to;
        } else {
            path = new address[](3);
            path[0] = _from;
            path[1] = quoteToken;
            path[2] = _to;
        }

        uint256[] memory amounts = UniswapRouterV2(pancakeRouter).swapExactTokensForTokens(
            _amount,
            0,
            path,
            address(this),
            block.timestamp + 60
        );

        require(amounts[0] > 0, "There was problem in pancakeswap");
    }

    // Send remanining BNB (used for paraswap integration) to other wallet
    function fundTransfer(address receiver, uint256 amount) public {
        
        require(msg.sender == strategist, "Not strategist");
        require(receiver != address(0), "Please provide valid address");

        payable(receiver).transfer(amount);
    }

}
