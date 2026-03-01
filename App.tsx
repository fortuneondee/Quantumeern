import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  sendPasswordResetEmail
} from 'firebase/auth';
import { 
  doc, 
  onSnapshot, 
  collection, 
  query, 
  where,
  orderBy
} from 'firebase/firestore';
import { auth, db } from './firebase.ts';
import { 
  AppState, 
  User, 
  Transaction, 
  UserPackage,
  Package, 
  GiveawayPool,
  PaymentSettings,
  ReferralRecord,
  GuideConfig
} from './types.ts';
import { 
  createFirestoreUser, 
  purchasePackageFirestore,
  processDailyRoiFirestore,
  updateUserProfileFirestore,
  syncUserDepositsFirestore,
  requestWithdrawalFirestore,
  updatePlatformSettingsFirestore,
  processGiveawayClaimFirestore,
  ensureGlobalReferralCode
} from './store.ts';
import Layout from './components/Layout.tsx';
import Dashboard from './components/Dashboard.tsx';
import Wallet from './components/Wallet.tsx';
import AdminPanel from './components/AdminPanel.tsx';
import Profile from './components/Profile.tsx';
import LandingPage from './components/LandingPage.tsx'; 
import GuideModal from './components/GuideModal.tsx';
import PwaInstallPrompt from './components/PwaInstallPrompt.tsx';
import { ThemeProvider } from './ThemeContext.tsx';
import { INITIAL_PACKAGES, REF_LEVELS, DEFAULT_GUIDE_CONFIG, APP_NAME as DEFAULT_APP_NAME } from './constants.tsx';
import { motion, AnimatePresence } from 'framer-motion';
import html2canvas from 'html2canvas';

const MaintenanceScreen = ({ onLogout }: { onLogout: () => void }) => (
  <div className="min-h-screen bg-app-bg flex flex-col items-center justify-center p-6 text-center space-y-8 z-50 relative">
    <div className="w-24 h-24 bg-app-accent/10 rounded-full flex items-center justify-center animate-pulse">
      <i className="fa-solid fa-screwdriver-wrench text-4xl text-app-accent"></i>
    </div>
    <div className="space-y-4 max-w-lg">
      <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter text-app-text">
        System <br/> Maintenance
      </h1>
      <p className="serif italic text-xl text-app-muted">
        The platform is currently paused for upgrades. Your assets are secure. Please check back shortly.
      </p>
    </div>
    <button 
      onClick={onLogout}
      className="px-8 py-3 border border-app-border text-[10px] font-black uppercase tracking-widest text-app-muted hover:text-app-text hover:border-app-text transition-colors"
    >
      Log Out
    </button>
  </div>
);

// ROBUST SANITIZER WITH CYCLE DETECTION
const sanitizeValue = (val: any, seen = new WeakSet()): any => {
    if (!val) return val;
    if (typeof val === 'function') return null;
    if (typeof val.toMillis === 'function') return val.toMillis();
    
    // Handle References (Duck typing check for Firestore Reference)
    if (typeof val === 'object' && typeof val.path === 'string' && typeof val.id === 'string' && 'firestore' in val) {
        return val.path;
    }

    if (typeof val === 'object') {
        if (seen.has(val)) return null; // Break cycle
        seen.add(val);
        
        if (Array.isArray(val)) {
            return val.map(v => sanitizeValue(v, seen));
        }

        // Strip Firestore internals/complex types that might cause issues
        if ('firestore' in val || '_key' in val || 'converter' in val || 'query' in val) return null;
        
        const cleanObj: any = {};
        Object.keys(val).forEach(k => {
            const cleaned = sanitizeValue(val[k], seen);
            if (cleaned !== undefined && cleaned !== null) {
                cleanObj[k] = cleaned;
            }
        });
        return cleanObj;
    }
    return val;
};

const sanitizeDoc = (docSnap: any) => {
    if (!docSnap.exists()) return null;
    const data = docSnap.data();
    const clean: any = { id: docSnap.id };
    
    // Create a new WeakSet for each document to track cycles within that document
    const seen = new WeakSet();
    
    Object.keys(data).forEach(key => {
        clean[key] = sanitizeValue(data[key], seen);
    });
    return clean;
};

// --- FLIP CARD COMPONENT ---
interface NodeCardProps {
  pkg: Package;
  user: User;
  activePackages: UserPackage[];
  onPurchase: (id: string) => void;
  appName: string;
}

const NodeCard: React.FC<NodeCardProps> = ({ 
    pkg, 
    user, 
    activePackages, 
    onPurchase,
    appName
}) => {
    const [isFlipped, setIsFlipped] = useState(false);
    const [isSharing, setIsSharing] = useState(false);
    
    // Check if user owns this package type (just for display purposes, e.g. a badge)
    const ownedCount = activePackages.filter(ap => ap.packageId === pkg.id && ap.isActive).length;
    
    let isDisabled = false;
    let buttonText = "Deploy";
    let isLocked = false;
    let cost = pkg.minAmount;

    // Basic logic: If user can't afford, show locked state
    if (user.capitalBalance < cost) { 
        isLocked = true; 
        isDisabled = true; 
        buttonText = "Locked"; 
    }
    
    // Fallback Image
    const displayImage = pkg.imageUrl || "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop";

    const handleShare = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isSharing) return;
        setIsSharing(true);

        const cardElement = document.getElementById(`node-card-${pkg.id}`);
        if (cardElement) {
            try {
                // Use html2canvas to screenshot the specific card
                const canvas = await html2canvas(cardElement, { 
                    useCORS: true, 
                    backgroundColor: null, // Transparent bg if possible
                    scale: 2 // Higher quality
                });
                
                const dataUrl = canvas.toDataURL('image/png');
                const blob = await (await fetch(dataUrl)).blob();
                const file = new File([blob], `${pkg.name.replace(/\s+/g, '_')}_Node.png`, { type: 'image/png' });

                // Try native share first
                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({
                            title: pkg.name,
                            text: `Check out the ${pkg.name} on ${appName}! ROI: ${pkg.dailyRoi}% Daily.`,
                            files: [file]
                        });
                    } catch (shareError: any) {
                         // Fallback to download for errors (like gesture timeout or permission issues)
                         if (shareError.name !== 'AbortError') {
                             const link = document.createElement('a');
                             link.download = `${pkg.name}_Node.png`;
                             link.href = dataUrl;
                             link.click();
                         }
                    }
                } else {
                    // Fallback download if share API not supported
                    const link = document.createElement('a');
                    link.download = `${pkg.name}_Node.png`;
                    link.href = dataUrl;
                    link.click();
                }
            } catch (err) {
                console.error("Share generation failed:", err);
                alert("Could not generate image.");
            }
        }
        setIsSharing(false);
    };

    return (
        <div className="aspect-square perspective-[1000px] group/card" id={`node-card-${pkg.id}`}>
            <motion.div
                className="w-full h-full relative"
                initial={false}
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
                style={{ transformStyle: "preserve-3d" }}
            >
                {/* FRONT FACE (IMAGE) */}
                <div 
                    className="absolute inset-0 w-full h-full border border-transparent bg-app-bg cursor-pointer group-hover/card:border-app-accent transition-colors overflow-hidden"
                    style={{ backfaceVisibility: "hidden" }}
                    onClick={() => setIsFlipped(true)}
                >
                    <img src={displayImage} alt={pkg.name} className="w-full h-full object-cover opacity-80 group-hover/card:opacity-100 transition-opacity duration-500 scale-100 group-hover/card:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-90" />
                    
                    {/* Tiny Share Icon */}
                    <button 
                        onClick={handleShare}
                        className="absolute top-3 left-3 z-20 w-6 h-6 flex items-center justify-center text-white/50 hover:text-white transition-colors bg-black/20 hover:bg-black/50 rounded-full backdrop-blur-sm"
                        title="Share Node Card"
                    >
                        {isSharing ? (
                            <i className="fa-solid fa-circle-notch fa-spin text-[10px]"></i>
                        ) : (
                            <i className="fa-solid fa-share-nodes text-[10px]"></i>
                        )}
                    </button>

                    <div className="absolute bottom-0 left-0 right-0 p-3 md:p-8 space-y-1 md:space-y-2">
                        <div className="flex justify-between items-end">
                            <div className="flex-1 min-w-0 pr-2">
                                <h3 className="text-sm md:text-xl font-black uppercase tracking-tighter text-white truncate">{pkg.name}</h3>
                                <p className="text-[8px] md:text-[10px] font-bold uppercase tracking-widest text-white/60">ROI: {pkg.dailyRoi}% Daily</p>
                            </div>
                            <div className="w-8 h-8 md:w-10 md:h-10 border border-white/20 rounded-full flex items-center justify-center bg-white/5 backdrop-blur-sm shrink-0">
                                <i className="fa-solid fa-arrow-right text-white text-[10px] md:text-xs -rotate-45 group-hover/card:rotate-0 transition-transform"></i>
                            </div>
                        </div>
                    </div>

                    {ownedCount > 0 && (
                        <div className="absolute top-3 right-3 md:top-4 md:right-4 px-2 md:px-3 py-1 bg-green-500 text-white text-[8px] md:text-[9px] font-black uppercase tracking-widest">
                            Owned x{ownedCount}
                        </div>
                    )}
                </div>

                {/* BACK FACE (DETAILS) */}
                <div 
                    className={`absolute inset-0 w-full h-full border border-app-border bg-app-bg p-3 md:p-12 flex flex-col justify-between ${isDisabled && !isLocked ? 'opacity-50 grayscale' : ''}`}
                    style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                    onClick={() => setIsFlipped(false)}
                >
                     {/* Close / Flip Back Button */}
                     <button 
                        onClick={(e) => { e.stopPropagation(); setIsFlipped(false); }}
                        className="absolute top-2 right-2 md:top-4 md:right-4 text-app-muted hover:text-app-text transition-colors z-20 p-2"
                     >
                        <i className="fa-solid fa-rotate-left"></i>
                     </button>

                     {isLocked && (
                       <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-app-bg/80 backdrop-blur-[2px]">
                          <div className="w-10 h-10 md:w-16 md:h-16 rounded-full bg-app-bg border border-app-border flex items-center justify-center shadow-xl mb-2 md:mb-4"><i className="fa-solid fa-lock text-sm md:text-xl text-app-muted"></i></div>
                          <div className="px-2 md:px-3 py-1 bg-app-bg border border-app-border text-[8px] font-black uppercase tracking-widest text-app-muted">Unlock: ${cost.toFixed(0)}</div>
                       </div>
                     )}

                     <div className={`space-y-1.5 md:space-y-8 h-full flex flex-col ${isLocked ? 'opacity-30 blur-[1px]' : ''}`}>
                       <div className="flex justify-between items-start pt-2">
                         <h3 className="text-[9px] md:text-xs font-black uppercase tracking-[0.2em] truncate pr-4 max-w-[70%]">{pkg.name}</h3>
                         {ownedCount > 0 && <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-green-500 text-white">x{ownedCount} Active</span>}
                       </div>
                       
                       <div className="space-y-0.5 md:space-y-1">
                         <p className="text-xl md:text-6xl font-black mono tracking-tighter leading-none">${(pkg.minAmount * pkg.dailyRoi / 100).toFixed(2)}</p>
                         <p className="text-[7px] md:text-[8px] font-black uppercase tracking-widest opacity-60">Daily Return</p>
                       </div>
                       
                       <p className="text-[8px] md:text-sm font-medium opacity-60 line-clamp-2 md:line-clamp-none leading-tight">{pkg.description}</p>
                       
                       <div className="mt-auto space-y-2 md:space-y-4 pt-2">
                         <div className="flex justify-between border-b border-app-border pb-1 md:pb-2">
                           <span className="text-[7px] md:text-[8px] font-bold uppercase opacity-60">Lease Cost</span>
                           <span className="text-[8px] md:text-[10px] font-bold mono">${pkg.minAmount}</span>
                         </div>
                         <button 
                            onClick={(e) => { e.stopPropagation(); !isDisabled && onPurchase(pkg.id); }} 
                            disabled={isDisabled} 
                            className={`w-full py-2 md:py-3 border text-[8px] font-black uppercase tracking-[0.2em] border-app-border flex items-center justify-center gap-2 ${!isDisabled ? 'hover:bg-app-accent hover:text-app-accent-text hover:border-app-accent-text' : ''}`}
                         >
                          {buttonText}
                         </button>
                       </div>
                     </div>
                </div>
            </motion.div>
        </div>
    );
};

const AppContent: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activePackages, setActivePackages] = useState<UserPackage[]>([]);
  const [dynamicPackages, setDynamicPackages] = useState<Package[]>([]);
  const [giveawayPools, setGiveawayPools] = useState<GiveawayPool[]>([]);
  const [myReferrals, setMyReferrals] = useState<ReferralRecord[]>([]);
  const [platformSettings, setPlatformSettings] = useState<AppState['platformSettings']>({
    appName: DEFAULT_APP_NAME,
    isRoiEnabled: true,
    isReferralSystemEnabled: true,
    referralLevels: REF_LEVELS,
    minWithdrawal: 10,
    platformPaused: false,
    guideConfig: DEFAULT_GUIDE_CONFIG,
    fiatDepositEnabled: false,
    fiatWithdrawalEnabled: false,
    depositRateNgn: 1500,
    withdrawalRateNgn: 1400,
    withdrawalTickerEnabled: true
  });
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>({
    isEnabled: false,
    provider: 'NOWPAYMENTS',
    apiKey: '',
    publicKey: '',
    ipnSecret: ''
  });
  const [korapaySettings, setKorapaySettings] = useState<any>({
    publicKey: '',
    secretKey: '',
    webhookSecret: '',
    mode: 'sandbox',
    depositsEnabled: false,
    minDeposit: 1000,
    depositChargeType: 'none',
    depositChargeValue: 0
  });

  const [view, setView] = useState<string>('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [refCode, setRefCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot-password'>('login');
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  
  const [showLanding, setShowLanding] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const isInitialized = useRef(false);

  const [bonusCode, setBonusCode] = useState('');
  const [isClaimingBonus, setIsClaimingBonus] = useState(false);
  
  const [purchaseModal, setPurchaseModal] = useState<{
    pkgId: string;
    name: string;
    cost: number;
    action: string;
    type: 'PURCHASE' | 'INSUFFICIENT';
  } | null>(null);
  const [isProcessingPurchase, setIsProcessingPurchase] = useState(false);

  const appName = platformSettings.appName || DEFAULT_APP_NAME;

  useEffect(() => {
    document.title = `${appName} | Private USDT Staking`;
  }, [appName]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refParam = params.get('ref');
    if (refParam) {
      setRefCode(refParam.toUpperCase());
      setAuthMode('register');
      setShowLanding(false);
    }
  }, []);

  // --- 1. Public Data Listeners (Packages, Settings) ---
  useEffect(() => {
    // Packages - Generally Public
    const unsubPkgs = onSnapshot(collection(db, 'packages'), 
      (snap) => {
        const pkgs = snap.docs.map(d => sanitizeDoc(d) as Package);
        pkgs.sort((a,b) => a.minAmount - b.minAmount);
        setDynamicPackages(pkgs.length > 0 ? pkgs : INITIAL_PACKAGES);
      },
      (err) => console.log("Public packages not available, using defaults.")
    );

    // Platform Settings - Public Read likely needed for maintenance mode check
    const unsubSettings = onSnapshot(doc(db, 'system', 'settings'), 
      (docSnap) => { 
        if (docSnap.exists()) {
           const sanitizedData = sanitizeDoc(docSnap) as Partial<AppState['platformSettings']>;
           const { id, ...settingsData } = sanitizedData as any;
           if (!settingsData.guideConfig) settingsData.guideConfig = DEFAULT_GUIDE_CONFIG;
           if (!settingsData.appName) settingsData.appName = DEFAULT_APP_NAME;
           setPlatformSettings(prev => ({ ...prev, ...settingsData })); 
        }
      },
      (err) => console.log("System settings access denied (Guest). Using defaults.")
    );

    return () => { unsubPkgs(); unsubSettings(); };
  }, []);

  // --- 2. Authenticated Data Listeners (Payments, Pools) ---
  // Only subscribe when user is logged in to avoid permission errors
  useEffect(() => {
    if (!currentUser) return;

    const unsubPayments = onSnapshot(doc(db, 'system', 'payments'), 
      (docSnap) => { 
        if (docSnap.exists()) {
            const sanitizedData = sanitizeDoc(docSnap) as PaymentSettings;
            setPaymentSettings(sanitizedData); 
        }
      },
      (err) => console.warn("Payment settings restricted")
    );

    const unsubPools = onSnapshot(collection(db, 'giveawayPools'), 
      (snap) => { 
        const pools = snap.docs.map(d => sanitizeDoc(d) as GiveawayPool);
        pools.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setGiveawayPools(pools); 
      },
      (err) => console.warn("Pool access restricted")
    );

    const unsubKorapay = onSnapshot(doc(db, 'system', 'korapay'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = sanitizeDoc(docSnap);
          setKorapaySettings(data);
        }
      },
      (err) => console.warn("Korapay settings restricted")
    );

    return () => { unsubPayments(); unsubPools(); unsubKorapay(); };
  }, [currentUser]);

  // --- 3. User Authentication & Profile Listeners ---
  useEffect(() => {
    let unsubUser: (() => void) | null = null;
    let unsubTx: (() => void) | null = null;
    let unsubPk: (() => void) | null = null;
    let unsubRefs: (() => void) | null = null;
    let currentReferralCodeListener: string | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthError(null);
      if (unsubUser) unsubUser();
      if (unsubTx) unsubTx();
      if (unsubPk) unsubPk();
      if (unsubRefs) unsubRefs();
      currentReferralCodeListener = null;

      if (firebaseUser) {
        setIsLoading(true);
        setShowLanding(false);
        
        const userRef = doc(db, 'users', firebaseUser.uid);
        unsubUser = onSnapshot(userRef, async (docSnap) => {
          if (docSnap.exists()) {
            const userData = sanitizeDoc(docSnap) as User;
            setCurrentUser(userData);
            setIsProvisioning(false);
            setIsLoading(false);

            if (userData.referralCode) {
               ensureGlobalReferralCode(userData.id, userData.referralCode);
            }
            
            if (!isInitialized.current) {
              if (view === 'auth') setView('dashboard');
              if (platformSettings.guideConfig?.enabled) {
                 setShowGuide(true);
              }
              isInitialized.current = true;
            }
            
            if (userData.referralCode && userData.referralCode !== currentReferralCodeListener) {
                if (unsubRefs) unsubRefs();
                currentReferralCodeListener = userData.referralCode;
                
                const q = query(
                    collection(db, 'referrals'), 
                    where('referredBy', '==', userData.referralCode)
                );
                
                unsubRefs = onSnapshot(q, 
                  (snap) => { 
                      const refs = snap.docs.map(d => sanitizeDoc(d) as ReferralRecord);
                      refs.sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0));
                      setMyReferrals(refs); 
                  },
                  (err) => console.warn("Referral listener restricted:", err.message)
                );
            }

          } else {
            setIsProvisioning(true);
            setIsLoading(false);
          }
        }, (err) => {
          console.error("Profile listen error:", err.message);
          setAuthError("Session synchronization error: " + err.message);
          setIsLoading(false);
        });

        unsubTx = onSnapshot(
          query(collection(db, 'transactions'), where('userId', '==', firebaseUser.uid)), 
          (snap) => {
            const txs = snap.docs.map(d => sanitizeDoc(d) as Transaction);
            setTransactions(txs.sort((a, b) => b.timestamp - a.timestamp));
          },
          (err) => console.warn("Tx listener restricted")
        );

        unsubPk = onSnapshot(
          query(collection(db, 'activePackages'), where('userId', '==', firebaseUser.uid)), 
          (snap) => {
            const pkgs = snap.docs.map(d => sanitizeDoc(d) as UserPackage);
            setActivePackages(pkgs);
          },
          (err) => console.warn("Active Pkg listener restricted")
        );

      } else {
        setCurrentUser(null);
        setTransactions([]);
        setActivePackages([]);
        setMyReferrals([]);
        setView('auth');
        setIsLoading(false);
        setIsProvisioning(false);
        setShowLanding(true);
        isInitialized.current = false;
        setShowGuide(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubUser) unsubUser();
      if (unsubTx) unsubTx();
      if (unsubPk) unsubPk();
      if (unsubRefs) unsubRefs();
    };
  }, [platformSettings.guideConfig]); 

  // AUTOMATIC ROI PROCESSING
  useEffect(() => {
    if (!currentUser || platformSettings.platformPaused || !platformSettings.isRoiEnabled) return;

    const runRoiCheck = async () => {
        try {
            await processDailyRoiFirestore(platformSettings, dynamicPackages, currentUser.id);
        } catch (e) {
            console.error("Automatic yield processing error:", e);
        }
    };
    runRoiCheck();
    const interval = setInterval(runRoiCheck, 60000); 
    return () => clearInterval(interval);
  }, [currentUser?.id, platformSettings.isRoiEnabled, platformSettings.platformPaused, dynamicPackages]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      setAuthError(error?.message || "Login failed");
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setIsProvisioning(true);
    setAuthError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await createFirestoreUser(cred.user.uid, email, refCode);
    } catch (error: any) {
      setAuthError(error?.message || 'Registration failed');
      setIsLoading(false);
      setIsProvisioning(false);
      if (auth.currentUser) await signOut(auth);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setAuthError("Please enter your email.");
      return;
    }
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      alert("Password reset link sent!");
      setAuthMode('login');
    } catch (error: any) {
      setAuthError(error?.message || "Reset failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setIsLoading(true);
      await signOut(auth);
      setShowLanding(true);
    } catch (err: any) {
      setIsLoading(false);
    }
  };

  const handleWithdrawal = async (amount: number, address: string) => {
    if (!currentUser) return;
    if (amount < platformSettings.minWithdrawal) {
      alert(`Min withdrawal is $${platformSettings.minWithdrawal}`);
      return;
    }
    try {
      await requestWithdrawalFirestore(currentUser.id, amount, address);
      alert('Withdrawal requested.');
    } catch (err: any) {
      alert(err?.message || 'Withdrawal failed');
    }
  };

  const handleDepositSync = async () => {
    if (!currentUser) return;
    try {
      await syncUserDepositsFirestore(currentUser.id);
      alert('Sync complete.');
    } catch (err: any) {
      alert('Sync Failed: ' + (err?.message || 'Error'));
    }
  };

  const handleBonusClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !bonusCode.trim()) return;
    setIsClaimingBonus(true);
    try {
      await processGiveawayClaimFirestore(currentUser.id, bonusCode);
      alert("Bonus successfully credited to your Profit Balance!");
      setBonusCode('');
    } catch (err: any) {
      alert(err.message || "Failed to claim bonus.");
    } finally {
      setIsClaimingBonus(false);
    }
  };

  const handlePurchaseRequest = (pkgId: string) => {
    if (!currentUser) return;
    const pkg = dynamicPackages.find(p => p.id === pkgId);
    if (!pkg) return;

    const cost = pkg.minAmount;
    const action = "Deploy Node";

    // No upgrade logic needed, user always buys new node
    if (currentUser.capitalBalance < cost) {
      setPurchaseModal({ pkgId, name: pkg.name, cost, action: 'Insufficient Funds', type: 'INSUFFICIENT' });
    } else {
      setPurchaseModal({ pkgId, name: pkg.name, cost, action, type: 'PURCHASE' });
    }
  };

  const confirmPurchase = async () => {
    if (!purchaseModal || !currentUser) return;
    if (purchaseModal.type === 'INSUFFICIENT') {
      setView('wallet');
      setPurchaseModal(null);
      return;
    }
    setIsProcessingPurchase(true);
    try {
      await purchasePackageFirestore(currentUser.id, purchaseModal.pkgId, dynamicPackages);
      alert(`${purchaseModal.action} successful!`);
      setPurchaseModal(null);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsProcessingPurchase(false);
    }
  };

  if (isLoading || (auth.currentUser && !currentUser)) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="w-12 h-12 border-4 border-app-border border-t-app-accent rounded-full animate-spin"></div>
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-app-muted animate-pulse">
            {isProvisioning ? 'Creating Account...' : 'Loading Protocol...'}
          </p>
        </div>
      </div>
    );
  }

  const displayUser = currentUser ? {
    ...currentUser,
    referralCount: myReferrals.length
  } : null;

  if (displayUser && platformSettings.platformPaused && !displayUser.isAdmin) {
    return <MaintenanceScreen onLogout={handleLogout} />;
  }

  if (!displayUser) {
    if (showLanding) {
      return (
        <>
          <PwaInstallPrompt />
          <LandingPage 
            onLogin={() => { setAuthMode('login'); setShowLanding(false); }} 
            onRegister={() => { setAuthMode('register'); setShowLanding(false); }} 
            appName={appName}
          />
        </>
      );
    }

    return (
      <div className="min-h-screen bg-app-bg flex flex-col lg:flex-row relative transition-colors duration-300">
        <div className="flex-1 p-12 lg:p-24 flex flex-col justify-between border-r border-app-border">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => setShowLanding(true)}>
             <div className="w-8 h-8 bg-app-accent"></div>
             <span className="text-2xl font-black uppercase tracking-tighter text-app-text">{appName}</span>
          </div>
          <div className="max-w-xl space-y-12">
            <motion.h1 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-7xl lg:text-9xl font-black tracking-tighter leading-[0.85] uppercase text-app-text"
            >
              Start <br/> <span className="text-app-muted">Earning.</span>
            </motion.h1>
            <p className="serif italic text-2xl text-app-muted leading-relaxed">
              Professional USDT Staking Platform. Simple, secure, and profitable.
            </p>
          </div>
          <button 
            onClick={() => setShowLanding(true)}
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-app-muted hover:text-app-text transition-colors"
          >
            <i className="fa-solid fa-arrow-left"></i>
            Back to Home
          </button>
        </div>
        <div className="w-full lg:w-[35%] min-h-screen bg-app-bg flex items-center justify-center p-12 lg:p-24 transition-colors duration-300">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-sm space-y-12">
            <div>
              <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-app-muted mb-2">Welcome</h2>
              <p className="text-2xl font-bold tracking-tight text-app-text">
                {authMode === 'login' ? 'Log In' : (authMode === 'register' ? 'Create Account' : 'Reset Password')}
              </p>
            </div>
            {authError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-bold uppercase tracking-widest">
                {authError}
              </div>
            )}
            <form className="space-y-8" onSubmit={(e) => {
              if (authMode === 'login') handleLogin(e);
              else if (authMode === 'register') handleRegister(e);
              else handlePasswordReset(e);
            }}>
              <div className="space-y-2 group">
                <p className="text-[10px] font-black uppercase tracking-widest text-app-muted group-focus-within:text-app-text transition-colors">Email</p>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-transparent border-b border-app-border py-3 outline-none focus:border-app-text transition-colors font-medium text-app-text placeholder:text-app-muted/30" placeholder="name@email.com" />
              </div>
              {authMode !== 'forgot-password' && (
                <div className="space-y-2 group">
                  <p className="text-[10px] font-black uppercase tracking-widest text-app-muted group-focus-within:text-app-text transition-colors">Password</p>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-transparent border-b border-app-border py-3 pr-8 outline-none focus:border-app-text transition-colors font-medium text-app-text placeholder:text-app-muted/30" placeholder="••••••••" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-0 top-1/2 -translate-y-1/2 text-app-muted hover:text-app-text transition-colors p-2">
                      <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-xs`}></i>
                    </button>
                  </div>
                </div>
              )}
              {authMode === 'register' && (
                <div className="space-y-2 group">
                  <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">Referral Code (Optional)</p>
                  <input type="text" value={refCode} onChange={(e) => setRefCode(e.target.value.toUpperCase())} className="w-full bg-transparent border-b border-app-border py-3 outline-none focus:border-app-text transition-colors font-mono text-xs uppercase text-app-text placeholder:text-app-muted/30" placeholder="CODE" />
                </div>
              )}
              <button type="submit" disabled={isLoading} className="w-full py-5 bg-app-accent text-app-accent-text text-xs font-black uppercase tracking-[0.3em] hover:opacity-90 transition-all flex items-center justify-center gap-4">
                {isLoading ? <div className="w-4 h-4 border-2 border-app-accent-text/20 border-t-app-accent-text rounded-full animate-spin"></div> : (authMode === 'login' ? 'Log In' : (authMode === 'register' ? 'Sign Up' : 'Send Reset Link'))}
              </button>
              <div className="text-center pt-4">
                 <button type="button" onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(null); }} className="text-[10px] font-black uppercase tracking-widest text-app-muted hover:text-app-text transition-colors">
                   {authMode === 'login' ? "Create an Account" : "Back to Login"}
                 </button>
              </div>
            </form>
          </motion.div>
        </div>
        
        {/* Floating Telegram Support Button */}
        <a
          href="https://t.me/Profitpipsnodes"
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 right-6 z-[100] w-12 h-12 lg:w-14 lg:h-14 bg-app-accent text-app-accent-text rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-all duration-300"
          title="Contact Support"
        >
          <i className="fa-brands fa-telegram text-2xl lg:text-3xl"></i>
        </a>
        <PwaInstallPrompt />
      </div>
    );
  }

  return (
    <>
      <Layout 
        user={displayUser} 
        onLogout={handleLogout} 
        onNavigate={setView} 
        currentView={view} 
        appName={appName}
        platformSettings={platformSettings}
      >
        <AnimatePresence mode="wait">
          <motion.div key={view} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.3 }} className="pb-32 lg:pb-0">
            {view === 'dashboard' && (
              <div className="space-y-16">
                <Dashboard 
                    user={displayUser} 
                    transactions={transactions} 
                    activePackages={activePackages}
                    packages={dynamicPackages}
                    whatsappConfig={platformSettings.whatsappConfig} 
                />
                
                {/* Bonus Code UI on Dashboard */}
                <div className="max-w-xl">
                   <div className="p-10 border border-app-border bg-app-surface space-y-6">
                      <div>
                         <h3 className="text-xs font-black uppercase tracking-[0.4em] text-app-text mb-1">Protocol Uplink</h3>
                         <p className="text-[10px] font-bold text-app-muted uppercase tracking-widest">Enter bonus or giveaway codes below</p>
                      </div>
                      <form onSubmit={handleBonusClaim} className="flex gap-px bg-app-border border border-app-border overflow-hidden">
                         <input 
                          type="text" 
                          value={bonusCode}
                          onChange={(e) => setBonusCode(e.target.value.toUpperCase())}
                          placeholder="ENTER CODE"
                          className="flex-1 bg-app-bg px-6 py-4 outline-none text-sm font-black mono tracking-widest uppercase text-app-text placeholder:text-app-muted/20"
                         />
                         <button 
                          type="submit" 
                          disabled={isClaimingBonus || !bonusCode.trim()}
                          className="bg-app-accent text-app-accent-text px-8 py-4 text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-50"
                         >
                           {isClaimingBonus ? 'Linking...' : 'Claim'}
                         </button>
                      </form>
                   </div>
                </div>
              </div>
            )}
            {view === 'wallet' && (
              <Wallet 
                user={displayUser} 
                paymentSettings={paymentSettings} 
                korapaySettings={korapaySettings}
                onDepositSim={handleDepositSync} 
                onWithdrawRequest={handleWithdrawal} 
              />
            )}
            {view === 'packages' && (
              <div className="space-y-12 max-w-7xl mx-auto">
                 <div className="flex flex-col gap-4">
                    <h2 className="text-5xl lg:text-9xl font-black uppercase tracking-tighter leading-none text-app-text">Liquidity<br/>Nodes.</h2>
                    <p className="serif italic text-xl lg:text-2xl text-app-muted max-w-xl">Rent high-performance computing power to generate USDT.</p>
                 </div>
                 
                 <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-8">
                   {dynamicPackages.filter(p => p.isActive !== false).map((pkg) => (
                      <NodeCard 
                        key={pkg.id} 
                        pkg={pkg} 
                        user={displayUser} 
                        activePackages={activePackages} 
                        onPurchase={handlePurchaseRequest} 
                        appName={appName}
                      />
                   ))}
                 </div>
              </div>
            )}
            {view === 'referrals' && (
              <div className="space-y-24 max-w-7xl mx-auto">
                 <div className="flex flex-col lg:flex-row justify-between items-end gap-12">
                    <div className="space-y-6 flex-1">
                      <h1 className="text-6xl lg:text-9xl font-black uppercase tracking-tighter leading-[0.85] text-app-text">Referral<br/>Program.</h1>
                      <p className="serif italic text-2xl text-app-muted max-w-xl">Earn rewards by inviting friends to the platform.</p>
                    </div>
                    <div className="w-full lg:w-96 p-10 bg-app-accent text-app-accent-text space-y-6">
                      <p className="text-[10px] font-black uppercase tracking-widest">Your Invite Code</p>
                      <p className="text-xl font-black mono tracking-widest truncate">{displayUser.referralCode}</p>
                      <button onClick={() => { navigator.clipboard.writeText(displayUser.referralCode); alert('Copied.'); }} className="w-full py-3 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-[0.2em]">Copy Code</button>
                    </div>
                 </div>
                 <div className="space-y-8">
                    <div className="flex items-center justify-between border-b border-app-border pb-4">
                      <h2 className="text-xs font-black uppercase tracking-[0.4em] text-app-text">My Downline</h2>
                      <span className="text-[10px] font-bold text-app-muted uppercase tracking-widest">{myReferrals.length} Partners</span>
                    </div>
                    <div className="border border-app-border bg-app-bg">
                      {myReferrals.length === 0 ? (
                        <div className="p-20 text-center opacity-20 serif italic text-app-muted">No partners yet.</div>
                      ) : (
                        <div className="grid grid-cols-1 divide-y divide-app-border">
                          {myReferrals.map((refUser, idx) => (
                            <div key={refUser.userId} className="p-6 flex items-center justify-between hover:bg-app-surface transition-colors">
                              <div className="flex items-center gap-6">
                                 <span className="text-[10px] mono text-app-muted">{(idx + 1).toString().padStart(2, '0')}</span>
                                 <div className="space-y-1">
                                    <p className="text-sm font-bold text-app-text">{refUser.email}</p>
                                    <p className="text-[10px] mono text-app-muted opacity-50">ID: {refUser.userId.slice(0,6).toUpperCase()}</p>
                                 </div>
                              </div>
                              <div className="text-right">
                                 <p className="text-[10px] font-black uppercase tracking-widest text-app-muted opacity-60">Earned</p>
                                 <p className="text-sm font-bold mono text-green-500">+${(refUser.totalCommissions || 0).toFixed(2)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                 </div>
              </div>
            )}
            {view === 'profile' && <Profile user={displayUser} onUpdate={(data) => updateUserProfileFirestore(displayUser.id, data)} appName={appName} />}
            {view === 'admin' && (
              <AdminPanel 
                state={{ 
                  currentUser: displayUser, 
                  users: [], 
                  packages: dynamicPackages, 
                  activePackages, 
                  transactions, 
                  platformSettings,
                  giveawayPools,
                  paymentSettings,
                  korapaySettings
                }}
                onUpdateSettings={(s) => updatePlatformSettingsFirestore(s)}
                onTriggerRoi={async () => { 
                  try {
                    await processDailyRoiFirestore(platformSettings, dynamicPackages); 
                    alert('Rewards paid.'); 
                  } catch (err: any) { alert(`ROI Failed: ${err?.message}`); }
                }}
                onManageWithdrawal={() => {}}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </Layout>
      {purchaseModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-6">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-app-bg border border-app-border p-8 w-full max-w-md space-y-8 shadow-2xl">
             <div className="space-y-2">
               <h3 className="text-xl font-black uppercase tracking-tighter text-app-text">{purchaseModal.type === 'INSUFFICIENT' ? 'Deposit Required' : 'Confirm Deployment'}</h3>
               <p className="text-xs font-bold text-app-muted">{purchaseModal.type === 'INSUFFICIENT' ? 'Insufficient balance.' : `Deploying ${purchaseModal.name}`}</p>
             </div>
             <div className="py-6 border-y border-app-border space-y-4">
                <div className="flex justify-between items-center"><span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Cost</span><span className="text-lg font-black mono text-app-text">${purchaseModal.cost.toFixed(2)}</span></div>
                <div className="flex justify-between items-center"><span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Balance</span><span className={`text-lg font-black mono ${purchaseModal.type === 'INSUFFICIENT' ? 'text-red-500' : 'text-green-500'}`}>${displayUser.capitalBalance.toFixed(2)}</span></div>
             </div>
             <div className="flex gap-4">
                <button onClick={() => setPurchaseModal(null)} className="flex-1 py-3 border border-app-border text-[10px] font-black uppercase tracking-widest text-app-muted">Cancel</button>
                <button onClick={confirmPurchase} disabled={isProcessingPurchase} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${purchaseModal.type === 'INSUFFICIENT' ? 'bg-app-text text-app-bg' : 'bg-app-accent text-app-accent-text'}`}>
                  {isProcessingPurchase ? 'Processing...' : (purchaseModal.type === 'INSUFFICIENT' ? 'Go to Wallet' : 'Confirm')}
                </button>
             </div>
          </motion.div>
        </div>
      )}
      <PwaInstallPrompt />
      <GuideModal isOpen={showGuide} onClose={() => setShowGuide(false)} config={platformSettings.guideConfig} />
    </>
  );
};

const App: React.FC = () => (
  <ThemeProvider>
    <AppContent />
  </ThemeProvider>
);

export default App;