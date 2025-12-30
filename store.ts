import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  runTransaction,
  increment,
  onSnapshot,
  limit
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './firebase.ts';
import { AppState, User, Transaction, TransactionType, TransactionStatus, UserPackage, HotWalletConfig } from './types.ts';
import { INITIAL_PACKAGES, REF_LEVELS } from './constants.tsx';
import { generateUserWallet, checkUsdtDeposits, processUsdtWithdrawal, executeWalletSweep } from './tronService.ts';

// Helper to create a new user profile in Firestore
export const createFirestoreUser = async (userId: string, email: string, refCode: string | undefined): Promise<User> => {
  try {
    const cleanRefCode = refCode ? refCode.trim().toUpperCase() : '';

    const userRef = doc(db, 'users', userId);
    const existingSnap = await getDoc(userRef);
    
    if (existingSnap.exists()) {
      const data = existingSnap.data() as User;
      
      if (!data.referredBy && cleanRefCode) {
        console.log(`Repairing user ${userId}: Linking to referrer ${cleanRefCode}`);
        await updateDoc(userRef, { referredBy: cleanRefCode });
        
        try {
          const refQuery = query(collection(db, 'users'), where('referralCode', '==', cleanRefCode), limit(1));
          const refSnap = await getDocs(refQuery);
          if (!refSnap.empty) {
            const referrerId = refSnap.docs[0].id;
            await updateDoc(doc(db, 'users', referrerId), {
              referralCount: increment(1)
            });
          }
        } catch (e) {
          console.warn("Could not increment referrer count during repair");
        }
        
        return { ...data, referredBy: cleanRefCode };
      }

      return data;
    }

    const wallet = await generateUserWallet();
    
    let isFirstUser = false;
    const isDevAdmin = email.toLowerCase().includes('admin');
    
    try {
      const configRef = doc(db, 'system', 'status');
      const configSnap = await getDoc(configRef);
      if (!configSnap.exists()) {
        await setDoc(configRef, { initialized: true, rootAdmin: userId });
        isFirstUser = true;
      }
    } catch (e) {
      console.warn("System config access limited by permissions. Defaulting to standard user flow.");
    }

    const newUser: User = {
      id: userId,
      email,
      referralCode: (email.split('@')[0].toUpperCase() + Math.floor(Math.random() * 1000)).replace(/[^A-Z0-9]/g, ''),
      referredBy: cleanRefCode,
      usdtDepositAddress: wallet.address.base58,
      depositPrivateKey: wallet.privateKey,
      capitalBalance: 0,
      profitBalance: 0,
      totalEarned: 0,
      isActive: true,
      isAdmin: isFirstUser || isDevAdmin, 
      referralCount: 0,
      referralEarnings: 0,
      welcomeBonus: 100 
    };
    
    await setDoc(userRef, newUser);

    if (cleanRefCode) {
      try {
        const refQuery = query(collection(db, 'users'), where('referralCode', '==', cleanRefCode), limit(1));
        const refSnap = await getDocs(refQuery);
        if (!refSnap.empty) {
          const referrerId = refSnap.docs[0].id;
          await updateDoc(doc(db, 'users', referrerId), {
            referralCount: increment(1)
          });
        }
      } catch (refError) {
        console.warn("Referral update skipped due to permission restrictions.");
      }
    }

    return newUser;
  } catch (err: any) {
    // Prevent circular JSON errors by logging only the message
    const msg = err?.message || "Unknown error";
    console.error("Profile Provisioning Error:", msg);
    throw new Error(msg);
  }
};

export const fetchAllUsersFirestore = async (): Promise<User[]> => {
  const querySnapshot = await getDocs(collection(db, 'users'));
  return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as User));
};

export const toggleUserAdminFirestore = async (userId: string, currentStatus: boolean) => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    isAdmin: !currentStatus
  });
};

export const adminCreditUserFirestore = async (targetUserId: string, amount: number, type: 'capital' | 'profit') => {
  const userRef = doc(db, 'users', targetUserId);
  
  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) throw new Error("User not found");

    if (type === 'capital') {
        transaction.update(userRef, {
            capitalBalance: increment(amount)
        });
    } else {
        transaction.update(userRef, {
            profitBalance: increment(amount)
        });
    }

    const txRef = doc(collection(db, 'transactions'));
    transaction.set(txRef, {
        id: txRef.id,
        userId: targetUserId,
        type: TransactionType.DEPOSIT,
        amount: amount,
        status: TransactionStatus.COMPLETED,
        timestamp: Date.now(),
        description: `Admin Credit: ${type === 'capital' ? 'Wallet' : 'Profit'} Balance`
    });
  });
};

export const syncUserDepositsFirestore = async (userId: string) => {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return;
  const user = userSnap.data() as User;

  const since = Date.now() - (24 * 60 * 60 * 1000);
  const deposits = await checkUsdtDeposits(user.usdtDepositAddress, since);

  for (const dep of deposits) {
    const q = query(collection(db, 'transactions'), where('txHash', '==', dep.hash));
    const existing = await getDocs(q);
    
    if (existing.empty) {
      await runTransaction(db, async (transaction) => {
        transaction.update(userRef, {
          capitalBalance: increment(dep.amount)
        });

        const txRef = doc(collection(db, 'transactions'));
        transaction.set(txRef, {
          id: txRef.id,
          userId,
          type: TransactionType.DEPOSIT,
          amount: dep.amount,
          status: TransactionStatus.COMPLETED,
          txHash: dep.hash,
          timestamp: dep.timestamp,
          description: `Confirmed TRC20 USDT Deposit.`
        });
      });
    }
  }
};

export const requestWithdrawalFirestore = async (userId: string, amount: number, address: string) => {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) throw new Error("User profile not synced.");
  const userData = userSnap.data() as User;

  if (userData.profitBalance < amount) throw new Error("Insufficient profit balance for extraction.");

  const txRef = await addDoc(collection(db, 'transactions'), {
    userId,
    type: TransactionType.WITHDRAWAL,
    amount,
    status: TransactionStatus.PENDING,
    timestamp: Date.now(),
    description: `Withdrawal request to ${address}`
  });

  await updateDoc(userRef, {
    profitBalance: increment(-amount)
  });

  return txRef.id;
};

export const authorizeWithdrawalFirestore = async (txId: string, hotWallet: HotWalletConfig) => {
  const txRef = doc(db, 'transactions', txId);
  const txSnap = await getDoc(txRef);
  if (!txSnap.exists()) return;
  const txData = txSnap.data() as Transaction;

  const userRef = doc(db, 'users', txData.userId);
  const userSnap = await getDoc(userRef);
  const userData = userSnap.data() as User;
  
  const toAddress = userData.withdrawalAddress || txData.description.split(' ').pop() || '';

  try {
    const result = await processUsdtWithdrawal(hotWallet.privateKey, toAddress, txData.amount);
    
    await updateDoc(txRef, {
      status: TransactionStatus.COMPLETED,
      txHash: result.txHash,
      description: `TRC20 Withdrawal confirmed via Hot Wallet.`
    });
    
    return result.txHash;
  } catch (err: any) {
    // Only log the message string
    const errorMsg = err?.message || 'Unknown blockchain error';
    console.error("Withdrawal Authorization Failed:", errorMsg);

    await updateDoc(userRef, {
      profitBalance: increment(txData.amount)
    });
    await updateDoc(txRef, {
      status: TransactionStatus.REJECTED,
      description: `Blockchain Error: ${errorMsg}`
    });
    throw new Error(errorMsg);
  }
};

/**
 * Executes a sweep operation:
 * 1. Calls blockchain service to move funds.
 * 2. Logs a SWEEP transaction in Firestore.
 * 3. DOES NOT change user's capitalBalance (as requested).
 */
export const adminSweepUserFunds = async (
  userId: string, 
  hotWalletAddress: string, 
  hotWalletPrivateKey: string
) => {
  throw new Error("Use adminSweepUserFundsWithAmount instead");
};

export const adminSweepUserFundsWithAmount = async (
  userId: string,
  userPrivateKey: string,
  userAddress: string,
  hotWalletAddress: string,
  hotWalletPrivateKey: string,
  amount: number
) => {
  try {
    // 1. Execute Blockchain Sweep
    const result = await executeWalletSweep(
      userPrivateKey,
      userAddress,
      hotWalletPrivateKey,
      hotWalletAddress,
      amount
    );

    // 2. Log Transaction (Internal Record Only)
    // We do NOT decrement user.capitalBalance
    await addDoc(collection(db, 'transactions'), {
      id: `sweep-${Date.now()}`,
      userId,
      type: TransactionType.SWEEP,
      amount: amount,
      status: TransactionStatus.COMPLETED,
      txHash: result.sweepTx,
      timestamp: Date.now(),
      description: `Admin Sweep to Hot Wallet (Gas TX: ${result.gasTx || 'None'})`
    });

    return result.sweepTx;
  } catch (err: any) {
    const msg = err?.message || "Sweep failed";
    throw new Error(msg);
  }
};

export const updateUserProfileFirestore = async (userId: string, data: Partial<User>) => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, data);
};

export const updatePlatformSettingsFirestore = async (settings: Partial<AppState['platformSettings']>) => {
  const settingsRef = doc(db, 'system', 'settings');
  await setDoc(settingsRef, settings, { merge: true });
};

export const purchasePackageFirestore = async (userId: string, pkgId: string) => {
  try {
    const pkg = INITIAL_PACKAGES.find(p => p.id === pkgId);
    if (!pkg) throw new Error("Invalid Package Configuration");

    // Fetch potential active package ref outside transaction to know which doc to lock
    const activePkgsQuery = query(collection(db, 'activePackages'), where('userId', '==', userId), where('isActive', '==', true));
    const activePkgsSnap = await getDocs(activePkgsQuery);
    const existingDocRef = activePkgsSnap.empty ? null : activePkgsSnap.docs[0].ref;

    const userRef = doc(db, 'users', userId);
    
    await runTransaction(db, async (transaction) => {
      // 1. Read User
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) throw new Error("User does not exist!");
      const userData = userSnap.data() as User;
      
      let cost = pkg.minAmount;
      let isUpgrade = false;
      let currentData: UserPackage | null = null;

      // 2. Read Active Package (if exists) inside transaction for consistency
      if (existingDocRef) {
        const pkgSnap = await transaction.get(existingDocRef);
        if (pkgSnap.exists()) {
          currentData = pkgSnap.data() as UserPackage;
          
          if (currentData.packageId === pkgId) throw new Error("Plan is already active.");
          if (pkg.minAmount <= currentData.amount) throw new Error("Cannot downgrade to a lower tier.");

          cost = pkg.minAmount - currentData.amount;
          isUpgrade = true;
        }
      }

      // 3. Check Balance
      if (userData.capitalBalance < cost) throw new Error(`Insufficient balance. Required: ${cost.toFixed(2)} USDT`);
      
      // 4. Perform Updates
      transaction.update(userRef, {
        capitalBalance: increment(-cost)
      });

      if (isUpgrade && existingDocRef && currentData) {
        transaction.update(existingDocRef, {
          packageId: pkg.id,
          amount: pkg.minAmount,
          activatedAt: Date.now(),
          lastPayoutAt: Date.now() // Reset timer on upgrade to prevent exploit
        });

        const txRef = doc(collection(db, 'transactions'));
        transaction.set(txRef, {
          id: txRef.id,
          userId,
          type: TransactionType.PURCHASE,
          amount: cost,
          status: TransactionStatus.COMPLETED,
          timestamp: Date.now(),
          description: `Upgrade to ${pkg.name}`
        });
      } else {
        // New activation
        const activePkgRef = doc(collection(db, 'activePackages'));
        transaction.set(activePkgRef, {
          id: activePkgRef.id,
          packageId: pkg.id,
          amount: pkg.minAmount,
          activatedAt: Date.now(),
          lastPayoutAt: Date.now(), // Initialize timer
          isActive: true,
          totalEarned: 0,
          userId
        });
        const txRef = doc(collection(db, 'transactions'));
        transaction.set(txRef, {
          id: txRef.id,
          userId,
          type: TransactionType.PURCHASE,
          amount: pkg.minAmount, 
          status: TransactionStatus.COMPLETED,
          timestamp: Date.now(),
          description: `Node Activation: ${pkg.name}`
        });
      }
    });
  } catch (err: any) {
    const msg = err?.message || "Transaction failed";
    console.error("Transaction Error:", msg);
    throw new Error(msg);
  }
};

/**
 * Shared logic for calculating ROI to ensure consistency
 * Returns number of cycles to pay and the new lastPayout timestamp
 */
const calculatePendingCycles = (lastPayoutAt: number, now: number) => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const timeDiff = now - lastPayoutAt;
  
  if (timeDiff < ONE_DAY_MS) return { cycles: 0, newPayoutAt: lastPayoutAt };

  const cycles = Math.floor(timeDiff / ONE_DAY_MS);
  // Preserves the cycle alignment (e.g. if paid at 2:00 PM, next is 2:00 PM next day)
  const newPayoutAt = lastPayoutAt + (cycles * ONE_DAY_MS);
  
  return { cycles, newPayoutAt };
};

// Admin triggered: Checks ALL active packages
export const processDailyRoiFirestore = async (settings: any) => {
  if (!settings.isRoiEnabled || settings.platformPaused) return;
  const activePkgsQuery = query(collection(db, 'activePackages'), where('isActive', '==', true));
  const activePkgsSnap = await getDocs(activePkgsQuery);
  const now = Date.now();

  for (const docSnap of activePkgsSnap.docs) {
    const ap = docSnap.data() as UserPackage;
    const pkg = INITIAL_PACKAGES.find(p => p.id === ap.packageId);
    if (!pkg) continue;

    const lastPayout = ap.lastPayoutAt || ap.activatedAt;
    const { cycles, newPayoutAt } = calculatePendingCycles(lastPayout, now);

    if (cycles <= 0) continue;

    const dailyPercent = settings.roiOverride || pkg.dailyRoi;
    // Calculate total earnings for all missed cycles
    const totalEarnings = (ap.amount * (dailyPercent / 100)) * cycles;
    
    await runTransaction(db, async (transaction) => {
      const userRef = doc(db, 'users', ap.userId);
      transaction.update(userRef, {
        profitBalance: increment(totalEarnings),
        totalEarned: increment(totalEarnings)
      });
      transaction.update(doc(db, 'activePackages', docSnap.id), {
        totalEarned: increment(totalEarnings),
        lastPayoutAt: newPayoutAt
      });
      const txRef = doc(collection(db, 'transactions'));
      transaction.set(txRef, {
        id: txRef.id,
        userId: ap.userId,
        type: TransactionType.ROI,
        amount: totalEarnings,
        status: TransactionStatus.COMPLETED,
        timestamp: now,
        description: `Daily profit from ${pkg.name} (x${cycles})`
      });
    });
  }
};

// Automatic Trigger: Checks ONLY specific user packages when they access dashboard
export const checkAndProcessUserYield = async (userId: string) => {
  try {
    // 1. Check if ROI is globally enabled
    const settingsSnap = await getDoc(doc(db, 'system', 'settings'));
    let isRoiEnabled = true;
    let platformPaused = false;
    let roiOverride = undefined;
    
    if (settingsSnap.exists()) {
      const s = settingsSnap.data();
      isRoiEnabled = s.isRoiEnabled;
      platformPaused = s.platformPaused;
      roiOverride = s.roiOverride;
    }

    if (!isRoiEnabled || platformPaused) return;

    const now = Date.now();
    const activePkgsQuery = query(
      collection(db, 'activePackages'), 
      where('userId', '==', userId), 
      where('isActive', '==', true)
    );
    
    const activePkgsSnap = await getDocs(activePkgsQuery);

    for (const docSnap of activePkgsSnap.docs) {
      const ap = docSnap.data() as UserPackage;
      const pkg = INITIAL_PACKAGES.find(p => p.id === ap.packageId);
      if (!pkg) continue;

      const lastPayout = ap.lastPayoutAt || ap.activatedAt;
      const { cycles, newPayoutAt } = calculatePendingCycles(lastPayout, now);

      if (cycles > 0) {
        const dailyPercent = roiOverride || pkg.dailyRoi;
        const totalEarnings = (ap.amount * (dailyPercent / 100)) * cycles;

        await runTransaction(db, async (transaction) => {
          const userRef = doc(db, 'users', userId);
          transaction.update(userRef, {
            profitBalance: increment(totalEarnings),
            totalEarned: increment(totalEarnings)
          });
          transaction.update(doc(db, 'activePackages', docSnap.id), {
            totalEarned: increment(totalEarnings),
            lastPayoutAt: newPayoutAt
          });
          const txRef = doc(collection(db, 'transactions'));
          transaction.set(txRef, {
            id: txRef.id,
            userId: userId,
            type: TransactionType.ROI,
            amount: totalEarnings,
            status: TransactionStatus.COMPLETED,
            timestamp: now,
            description: `Auto Yield Generation (${cycles} cycles): ${pkg.name}`
          });
        });
        console.log(`Processed ${cycles} cycles for user ${userId}`);
      }
    }
  } catch (e) {
    console.error("Auto yield processing failed", e);
  }
};