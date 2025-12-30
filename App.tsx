import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
  doc, 
  onSnapshot, 
  collection, 
  query, 
  where 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { auth, db } from './firebase.ts';
import { 
  AppState, 
  User, 
  Transaction, 
  UserPackage 
} from './types.ts';
import { 
  createFirestoreUser, 
  purchasePackageFirestore,
  processDailyRoiFirestore,
  updateUserProfileFirestore,
  syncUserDepositsFirestore,
  requestWithdrawalFirestore,
  updatePlatformSettingsFirestore
} from './store.ts';
import Layout from './components/Layout.tsx';
import Dashboard from './components/Dashboard.tsx';
import Wallet from './components/Wallet.tsx';
import AdminPanel from './components/AdminPanel.tsx';
import Profile from './components/Profile.tsx';
import LandingPage from './components/LandingPage.tsx'; 
import GuideModal from './components/GuideModal.tsx';
import { ThemeProvider } from './ThemeContext.tsx';
import { INITIAL_PACKAGES, REF_LEVELS } from './constants.tsx';
import { motion, AnimatePresence } from 'framer-motion';

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

const AppContent: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activePackages, setActivePackages] = useState<UserPackage[]>([]);
  const [myReferrals, setMyReferrals] = useState<User[]>([]);
  const [platformSettings, setPlatformSettings] = useState<AppState['platformSettings']>({
    isRoiEnabled: true,
    referralLevels: REF_LEVELS,
    minWithdrawal: 10,
    platformPaused: false
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
  
  // Modal State
  const [purchaseModal, setPurchaseModal] = useState<{
    pkgId: string;
    name: string;
    cost: number;
    action: string;
    type: 'PURCHASE' | 'INSUFFICIENT';
  } | null>(null);
  const [isProcessingPurchase, setIsProcessingPurchase] = useState(false);

  const handleManualProvision = useCallback(async () => {
    if (!auth.currentUser) return;
    setIsProvisioning(true);
    setAuthError(null);
    try {
      await createFirestoreUser(auth.currentUser.uid, auth.currentUser.email || '', refCode);
    } catch (err: any) {
      console.error("Manual provision failed");
      const msg = err?.message || 'Unknown error';
      setAuthError(`Setup failed: ${msg}`);
      setIsProvisioning(false);
    }
  }, [refCode]);

  // Sync Platform Settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system', 'settings'), (doc) => {
      if (doc.exists()) {
        setPlatformSettings(prev => ({ ...prev, ...doc.data() }));
      }
    }, (err) => {
      // Suppress permission errors on public/unauth load
      console.warn("Settings sync restricted:", err.code);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let unsubUser: (() => void) | null = null;
    let unsubTx: (() => void) | null = null;
    let unsubPk: (() => void) | null = null;
    let unsubRefs: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthError(null);
      if (unsubUser) unsubUser();
      if (unsubTx) unsubTx();
      if (unsubPk) unsubPk();
      if (unsubRefs) unsubRefs();

      if (firebaseUser) {
        setIsLoading(true);
        setShowLanding(false);
        
        const userRef = doc(db, 'users', firebaseUser.uid);
        unsubUser = onSnapshot(userRef, async (docSnap) => {
          if (docSnap.exists()) {
            const userData = { ...docSnap.data(), id: docSnap.id } as User;
            setCurrentUser(userData);
            setIsProvisioning(false);
            setIsLoading(false);
            
            // Show guide on first load of the session
            if (!isInitialized.current) {
              if (view === 'auth') setView('dashboard');
              setShowGuide(true);
              isInitialized.current = true;
            }
            
            if (userData.referralCode) {
              const qRefs = query(collection(db, 'users'), where('referredBy', '==', userData.referralCode));
              unsubRefs = onSnapshot(qRefs, (snap) => {
                const refs = snap.docs.map(d => ({ ...d.data(), id: d.id }) as User);
                setMyReferrals(refs);
              }, (err) => {
                console.warn("Referral sync issue", err.code);
              });
            }

          } else {
            console.log("No profile found. Waiting for provision.");
            setIsProvisioning(true);
            setIsLoading(false);
          }
        }, (err) => {
          console.error("Profile sync failure", err.message);
          setAuthError("Failed to load profile. Check connection.");
          setIsLoading(false);
        });

        unsubTx = onSnapshot(
          query(collection(db, 'transactions'), where('userId', '==', firebaseUser.uid)), 
          (snap) => {
            const txs = snap.docs.map(d => ({ ...d.data(), id: d.id }) as Transaction);
            setTransactions(txs.sort((a, b) => b.timestamp - a.timestamp));
          },
          (err) => {
            console.warn("Transaction sync failed:", err.code);
          }
        );

        unsubPk = onSnapshot(
          query(collection(db, 'activePackages'), where('userId', '==', firebaseUser.uid)), 
          (snap) => {
            setActivePackages(snap.docs.map(d => ({ ...d.data(), id: d.id }) as UserPackage));
          },
          (err) => {
            console.warn("Packages sync failed:", err.code);
          }
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
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      const msg = error?.message || "Auth failed";
      console.error("Login Error:", msg);
      
      let errorMessage = "Login failed. Please try again.";
      
      if (error.code === 'auth/invalid-credential' || msg.includes('invalid-credential')) {
        errorMessage = "Invalid email or password. Please check your credentials.";
      } else if (error.code === 'auth/user-not-found') {
        errorMessage = "No account found with this email. Please register.";
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = "Incorrect password.";
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = "Too many failed attempts. Access temporarily blocked. Please try again later.";
      } else if (msg) {
        errorMessage = msg;
      }
      
      setAuthError(errorMessage);
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
      const msg = error?.message || "Unknown error";
      
      if (error.code === 'auth/email-already-in-use' || msg.includes('email-already-in-use')) {
        setAuthError('This email is already registered. Please log in instead.');
      } else {
        console.error("Registration Error:", msg);
        setAuthError(msg || 'Registration failed');
      }
      setIsLoading(false);
      setIsProvisioning(false);
      if (auth.currentUser) await signOut(auth);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setAuthError("Please enter your email address.");
      return;
    }
    setIsLoading(true);
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      alert("Password reset link sent! Please check your email inbox.");
      setAuthMode('login');
    } catch (error: any) {
      const msg = error?.message || "Error sending reset email";
      console.error("Reset Error:", msg);
      setAuthError(msg);
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
      console.error("Session termination error");
      setIsLoading(false);
    }
  };

  const handleWithdrawal = async (amount: number, address: string) => {
    if (!currentUser) return;
    if (amount < platformSettings.minWithdrawal) {
      alert(`Minimum withdrawal is $${platformSettings.minWithdrawal} USDT`);
      return;
    }
    try {
      await requestWithdrawalFirestore(currentUser.id, amount, address);
      alert('Withdrawal request submitted. Waiting for approval.');
    } catch (err: any) {
      alert(err?.message || 'Withdrawal failed');
    }
  };

  const handleDepositSync = async () => {
    if (!currentUser) return;
    try {
      await syncUserDepositsFirestore(currentUser.id);
      alert('Deposit check complete. Your balance has been updated.');
    } catch (err: any) {
      alert('Sync Failed: ' + (err?.message || 'Unknown error'));
    }
  };

  const handlePurchaseRequest = (pkgId: string) => {
    if (!currentUser) return;
    
    const pkg = INITIAL_PACKAGES.find(p => p.id === pkgId);
    if (!pkg) return;

    const currentActive = activePackages.find(p => p.isActive);
    let cost = pkg.minAmount;
    let action = "Deploy Node";

    if (currentActive) {
        if (currentActive.packageId === pkgId) {
          alert("This node is already active.");
          return; 
        }
        if (currentActive.amount >= pkg.minAmount) {
            alert("You cannot downgrade to a lower tier node.");
            return;
        }
        cost = pkg.minAmount - currentActive.amount;
        action = "Upgrade Node";
    }

    if (currentUser.capitalBalance < cost) {
      setPurchaseModal({
        pkgId,
        name: pkg.name,
        cost,
        action: 'Insufficient Funds',
        type: 'INSUFFICIENT'
      });
    } else {
      setPurchaseModal({
        pkgId,
        name: pkg.name,
        cost,
        action,
        type: 'PURCHASE'
      });
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
      await purchasePackageFirestore(currentUser.id, purchaseModal.pkgId);
      alert(`${purchaseModal.action} successful! Your node is now generating yield.`);
      setPurchaseModal(null);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Transaction failed');
      alert(`Error: ${msg}`);
    } finally {
      setIsProcessingPurchase(false);
    }
  };

  if (isLoading || (auth.currentUser && !currentUser)) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="w-12 h-12 border-4 border-app-border border-t-app-accent rounded-full animate-spin"></div>
          <div className="text-center space-y-4 max-w-xs">
            <p className="text-[10px] font-black uppercase tracking-[0.5em] text-app-muted animate-pulse">
              {isProvisioning ? 'Creating Account...' : 'Loading...'}
            </p>
            {authError && <p className="text-[9px] text-red-500 font-bold uppercase tracking-widest">{authError}</p>}
            {isProvisioning && (
              <div className="flex flex-col gap-4 pt-8">
                 <button 
                  onClick={handleManualProvision}
                  className="px-6 py-2 border border-app-border text-[8px] font-black uppercase tracking-widest text-app-muted hover:text-app-text hover:border-app-text transition-all"
                >
                  Retry Setup
                </button>
                <button 
                  onClick={handleLogout}
                  className="text-[8px] font-black uppercase tracking-widest text-app-muted/50 hover:text-app-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const displayUser = currentUser ? {
    ...currentUser,
    referralCount: myReferrals.length
  } : null;

  // MAINTENANCE MODE CHECK
  if (displayUser && platformSettings.platformPaused && !displayUser.isAdmin) {
    return <MaintenanceScreen onLogout={handleLogout} />;
  }

  if (!displayUser) {
    if (showLanding) {
      return (
        <LandingPage 
          onLogin={() => {
            setAuthMode('login');
            setShowLanding(false);
          }} 
          onRegister={() => {
            setAuthMode('register');
            setShowLanding(false);
          }} 
        />
      );
    }

    return (
      <div className="min-h-screen bg-app-bg flex flex-col lg:flex-row relative transition-colors duration-300">
        <div className="flex-1 p-12 lg:p-24 flex flex-col justify-between border-r border-app-border">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => setShowLanding(true)}>
             <div className="w-8 h-8 bg-app-accent"></div>
             <span className="text-2xl font-black uppercase tracking-tighter text-app-text">QUANTUM</span>
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
          <div className="flex gap-16">
            <button 
              onClick={() => setShowLanding(true)}
              className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-app-muted hover:text-app-text transition-colors"
            >
              <i className="fa-solid fa-arrow-left"></i>
              Back to Home
            </button>
          </div>
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
                  <div className="flex justify-between items-baseline">
                    <p className="text-[10px] font-black uppercase tracking-widest text-app-muted group-focus-within:text-app-text transition-colors">Password</p>
                  </div>
                  <div className="relative">
                    <input 
                      type={showPassword ? "text" : "password"} 
                      required 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      className="w-full bg-transparent border-b border-app-border py-3 pr-8 outline-none focus:border-app-text transition-colors font-medium text-app-text placeholder:text-app-muted/30" 
                      placeholder="••••••••" 
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-0 top-1/2 -translate-y-1/2 text-app-muted hover:text-app-text transition-colors p-2"
                    >
                      <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-xs`}></i>
                    </button>
                  </div>
                </div>
              )}

              {authMode === 'login' && (
                <div className="flex justify-end">
                   <button 
                     type="button" 
                     onClick={() => { setAuthMode('forgot-password'); setAuthError(null); }}
                     className="text-[9px] font-bold uppercase tracking-widest text-app-muted hover:text-app-text transition-colors"
                   >
                     Forgot Password?
                   </button>
                </div>
              )}

              {authMode === 'register' && (
                <div className="space-y-2 group">
                  <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">Referral Code (Optional)</p>
                  <input type="text" value={refCode} onChange={(e) => setRefCode(e.target.value.toUpperCase())} className="w-full bg-transparent border-b border-app-border py-3 outline-none focus:border-app-text transition-colors font-mono text-xs uppercase text-app-text placeholder:text-app-muted/30" placeholder="CODE" />
                </div>
              )}

              <button type="submit" disabled={isLoading} className="w-full py-5 bg-app-accent text-app-accent-text text-xs font-black uppercase tracking-[0.3em] hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-4">
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-app-accent-text/20 border-t-app-accent-text rounded-full animate-spin"></div>
                ) : (
                  authMode === 'login' ? 'Log In' : (authMode === 'register' ? 'Sign Up' : 'Send Reset Link')
                )}
              </button>
              
              <div className="text-center pt-4">
                 {authMode === 'forgot-password' ? (
                   <button 
                     type="button" 
                     onClick={() => { setAuthMode('login'); setAuthError(null); }} 
                     className="text-[10px] font-black uppercase tracking-widest text-app-muted hover:text-app-text transition-colors"
                   >
                     Back to Login
                   </button>
                 ) : (
                   <button 
                     type="button" 
                     onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(null); }} 
                     className="text-[10px] font-black uppercase tracking-widest text-app-muted hover:text-app-text transition-colors"
                   >
                     {authMode === 'login' ? "Create an Account" : "Back to Login"}
                   </button>
                 )}
              </div>
            </form>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <Layout user={displayUser} onLogout={handleLogout} onNavigate={setView} currentView={view}>
      <AnimatePresence mode="wait">
        <motion.div key={view} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.3 }} className="pb-24 lg:pb-0">
          {view === 'dashboard' && <Dashboard user={displayUser} transactions={transactions} activePackages={activePackages} />}
          {view === 'wallet' && <Wallet user={displayUser} onDepositSim={handleDepositSync} onWithdrawRequest={handleWithdrawal} />}
          {view === 'packages' && (
            <div className="space-y-12 max-w-7xl mx-auto">
               <div className="flex flex-col gap-4">
                  <h2 className="text-5xl lg:text-9xl font-black uppercase tracking-tighter leading-none text-app-text">Liquidity<br/>Nodes.</h2>
                  <p className="serif italic text-xl lg:text-2xl text-app-muted max-w-xl">Rent high-performance computing power to generate USDT.</p>
               </div>
               <div className="grid grid-cols-2 md:grid-cols-3 border-t border-l border-app-border">
                 {INITIAL_PACKAGES.map((pkg) => {
                   const currentActive = activePackages.find(ap => ap.isActive);
                   const isCurrent = currentActive?.packageId === pkg.id;
                   
                   let isDisabled = false;
                   let buttonText = "Deploy Node";
                   let extraInfo = "";
                   let isLocked = false;
                   let cost = pkg.minAmount;

                   if (currentActive) {
                      if (isCurrent) {
                          buttonText = "Node Active";
                          isDisabled = true;
                      } else if (pkg.minAmount <= currentActive.amount) {
                          buttonText = "Unavailable";
                          isDisabled = true;
                          extraInfo = "Downgrade not allowed";
                      } else {
                          const upgradeCost = pkg.minAmount - currentActive.amount;
                          cost = upgradeCost;
                          if (displayUser.capitalBalance < cost) {
                             isLocked = true;
                             isDisabled = true;
                             buttonText = "Locked";
                          } else {
                             buttonText = "Upgrade Available";
                             extraInfo = `Pay Difference: ${upgradeCost.toFixed(0)} USDT`;
                          }
                      }
                   } else {
                      if (displayUser.capitalBalance < cost) {
                         isLocked = true;
                         isDisabled = true;
                         buttonText = "Locked";
                      }
                   }
                   
                   const isProcessing = purchaseModal?.pkgId === pkg.id;

                   return (
                     <div key={pkg.id} className={`border-r border-b border-app-border p-6 md:p-12 group transition-all duration-500 relative ${isDisabled && !isLocked ? 'opacity-50 grayscale' : ''} ${!isDisabled ? 'hover:bg-app-accent hover:text-app-accent-text' : ''}`}>
                       
                       {isLocked && (
                         <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-app-bg/5 backdrop-blur-[2px] transition-all group-hover:bg-app-bg/10">
                            <div className="w-16 h-16 rounded-full bg-app-bg border border-app-border flex items-center justify-center shadow-xl mb-4 group-hover:scale-110 transition-transform">
                                <i className="fa-solid fa-lock text-xl text-app-muted"></i>
                            </div>
                            <div className="px-3 py-1 bg-app-bg border border-app-border text-[8px] font-black uppercase tracking-widest text-app-muted">
                                Unlock: ${cost.toFixed(0)}
                            </div>
                         </div>
                       )}

                       <div className={`space-y-4 md:space-y-8 h-full flex flex-col ${isLocked ? 'opacity-30 blur-[1px]' : ''}`}>
                         {/* Card Content */}
                         <div className="flex justify-between items-start">
                           <h3 className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em]">{pkg.name}</h3>
                           {isCurrent && <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-green-500 text-white">Online</span>}
                         </div>
                         <div className="space-y-1">
                           <p className="text-3xl md:text-6xl font-black mono tracking-tighter leading-none">
                             ${(pkg.minAmount * pkg.dailyRoi / 100).toFixed(2)}
                           </p>
                           <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Daily Return</p>
                         </div>
                         <p className="text-[10px] md:text-sm font-medium leading-tight opacity-60 group-hover:opacity-100">{pkg.description}</p>
                         <div className="mt-auto space-y-4 pt-6">
                           <div className="flex justify-between border-b border-app-border group-hover:border-app-accent-text/10">
                             <span className="text-[8px] font-bold uppercase opacity-60">Lease Cost</span>
                             <span className="text-[10px] font-bold mono">${pkg.minAmount}</span>
                           </div>
                           <button 
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!isDisabled) handlePurchaseRequest(pkg.id);
                            }} 
                            disabled={isDisabled || isProcessing}
                            className={`w-full py-3 border text-[8px] font-black uppercase tracking-[0.2em] border-app-border flex items-center justify-center gap-2 ${
                                !isDisabled ? 'group-hover:bg-app-accent-text group-hover:text-app-accent group-hover:border-app-accent-text' : 'cursor-not-allowed'
                            }`}
                           >
                            {isProcessing && <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>}
                            {buttonText}
                           </button>
                           {extraInfo && <p className="text-[9px] font-bold uppercase text-center opacity-70">{extraInfo}</p>}
                         </div>
                       </div>
                     </div>
                   );
                 })}
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
                    <button onClick={() => { navigator.clipboard.writeText(displayUser.referralCode); alert('Code copied to clipboard.'); }} className="w-full py-3 bg-app-accent-text text-app-accent text-[10px] font-black uppercase tracking-[0.2em]">Copy Code</button>
                  </div>
               </div>

               <div className="space-y-8">
                  <div className="flex items-center justify-between border-b border-app-border pb-4">
                    <h2 className="text-xs font-black uppercase tracking-[0.4em] text-app-text">My Downline</h2>
                    <span className="text-[10px] font-bold text-app-muted uppercase tracking-widest">{myReferrals.length} Partners</span>
                  </div>
                  <div className="border border-app-border bg-app-bg">
                    {myReferrals.length === 0 ? (
                      <div className="p-20 text-center opacity-20 serif italic text-app-muted">
                        No partners yet. Share your code to start growing your network.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 divide-y divide-app-border">
                        {myReferrals.map((refUser, idx) => (
                          <div key={refUser.id} className="p-6 flex items-center justify-between hover:bg-app-surface transition-colors">
                            <div className="flex items-center gap-6">
                               <span className="text-[10px] mono text-app-muted">{(idx + 1).toString().padStart(2, '0')}</span>
                               <div className="space-y-1">
                                  <p className="text-sm font-bold text-app-text">{refUser.email}</p>
                                  <p className="text-[10px] mono text-app-muted opacity-50">ID: {refUser.id.slice(0,6).toUpperCase()}</p>
                               </div>
                            </div>
                            <div className="text-right">
                               <span className="text-[10px] px-2 py-0.5 border border-app-border font-black uppercase tracking-widest text-green-500">Active</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
               </div>
            </div>
          )}
          {view === 'profile' && <Profile user={displayUser} onUpdate={(data) => updateUserProfileFirestore(displayUser.id, data)} />}
          {view === 'admin' && (
            <AdminPanel 
              state={{ currentUser: displayUser, users: [], packages: INITIAL_PACKAGES, activePackages, transactions, platformSettings }}
              onUpdateSettings={(s) => updatePlatformSettingsFirestore(s)}
              onTriggerRoi={async () => { 
                try {
                  await processDailyRoiFirestore(platformSettings); 
                  alert('Daily rewards paid out successfully.'); 
                } catch (err: any) {
                  const msg = err?.message || 'Unknown error';
                  alert(`ROI Processing Failed: ${msg}`);
                }
              }}
              onManageWithdrawal={() => {}}
            />
          )}
        </motion.div>
      </AnimatePresence>
      
      {/* Global Modals */}
      {purchaseModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-6">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-app-bg border border-app-border p-8 w-full max-w-md space-y-8 shadow-2xl">
             <div className="space-y-2">
               <h3 className="text-xl font-black uppercase tracking-tighter text-app-text">
                 {purchaseModal.type === 'INSUFFICIENT' ? 'Deposit Required' : 'Confirm Deployment'}
               </h3>
               <p className="text-xs font-bold text-app-muted">
                 {purchaseModal.type === 'INSUFFICIENT' ? 'Your wallet balance is too low.' : `Deploying ${purchaseModal.name}`}
               </p>
             </div>
             
             <div className="py-6 border-y border-app-border space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Cost</span>
                  <span className="text-lg font-black mono text-app-text">${purchaseModal.cost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Wallet Balance</span>
                  <span className={`text-lg font-black mono ${purchaseModal.type === 'INSUFFICIENT' ? 'text-red-500' : 'text-green-500'}`}>
                    ${displayUser.capitalBalance.toFixed(2)}
                  </span>
                </div>
             </div>

             <div className="flex gap-4">
                <button 
                  onClick={() => setPurchaseModal(null)}
                  className="flex-1 py-3 border border-app-border text-[10px] font-black uppercase tracking-widest text-app-muted hover:text-app-text hover:border-app-text transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmPurchase}
                  disabled={isProcessingPurchase}
                  className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                     purchaseModal.type === 'INSUFFICIENT' 
                     ? 'bg-app-text text-app-bg hover:opacity-90' 
                     : 'bg-app-accent text-app-accent-text hover:opacity-90'
                  }`}
                >
                  {isProcessingPurchase ? 'Processing...' : (purchaseModal.type === 'INSUFFICIENT' ? 'Go to Wallet' : 'Confirm')}
                </button>
             </div>
          </motion.div>
        </div>
      )}

      {/* Guide Modal */}
      <GuideModal isOpen={showGuide} onClose={() => setShowGuide(false)} />

    </Layout>
  );
};

const App: React.FC = () => (
  <ThemeProvider>
    <AppContent />
  </ThemeProvider>
);

export default App;