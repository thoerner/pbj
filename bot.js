const fs = require('fs');
const { WebSocketProvider } = require('@ethersproject/providers')
require('dotenv').config();
const ethers = require('ethers');

// Load environment variables
const infuraApiKey = process.env.INFURA_API_KEY;
const privateKey = process.env.PRIVATE_KEY;

const WFTM_ADDRESS = '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83';

// Initialize Ethereum provider and wallet
const provider = new WebSocketProvider('wss://thrumming-alien-putty.fantom.discover.quiknode.pro/98031b209341897c27b860bad97c505089734836/');
const wallet = new ethers.Wallet(privateKey, provider);

// Initialize target token contract and Uniswap router
const tokenAddress = '0xf16e81dce15B08F326220742020379B855B87DF9'; // Replace with the target token contract address
const uniswapRouterAddress = '0xF491e7B69E4244ad4002BC14e878a34207E38c29'; // Uniswap V2 router address
const tokenContract = new ethers.Contract(tokenAddress, ['function balanceOf(address) view returns (uint256)'], provider);

// Read and parse the Uniswap V2 Router ABI from the JSON file
const uniswapRouterJson = fs.readFileSync('SpookySwapRouter.json', 'utf8');
const uniswapRouterABI = JSON.parse(uniswapRouterJson)

const uniswapRouter = new ethers.Contract(uniswapRouterAddress, uniswapRouterABI, wallet);

// Parameters for sandwich bot
const sandwichAmount = ethers.utils.parseEther('0.1'); // Amount of target token to buy and sell
const slippage = 0.01; // Slippage tolerance (e.g., 1%)
const gasPrice = ethers.utils.parseUnits('60', 'gwei'); // Gas price for transactions

async function processTransaction(txHash) {
    try {
        const tx = await provider.getTransaction(txHash);
        const txTo = tx.to;
        const txFrom = tx.from;

        // Check if transaction is a token swap
        if (txTo.toLowerCase() === uniswapRouterAddress.toLowerCase() && tx.data.startsWith('0x') && txFrom.toLowerCase() !== wallet.address.toLowerCase()) {

            const decodedInputData = uniswapRouter.interface.decodeFunctionData('swapExactTokensForTokens(uint256,uint256,address[],address,uint256)', tx.data);

            const amountIn = decodedInputData[0];
            const path = decodedInputData[2];
            const tokenOut = path[path.length - 1];
            const counterpartyToken = path[0];

            // Check if token out is the target token and counterparty token is ETH
            if (tokenOut.toLowerCase() === tokenAddress.toLowerCase() && counterpartyToken.toLowerCase() === WFTM_ADDRESS.toLowerCase()) {
                const amountOutMin = decodedInputData[1];
                const deadline = decodedInputData[4];

                // Calculate the amount of target token to sell and buy
                const amountInMax = amountIn.mul(ethers.utils.parseUnits('1', 'ether')).div(ethers.utils.parseUnits('1', 'ether').sub(slippage));
                const amountOut = sandwichAmount;

                // Execute the sandwich
                const tx = await uniswapRouter.swapExactTokensForTokens(
                    amountOut,
                    amountOutMin,
                    [tokenAddress, ...path],
                    wallet.address,
                    deadline,
                    { gasPrice: gasPrice, gasLimit: 1000000 }
                );
                console.log(`Sandwich executed: ${tx.hash}`);
            }
        }
    } catch (error) {
        console.error(`Error processing transaction: ${error.message}`);
    }
}

provider.on('pending', (txHash) => {
    processTransaction(txHash);
});
