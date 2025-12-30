import * as TronWebPkg from 'tronweb';

// Fix for TronWeb import in different environments (ESM/Bundle)
// Checks named export, default export, or the module itself for the constructor
// @ts-ignore
const TronWeb = TronWebPkg.TronWeb || TronWebPkg.default || TronWebPkg;

// TRONGRID CONFIGURATION
const TRONGRID_API_KEY = 'c91bd6bb-7cc8-49c8-a185-63eeaa684010';
const FULL_NODE = 'https://api.trongrid.io';
const USDT_CONTRACT_ADDRESS = 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj'; // Provided by user
const DECIMALS = 6;

// Helper to safely get TronWeb instance
const getSafeTronWeb = (privateKey?: string) => {
  try {
    return new TronWeb({
      fullHost: FULL_NODE,
      headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY },
      privateKey: privateKey || '01'.repeat(32) // Dummy key if none provided
    });
  } catch (e) {
    console.error("TronWeb initialization failed:", e);
    return null;
  }
};

/**
 * Generate a new TRC20 wallet for a user.
 * Includes a fallback to a simulation address if TronWeb fails.
 */
export const generateUserWallet = async () => {
  try {
    const tronWeb = getSafeTronWeb();
    if (tronWeb) {
      // createAccount is synchronous in newer TronWeb, but we await just in case
      return await tronWeb.createAccount();
    }
    throw new Error("TronWeb instance not available");
  } catch (error) {
    console.warn("Blockchain Service Unavailable. Generating fallback simulation wallet.", error);
    // Return a valid-looking structure so the app doesn't crash during demo/dev
    const randomHex = Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join('');
    return {
      address: {
        base58: 'T' + Array.from({length: 33}, () => 'ABCDEF1234567890'[Math.floor(Math.random() * 16)]).join(''),
        hex: '41' + randomHex
      },
      privateKey: randomHex + randomHex
    };
  }
};

/**
 * Scans for USDT transfers to a specific address using TronGrid.
 * Used for the Automatic Deposit Confirmation system.
 */
export const checkUsdtDeposits = async (address: string, sinceTimestamp: number) => {
  try {
    const url = `${FULL_NODE}/v1/accounts/${address}/transactions/trc20?limit=20&contract_address=${USDT_CONTRACT_ADDRESS}&only_to=true&min_timestamp=${sinceTimestamp}`;
    const response = await fetch(url, {
      headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY }
    });
    const data = await response.json();
    
    if (data.success && data.data) {
      return data.data.map((tx: any) => ({
        hash: tx.transaction_id,
        from: tx.from,
        amount: Number(tx.value) / Math.pow(10, DECIMALS),
        timestamp: tx.block_timestamp
      }));
    }
    return [];
  } catch (error) {
    console.error('TronGrid API Error:', error);
    return [];
  }
};

/**
 * Process a Withdrawal from the Hot Wallet to a user.
 */
export const processUsdtWithdrawal = async (
  hotWalletPrivateKey: string,
  toAddress: string,
  amount: number
) => {
  const tronWeb = getSafeTronWeb(hotWalletPrivateKey);
  
  if (!tronWeb) {
    throw new Error("Blockchain bridge currently unavailable. Please try again later.");
  }

  try {
    const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    const amountInSun = Math.floor(amount * Math.pow(10, DECIMALS));
    
    // Call the transfer(address, uint256) function
    const txHash = await contract.transfer(toAddress, amountInSun.toString()).send();
    
    return {
      success: true,
      txHash
    };
  } catch (error: any) {
    console.error('Withdrawal Failed:', error);
    throw new Error(error.message || 'Blockchain transaction failed');
  }
};

/**
 * NEW: Get real-time on-chain balances for Sweep functionality
 */
export const getWalletBalances = async (address: string) => {
  const tronWeb = getSafeTronWeb();
  if (!tronWeb) throw new Error("TronWeb init failed");

  try {
    // 1. Get TRX Balance
    const trxBalance = await tronWeb.trx.getBalance(address);
    
    // 2. Get USDT Balance
    let usdtBalance = 0;
    try {
      const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
      const balance = await contract.balanceOf(address).call();
      // balance is often returned as a hex string or BigNumber object, convert safely
      usdtBalance = parseInt(balance._hex || balance.toString(), 16) / Math.pow(10, DECIMALS);
    } catch (e) {
      console.warn("Could not fetch USDT balance (account might be inactive)", e);
    }

    return {
      trx: trxBalance / 1_000_000,
      usdt: usdtBalance || 0
    };
  } catch (error: any) {
    console.error("Balance Check Error:", error);
    return { trx: 0, usdt: 0 };
  }
};

/**
 * NEW: Execute Sweep Operation
 * 1. Send TRX from Hot Wallet to User Wallet (Gas)
 * 2. Send USDT from User Wallet to Hot Wallet
 */
export const executeWalletSweep = async (
  userPrivateKey: string,
  userAddress: string,
  hotWalletPrivateKey: string,
  hotWalletAddress: string,
  usdtAmount: number
) => {
  // Instance for Admin (Gas Payer)
  const adminTronWeb = getSafeTronWeb(hotWalletPrivateKey);
  // Instance for User (USDT Sender)
  const userTronWeb = getSafeTronWeb(userPrivateKey);

  if (!adminTronWeb || !userTronWeb) throw new Error("Wallet initialization failed");

  const results = {
    gasTx: '',
    sweepTx: ''
  };

  try {
    // Step 1: Check if User needs Gas (Approx 30 TRX needed for safe transfer)
    const REQUIRED_TRX = 30;
    const userTrxBalance = await adminTronWeb.trx.getBalance(userAddress);
    const currentTrx = userTrxBalance / 1_000_000;

    if (currentTrx < REQUIRED_TRX) {
      const trxToSend = Math.ceil(REQUIRED_TRX - currentTrx);
      console.log(`Sending ${trxToSend} TRX for gas...`);
      const trade = await adminTronWeb.transactionBuilder.sendTrx(
        userAddress,
        trxToSend * 1_000_000,
        adminTronWeb.defaultAddress.base58
      );
      const signed = await adminTronWeb.trx.sign(trade);
      const receipt = await adminTronWeb.trx.sendRawTransaction(signed);
      if (receipt.result) {
        results.gasTx = receipt.txid;
        // Wait 5 seconds for TRX to arrive/confirm
        await new Promise(r => setTimeout(r, 5000));
      } else {
        throw new Error("Failed to send gas (TRX)");
      }
    }

    // Step 2: Sweep USDT
    console.log(`Sweeping ${usdtAmount} USDT...`);
    const contract = await userTronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    const amountInSun = Math.floor(usdtAmount * Math.pow(10, DECIMALS));
    
    const txHash = await contract.transfer(hotWalletAddress, amountInSun.toString()).send();
    results.sweepTx = txHash;

    return results;
  } catch (error: any) {
    console.error("Sweep Error:", error);
    throw new Error(error.message || "Sweep failed on-chain");
  }
};