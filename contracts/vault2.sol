// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/uniswapv2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

import "hardhat/console.sol";

struct VaultParams {
    address quoteToken;
    address baseToken;
    address aggregatorAddr;
    address mainRouter;
    address ubxnPoolRouter;
    address ubxnToken;
    address ubxnPairToken;
    address quotePriceFeed;
    address basePriceFeed;
    uint256 maxCap;
}

struct FeeParams {
    // percent values for the fees
    uint16 pctDeposit;
    uint16 pctWithdraw;
    uint16 pctPerfBurning;
    uint16 pctPerfStakers;
    uint16 pctPerfAlgoDev;
    uint16 pctPerfUpbots;
    uint16 pctPerfPartners;
    uint16 pctTradUpbots;
    // address for the fees
    address addrStakers;
    address addrAlgoDev;
    address addrUpbots;
    address addrPartner;
}

contract Vault2 is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    string public vaultName;
    address public strategist;
    address public immutable addrFactory;

    VaultParams public vaultParams;
    FeeParams public feeParams;
    bool public initialized = false;

    mapping(address => bool) public whiteList;
    mapping(address => uint256) public lastBlockNumber; // last block number

    uint256 public position = 0; // 0: closed, 1: opened
    uint256 public soldAmount = 0;
    uint256 public profit = PERCENT_MAX;

    address public constant BURN_ADDRESS =
        0x000000000000000000000000000000000000dEaD;
    uint256 private constant MAX_APPROVAL = (10**18) * (10**18);
    uint16 public constant PERCENT_MAX = 10000;
    uint256 private constant PRICE_DECIMALS = (10**18);

    event Received(address, uint256);
    event Initialized(VaultParams, FeeParams);
    event WhiteListAdded(address);
    event WhiteListRemoved(address);
    event TradeDone(uint256, uint256, uint256);
    event StrategistUpdated(address);

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    constructor(string memory _name, address _strategist)
        ERC20(
            string(abi.encodePacked("xUBXN_", _name)),
            string(abi.encodePacked("xUBXN_", _name))
        )
    {
        require(_strategist != address(0));

        vaultName = _name;
        strategist = _strategist;
        addrFactory = msg.sender;
    }

    function initialize(
        VaultParams calldata _vaultParams,
        FeeParams calldata _feeParams
    ) external {
        require(msg.sender == strategist, "Not strategist");
        require(!initialized, "already initialized");

        require(_vaultParams.quoteToken != address(0));
        require(_vaultParams.baseToken != address(0));
        require(_vaultParams.aggregatorAddr != address(0));
        require(_vaultParams.mainRouter != address(0));
        require(_vaultParams.ubxnPoolRouter != address(0));
        require(_vaultParams.ubxnToken != address(0));
        require(_vaultParams.ubxnPairToken != address(0));
        require(_vaultParams.quotePriceFeed != address(0));
        require(_vaultParams.basePriceFeed != address(0));

        require(_feeParams.pctDeposit < PERCENT_MAX, "invalid deposit fee");
        require(_feeParams.pctWithdraw < PERCENT_MAX, "invalid withdraw fee");
        require(_feeParams.pctTradUpbots < PERCENT_MAX, "invalid trade fee");
        require(
            _feeParams.pctPerfAlgoDev < PERCENT_MAX,
            "invalid algo dev fee"
        );
        require(
            _feeParams.pctPerfPartners < PERCENT_MAX,
            "invalid partner fee"
        );
        require(_feeParams.pctPerfStakers < PERCENT_MAX, "invalid stakers fee");
        require(_feeParams.pctPerfBurning < PERCENT_MAX, "invalid burn fee");
        require(_feeParams.pctPerfUpbots < PERCENT_MAX, "invalid upbots fee");

        require(_feeParams.addrStakers != address(0));
        require(_feeParams.addrAlgoDev != address(0));
        require(_feeParams.addrUpbots != address(0));

        vaultParams = _vaultParams;
        feeParams = _feeParams;

        approveTokensForAggregator();

        initialized = true;

        emit Initialized(vaultParams, feeParams);
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
        require(initialized, "not initialized");
        require(
            block.number > lastBlockNumber[msg.sender],
            "allowed only one call per block"
        );

        // 1. Check max cap
        uint256 _poolSize = (IERC20(vaultParams.baseToken).balanceOf(
            address(this)
        ) * getDerivedPrice(true)) /
            PRICE_DECIMALS +
            IERC20(vaultParams.quoteToken).balanceOf(address(this)); // get approximate pool size to compare with max cap
        require(
            vaultParams.maxCap == 0 || _poolSize + amount < vaultParams.maxCap,
            "The vault reached the max cap"
        );

        // 2. transfer quote from sender to this vault
        uint256 _before = IERC20(vaultParams.quoteToken).balanceOf(
            address(this)
        );
        IERC20(vaultParams.quoteToken).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );
        uint256 _after = IERC20(vaultParams.quoteToken).balanceOf(
            address(this)
        );
        amount = _after - _before; // Additional check for deflationary tokens

        // 3. pay deposit fees
        amount = takePartnerFees(vaultParams.quoteToken, amount, true);

        // 4. swap Quote to Base if position is opened
        if (position == 1) {
            soldAmount = soldAmount + amount;

            _before = IERC20(vaultParams.baseToken).balanceOf(address(this));
            _swapUniswap(true, amount);
            _after = IERC20(vaultParams.baseToken).balanceOf(address(this));
            amount = _after - _before;

            _poolSize = _before;
        }

        // 5. calculate share and send back xUBXN
        uint256 shares = 0;
        if (totalSupply() == 0) {
            shares = amount;
        } else {
            shares = (amount * totalSupply()) / _poolSize;
        }
        require(shares > 0, "failure in share calculation");
        _mint(msg.sender, shares);

        lastBlockNumber[msg.sender] = block.number;
    }

    function depositBase(uint256 amount) external nonReentrant {
        require(initialized, "not initialized");
        require(
            block.number > lastBlockNumber[msg.sender],
            "allowed only one call per block"
        );

        // . Check max cap
        uint256 _price = getDerivedPrice(true);
        uint256 _poolSize = (_price *
            IERC20(vaultParams.baseToken).balanceOf(address(this))) /
            PRICE_DECIMALS +
            IERC20(vaultParams.quoteToken).balanceOf(address(this)); // get approximate pool size to compare with max cap
        require(
            vaultParams.maxCap == 0 ||
                _poolSize + (_price * amount) / PRICE_DECIMALS <
                vaultParams.maxCap,
            "The vault reached the max cap"
        );

        // . transfer base from sender to this vault
        uint256 _before = IERC20(vaultParams.baseToken).balanceOf(
            address(this)
        );
        IERC20(vaultParams.baseToken).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );
        uint256 _after = IERC20(vaultParams.baseToken).balanceOf(address(this));
        amount = _after - _before; // Additional check for deflationary tokens

        // 3. pay deposit fees
        amount = takePartnerFees(vaultParams.baseToken, amount, true);

        _poolSize = _before;

        // 4. swap Base to Quote if position is closed
        if (position == 0) {
            _before = IERC20(vaultParams.quoteToken).balanceOf(address(this));
            _swapUniswap(false, amount);
            _after = IERC20(vaultParams.quoteToken).balanceOf(address(this));
            amount = _after - _before;

            _poolSize = _before;
        }

        // update soldAmount if position is opened
        if (position == 1) {
            soldAmount = soldAmount + (_price * amount) / PRICE_DECIMALS;
        }

        // 5. calculate share and send back xUBXN
        uint256 shares = 0;
        if (totalSupply() == 0) {
            shares = amount;
        } else {
            shares = (amount * totalSupply()) / _poolSize;
        }
        require(shares > 0, "failure in share calculation");
        _mint(msg.sender, shares);

        lastBlockNumber[msg.sender] = block.number;
    }

    function withdraw(uint256 shares) external nonReentrant {
        require(initialized, "not initialized");
        require(
            block.number > lastBlockNumber[msg.sender],
            "allowed only one call per block"
        );
        require(shares <= balanceOf(msg.sender), "Invalid share amount");

        uint256 withdrawAmount;

        if (position == 0) {
            withdrawAmount =
                (IERC20(vaultParams.quoteToken).balanceOf(address(this)) *
                    shares) /
                totalSupply();
            if (withdrawAmount > 0) {
                // pay withdraw fees
                withdrawAmount = takePartnerFees(
                    vaultParams.quoteToken,
                    withdrawAmount,
                    false
                );
                IERC20(vaultParams.quoteToken).safeTransfer(
                    msg.sender,
                    withdrawAmount
                );
            }
        }

        if (position == 1) {
            withdrawAmount =
                (IERC20(vaultParams.baseToken).balanceOf(address(this)) *
                    shares) /
                totalSupply();
            uint256 amountInQuote = (getDerivedPrice(true) * withdrawAmount) /
                PRICE_DECIMALS;

            uint256 thisSoldAmount = (soldAmount * shares) / totalSupply();
            uint256 _profit = (profit * amountInQuote) / thisSoldAmount;
            if (_profit > PERCENT_MAX) {
                uint256 profitAmount = (withdrawAmount *
                    (_profit - PERCENT_MAX)) / _profit;
                uint256 feeAmount = takePerfFees(
                    vaultParams.baseToken,
                    profitAmount
                );
                withdrawAmount = withdrawAmount - feeAmount;
            }
            soldAmount = soldAmount - thisSoldAmount;

            if (withdrawAmount > 0) {
                // pay withdraw fees
                withdrawAmount = takePartnerFees(
                    vaultParams.baseToken,
                    withdrawAmount,
                    false
                );
                IERC20(vaultParams.baseToken).safeTransfer(
                    msg.sender,
                    withdrawAmount
                );
            }
        }

        // burn these shares from the sender wallet
        _burn(msg.sender, shares);

        lastBlockNumber[msg.sender] = block.number;
    }

    function buy(bytes calldata swapCallData) external nonReentrant {
        require(initialized, "not initialized");
        require(
            block.number > lastBlockNumber[msg.sender],
            "allowed only one call per block"
        );
        require(whiteList[msg.sender], "Not whitelisted");
        require(position == 0, "Not valid position");

        // 1. get the amount of quoteToken to trade
        uint256 amount = IERC20(vaultParams.quoteToken).balanceOf(
            address(this)
        );
        require(amount > 0, "No enough quoteAmount");

        // 2. takeTradingFees
        amount = takeTradingFees(vaultParams.quoteToken, amount);

        // 3. get uniswap swap amount
        uint256 expectedAmount = (getDerivedPrice(false) * amount) /
            PRICE_DECIMALS;

        // 4. save the remaining to soldAmount
        soldAmount = amount;

        // 5. swap tokens to Base
        (bool success, ) = vaultParams.aggregatorAddr.call(swapCallData);

        if (!success) {
            // Copy revert reason from call
            assembly {
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
        }

        // 6. check swapped amount
        amount = IERC20(vaultParams.baseToken).balanceOf(address(this));
        require(
            IERC20(vaultParams.quoteToken).balanceOf(address(this)) == 0,
            "not a valid swap"
        );
        require(amount >= (expectedAmount * 90) / 100, "not a valid swap");

        // 7. update position
        position = 1;

        // 8. emit event
        emit TradeDone(1, soldAmount, amount);

        lastBlockNumber[msg.sender] = block.number;
    }

    function sell(bytes calldata swapCallData) external nonReentrant {
        require(initialized, "not initialized");
        require(
            block.number > lastBlockNumber[msg.sender],
            "allowed only one call per block"
        );
        require(whiteList[msg.sender], "Not whitelisted");
        require(position == 1, "Not valid position");

        // 1. get the amount of baseToken to trade
        uint256 baseAmount = IERC20(vaultParams.baseToken).balanceOf(
            address(this)
        );
        require(baseAmount > 0, "No enough baseAmount");

        // 2. calc base fee amount
        baseAmount = takeTradingFees(vaultParams.baseToken, baseAmount);

        // 3. calc min swapped amount
        uint256 expectedAmount = (getDerivedPrice(true) * baseAmount) /
            PRICE_DECIMALS;

        // 4. swap tokens to Quote and get the newly create quoteToken
        (bool success, ) = vaultParams.aggregatorAddr.call(swapCallData);

        if (!success) {
            // Copy revert reason from call
            assembly {
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
        }

        // 5. check swapped amount
        uint256 quoteAmount = IERC20(vaultParams.quoteToken).balanceOf(
            address(this)
        );
        require(
            IERC20(vaultParams.baseToken).balanceOf(address(this)) == 0,
            "not a valid swap"
        );
        require(quoteAmount >= (expectedAmount * 90) / 100, "not a valid swap");

        // 6. calculate the profit in percent
        profit = (profit * quoteAmount) / soldAmount;

        // 7. take performance fees in case of profit
        if (profit > PERCENT_MAX) {
            uint256 profitAmount = (quoteAmount * (profit - PERCENT_MAX)) /
                profit;
            takePerfFees(vaultParams.quoteToken, profitAmount);
            profit = PERCENT_MAX;
        }

        // 8. update soldAmount
        soldAmount = 0;

        // 9. update position
        position = 0;

        // emit event
        emit TradeDone(0, baseAmount, quoteAmount);

        lastBlockNumber[msg.sender] = block.number;
    }

    function takePartnerFees(
        address token,
        uint256 amount,
        bool isDeposit
    ) private returns (uint256) {
        if (amount == 0) {
            return 0;
        }

        if (feeParams.addrPartner == address(0)) {
            // take fees when partner is provided
            return amount;
        }

        uint256 fees = (amount *
            (isDeposit ? feeParams.pctDeposit : feeParams.pctWithdraw)) /
            PERCENT_MAX;
        IERC20(token).safeTransfer(feeParams.addrPartner, fees);
        return amount - fees;
    }

    function takeTradingFees(address token, uint256 amount)
        private
        returns (uint256)
    {
        if (amount == 0) {
            return 0;
        }

        // swap to UBXN
        uint256 fee = (amount * feeParams.pctTradUpbots) / PERCENT_MAX;
        uint256 _before = IERC20(vaultParams.ubxnToken).balanceOf(
            address(this)
        );
        _swapToUBXN(token, fee);
        uint256 _after = IERC20(vaultParams.ubxnToken).balanceOf(address(this));
        uint256 ubxnAmt = _after - _before;

        // transfer to company wallet
        IERC20(vaultParams.ubxnToken).safeTransfer(
            feeParams.addrUpbots,
            ubxnAmt
        );

        // return remaining token amount
        return amount - fee;
    }

    function takePerfFees(address token, uint256 amount)
        private
        returns (uint256)
    {
        if (amount == 0) {
            return 0;
        }

        // calculate fees
        uint256 burnAmount = (amount * feeParams.pctPerfBurning) / PERCENT_MAX;
        uint256 stakersAmount = (amount * feeParams.pctPerfStakers) /
            PERCENT_MAX;
        uint256 devAmount = (amount * feeParams.pctPerfAlgoDev) / PERCENT_MAX;
        uint256 pctCompany = feeParams.addrPartner != address(0)
            ? feeParams.pctPerfPartners
            : feeParams.pctPerfUpbots;
        address addrCompany = feeParams.addrPartner != address(0)
            ? feeParams.addrPartner
            : feeParams.addrUpbots;
        uint256 companyAmount = (amount * pctCompany) / PERCENT_MAX;

        // swap to UBXN
        uint256 _total = stakersAmount + devAmount + burnAmount + companyAmount;

        uint256 _tokenBefore = IERC20(token).balanceOf(address(this));
        uint256 _before = IERC20(vaultParams.ubxnToken).balanceOf(
            address(this)
        );
        _swapToUBXN(token, _total);
        uint256 _after = IERC20(vaultParams.ubxnToken).balanceOf(address(this));
        uint256 _tokenAfter = IERC20(vaultParams.baseToken).balanceOf(
            address(this)
        );

        uint256 ubxnAmt = _after - _before;
        uint256 feeAmount = _tokenBefore - _tokenAfter;

        // calculate UBXN amounts
        stakersAmount = (ubxnAmt * stakersAmount) / _total;
        devAmount = (ubxnAmt * devAmount) / _total;
        companyAmount = (ubxnAmt * companyAmount) / _total;
        burnAmount = ubxnAmt - stakersAmount - devAmount - companyAmount;

        // Transfer
        IERC20(vaultParams.ubxnToken).safeTransfer(
            BURN_ADDRESS, // burn
            burnAmount
        );

        IERC20(vaultParams.ubxnToken).safeTransfer(
            feeParams.addrStakers, // stakers
            stakersAmount
        );

        IERC20(vaultParams.ubxnToken).safeTransfer(
            feeParams.addrAlgoDev, // algodev
            devAmount
        );

        IERC20(vaultParams.ubxnToken).safeTransfer(
            addrCompany, // company (upbots or partner)
            companyAmount
        );

        return feeAmount;
    }

    // *** internal functions ***

    function approveTokensForAggregator() internal {
        assert(
            IERC20(vaultParams.quoteToken).approve(
                vaultParams.aggregatorAddr,
                MAX_APPROVAL
            )
        );
        assert(
            IERC20(vaultParams.baseToken).approve(
                vaultParams.aggregatorAddr,
                MAX_APPROVAL
            )
        );
        assert(
            IERC20(vaultParams.quoteToken).approve(
                vaultParams.mainRouter,
                MAX_APPROVAL
            )
        );
        assert(
            IERC20(vaultParams.baseToken).approve(
                vaultParams.mainRouter,
                MAX_APPROVAL
            )
        );
        assert(
            IERC20(vaultParams.quoteToken).approve(
                vaultParams.ubxnPoolRouter,
                MAX_APPROVAL
            )
        );
        assert(
            IERC20(vaultParams.baseToken).approve(
                vaultParams.ubxnPoolRouter,
                MAX_APPROVAL
            )
        );
    }

    function _swapUniswap(bool isBuy, uint256 _amount) internal {
        address[] memory path;

        path = new address[](2);
        path[0] = isBuy ? vaultParams.quoteToken : vaultParams.baseToken;
        path[1] = isBuy ? vaultParams.baseToken : vaultParams.quoteToken;

        uint256 expectedAmount = (getDerivedPrice(!isBuy) * _amount) /
            PRICE_DECIMALS;

        uint256[] memory amounts = UniswapRouterV2(vaultParams.mainRouter)
            .swapExactTokensForTokens(
                _amount,
                (expectedAmount * 90) / 100,
                path,
                address(this),
                block.timestamp + 60
            );

        require(amounts[0] > 0, "invalid swap result");
    }

    // _to is supposed to be UBXN
    // _from is quote token or base token (we assume quote token is USDC)
    function _swapToUBXN(address _from, uint256 _amount) internal {
        address[] memory path;

        //from token could be one of quote, base, ubxnPair token.
        if (_from == vaultParams.ubxnPairToken) {
            path = new address[](2);
            path[0] = _from;
            path[1] = vaultParams.ubxnToken;
        } else if (
            _from == vaultParams.quoteToken ||
            vaultParams.ubxnPairToken == vaultParams.quoteToken
        ) {
            path = new address[](3);
            path[0] = _from;
            path[1] = vaultParams.ubxnPairToken;
            path[2] = vaultParams.ubxnToken;
        } else {
            path = new address[](4);
            path[0] = _from;
            path[1] = vaultParams.quoteToken;
            path[2] = vaultParams.ubxnPairToken;
            path[3] = vaultParams.ubxnToken;
        }

        uint256[] memory amounts = UniswapRouterV2(vaultParams.ubxnPoolRouter)
            .swapExactTokensForTokens(
                _amount,
                0,
                path,
                address(this),
                block.timestamp + 60
            );

        require(amounts[0] > 0, "invalid swap result");
    }

    function _beforeTokenTransfer(
        address,
        address,
        uint256
    ) internal virtual override {
        require(
            block.number > lastBlockNumber[msg.sender],
            "allowed only one call per block"
        );
        lastBlockNumber[msg.sender] = block.number;
    }

    function getDerivedPrice(bool isBasePrice) public view returns (uint256) {
        (, int256 basePrice, , , ) = AggregatorV3Interface(
            vaultParams.basePriceFeed
        ).latestRoundData();
        uint8 baseDecimals = AggregatorV3Interface(vaultParams.basePriceFeed)
            .decimals();
        basePrice = scalePrice(
            basePrice,
            baseDecimals,
            IERC20Metadata(vaultParams.baseToken).decimals()
        );

        (, int256 quotePrice, , , ) = AggregatorV3Interface(
            vaultParams.quotePriceFeed
        ).latestRoundData();
        uint8 quoteDecimals = AggregatorV3Interface(vaultParams.quotePriceFeed)
            .decimals();
        quotePrice = scalePrice(
            quotePrice,
            quoteDecimals,
            IERC20Metadata(vaultParams.quoteToken).decimals()
        );

        return
            isBasePrice
                ? ((uint256(basePrice) * PRICE_DECIMALS) / uint256(quotePrice))
                : ((uint256(quotePrice) * PRICE_DECIMALS) / uint256(basePrice));
    }

    function scalePrice(
        int256 _price,
        uint8 _priceDecimals,
        uint8 _decimals
    ) internal pure returns (int256) {
        if (_priceDecimals < _decimals) {
            return _price * int256(10**uint256(_decimals - _priceDecimals));
        } else if (_priceDecimals > _decimals) {
            return _price / int256(10**uint256(_priceDecimals - _decimals));
        }
        return _price;
    }
}
