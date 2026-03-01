
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
  limit,
  deleteDoc
} from 'firebase/firestore';
import { db } from './firebase.ts';
import { AppState, User, Transaction, TransactionType, TransactionStatus, UserPackage, HotWalletConfig, Package, GiveawayPool, PaymentSettings, ReferralRecord, WhatsappTaskConfig, BankAccount, FiatRequest } from './types.ts';
import { INITIAL_PACKAGES, REF_LEVELS } from './constants.tsx';
import { generateUserWallet, checkUsdtDeposits, processUsdtWithdrawal, executeWalletSweep } from './tronService.ts';

// Dynamic Node Management
export const savePackageFirestore = async (pkg: Package) => {
  const pkgRef = doc(db, 'packages', pkg.id);
  await setDoc(pkgRef, { ...pkg, isActive: pkg.isActive ?? true }, { merge: true });
};

export const deletePackageFirestore = async (pkgId: string) => {
  await deleteDoc(doc(db, 'packages', pkgId));
};

// Payment Settings
export const updatePaymentSettingsFirestore = async (settings: PaymentSettings) => {
  await setDoc(doc(db, 'system', 'payments'), settings, { merge: true });
};

export const updateKorapaySettingsFirestore = async (settings: any) => {
  // Save ALL settings to system/korapay to allow client-side fallback
  // This is necessary for static deployments (Netlify) where server-side API routes are unavailable.
  // WARNING: This exposes the Secret Key to the frontend.
  await setDoc(doc(db, 'system', 'korapay'), settings, { merge: true });
  
  // We also keep the vault for backward compatibility or if we switch to a secure backend later
  const { secretKey, webhookSecret } = settings;
  if (secretKey || webhookSecret) {
      const privateSettings: any = {};
      if (secretKey) privateSettings.secretKey = secretKey;
      if (webhookSecret) privateSettings.webhookSecret = webhookSecret;
      await setDoc(doc(db, 'vault', 'korapay'), privateSettings, { merge: true });
  }
};

export const fetchKorapaySecretsFirestore = async () => {
  const snap = await getDoc(doc(db, 'vault', 'korapay'));
  return snap.exists() ? snap.data() : {};
};

// --- BANK ACCOUNT MANAGEMENT ---

export const saveBankAccountFirestore = async (bank: BankAccount) => {
  const bankRef = doc(db, 'system_banks', bank.id);
  await setDoc(bankRef, bank, { merge: true });
};

export const deleteBankAccountFirestore = async (bankId: string) => {
  await deleteDoc(doc(db, 'system_banks', bankId));
};

export const fetchBankAccountsFirestore = async (): Promise<BankAccount[]> => {
  const snap = await getDocs(collection(db, 'system_banks'));
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as BankAccount));
};

// --- FIAT TRANSACTION LOGIC ---

export const requestFiatDeposit = async (
  userId: string,
  amountNgn: number,
  exchangeRate: number,
  proofImage: string,
  adminBankId: string
) => {
  const amountUsdt = amountNgn / exchangeRate;
  
  const reqRef = doc(collection(db, 'fiat_requests'));
  const request: FiatRequest = {
    id: reqRef.id,
    userId,
    type: 'DEPOSIT',
    amountNgn,
    amountUsdt,
    exchangeRate,
    status: TransactionStatus.PENDING,
    timestamp: Date.now(),
    proofImage,
    adminBankId
  };

  await setDoc(reqRef, request);
  return request;
};

export const requestFiatWithdrawal = async (
  userId: string,
  amountUsdt: number,
  exchangeRate: number,
  bankDetails: { bankName: string; accountName: string; accountNumber: string }
) => {
  const amountNgn = amountUsdt * exchangeRate;
  const userRef = doc(db, 'users', userId);

  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) throw new Error("User not found");
    const userData = userSnap.data() as User;

    if (userData.profitBalance < amountUsdt) {
      throw new Error("Insufficient profit balance.");
    }

    // Deduct immediately to lock funds
    transaction.update(userRef, {
      profitBalance: increment(-amountUsdt)
    });

    const reqRef = doc(collection(db, 'fiat_requests'));
    const request: FiatRequest = {
      id: reqRef.id,
      userId,
      type: 'WITHDRAWAL',
      amountUsdt,
      amountNgn,
      exchangeRate,
      status: TransactionStatus.PENDING,
      timestamp: Date.now(),
      userBankName: bankDetails.bankName,
      userAccountName: bankDetails.accountName,
      userAccountNumber: bankDetails.accountNumber
    };

    transaction.set(reqRef, request);
    
    // Log in main transaction ledger as pending
    const txRef = doc(collection(db, 'transactions'));
    transaction.set(txRef, {
      id: txRef.id,
      userId,
      type: TransactionType.FIAT_WITHDRAWAL,
      amount: amountUsdt,
      status: TransactionStatus.PENDING,
      timestamp: Date.now(),
      description: `Fiat Withdrawal Request (${amountNgn.toLocaleString()} NGN)`
    });
  });
};

export const processFiatDecision = async (
  requestId: string,
  action: 'APPROVE' | 'REJECT',
  adminId: string,
  rejectionReason?: string
) => {
  const reqRef = doc(db, 'fiat_requests', requestId);
  
  await runTransaction(db, async (transaction) => {
    const reqSnap = await transaction.get(reqRef);
    if (!reqSnap.exists()) throw new Error("Request not found");
    const reqData = reqSnap.data() as FiatRequest;

    if (reqData.status !== TransactionStatus.PENDING) {
      throw new Error("Request is not pending");
    }

    const userRef = doc(db, 'users', reqData.userId);

    if (reqData.type === 'DEPOSIT') {
      if (action === 'APPROVE') {
        // Credit User
        transaction.update(userRef, { capitalBalance: increment(reqData.amountUsdt) });
        transaction.update(reqRef, { status: TransactionStatus.COMPLETED });

        // Add to main ledger
        const txRef = doc(collection(db, 'transactions'));
        transaction.set(txRef, {
          id: txRef.id,
          userId: reqData.userId,
          type: TransactionType.FIAT_DEPOSIT,
          amount: reqData.amountUsdt,
          status: TransactionStatus.COMPLETED,
          timestamp: Date.now(),
          description: `Fiat Deposit Approved (${reqData.amountNgn.toLocaleString()} NGN)`
        });

      } else {
        // Reject
        transaction.update(reqRef, { 
          status: TransactionStatus.REJECTED,
          rejectionReason: rejectionReason || 'Admin rejected request'
        });
      }
    } else {
      // WITHDRAWAL
      if (action === 'APPROVE') {
        transaction.update(reqRef, { status: TransactionStatus.COMPLETED });
        
        // Update main transaction status logic could go here if needed, 
        // but simple request status update is sufficient for this flow.
        
      } else {
        // REJECT -> Refund
        transaction.update(userRef, { profitBalance: increment(reqData.amountUsdt) });
        transaction.update(reqRef, { 
            status: TransactionStatus.REJECTED,
            rejectionReason: rejectionReason || 'Admin rejected request'
        });
        
        // Add refund record
        const txRef = doc(collection(db, 'transactions'));
        transaction.set(txRef, {
          id: txRef.id,
          userId: reqData.userId,
          type: TransactionType.BONUS, // Use Bonus or create REFUND type
          amount: reqData.amountUsdt,
          status: TransactionStatus.COMPLETED,
          timestamp: Date.now(),
          description: `Refund: Rejected Fiat Withdrawal`
        });
      }
    }
  });
};


// Giveaway System
export const createGiveawayPoolFirestore = async (pool: Omit<GiveawayPool, 'id' | 'claimsCount' | 'createdAt'>) => {
  const poolRef = doc(collection(db, 'giveawayPools'));
  const newPool: GiveawayPool = {
    ...pool,
    id: poolRef.id,
    claimsCount: 0,
    createdAt: Date.now()
  };
  await setDoc(poolRef, newPool);
  return newPool.id;
};

export const updateGiveawayPoolStatus = async (poolId: string, isActive: boolean) => {
  await updateDoc(doc(db, 'giveawayPools', poolId), { isActive });
};

export const deleteGiveawayPool = async (poolId: string) => {
  await deleteDoc(doc(db, 'giveawayPools', poolId));
};

export const processGiveawayClaimFirestore = async (userId: string, code: string) => {
  // 1. Find the pool
  const q = query(collection(db, 'giveawayPools'), where('code', '==', code.trim().toUpperCase()), where('isActive', '==', true), limit(1));
  const snap = await getDocs(q);
  
  if (snap.empty) throw new Error("Invalid or inactive bonus code.");
  
  // Use data() to safely get fields, fallback to doc.id if missing in data
  const poolData = snap.docs[0].data();
  const pool: GiveawayPool = { ...poolData, id: snap.docs[0].id } as GiveawayPool;

  if (pool.expiryDate && Date.now() > pool.expiryDate) throw new Error("This bonus code has expired.");
  if (pool.claimsCount >= pool.maxClaims) throw new Error("This reward pool has been fully claimed.");

  // 2. Check Eligibility (Deposit Check)
  if (pool.requireDeposit) {
    const txQ = query(collection(db, 'transactions'), where('userId', '==', userId));
    const txSnap = await getDocs(txQ);
    const hasDeposit = txSnap.docs.some(doc => {
      const data = doc.data();
      return (data.type === TransactionType.DEPOSIT || data.type === TransactionType.FIAT_DEPOSIT) && data.status === TransactionStatus.COMPLETED;
    });

    if (!hasDeposit) {
      throw new Error("Eligibility Error: You must complete at least one deposit to unlock bonus claims.");
    }
  }

  const claimId = `${pool.id}_${userId}`;
  const claimRef = doc(db, 'giveawayClaims', claimId);
  const userRef = doc(db, 'users', userId);
  const poolRef = doc(db, 'giveawayPools', pool.id);

  // 3. Execute Claim Transaction
  await runTransaction(db, async (transaction) => {
    // Check if already claimed
    const claimSnap = await transaction.get(claimRef);
    if (claimSnap.exists()) throw new Error("You have already claimed this bonus.");

    const freshPoolSnap = await transaction.get(poolRef);
    if (!freshPoolSnap.exists()) throw new Error("Pool unavailable.");
    
    const freshPool = freshPoolSnap.data() as GiveawayPool;
    if (freshPool.claimsCount >= freshPool.maxClaims) throw new Error("Rewards just ran out!");

    // Create Claim Record
    transaction.set(claimRef, {
      id: claimId,
      poolId: pool.id,
      userId,
      amount: pool.rewardPerUser,
      timestamp: Date.now()
    });

    // Increment Pool Counter
    transaction.update(poolRef, {
      claimsCount: increment(1)
    });

    // Credit User
    transaction.update(userRef, {
      profitBalance: increment(pool.rewardPerUser),
      totalEarned: increment(pool.rewardPerUser)
    });

    // Create Ledger Entry
    const txRef = doc(collection(db, 'transactions'));
    transaction.set(txRef, {
      id: txRef.id,
      userId,
      type: TransactionType.BONUS,
      amount: pool.rewardPerUser,
      status: TransactionStatus.COMPLETED,
      timestamp: Date.now(),
      description: `Giveaway Reward: ${pool.code}`
    });
  });
};

export const ensureGlobalReferralCode = async (userId: string, code: string) => {
  if (!code) return;
  const refCodeRef = doc(db, 'referral_codes', code);
  try {
    const snap = await getDoc(refCodeRef);
    if (!snap.exists()) {
      await setDoc(refCodeRef, { userId });
      // console.log(`Self-healed referral code index for ${code}`);
    }
  } catch (e) {
    console.warn("Error ensuring referral code:", e);
  }
};

const generateApiKey = () => {
    return 'pk_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export const createFirestoreUser = async (userId: string, email: string, refCode: string | undefined): Promise<User> => {
  try {
    const cleanRefCode = refCode ? refCode.trim().toUpperCase() : '';
    const userRef = doc(db, 'users', userId);
    const existingSnap = await getDoc(userRef);
    
    if (existingSnap.exists()) {
      return existingSnap.data() as User;
    }

    const wallet = await generateUserWallet();
    
    // Logic for auto-admin is removed for security. 
    // First user initialization is only to set system flag, not user rights.
    try {
      const configRef = doc(db, 'system', 'status');
      const configSnap = await getDoc(configRef);
      if (!configSnap.exists()) {
        await setDoc(configRef, { initialized: true, rootId: userId });
      }
    } catch (e) {
      console.warn("System config read failed during signup.");
    }

    const referralCode = (email.split('@')[0].toUpperCase() + Math.floor(Math.random() * 1000)).replace(/[^A-Z0-9]/g, '');

    // 1. Resolve Referrer (Robust Method)
    let validReferrerId: string | null = null;
    let finalReferredBy = '';

    if (cleanRefCode) {
        try {
            // A. Try Direct Fast Lookup
            const referrerSnap = await getDoc(doc(db, 'referral_codes', cleanRefCode));
            if (referrerSnap.exists()) {
                validReferrerId = referrerSnap.data().userId;
                finalReferredBy = cleanRefCode;
            } else {
                // B. Fallback: Deep Search in Users collection (Self-Healing)
                const q = query(collection(db, 'users'), where('referralCode', '==', cleanRefCode), limit(1));
                const qSnap = await getDocs(q);
                if (!qSnap.empty) {
                    validReferrerId = qSnap.docs[0].id;
                    finalReferredBy = cleanRefCode;
                    // Fix the missing index for future lookups
                    setDoc(doc(db, 'referral_codes', cleanRefCode), { userId: validReferrerId });
                }
            }
        } catch (err) {
            console.warn("Referral resolution failed:", err);
        }
    }

    const newUser: User = {
      id: userId,
      email,
      referralCode,
      referredBy: finalReferredBy, // Only set if validated
      usdtDepositAddress: wallet.address.base58,
      depositPrivateKey: wallet.privateKey,
      capitalBalance: 0,
      profitBalance: 0,
      totalEarned: 0,
      isActive: true,
      isAdmin: false, // FORCE FALSE for all new users
      referralCount: 0,
      referralEarnings: 0,
      welcomeBonus: 100,
      joinedAt: Date.now(),
      whatsappShares: 0,
      lastWhatsappShare: 0,
      apiKey: generateApiKey()
    };
    
    // 2. Create the user document
    await setDoc(userRef, newUser);
    
    // 3. Register the new referral code globally
    await setDoc(doc(db, 'referral_codes', referralCode), { userId });

    // 4. Create Linkage Record
    if (validReferrerId && finalReferredBy) {
        try {
            const refRecord: ReferralRecord = {
                userId,
                email,
                referredBy: finalReferredBy,
                joinedAt: Date.now(),
                status: 'active',
                totalCommissions: 0
            };
            
            // Link in 'referrals' collection
            await setDoc(doc(db, 'referrals', userId), refRecord);
            
            // Increment count on referrer
            await updateDoc(doc(db, 'users', validReferrerId), {
                referralCount: increment(1)
            });
        } catch (refErr) {
            console.error("Critical: Failed to link referral record", refErr);
        }
    }

    return newUser;
  } catch (err: any) {
    throw new Error(err.message || "Profile Provisioning Error");
  }
};

export const regenerateUserApiKey = async (userId: string) => {
    const newKey = generateApiKey();
    await updateDoc(doc(db, 'users', userId), { apiKey: newKey });
    return newKey;
};

export const fetchAllUsersFirestore = async (): Promise<User[]> => {
  const querySnapshot = await getDocs(collection(db, 'users'));
  return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as User));
};

export const toggleUserAdminFirestore = async (userId: string, currentStatus: boolean) => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, { isAdmin: !currentStatus });
};

export const adminCreditUserFirestore = async (targetUserId: string, amount: number, type: 'capital' | 'profit') => {
  if (!amount || isNaN(amount) || amount <= 0) throw new Error("Invalid amount");
  
  const userRef = doc(db, 'users', targetUserId);
  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) throw new Error("User not found");
    
    const update = type === 'capital' ? { capitalBalance: increment(amount) } : { profitBalance: increment(amount) };
    transaction.update(userRef, update);
    
    // NOTE: This requires Admin 'create' permission in Security Rules
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
    const q = query(
        collection(db, 'transactions'), 
        where('userId', '==', userId), 
        where('txHash', '==', dep.hash)
    );
    const existing = await getDocs(q);
    if (existing.empty) {
      await runTransaction(db, async (transaction) => {
        transaction.update(userRef, { capitalBalance: increment(dep.amount) });
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

export const processExternalDeposit = async (userId: string, amount: number, externalTxId: string) => {
  const q = query(
      collection(db, 'transactions'), 
      where('userId', '==', userId), 
      where('txHash', '==', externalTxId)
  );
  const snap = await getDocs(q);
  if (!snap.empty) return;

  const userRef = doc(db, 'users', userId);
  await runTransaction(db, async (transaction) => {
    transaction.update(userRef, { capitalBalance: increment(amount) });
    const txRef = doc(collection(db, 'transactions'));
    transaction.set(txRef, {
      id: txRef.id,
      userId,
      type: TransactionType.DEPOSIT,
      amount: amount,
      status: TransactionStatus.COMPLETED,
      txHash: externalTxId,
      timestamp: Date.now(),
      description: `Gateway Deposit (ID: ${externalTxId.slice(0, 8)})`
    });
  });
};

export const requestWithdrawalFirestore = async (userId: string, amount: number, address: string) => {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) throw new Error("User profile not synced.");
  const userData = userSnap.data() as User;
  if (userData.profitBalance < amount) throw new Error("Insufficient profit balance.");
  const txRef = await addDoc(collection(db, 'transactions'), {
    userId,
    type: TransactionType.WITHDRAWAL,
    amount,
    status: TransactionStatus.PENDING,
    timestamp: Date.now(),
    description: `Withdrawal request to ${address}`
  });
  await updateDoc(userRef, { profitBalance: increment(-amount) });
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
    const errorMsg = err?.message || 'Unknown blockchain error';
    await updateDoc(userRef, { profitBalance: increment(txData.amount) });
    await updateDoc(txRef, {
      status: TransactionStatus.REJECTED,
      description: `Blockchain Error: ${errorMsg}`
    });
    throw new Error(errorMsg);
  }
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
    const result = await executeWalletSweep(userPrivateKey, userAddress, hotWalletPrivateKey, hotWalletAddress, amount);
    await addDoc(collection(db, 'transactions'), {
      id: `sweep-${Date.now()}`,
      userId,
      type: TransactionType.SWEEP,
      amount: amount,
      status: TransactionStatus.COMPLETED,
      txHash: result.sweepTx,
      timestamp: Date.now(),
      description: `Admin Sweep to Hot Wallet`
    });
    return result.sweepTx;
  } catch (err: any) {
    throw new Error(err.message || "Sweep failed");
  }
};

export const updateUserProfileFirestore = async (userId: string, data: Partial<User>) => {
  await updateDoc(doc(db, 'users', userId), data);
};

export const updatePlatformSettingsFirestore = async (settings: Partial<AppState['platformSettings']>) => {
  await setDoc(doc(db, 'system', 'settings'), settings, { merge: true });
};

// HELPER: Find User by Referral Code (for commission logic)
const findUserByReferralCode = async (code: string) => {
  // Try direct lookup first
  const codeSnap = await getDoc(doc(db, 'referral_codes', code));
  if (codeSnap.exists()) {
      const userId = codeSnap.data().userId;
      const userSnap = await getDoc(doc(db, 'users', userId));
      if (userSnap.exists()) {
          return { ref: userSnap.ref, data: userSnap.data() as User, id: userId };
      }
  }

  // Fallback to query
  const q = query(collection(db, 'users'), where('referralCode', '==', code), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  // FOUND VIA QUERY - Auto-fix index
  const foundUser = snap.docs[0];
  try {
      await setDoc(doc(db, 'referral_codes', code), { userId: foundUser.id });
  } catch(e) { console.warn("Index auto-fix failed", e); }
  
  return { ref: foundUser.ref, data: foundUser.data() as User, id: foundUser.id };
};

export const purchasePackageFirestore = async (userId: string, pkgId: string, currentPackages: Package[]) => {
  console.log(`[Purchase] Start for user ${userId}, node ${pkgId}`);
  const pkg = currentPackages.find(p => p.id === pkgId);
  if (!pkg) throw new Error("Invalid Package Configuration");
  
  // 1. Resolve Upline IDs and Configs BEFORE transaction (Read Phase)
  let uplineData: { userId: string; percentage: number; level: number }[] = [];
  
  try {
      const settingsRef = doc(db, 'system', 'settings');
      const settingsSnap = await getDoc(settingsRef);
      const settings = settingsSnap.exists() ? settingsSnap.data() as AppState['platformSettings'] : null;
      const isReferralEnabled = settings?.isReferralSystemEnabled !== false;
      const activeLevels = settings?.referralLevels && settings.referralLevels.length > 0 
          ? settings.referralLevels 
          : REF_LEVELS;

      if (isReferralEnabled) {
          const userRef = doc(db, 'users', userId);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
              const userData = userSnap.data() as User;
              let currentReferrerCode = userData.referredBy;

              // Fallback: If referredBy is missing in User doc, check 'referrals' collection
              if (!currentReferrerCode) {
                 const refLinkSnap = await getDoc(doc(db, 'referrals', userId));
                 if (refLinkSnap.exists()) {
                    currentReferrerCode = (refLinkSnap.data() as ReferralRecord).referredBy;
                 }
              }
              
              const sortedLevels = [...activeLevels].sort((a,b) => a.level - b.level);

              for (const levelConfig of sortedLevels) {
                  if (!currentReferrerCode) break;
                  
                  const uplineUser = await findUserByReferralCode(currentReferrerCode);
                  if (uplineUser) {
                      // Prevent Self-Referral
                      if (uplineUser.id === userId) break; 
                      
                      uplineData.push({
                          userId: uplineUser.id,
                          percentage: levelConfig.percentage,
                          level: levelConfig.level
                      });
                      currentReferrerCode = uplineUser.data.referredBy;
                  } else {
                      break;
                  }
              }
          }
      }
  } catch (err) {
      console.warn("Referral resolution error:", err);
  }

  const cost = pkg.minAmount;
  const now = new Date();
  const next1AM = new Date(now);
  next1AM.setHours(1, 0, 0, 0);
  if (now.getTime() >= next1AM.getTime()) next1AM.setDate(next1AM.getDate() + 1);
  const scheduledLastPayout = next1AM.getTime() - (24 * 60 * 60 * 1000);

  // 2. SINGLE ATOMIC TRANSACTION
  await runTransaction(db, async (transaction) => {
    // A. READS
    const userRef = doc(db, 'users', userId);
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) throw new Error("User does not exist!");
    const userData = userSnap.data() as User;

    const uplineSnaps = await Promise.all(
        uplineData.map(u => transaction.get(doc(db, 'users', u.userId)))
    );

    // B. CHECKS
    if (userData.capitalBalance < cost) throw new Error(`Insufficient balance. Required: ${cost.toFixed(2)} USDT`);

    // C. WRITES - BUYER
    transaction.update(userRef, { 
        capitalBalance: increment(-cost)
    });

    const activePkgRef = doc(collection(db, 'activePackages'));
    transaction.set(activePkgRef, { 
        id: activePkgRef.id, 
        packageId: pkg.id, 
        amount: pkg.minAmount, 
        activatedAt: Date.now(), 
        lastPayoutAt: scheduledLastPayout, 
        isActive: true, 
        totalEarned: 0, 
        userId 
    });

    const txRef = doc(collection(db, 'transactions'));
    transaction.set(txRef, { 
        id: txRef.id, 
        userId, 
        type: TransactionType.PURCHASE, 
        amount: cost, 
        status: TransactionStatus.COMPLETED, 
        timestamp: Date.now(), 
        description: `Node Activation: ${pkg.name}` 
    });

    // D. WRITES - UPLINES (Referrals)
    uplineData.forEach((upline, index) => {
        const upSnap = uplineSnaps[index];
        if (upSnap.exists()) {
            const commission = cost * (upline.percentage / 100);
            if (commission > 0) {
                const upRef = doc(db, 'users', upline.userId);
                
                transaction.update(upRef, {
                    profitBalance: increment(commission),
                    referralEarnings: increment(commission),
                    totalEarned: increment(commission)
                });

                const refTxRef = doc(collection(db, 'transactions'));
                transaction.set(refTxRef, {
                    id: refTxRef.id,
                    userId: upline.userId,
                    type: TransactionType.REFERRAL,
                    amount: commission,
                    status: TransactionStatus.COMPLETED,
                    timestamp: Date.now(),
                    description: `L${upline.level} Commission from ${userData.email}`
                });

                if (upline.level === 1) {
                    const referralRecordRef = doc(db, 'referrals', userId); 
                    // Use SET with MERGE to safely update or create if missing
                    transaction.set(referralRecordRef, {
                        totalCommissions: increment(commission)
                    }, { merge: true });
                }
            }
        }
    });
  });
};

export const processDailyRoiFirestore = async (settings: any, currentPackages: Package[], userId?: string) => {
  if (!settings.isRoiEnabled || settings.platformPaused) return;

  // Optimized Query: Only fetch specific user's packages if userId is provided
  let activePkgsQuery;
  if (userId) {
     activePkgsQuery = query(collection(db, 'activePackages'), where('userId', '==', userId), where('isActive', '==', true));
  } else {
     activePkgsQuery = query(collection(db, 'activePackages'), where('isActive', '==', true));
  }

  const activePkgsSnap = await getDocs(activePkgsQuery);
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  for (const docSnap of activePkgsSnap.docs) {
    const ap = docSnap.data() as UserPackage;
    const pkg = currentPackages.find(p => p.id === ap.packageId);
    if (!pkg || pkg.isActive === false) continue;

    const lastPayout = ap.lastPayoutAt || ap.activatedAt;
    const timeDiff = now - lastPayout;

    // Check if at least 24 hours have passed
    if (timeDiff >= ONE_DAY_MS) {
        // Calculate exact number of payout cycles missed (Catch-Up Logic)
        const intervals = Math.floor(timeDiff / ONE_DAY_MS);
        
        if (intervals > 0) {
            const dailyPercent = settings.roiOverride || pkg.dailyRoi;
            const singleDayEarnings = ap.amount * (dailyPercent / 100);
            const totalEarnings = singleDayEarnings * intervals;
            
            // Calculate new lastPayoutAt based on missed intervals to prevent time drift
            // (e.g., if paid at 10:00 AM, next pay should be 10:00 AM next day, even if script runs at 10:05 AM)
            const newLastPayoutAt = lastPayout + (intervals * ONE_DAY_MS);

            await runTransaction(db, async (transaction) => {
                const userRef = doc(db, 'users', ap.userId);
                const userSnap = await transaction.get(userRef);
                if (!userSnap.exists()) return;

                transaction.update(userRef, { 
                    profitBalance: increment(totalEarnings), 
                    totalEarned: increment(totalEarnings) 
                });
                
                transaction.update(doc(db, 'activePackages', docSnap.id), { 
                    totalEarned: increment(totalEarnings), 
                    lastPayoutAt: newLastPayoutAt 
                });
                
                const txRef = doc(collection(db, 'transactions'));
                transaction.set(txRef, { 
                    id: txRef.id, 
                    userId: ap.userId, 
                    type: TransactionType.ROI, 
                    amount: totalEarnings, 
                    status: TransactionStatus.COMPLETED, 
                    timestamp: now, 
                    description: `Daily Yield (x${intervals}) from ${pkg.name}` 
                });
            });
        }
    }
  }
};

export const performWhatsappShareTask = async (userId: string) => {
  const settingsRef = doc(db, 'system', 'settings');
  const userRef = doc(db, 'users', userId);

  await runTransaction(db, async (transaction) => {
    const settingsSnap = await transaction.get(settingsRef);
    const userSnap = await transaction.get(userRef);

    if (!userSnap.exists()) throw new Error("User not found");
    const user = userSnap.data() as User;
    
    const settings = settingsSnap.exists() ? settingsSnap.data() : {};
    const taskConfig = settings.whatsappConfig as WhatsappTaskConfig | undefined;

    // 1. Check if Enabled
    if (!taskConfig || !taskConfig.enabled) {
      throw new Error("Task is currently disabled by administrator.");
    }

    // 2. Check Lifetime Limit
    const currentShares = user.whatsappShares || 0;
    if (currentShares >= taskConfig.maxLifetimeShares) {
      throw new Error(`Maximum lifetime shares (${taskConfig.maxLifetimeShares}) reached.`);
    }

    // 3. Check Cooldown
    const lastShare = user.lastWhatsappShare || 0;
    const now = Date.now();
    const cooldownMs = taskConfig.cooldownHours * 60 * 60 * 1000;
    const timeSinceLast = now - lastShare;

    if (timeSinceLast < cooldownMs) {
      const hoursRemaining = Math.ceil((cooldownMs - timeSinceLast) / (60 * 60 * 1000));
      throw new Error(`Cooldown active. Try again in ${hoursRemaining} hours.`);
    }

    // 4. Execute Reward
    transaction.update(userRef, {
      whatsappShares: increment(1),
      lastWhatsappShare: now,
      profitBalance: increment(taskConfig.rewardAmount),
      totalEarned: increment(taskConfig.rewardAmount)
    });

    const txRef = doc(collection(db, 'transactions'));
    transaction.set(txRef, {
      id: txRef.id,
      userId,
      type: TransactionType.TASK_REWARD,
      amount: taskConfig.rewardAmount,
      status: TransactionStatus.COMPLETED,
      timestamp: now,
      description: `Task Reward: WhatsApp Share`
    });
  });
};
