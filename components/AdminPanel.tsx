import React, { useState, useEffect } from 'react';
import { AppState, User, TransactionStatus, HotWalletConfig, Package, GiveawayPool, PaymentSettings, WhatsappTaskConfig, GuideConfig, GuideStep, BankAccount, FiatRequest, KorapaySettings } from '../types.ts';
import { doc, getDoc, setDoc, collection, onSnapshot, query, orderBy, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase.ts';
import { 
  authorizeWithdrawalFirestore, 
  toggleUserAdminFirestore, 
  adminCreditUserFirestore, 
  adminSweepUserFundsWithAmount,
  savePackageFirestore,
  deletePackageFirestore,
  createGiveawayPoolFirestore,
  updateGiveawayPoolStatus,
  deleteGiveawayPool,
  updatePaymentSettingsFirestore,
  updateKorapaySettingsFirestore,
  fetchKorapaySecretsFirestore,
  updatePlatformSettingsFirestore,
  saveBankAccountFirestore,
  deleteBankAccountFirestore,
  processFiatDecision
} from '../store.ts';
import { DEFAULT_GUIDE_CONFIG } from '../constants.tsx';
import { motion, AnimatePresence } from 'framer-motion';

interface AdminPanelProps {
  state: AppState;
  onUpdateSettings: (settings: Partial<AppState['platformSettings']>) => void;
  onTriggerRoi: (e?: React.MouseEvent) => void;
  onManageWithdrawal: (txId: string, status: TransactionStatus) => void;
}

// ROBUST SANITIZER WITH CYCLE DETECTION
const sanitizeValue = (val: any, seen = new WeakSet()): any => {
    if (!val) return val;
    if (typeof val === 'function') return null;
    if (typeof val.toMillis === 'function') return val.toMillis();
    
    // Handle References
    if (typeof val === 'object' && typeof val.path === 'string' && typeof val.id === 'string' && 'firestore' in val) {
        return val.path;
    }

    if (typeof val === 'object') {
        if (seen.has(val)) return null; // Break cycle
        seen.add(val);
        
        if (Array.isArray(val)) {
            return val.map(v => sanitizeValue(v, seen));
        }

        // Strip Firestore internals/complex types
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
    
    // Create a new WeakSet for each document
    const seen = new WeakSet();
    
    Object.keys(data).forEach(key => {
        clean[key] = sanitizeValue(data[key], seen);
    });
    return clean;
};

const AdminPanel: React.FC<AdminPanelProps> = ({ state, onUpdateSettings, onTriggerRoi, onManageWithdrawal }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'withdrawals' | 'nodes' | 'referrals' | 'tasks' | 'guide' | 'gateways' | 'fiat' | 'korapay'>('overview');
  const [users, setUsers] = useState<User[]>([]);
  const [hotWallet, setHotWallet] = useState<HotWalletConfig>({
    address: '',
    privateKey: '',
    lastSyncTimestamp: Date.now()
  });

  // Payment Config State
  const [paymentConfig, setPaymentConfig] = useState<PaymentSettings>({
    isEnabled: false,
    provider: 'NOWPAYMENTS',
    apiKey: '',
    publicKey: '',
    ipnSecret: ''
  });

  // Korapay Config State
  const [korapayConfig, setKorapayConfig] = useState<KorapaySettings>({
    publicKey: '',
    secretKey: '',
    webhookSecret: '',
    mode: 'sandbox',
    depositsEnabled: false,
    minDeposit: 1000,
    depositChargeType: 'none',
    depositChargeValue: 0
  });

  // Task Config State
  const [waConfig, setWaConfig] = useState<WhatsappTaskConfig>({
     enabled: false,
     rewardAmount: 0.1,
     cooldownHours: 24,
     maxLifetimeShares: 10,
     messageTemplate: "Join Profit Pips and start earning USDT daily! 🚀 {link}"
  });

  // Guide Config State
  const [guideConfig, setGuideConfig] = useState<GuideConfig>(DEFAULT_GUIDE_CONFIG);

  // Referral Management State
  const [referralLevels, setReferralLevels] = useState<{level: number, percentage: number}[]>([]);

  // Node Editor State
  const [editingNode, setEditingNode] = useState<Partial<Package> | null>(null);
  
  // Giveaway Form State
  const [newPool, setNewPool] = useState<Omit<GiveawayPool, 'id' | 'claimsCount' | 'createdAt'>>({
    code: '',
    totalAmount: 0,
    rewardPerUser: 1,
    maxClaims: 0,
    isActive: true,
    requireDeposit: true
  });
  const [isCreatingPool, setIsCreatingPool] = useState(false);

  // Credit/Sweep State
  const [creditModal, setCreditModal] = useState<{user: User, amount: string, type: 'capital' | 'profit'} | null>(null);
  const [isCrediting, setIsCrediting] = useState(false);

  // --- FIAT STATE ---
  const [fiatBanks, setFiatBanks] = useState<BankAccount[]>([]);
  const [newBank, setNewBank] = useState<Partial<BankAccount>>({ bankName: '', accountName: '', accountNumber: '', isActive: true });
  const [fiatRequests, setFiatRequests] = useState<FiatRequest[]>([]);
  const [rates, setRates] = useState({ deposit: 0, withdrawal: 0 });
  const [paystackKey, setPaystackKey] = useState('');

  // Fiat Decision Modal State
  const [fiatDecisionModal, setFiatDecisionModal] = useState<{ req: FiatRequest, action: 'APPROVE' | 'REJECT' } | null>(null);
  const [isProcessingFiat, setIsProcessingFiat] = useState(false);

  // App Name State
  const [appNameInput, setAppNameInput] = useState('');

  useEffect(() => {
    if (!state.currentUser?.isAdmin) return;

    const unsub = onSnapshot(collection(db, 'users'), 
      (snap) => { 
        const sanitizedUsers = snap.docs.map(d => sanitizeDoc(d) as User).filter(u => u !== null);
        setUsers(sanitizedUsers); 
      },
      (err) => console.warn("User list listener restricted:", err.message)
    );

    const loadVault = async () => {
      try {
        const vaultSnap = await getDoc(doc(db, 'vault', 'hotwallet'));
        if (vaultSnap.exists()) {
          const hw = sanitizeDoc(vaultSnap) as HotWalletConfig;
          setHotWallet(hw);
        }

        const koraSecrets = await fetchKorapaySecretsFirestore();
        setKorapayConfig(prev => ({ ...prev, ...koraSecrets }));
      } catch (e: any) {
        console.warn("Vault access restricted:", e.message);
      }
    };
    
    if (state.paymentSettings) setPaymentConfig(state.paymentSettings);
    if (state.korapaySettings) setKorapayConfig(prev => ({ ...prev, ...state.korapaySettings }));
    if (state.platformSettings.whatsappConfig) setWaConfig(state.platformSettings.whatsappConfig);
    if (state.platformSettings.guideConfig) setGuideConfig(state.platformSettings.guideConfig);
    if (state.platformSettings.referralLevels) setReferralLevels([...state.platformSettings.referralLevels]);
    if (state.platformSettings.appName) setAppNameInput(state.platformSettings.appName);
    if (state.platformSettings.paystackSecretKey) setPaystackKey(state.platformSettings.paystackSecretKey);
    
    // Fiat Listeners
    const unsubBanks = onSnapshot(
      collection(db, 'system_banks'), 
      (snap) => {
        setFiatBanks(snap.docs.map(d => ({...d.data(), id: d.id} as BankAccount)));
      },
      (err) => console.warn("Bank list restricted:", err.message)
    );

    // Listen only for pending requests for performance
    const qRequests = query(collection(db, 'fiat_requests'), where('status', '==', 'PENDING'));
    const unsubRequests = onSnapshot(
      qRequests, 
      (snap) => {
        const reqs = snap.docs.map(d => sanitizeDoc(d) as FiatRequest);
        setFiatRequests(reqs.sort((a,b) => b.timestamp - a.timestamp));
      },
      (err) => console.warn("Fiat requests restricted:", err.message)
    );

    setRates({
        deposit: state.platformSettings.depositRateNgn || 1500,
        withdrawal: state.platformSettings.withdrawalRateNgn || 1400
    });

    loadVault();
    return () => { unsub(); unsubBanks(); unsubRequests(); };
  }, [state.currentUser, state.paymentSettings, state.platformSettings]);

  // Fiat Handlers
  const handleSaveBank = async () => {
      if (!newBank.bankName || !newBank.accountNumber) return;
      await saveBankAccountFirestore({ ...newBank, id: newBank.id || `bank_${Date.now()}` } as BankAccount);
      setNewBank({ bankName: '', accountName: '', accountNumber: '', isActive: true });
  };
  
  const handleSaveRates = async () => {
      await onUpdateSettings({
          depositRateNgn: Number(rates.deposit),
          withdrawalRateNgn: Number(rates.withdrawal),
          paystackSecretKey: paystackKey
      });
      alert("Settings updated.");
  };

  const executeFiatDecision = async () => {
      if (!fiatDecisionModal || !state.currentUser) return;
      setIsProcessingFiat(true);
      try {
          await processFiatDecision(fiatDecisionModal.req.id, fiatDecisionModal.action, state.currentUser.id);
          setFiatDecisionModal(null);
      } catch (err: any) {
          alert(`Error: ${err.message}`);
      } finally {
          setIsProcessingFiat(false);
      }
  };

  const handleSaveNode = async () => {
    if (!editingNode || !editingNode.name || !editingNode.minAmount) return;
    try {
      const pkgId = editingNode.id || `pkg_${Date.now()}`;
      await savePackageFirestore({
        ...editingNode,
        id: pkgId,
      } as Package);
      setEditingNode(null);
      alert("Node saved.");
    } catch (err: any) { alert(err.message); }
  };

  const handleCreatePool = async () => {
    if (!newPool.code) { alert("Please enter a bonus code."); return; }
    if (newPool.totalAmount <= 0) { alert("Total pool amount must be greater than 0."); return; }
    
    setIsCreatingPool(true);
    try {
      const calculatedMax = Math.floor(newPool.totalAmount / newPool.rewardPerUser);
      await createGiveawayPoolFirestore({ ...newPool, maxClaims: calculatedMax });
      setNewPool({ code: '', totalAmount: 0, rewardPerUser: 1, maxClaims: 0, isActive: true, requireDeposit: true });
      alert("Giveaway pool created successfully.");
    } catch (err: any) { alert("Creation failed: " + err.message); } finally { setIsCreatingPool(false); }
  };

  const handleSavePaymentConfig = async () => {
    try { await updatePaymentSettingsFirestore(paymentConfig); alert("Saved."); } catch (err: any) { alert("Failed: " + err.message); }
  };

  const handleSaveKorapayConfig = async () => {
    try { await updateKorapaySettingsFirestore(korapayConfig); alert("Saved."); } catch (err: any) { alert("Failed: " + err.message); }
  };

  const handleSaveTaskConfig = async () => {
     try { await updatePlatformSettingsFirestore({ whatsappConfig: waConfig }); alert("Saved."); } catch (err: any) { alert("Failed: " + err.message); }
  };

  const handleSaveGuideConfig = async () => {
    try { await updatePlatformSettingsFirestore({ guideConfig: guideConfig }); alert("Saved."); } catch (err: any) { alert("Failed: " + err.message); }
  };

  // Hot Wallet Save Handler
  const handleSaveHotWallet = async () => {
    try {
      await setDoc(doc(db, 'vault', 'hotwallet'), {
        ...hotWallet,
        lastSyncTimestamp: Date.now()
      });
      alert("Hot Wallet configuration saved.");
    } catch (err: any) {
      alert("Error saving hot wallet: " + err.message);
    }
  };

  // Guide helpers
  const updateGuideStep = (index: number, field: keyof GuideStep, value: string) => {
      const newSteps = [...guideConfig.steps];
      newSteps[index] = { ...newSteps[index], [field]: value };
      setGuideConfig({ ...guideConfig, steps: newSteps });
  };
  const addGuideStep = () => setGuideConfig({ ...guideConfig, steps: [...guideConfig.steps, { id: `step_${Date.now()}`, stepNumber: '00', title: '', description: '' }] });
  const deleteGuideStep = (index: number) => setGuideConfig({ ...guideConfig, steps: guideConfig.steps.filter((_, i) => i !== index) });

  // Referral helpers
  const addReferralLevel = () => setReferralLevels([...referralLevels, { level: referralLevels.length + 1, percentage: 1 }]);
  const updateReferralLevel = (index: number, percentage: number) => {
      const newLevels = [...referralLevels]; newLevels[index].percentage = percentage; setReferralLevels(newLevels);
  };
  const deleteReferralLevel = (index: number) => {
      const newLevels = referralLevels.filter((_, i) => i !== index);
      setReferralLevels(newLevels.map((l, i) => ({ ...l, level: i + 1 })));
  };
  const saveReferralConfig = async () => {
      try { await updatePlatformSettingsFirestore({ referralLevels: referralLevels }); alert("Saved."); } catch(err: any) { alert("Error: " + err.message); }
  };

  const stats = [
    { label: 'Total Users', value: users.length },
    { label: 'Total Deposits', value: `${users.reduce((acc, u) => acc + u.capitalBalance, 0).toFixed(0)}` },
    { label: 'Total Payable', value: `${users.reduce((acc, u) => acc + u.profitBalance, 0).toFixed(0)}` },
    { label: 'Active Plans', value: state.activePackages.filter(p => p.isActive).length }
  ];

  return (
    <div className="space-y-16 max-w-7xl mx-auto pb-32">
      <div className="flex flex-col lg:flex-row justify-between items-end gap-8">
        <div className="space-y-4 flex-1">
          <h1 className="text-6xl lg:text-9xl font-black uppercase tracking-tighter leading-[0.85] text-app-text">System<br/>Control.</h1>
        </div>
        <button onClick={() => onTriggerRoi()} className="px-12 py-6 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-[0.4em] hover:opacity-90">Pay Daily ROI</button>
      </div>

      <div className="flex gap-px bg-app-border border border-app-border overflow-x-auto">
        {(['overview', 'users', 'nodes', 'referrals', 'tasks', 'guide', 'gateways', 'fiat', 'korapay'] as const).map(tab => (
          <button 
            key={tab} 
            onClick={() => setActiveTab(tab)}
            className={`px-10 py-5 text-[10px] font-black uppercase tracking-widest transition-colors ${activeTab === tab ? 'bg-app-accent text-app-accent-text' : 'bg-app-bg text-app-muted hover:text-app-text'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 border-t border-l border-app-border">
            {stats.map((stat, i) => (
              <div key={i} className="border-r border-b border-app-border p-12 space-y-8">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-app-muted">{stat.label}</p>
                <p className="text-5xl font-black mono tracking-tighter text-app-text">{stat.value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
             <div className="space-y-8">
                <h2 className="text-xs font-black uppercase tracking-[0.4em] border-b border-app-border pb-4">Hot Wallet Config</h2>
                <div className="p-8 border border-app-border bg-app-surface space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Wallet Address (TRC20)</label>
                        <input 
                            type="text" 
                            value={hotWallet.address} 
                            onChange={(e) => setHotWallet({...hotWallet, address: e.target.value})} 
                            className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text outline-none focus:border-app-accent"
                            placeholder="T..."
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Private Key</label>
                        <input 
                            type="password" 
                            value={hotWallet.privateKey} 
                            onChange={(e) => setHotWallet({...hotWallet, privateKey: e.target.value})} 
                            className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text outline-none focus:border-app-accent"
                            placeholder="Enter Private Key"
                        />
                    </div>
                    <button 
                        onClick={handleSaveHotWallet} 
                        className="w-full py-4 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all"
                    >
                        Save Configuration
                    </button>
                </div>
             </div>
             <div className="space-y-8">
                <h2 className="text-xs font-black uppercase tracking-[0.4em] border-b border-app-border pb-4">Platform State</h2>
                <div className="grid grid-cols-3 gap-px bg-app-border">
                   <button onClick={() => onUpdateSettings({ isRoiEnabled: !state.platformSettings.isRoiEnabled })} className={`p-8 text-[10px] font-black uppercase tracking-widest ${state.platformSettings.isRoiEnabled ? 'bg-green-500 text-white' : 'bg-app-bg text-app-muted'}`}>
                      ROI: {state.platformSettings.isRoiEnabled ? 'ONLINE' : 'OFFLINE'}
                   </button>
                   <button onClick={() => onUpdateSettings({ platformPaused: !state.platformSettings.platformPaused })} className={`p-8 text-[10px] font-black uppercase tracking-widest ${state.platformSettings.platformPaused ? 'bg-red-500 text-white' : 'bg-app-bg text-app-muted'}`}>
                      STATUS: {state.platformSettings.platformPaused ? 'MAINTENANCE' : 'LIVE'}
                   </button>
                   <button onClick={() => onUpdateSettings({ withdrawalTickerEnabled: !state.platformSettings.withdrawalTickerEnabled })} className={`p-8 text-[10px] font-black uppercase tracking-widest ${state.platformSettings.withdrawalTickerEnabled ? 'bg-green-500 text-white' : 'bg-app-bg text-app-muted'}`}>
                      TICKER: {state.platformSettings.withdrawalTickerEnabled ? 'ON' : 'OFF'}
                   </button>
                </div>
             </div>
             <div className="space-y-8 lg:col-span-2">
                <h2 className="text-xs font-black uppercase tracking-[0.4em] border-b border-app-border pb-4">General Settings</h2>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Application Name</label>
                        <div className="flex gap-4">
                            <input 
                                type="text" 
                                value={appNameInput} 
                                onChange={(e) => setAppNameInput(e.target.value)} 
                                className="flex-1 bg-app-bg border border-app-border p-3 text-sm font-bold text-app-text outline-none focus:border-app-accent" 
                            />
                            <button 
                                onClick={() => { onUpdateSettings({ appName: appNameInput }); alert('App name updated.'); }} 
                                className="px-6 py-3 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-widest hover:opacity-90"
                            >
                                Update
                            </button>
                        </div>
                    </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <section className="space-y-12">
          <div className="overflow-x-auto border border-app-border">
            <table className="w-full text-left border-collapse">
              <thead className="bg-app-surface">
                <tr>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-app-muted">Email</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-app-muted">Balance</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-app-muted">Profit</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-app-muted text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-app-surface transition-colors">
                    <td className="p-6 text-sm font-bold text-app-text">{u.email} {u.isAdmin && <span className="ml-2 text-[8px] px-1 py-0.5 bg-app-accent text-app-accent-text">ADMIN</span>}</td>
                    <td className="p-6 font-mono">${u.capitalBalance.toFixed(2)}</td>
                    <td className="p-6 font-mono text-green-500">${u.profitBalance.toFixed(2)}</td>
                    <td className="p-6 text-right space-x-2">
                      <button onClick={() => setCreditModal({ user: u, amount: '', type: 'capital' })} className="text-[10px] font-black border border-app-border px-4 py-2 hover:bg-app-accent hover:text-app-accent-text transition-colors">Credit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'fiat' && (
          <section className="space-y-16 animate-in fade-in">
              {/* Controls */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                  <div className="space-y-8">
                      <h2 className="text-xs font-black uppercase tracking-[0.4em] border-b border-app-border pb-4">Fiat Settings</h2>
                      <div className="space-y-4">
                         <div className="grid grid-cols-2 gap-4">
                             <button 
                                onClick={() => onUpdateSettings({ fiatDepositEnabled: !state.platformSettings.fiatDepositEnabled })} 
                                className={`py-4 text-[10px] font-black uppercase border border-app-border ${state.platformSettings.fiatDepositEnabled ? 'bg-green-500 text-white' : 'text-app-muted'}`}
                             >
                                 Deposits: {state.platformSettings.fiatDepositEnabled ? 'ON' : 'OFF'}
                             </button>
                             <button 
                                onClick={() => onUpdateSettings({ fiatWithdrawalEnabled: !state.platformSettings.fiatWithdrawalEnabled })} 
                                className={`py-4 text-[10px] font-black uppercase border border-app-border ${state.platformSettings.fiatWithdrawalEnabled ? 'bg-green-500 text-white' : 'text-app-muted'}`}
                             >
                                 Withdrawals: {state.platformSettings.fiatWithdrawalEnabled ? 'ON' : 'OFF'}
                             </button>
                         </div>
                         <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Deposit Rate (NGN {"->"} 1 USDT)</label>
                                <input type="number" value={rates.deposit} onChange={(e) => setRates({...rates, deposit: Number(e.target.value)})} className="w-full bg-app-bg border border-app-border p-3 text-sm font-mono" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Withdrawal Rate (1 USDT {"->"} NGN)</label>
                                <input type="number" value={rates.withdrawal} onChange={(e) => setRates({...rates, withdrawal: Number(e.target.value)})} className="w-full bg-app-bg border border-app-border p-3 text-sm font-mono" />
                            </div>
                         </div>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Paystack Secret Key (For Account Resolution)</label>
                            <input 
                                type="password" 
                                value={paystackKey} 
                                onChange={(e) => setPaystackKey(e.target.value)} 
                                className="w-full bg-app-bg border border-app-border p-3 text-sm font-mono" 
                                placeholder="sk_test_..."
                            />
                         </div>
                         <button onClick={handleSaveRates} className="w-full py-3 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-widest">Update Settings</button>
                      </div>
                  </div>

                  <div className="space-y-8">
                      <h2 className="text-xs font-black uppercase tracking-[0.4em] border-b border-app-border pb-4">System Bank Accounts</h2>
                      <div className="space-y-4">
                          {fiatBanks.map(bank => (
                              <div key={bank.id} className="p-4 border border-app-border bg-app-surface flex justify-between items-center">
                                  <div>
                                      <p className="font-bold text-sm">{bank.bankName}</p>
                                      <p className="text-xs font-mono">{bank.accountNumber} - {bank.accountName}</p>
                                  </div>
                                  <button onClick={() => deleteBankAccountFirestore(bank.id)} className="text-red-500 text-xs font-black uppercase hover:underline">Remove</button>
                              </div>
                          ))}
                          <div className="p-4 border border-app-border border-dashed space-y-2">
                              <input placeholder="Bank Name" value={newBank.bankName} onChange={e => setNewBank({...newBank, bankName: e.target.value})} className="w-full bg-transparent border-b border-app-border py-1 text-xs" />
                              <input placeholder="Account Name" value={newBank.accountName} onChange={e => setNewBank({...newBank, accountName: e.target.value})} className="w-full bg-transparent border-b border-app-border py-1 text-xs" />
                              <input placeholder="Account Number" value={newBank.accountNumber} onChange={e => setNewBank({...newBank, accountNumber: e.target.value})} className="w-full bg-transparent border-b border-app-border py-1 text-xs" />
                              <button onClick={handleSaveBank} className="w-full py-2 bg-app-text text-app-bg text-[9px] font-black uppercase mt-2">Add Bank</button>
                          </div>
                      </div>
                  </div>
              </div>

              {/* Requests */}
              <div className="space-y-8">
                  <h2 className="text-xs font-black uppercase tracking-[0.4em] border-b border-app-border pb-4">Pending Requests</h2>
                  {fiatRequests.length === 0 ? (
                      <div className="p-12 text-center text-app-muted italic opacity-50">No pending requests</div>
                  ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {fiatRequests.map(req => (
                              <div key={req.id} className="p-6 border border-app-border bg-app-bg space-y-4">
                                  <div className="flex justify-between items-start">
                                      <span className={`px-2 py-0.5 text-[9px] font-black uppercase ${req.type === 'DEPOSIT' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>{req.type}</span>
                                      <span className="text-[9px] mono opacity-50">{new Date(req.timestamp).toLocaleString()}</span>
                                  </div>
                                  
                                  <div className="space-y-1">
                                      <p className="text-xs font-bold text-app-muted">User: {users.find(u => u.id === req.userId)?.email}</p>
                                      <p className="text-xl font-black mono text-app-text">{req.amountUsdt.toFixed(2)} USDT</p>
                                      <p className="text-xs text-app-muted">Value: {req.amountNgn.toLocaleString()} NGN</p>
                                  </div>

                                  {req.type === 'DEPOSIT' && req.proofImage && (
                                      <div className="p-2 border border-app-border bg-app-surface">
                                          <p className="text-[9px] font-black uppercase mb-1">Proof</p>
                                          <img src={req.proofImage} alt="Proof" className="max-h-32 object-contain" />
                                      </div>
                                  )}

                                  {req.type === 'WITHDRAWAL' && (
                                      <div className="p-2 border border-app-border bg-app-surface text-xs font-mono">
                                          <p>Bank: {req.userBankName}</p>
                                          <p>Acc: {req.userAccountNumber}</p>
                                          <p>Name: {req.userAccountName}</p>
                                      </div>
                                  )}

                                  <div className="grid grid-cols-2 gap-2 pt-2">
                                      <button onClick={() => setFiatDecisionModal({ req, action: 'APPROVE' })} className="py-2 bg-green-500 text-white text-[9px] font-black uppercase hover:opacity-90">Approve</button>
                                      <button onClick={() => setFiatDecisionModal({ req, action: 'REJECT' })} className="py-2 bg-red-500 text-white text-[9px] font-black uppercase hover:opacity-90">Reject</button>
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
          </section>
      )}

      {/* Rest of the component code (no changes needed) */}
      {activeTab === 'referrals' && (
         <section className="space-y-12">
            <div className="flex justify-between items-center border-b border-app-border pb-4">
                <h2 className="text-xs font-black uppercase tracking-[0.4em]">Referral System</h2>
                <div className="flex items-center gap-4">
                    <span className="text-[10px] font-bold text-app-muted uppercase">Global Status</span>
                    <button onClick={() => onUpdateSettings({ isReferralSystemEnabled: !state.platformSettings.isReferralSystemEnabled })} className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest ${state.platformSettings.isReferralSystemEnabled ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                        {state.platformSettings.isReferralSystemEnabled ? 'ENABLED' : 'DISABLED'}
                    </button>
                </div>
            </div>
            <div className="space-y-8">
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                   {referralLevels.map((level, index) => (
                       <div key={level.level} className="p-8 border border-app-border bg-app-surface space-y-4">
                           <div className="flex justify-between items-center"><h3 className="text-[10px] font-black uppercase tracking-widest text-app-text">Level {level.level}</h3><button onClick={() => deleteReferralLevel(index)} className="text-red-500 hover:text-red-400 text-[10px] font-bold uppercase">Remove</button></div>
                           <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Commission %</label><input type="number" step="0.1" value={level.percentage} onChange={(e) => updateReferralLevel(index, Number(e.target.value))} className="w-full bg-app-bg border border-app-border p-4 text-xl font-mono text-app-text focus:border-app-accent outline-none" /></div>
                       </div>
                   ))}
                   <button onClick={addReferralLevel} className="p-8 border border-app-border border-dashed flex flex-col items-center justify-center gap-4 text-app-muted hover:text-app-text hover:border-app-text transition-all group"><i className="fa-solid fa-plus text-2xl group-hover:scale-110 transition-transform"></i><span className="text-[10px] font-black uppercase tracking-widest">Add New Level</span></button>
               </div>
               <div className="pt-8 border-t border-app-border"><button onClick={saveReferralConfig} className="px-12 py-4 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-[0.3em] hover:opacity-90">Save Configuration</button></div>
            </div>
         </section>
      )}

      {activeTab === 'guide' && (
         <section className="space-y-12">
            <div className="flex justify-between items-center border-b border-app-border pb-4">
                <h2 className="text-xs font-black uppercase tracking-[0.4em]">Quick Start Guide Config</h2>
                <div className="flex items-center gap-4">
                    <span className="text-[10px] font-bold text-app-muted uppercase">Popup Status</span>
                    <button onClick={() => { const newVal = !guideConfig.enabled; setGuideConfig({...guideConfig, enabled: newVal}); updatePlatformSettingsFirestore({ guideConfig: {...guideConfig, enabled: newVal} }); }} className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest ${guideConfig.enabled ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>{guideConfig.enabled ? 'ENABLED' : 'DISABLED'}</button>
                </div>
            </div>
            <div className="space-y-8">
               <div className="grid grid-cols-2 gap-8">
                   <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Modal Title</label><input type="text" value={guideConfig.title} onChange={(e) => setGuideConfig({...guideConfig, title: e.target.value})} className="w-full bg-app-bg border border-app-border p-4 text-sm text-app-text outline-none focus:border-app-accent" /></div>
                   <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Subtitle</label><input type="text" value={guideConfig.subtitle} onChange={(e) => setGuideConfig({...guideConfig, subtitle: e.target.value})} className="w-full bg-app-bg border border-app-border p-4 text-sm text-app-text outline-none focus:border-app-accent" /></div>
               </div>
               <div className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-app-muted">Guide Steps</h3>
                  <div className="grid grid-cols-1 gap-4">
                      {guideConfig.steps.map((step, index) => (
                          <div key={step.id || index} className="p-6 border border-app-border bg-app-surface space-y-4">
                              <div className="flex justify-between items-center"><span className="text-[10px] font-black bg-app-accent text-app-accent-text px-2 py-1">Step {index + 1}</span><button onClick={() => deleteGuideStep(index)} className="text-red-500 hover:text-red-400 text-[10px] font-bold uppercase">Delete</button></div>
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                  <div><input value={step.stepNumber} onChange={(e) => updateGuideStep(index, 'stepNumber', e.target.value)} className="w-full bg-app-bg border border-app-border p-2 text-xs" placeholder="No. (e.g. 01)" /></div>
                                  <div className="md:col-span-3"><input value={step.title} onChange={(e) => updateGuideStep(index, 'title', e.target.value)} className="w-full bg-app-bg border border-app-border p-2 text-xs font-bold" placeholder="Title" /></div>
                                  <div className="md:col-span-4"><textarea value={step.description} onChange={(e) => updateGuideStep(index, 'description', e.target.value)} className="w-full bg-app-bg border border-app-border p-2 text-xs h-20 resize-none" placeholder="Description" /></div>
                              </div>
                          </div>
                      ))}
                  </div>
                  <button onClick={addGuideStep} className="w-full py-3 border border-app-border border-dashed text-[10px] font-black uppercase text-app-muted hover:text-app-text hover:border-app-text transition-colors">+ Add New Step</button>
               </div>
            </div>
            <div className="pt-8 border-t border-app-border"><button onClick={handleSaveGuideConfig} className="px-12 py-4 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-[0.3em] hover:opacity-90">Save Guide Config</button></div>
         </section>
      )}

      {activeTab === 'gateways' && (
        <section className="space-y-12">
           <div className="flex justify-between items-center border-b border-app-border pb-4">
               <h2 className="text-xs font-black uppercase tracking-[0.4em]">Payment Gateway</h2>
               <div className="flex items-center gap-4">
                   <span className="text-[10px] font-bold text-app-muted uppercase">Status</span>
                   <button onClick={() => setPaymentConfig({...paymentConfig, isEnabled: !paymentConfig.isEnabled})} className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest ${paymentConfig.isEnabled ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>{paymentConfig.isEnabled ? 'ACTIVE' : 'DISABLED'}</button>
               </div>
           </div>
           <div className="max-w-2xl space-y-8">
              <div className="p-6 border border-app-border bg-app-surface space-y-4">
                  <div className="flex items-center gap-4"><div className="w-12 h-12 bg-blue-600 flex items-center justify-center text-white font-bold">NP</div><div><h3 className="text-sm font-bold text-app-text">NOWPayments</h3><p className="text-[10px] text-app-muted">Cryptocurrency Payment Processor</p></div></div>
              </div>
              <div className="space-y-6">
                  <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-app-muted">API Key</label><input type="password" value={paymentConfig.apiKey} onChange={(e) => setPaymentConfig({...paymentConfig, apiKey: e.target.value})} className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text focus:border-app-accent outline-none" placeholder="Enter NOWPayments API Key" /></div>
                  <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-app-muted">IPN Secret</label><input type="password" value={paymentConfig.ipnSecret} onChange={(e) => setPaymentConfig({...paymentConfig, ipnSecret: e.target.value})} className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text focus:border-app-accent outline-none" placeholder="Enter IPN Secret Key" /></div>
              </div>
              <div className="pt-8 border-t border-app-border"><button onClick={handleSavePaymentConfig} className="px-12 py-4 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-[0.3em] hover:opacity-90">Save Configuration</button></div>
              
              {/* Korapay Section */}
              <div className="pt-12 border-t border-app-border space-y-8">
                 <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4"><div className="w-12 h-12 bg-green-600 flex items-center justify-center text-white font-bold">KP</div><div><h3 className="text-sm font-bold text-app-text">Korapay</h3><p className="text-[10px] text-app-muted">Fiat Payment Processor (NGN)</p></div></div>
                    <div className="flex items-center gap-4">
                        <span className="text-[10px] font-bold text-app-muted uppercase">Status</span>
                        <button onClick={() => setKorapayConfig({...korapayConfig, depositsEnabled: !korapayConfig.depositsEnabled})} className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest ${korapayConfig.depositsEnabled ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>{korapayConfig.depositsEnabled ? 'ACTIVE' : 'DISABLED'}</button>
                    </div>
                 </div>
                 
                 <div className="space-y-6">
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Mode</label>
                            <div className="flex border border-app-border">
                                <button onClick={() => setKorapayConfig({...korapayConfig, mode: 'sandbox'})} className={`flex-1 py-3 text-[10px] font-black uppercase ${korapayConfig.mode === 'sandbox' ? 'bg-app-accent text-app-accent-text' : 'bg-app-bg text-app-muted'}`}>Sandbox</button>
                                <button onClick={() => setKorapayConfig({...korapayConfig, mode: 'live'})} className={`flex-1 py-3 text-[10px] font-black uppercase ${korapayConfig.mode === 'live' ? 'bg-red-500 text-white' : 'bg-app-bg text-app-muted'}`}>Live</button>
                            </div>
                        </div>
                        <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Min Deposit (NGN)</label><input type="number" value={korapayConfig.minDeposit} onChange={(e) => setKorapayConfig({...korapayConfig, minDeposit: Number(e.target.value)})} className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text focus:border-app-accent outline-none" /></div>
                     </div>

                     <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Public Key</label><input type="text" value={korapayConfig.publicKey} onChange={(e) => setKorapayConfig({...korapayConfig, publicKey: e.target.value})} className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text focus:border-app-accent outline-none" placeholder="pk_..." /></div>
                     <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Secret Key</label><input type="password" value={korapayConfig.secretKey} onChange={(e) => setKorapayConfig({...korapayConfig, secretKey: e.target.value})} className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text focus:border-app-accent outline-none" placeholder="sk_..." /></div>
                     <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Webhook Secret</label><input type="password" value={korapayConfig.webhookSecret} onChange={(e) => setKorapayConfig({...korapayConfig, webhookSecret: e.target.value})} className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text focus:border-app-accent outline-none" placeholder="Enter Webhook Secret" /></div>

                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Charge Type</label>
                            <select value={korapayConfig.depositChargeType} onChange={(e) => setKorapayConfig({...korapayConfig, depositChargeType: e.target.value as any})} className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text focus:border-app-accent outline-none">
                                <option value="none">None</option>
                                <option value="fixed">Fixed Amount</option>
                                <option value="percentage">Percentage</option>
                            </select>
                        </div>
                        <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Charge Value</label><input type="number" value={korapayConfig.depositChargeValue} onChange={(e) => setKorapayConfig({...korapayConfig, depositChargeValue: Number(e.target.value)})} className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text focus:border-app-accent outline-none" /></div>
                     </div>
                 </div>
                 <div className="pt-8 border-t border-app-border"><button onClick={handleSaveKorapayConfig} className="px-12 py-4 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-[0.3em] hover:opacity-90">Save Korapay Config</button></div>
              </div>
           </div>
        </section>
      )}

      {activeTab === 'tasks' && (
         <section className="space-y-12">
            <div className="flex justify-between items-center border-b border-app-border pb-4">
                <h2 className="text-xs font-black uppercase tracking-[0.4em]">WhatsApp Share Config</h2>
                <div className="flex items-center gap-4">
                    <span className="text-[10px] font-bold text-app-muted uppercase">Status</span>
                    <button onClick={() => { const newVal = !waConfig.enabled; setWaConfig({...waConfig, enabled: newVal}); updatePlatformSettingsFirestore({ whatsappConfig: {...waConfig, enabled: newVal} }); }} className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest ${waConfig.enabled ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>{waConfig.enabled ? 'ENABLED' : 'DISABLED'}</button>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                    <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Reward Amount (USDT)</label><input type="number" step="0.01" value={waConfig.rewardAmount} onChange={(e) => setWaConfig({...waConfig, rewardAmount: Number(e.target.value)})} className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text focus:border-app-accent outline-none" /></div>
                    <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Cooldown (Hours)</label><input type="number" value={waConfig.cooldownHours} onChange={(e) => setWaConfig({...waConfig, cooldownHours: Number(e.target.value)})} className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text focus:border-app-accent outline-none" /></div>
                </div>
                <div className="space-y-6">
                    <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Max Lifetime Shares per User</label><input type="number" value={waConfig.maxLifetimeShares} onChange={(e) => setWaConfig({...waConfig, maxLifetimeShares: Number(e.target.value)})} className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text focus:border-app-accent outline-none" /></div>
                    <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Message Template</label><input type="text" value={waConfig.messageTemplate} onChange={(e) => setWaConfig({...waConfig, messageTemplate: e.target.value})} className="w-full bg-app-bg border border-app-border p-4 text-sm text-app-text focus:border-app-accent outline-none" placeholder="Use {link} for referral link" /><p className="text-[8px] text-app-muted uppercase">Use <span className="text-app-accent">{'{link}'}</span> to insert user's referral link automatically.</p></div>
                </div>
            </div>
            <div className="pt-8 border-t border-app-border"><button onClick={handleSaveTaskConfig} className="px-12 py-4 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-[0.3em] hover:opacity-90">Save Configuration</button></div>
         </section>
      )}

      {activeTab === 'nodes' && (
        <section className="space-y-12">
          <div className="flex justify-between items-center"><h2 className="text-xs font-black uppercase tracking-[0.4em]">Node Configurator</h2><button onClick={() => setEditingNode({ name: '', minAmount: 20, maxAmount: 100, dailyRoi: 10, durationDays: 365, description: '', isActive: true, imageUrl: '' })} className="px-6 py-3 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-widest">Add New Node</button></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {state.packages.map(pkg => (
              <div key={pkg.id} className="p-8 border border-app-border bg-app-bg space-y-6 group">
                <div className="flex justify-between items-start"><h3 className="text-sm font-black uppercase tracking-widest text-app-text">{pkg.name}</h3><span className={`text-[8px] px-2 py-0.5 font-black uppercase tracking-widest ${pkg.isActive !== false ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>{pkg.isActive !== false ? 'ACTIVE' : 'OFFLINE'}</span></div>
                <div className="space-y-2"><p className="text-[10px] text-app-muted font-bold uppercase tracking-widest">ROI: {pkg.dailyRoi}% / {pkg.durationDays} Days</p><p className="text-[10px] text-app-muted font-bold uppercase tracking-widest">Range: ${pkg.minAmount} - ${pkg.maxAmount}</p></div>
                <div className="flex gap-2 pt-4 border-t border-app-border"><button onClick={() => setEditingNode(pkg)} className="flex-1 py-2 text-[10px] font-black uppercase border border-app-border hover:bg-app-accent hover:text-app-accent-text transition-colors">Edit</button><button onClick={() => confirm("Delete node?") && deletePackageFirestore(pkg.id)} className="px-4 py-2 text-[10px] font-black text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-colors"><i className="fa-solid fa-trash-can"></i></button></div>
              </div>
            ))}
          </div>

          {editingNode && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-6">
              <div className="bg-app-bg border border-app-border p-10 w-full max-w-xl space-y-8 shadow-2xl animate-in fade-in zoom-in duration-300 max-h-[90vh] overflow-y-auto">
                 <h3 className="text-xl font-black uppercase tracking-tighter">Node Editor</h3>
                 <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2"><label className="text-[10px] font-black uppercase text-app-muted">Name</label><input value={editingNode.name} onChange={e => setEditingNode({...editingNode, name: e.target.value})} className="w-full bg-app-surface border-b border-app-border py-2 text-sm text-app-text outline-none focus:border-app-accent" /></div>
                    <div className="space-y-2"><label className="text-[10px] font-black uppercase text-app-muted">Daily ROI %</label><input type="number" value={editingNode.dailyRoi} onChange={e => setEditingNode({...editingNode, dailyRoi: Number(e.target.value)})} className="w-full bg-app-surface border-b border-app-border py-2 text-sm text-app-text outline-none focus:border-app-accent" /></div>
                    <div className="space-y-2"><label className="text-[10px] font-black uppercase text-app-muted">Min Amount</label><input type="number" value={editingNode.minAmount} onChange={e => setEditingNode({...editingNode, minAmount: Number(e.target.value)})} className="w-full bg-app-surface border-b border-app-border py-2 text-sm text-app-text outline-none focus:border-app-accent" /></div>
                    <div className="space-y-2"><label className="text-[10px] font-black uppercase text-app-muted">Max Amount</label><input type="number" value={editingNode.maxAmount} onChange={e => setEditingNode({...editingNode, maxAmount: Number(e.target.value)})} className="w-full bg-app-surface border-b border-app-border py-2 text-sm text-app-text outline-none focus:border-app-accent" /></div>
                    <div className="col-span-2 space-y-2"><label className="text-[10px] font-black uppercase text-app-muted">Description</label><input value={editingNode.description} onChange={e => setEditingNode({...editingNode, description: e.target.value})} className="w-full bg-app-surface border-b border-app-border py-2 text-sm text-app-text outline-none focus:border-app-accent" /></div>
                    <div className="col-span-2 space-y-2"><label className="text-[10px] font-black uppercase text-app-muted">Node Image URL</label><input value={editingNode.imageUrl || ''} onChange={e => setEditingNode({...editingNode, imageUrl: e.target.value})} className="w-full bg-app-surface border-b border-app-border py-2 text-sm text-app-text outline-none focus:border-app-accent" placeholder="https://..." /></div>
                 </div>
                 <div className="flex gap-4"><button onClick={() => setEditingNode(null)} className="flex-1 py-4 border border-app-border text-[10px] font-black uppercase">Cancel</button><button onClick={handleSaveNode} className="flex-1 py-4 bg-app-accent text-app-accent-text text-[10px] font-black uppercase">Save Configuration</button></div>
              </div>
            </div>
          )}
        </section>
      )}

      {creditModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-6">
          <div className="bg-app-bg border border-app-border p-8 w-full max-w-md space-y-8 shadow-2xl animate-in fade-in zoom-in duration-300">
             <div className="space-y-2">
               <h3 className="text-xl font-black uppercase tracking-tighter text-app-text">Manual Credit</h3>
               <p className="text-xs font-bold text-app-muted">Adjusting balance for <span className="text-app-text">{creditModal.user.email}</span></p>
             </div>
             <div className="space-y-6">
                <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Amount (USDT)</label><input type="number" autoFocus value={creditModal.amount} onChange={(e) => setCreditModal({...creditModal, amount: e.target.value})} className="w-full bg-app-surface border-b border-app-border py-3 text-lg font-mono text-app-text outline-none focus:border-app-accent" placeholder="0.00" /></div>
                <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Destination Balance</label><div className="grid grid-cols-2 gap-px bg-app-border"><button onClick={() => setCreditModal({...creditModal, type: 'capital'})} className={`py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${creditModal.type === 'capital' ? 'bg-app-accent text-app-accent-text' : 'bg-app-bg text-app-muted hover:text-app-text'}`}>Capital</button><button onClick={() => setCreditModal({...creditModal, type: 'profit'})} className={`py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${creditModal.type === 'profit' ? 'bg-app-accent text-app-accent-text' : 'bg-app-bg text-app-muted hover:text-app-text'}`}>Profit</button></div></div>
             </div>
             <div className="flex gap-4 pt-4 border-t border-app-border">
                <button onClick={() => setCreditModal(null)} disabled={isCrediting} className="flex-1 py-3 border border-app-border text-[10px] font-black uppercase tracking-widest text-app-muted hover:text-app-text">Cancel</button>
                <button type="button" disabled={isCrediting} onClick={async (e) => { e.preventDefault(); const amt = Number(creditModal.amount); if (!creditModal.amount || isNaN(amt) || amt <= 0) { alert("Please enter a valid amount greater than 0."); return; } setIsCrediting(true); try { await adminCreditUserFirestore(creditModal.user.id, amt, creditModal.type); setCreditModal(null); alert(`Successfully credited $${creditModal.amount} to ${creditModal.type} balance.`); } catch (err: any) { alert(`Error: ${err.message}`); } finally { setIsCrediting(false); } }} className="flex-1 py-3 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-50">{isCrediting ? 'Processing...' : 'Confirm Credit'}</button>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'korapay' && (
        <section className="space-y-12">
           <div className="flex justify-between items-center border-b border-app-border pb-4">
               <h2 className="text-xs font-black uppercase tracking-[0.4em]">Korapay Deposit Settings</h2>
               <div className="flex items-center gap-4">
                   <span className="text-[10px] font-bold text-app-muted uppercase">Status</span>
                   <button 
                      onClick={() => {
                        const newSettings = { ...state.korapaySettings, deposits_enabled: !state.korapaySettings?.deposits_enabled };
                        onUpdateSettings({ korapaySettings: newSettings as any });
                      }} 
                      className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest ${state.korapaySettings?.deposits_enabled ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}
                   >
                     {state.korapaySettings?.deposits_enabled ? 'ACTIVE' : 'DISABLED'}
                   </button>
               </div>
           </div>
           <div className="max-w-2xl space-y-8">
              <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Public Key</label>
                    <input 
                      type="text" 
                      value={state.korapaySettings?.public_key || ''} 
                      onChange={(e) => onUpdateSettings({ korapaySettings: { ...state.korapaySettings, public_key: e.target.value } as any })} 
                      className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text focus:border-app-accent outline-none" 
                      placeholder="pk_..." 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Secret Key</label>
                    <input 
                      type="password" 
                      value={state.korapaySettings?.secret_key || ''} 
                      onChange={(e) => onUpdateSettings({ korapaySettings: { ...state.korapaySettings, secret_key: e.target.value } as any })} 
                      className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text focus:border-app-accent outline-none" 
                      placeholder="sk_..." 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Webhook Secret</label>
                    <input 
                      type="password" 
                      value={state.korapaySettings?.webhook_secret || ''} 
                      onChange={(e) => onUpdateSettings({ korapaySettings: { ...state.korapaySettings, webhook_secret: e.target.value } as any })} 
                      className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text focus:border-app-accent outline-none" 
                      placeholder="Webhook Secret" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Mode</label>
                    <select 
                      value={state.korapaySettings?.mode || 'sandbox'} 
                      onChange={(e) => onUpdateSettings({ korapaySettings: { ...state.korapaySettings, mode: e.target.value as 'sandbox' | 'live' } as any })}
                      className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text focus:border-app-accent outline-none"
                    >
                      <option value="sandbox">Sandbox</option>
                      <option value="live">Live</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Min Deposit (NGN)</label>
                      <input 
                        type="number" 
                        value={state.korapaySettings?.min_deposit || 0} 
                        onChange={(e) => onUpdateSettings({ korapaySettings: { ...state.korapaySettings, min_deposit: Number(e.target.value) } as any })} 
                        className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text focus:border-app-accent outline-none" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Max Deposit (NGN)</label>
                      <input 
                        type="number" 
                        value={state.korapaySettings?.max_deposit || 0} 
                        onChange={(e) => onUpdateSettings({ korapaySettings: { ...state.korapaySettings, max_deposit: Number(e.target.value) } as any })} 
                        className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text focus:border-app-accent outline-none" 
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Charge Type</label>
                      <select 
                        value={state.korapaySettings?.deposit_charge_type || 'fixed'} 
                        onChange={(e) => onUpdateSettings({ korapaySettings: { ...state.korapaySettings, deposit_charge_type: e.target.value as 'fixed' | 'percentage' } as any })}
                        className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text focus:border-app-accent outline-none"
                      >
                        <option value="fixed">Fixed Amount</option>
                        <option value="percentage">Percentage (%)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Charge Value</label>
                      <input 
                        type="number" 
                        value={state.korapaySettings?.deposit_charge_value || 0} 
                        onChange={(e) => onUpdateSettings({ korapaySettings: { ...state.korapaySettings, deposit_charge_value: Number(e.target.value) } as any })} 
                        className="w-full bg-app-bg border border-app-border p-4 text-sm font-mono text-app-text focus:border-app-accent outline-none" 
                      />
                    </div>
                  </div>
              </div>
              <div className="pt-8 border-t border-app-border">
                <button 
                  onClick={() => alert('Korapay settings saved automatically when changed.')} 
                  className="px-12 py-4 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-[0.3em] hover:opacity-90"
                >
                  Save Configuration
                </button>
              </div>
           </div>
        </section>
      )}

      {/* FIAT DECISION MODAL */}
      <AnimatePresence>
        {fiatDecisionModal && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-6">
                <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }} 
                    animate={{ scale: 1, opacity: 1 }} 
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-app-bg border border-app-border p-8 w-full max-w-md space-y-6 shadow-2xl"
                >
                    <div className="space-y-2">
                        <h3 className="text-xl font-black uppercase tracking-tighter text-app-text">Confirm {fiatDecisionModal.action === 'APPROVE' ? 'Approval' : 'Rejection'}</h3>
                        <p className="text-xs text-app-muted">Action cannot be undone.</p>
                    </div>

                    <div className="space-y-4 border-y border-app-border py-6">
                        <div className="flex justify-between text-xs">
                            <span className="text-app-muted">Type</span>
                            <span className={`font-black uppercase ${fiatDecisionModal.req.type === 'DEPOSIT' ? 'text-green-500' : 'text-orange-500'}`}>{fiatDecisionModal.req.type}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-app-muted">User</span>
                            <span className="font-bold text-app-text">{users.find(u => u.id === fiatDecisionModal.req.userId)?.email || 'Unknown'}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-app-muted">Amount</span>
                            <span className="font-bold text-app-text mono">{fiatDecisionModal.req.amountUsdt.toFixed(2)} USDT</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-app-muted">Fiat Value</span>
                            <span className="font-bold text-app-text mono">{fiatDecisionModal.req.amountNgn.toLocaleString()} NGN</span>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <button 
                            type="button"
                            onClick={() => setFiatDecisionModal(null)}
                            disabled={isProcessingFiat}
                            className="flex-1 py-3 border border-app-border text-[10px] font-black uppercase tracking-widest text-app-muted hover:text-app-text"
                        >
                            Cancel
                        </button>
                        <button 
                            type="button"
                            onClick={executeFiatDecision}
                            disabled={isProcessingFiat}
                            className={`flex-1 py-3 text-white text-[10px] font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-50 ${fiatDecisionModal.action === 'APPROVE' ? 'bg-green-500' : 'bg-red-500'}`}
                        >
                            {isProcessingFiat ? 'Processing...' : `Confirm ${fiatDecisionModal.action === 'APPROVE' ? 'Approve' : 'Reject'}`}
                        </button>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminPanel;