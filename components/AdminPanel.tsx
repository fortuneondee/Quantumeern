import React, { useState, useEffect } from 'react';
import { AppState, User, TransactionStatus, HotWalletConfig } from '../types.ts';
import { doc, getDoc, setDoc, collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from '../firebase.ts';
import { authorizeWithdrawalFirestore, toggleUserAdminFirestore, adminCreditUserFirestore, adminSweepUserFundsWithAmount } from '../store.ts';
import { getWalletBalances } from '../tronService.ts';

interface AdminPanelProps {
  state: AppState;
  onUpdateSettings: (settings: Partial<AppState['platformSettings']>) => void;
  onTriggerRoi: (e?: React.MouseEvent) => void;
  onManageWithdrawal: (txId: string, status: TransactionStatus) => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ state, onUpdateSettings, onTriggerRoi, onManageWithdrawal }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [hotWallet, setHotWallet] = useState<HotWalletConfig>({
    address: '',
    privateKey: '',
    lastSyncTimestamp: Date.now()
  });
  const [isSavingWallet, setIsSavingWallet] = useState(false);

  // Credit Modal State
  const [creditModal, setCreditModal] = useState<{user: User, amount: string, type: 'capital' | 'profit'} | null>(null);
  const [isCrediting, setIsCrediting] = useState(false);

  // Sweep Modal State
  const [sweepModal, setSweepModal] = useState<{user: User} | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [isSweeping, setIsSweeping] = useState(false);
  const [sweepDetails, setSweepDetails] = useState<{
    onChainUsdt: number;
    onChainTrx: number;
    destination: string;
    gasKey: string;
    hotWalletTrx: number; // New: Track Hot Wallet Gas
  }>({
    onChainUsdt: 0,
    onChainTrx: 0,
    destination: '',
    gasKey: '',
    hotWalletTrx: 0
  });

  const pendingWithdrawals = state.transactions.filter(tx => tx.type === 'WITHDRAWAL' && tx.status === 'PENDING');

  useEffect(() => {
    // Real-time listener for all users
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => ({ ...d.data(), id: d.id } as User)));
    }, (error) => {
       const msg = error?.message || "Sync failed";
       console.error("Admin user sync failed:", msg);
    });

    const loadVault = async () => {
      try {
        const vaultSnap = await getDoc(doc(db, 'vault', 'hotwallet'));
        if (vaultSnap.exists()) {
          const hw = vaultSnap.data() as HotWalletConfig;
          setHotWallet(hw);
          setSweepDetails(prev => ({
            ...prev,
            destination: hw.address,
            gasKey: hw.privateKey
          }));
        }
      } catch (e) {
        console.warn("Vault access restricted");
      }
    };
    loadVault();

    return () => unsub();
  }, []);

  const saveHotWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingWallet(true);
    try {
      await setDoc(doc(db, 'vault', 'hotwallet'), hotWallet);
      alert('Hot wallet configuration saved.');
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsSavingWallet(false);
    }
  };

  const handleAuthorize = async (txId: string) => {
    if (!hotWallet.privateKey) {
      alert("Configure Hot Wallet Private Key first!");
      return;
    }
    if (!confirm("Confirm transfer from Hot Wallet?")) return;
    
    try {
      const hash = await authorizeWithdrawalFirestore(txId, hotWallet);
      alert(`Success! TX: ${hash}`);
    } catch (err: any) {
      alert(`Failed: ${err.message}`);
    }
  };

  const handleToggleAdmin = async (user: User) => {
    if (user.id === state.currentUser?.id) {
      alert("You cannot demote yourself.");
      return;
    }
    const action = user.isAdmin ? 'Demote' : 'Promote';
    if (confirm(`${action} ${user.email} to Admin?`)) {
      try {
        await toggleUserAdminFirestore(user.id, user.isAdmin);
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  const handleSubmitCredit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!creditModal) return;
    
    const amt = parseFloat(creditModal.amount);
    if (isNaN(amt) || amt <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    setIsCrediting(true);
    try {
      await adminCreditUserFirestore(creditModal.user.id, amt, creditModal.type);
      alert("Funds credited successfully.");
      setCreditModal(null);
    } catch (err: any) {
      const msg = err?.message || 'Unknown error';
      console.error("Credit failed:", msg);
      alert(`Error: ${msg}`);
    } finally {
      setIsCrediting(false);
    }
  };

  const handleOpenSweep = async (user: User) => {
    setSweepModal({ user });
    setIsCheckingBalance(true);
    try {
      // 1. Fetch User Balance
      const userBalances = await getWalletBalances(user.usdtDepositAddress);
      
      // 2. Fetch Hot Wallet Balance (To ensure we have Gas)
      let hwTrx = 0;
      if (hotWallet.address) {
        const hwBalances = await getWalletBalances(hotWallet.address);
        hwTrx = hwBalances.trx;
      }

      setSweepDetails(prev => ({
        ...prev,
        onChainUsdt: userBalances.usdt,
        onChainTrx: userBalances.trx,
        hotWalletTrx: hwTrx,
        destination: hotWallet.address || prev.destination,
        gasKey: hotWallet.privateKey || prev.gasKey
      }));
    } catch (err) {
      console.error("Failed to check balance", err);
    } finally {
      setIsCheckingBalance(false);
    }
  };

  const executeSweep = async () => {
    if (!sweepModal || !sweepModal.user.depositPrivateKey) {
      alert("User wallet keys missing.");
      return;
    }
    if (!sweepDetails.destination || !sweepDetails.gasKey) {
      alert("Destination address and Gas Key are required.");
      return;
    }
    if (sweepDetails.onChainUsdt < 1) {
        if(!confirm("USDT Balance is very low. Sweep anyway?")) return;
    }

    setIsSweeping(true);
    try {
      await adminSweepUserFundsWithAmount(
        sweepModal.user.id,
        sweepModal.user.depositPrivateKey,
        sweepModal.user.usdtDepositAddress,
        sweepDetails.destination,
        sweepDetails.gasKey,
        sweepDetails.onChainUsdt
      );
      alert("Sweep successful! Funds moved to hot wallet.");
      setSweepModal(null);
    } catch (err: any) {
      alert("Sweep Failed: " + err.message);
    } finally {
      setIsSweeping(false);
    }
  };

  const stats = [
    { label: 'Total Users', value: users.length },
    { label: 'Total Deposits', value: `${users.reduce((acc, u) => acc + u.capitalBalance, 0).toFixed(0)}` },
    { label: 'Total Payable', value: `${users.reduce((acc, u) => acc + u.profitBalance, 0).toFixed(0)}` },
    { label: 'Active Plans', value: state.activePackages.filter(p => p.isActive).length }
  ];

  return (
    <div className="space-y-24 max-w-7xl mx-auto pb-32">
      <div className="flex flex-col lg:flex-row justify-between items-end gap-8">
        <div className="space-y-4 flex-1">
          <h1 className="text-6xl lg:text-9xl font-black uppercase tracking-tighter leading-[0.85] text-app-text">Admin<br/>Dashboard.</h1>
          <p className="serif italic text-2xl text-app-muted max-w-xl">Manage platform settings, users, and withdrawals.</p>
        </div>
        <button 
          onClick={() => onTriggerRoi()}
          className="px-12 py-6 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-[0.4em] hover:opacity-90 transition-all flex items-center gap-4"
        >
          Pay Daily ROI
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 border-t border-l border-app-border">
        {stats.map((stat, i) => (
          <div key={i} className="border-r border-b border-app-border p-12 space-y-8">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-app-muted">{stat.label}</p>
            <p className="text-5xl font-black mono tracking-tighter text-app-text">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* User Management Section */}
      <section className="space-y-12">
        <div className="flex items-center justify-between border-b border-app-border pb-4">
          <h2 className="text-xs font-black uppercase tracking-[0.4em] text-app-text">Users</h2>
          <span className="text-[10px] font-bold text-app-muted uppercase tracking-widest">{users.length} Registered</span>
        </div>
        
        <div className="overflow-x-auto border border-app-border">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-app-surface">
                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-app-muted border-b border-app-border">Email</th>
                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-app-muted border-b border-app-border">ID</th>
                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-app-muted border-b border-app-border">Balance</th>
                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-app-muted border-b border-app-border">Profit</th>
                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-app-muted border-b border-app-border text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-app-surface transition-colors group">
                  <td className="p-6 border-b border-app-border">
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-app-text">{u.email}</p>
                      {u.isAdmin && <span className="text-[8px] px-1.5 py-0.5 bg-app-accent text-app-accent-text font-black uppercase tracking-tighter">Admin</span>}
                    </div>
                  </td>
                  <td className="p-6 border-b border-app-border text-xs font-mono text-app-muted">0x{u.id.slice(0, 8).toUpperCase()}</td>
                  <td className="p-6 border-b border-app-border text-sm font-bold mono text-app-text">${u.capitalBalance.toFixed(2)}</td>
                  <td className="p-6 border-b border-app-border text-sm font-bold mono text-green-500">${u.profitBalance.toFixed(2)}</td>
                  <td className="p-6 border-b border-app-border text-right space-x-2">
                    <button 
                      onClick={() => handleOpenSweep(u)}
                      className="text-[10px] font-black uppercase tracking-widest px-4 py-2 border border-app-border text-yellow-500 hover:bg-yellow-500 hover:text-black hover:border-yellow-500 transition-all"
                    >
                      Sweep
                    </button>
                    <button 
                      onClick={() => setCreditModal({ user: u, amount: '', type: 'capital' })}
                      className="text-[10px] font-black uppercase tracking-widest px-4 py-2 border border-app-border text-app-text hover:bg-app-accent hover:text-app-accent-text hover:border-app-accent transition-all"
                    >
                      Credit
                    </button>
                    <button 
                      onClick={() => handleToggleAdmin(u)}
                      className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 border transition-all ${
                        u.isAdmin ? 'border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white' : 'border-app-border text-app-muted hover:border-app-text hover:text-app-text'
                      }`}
                    >
                      {u.isAdmin ? 'Demote' : 'Promote'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Credit User Modal */}
      {creditModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <form onSubmit={handleSubmitCredit} className="bg-app-bg border border-app-border p-8 w-full max-w-md space-y-8 shadow-2xl">
             <div className="space-y-2">
               <h3 className="text-xl font-black uppercase tracking-tighter text-app-text">Credit User</h3>
               <p className="text-xs font-bold text-app-muted truncate">Target: {creditModal.user.email}</p>
             </div>
             
             <div className="space-y-6">
                <div className="space-y-2 group">
                  <label className="text-[10px] font-black uppercase tracking-widest text-app-muted group-focus-within:text-app-text transition-colors">Amount (USDT)</label>
                  <input 
                    type="number" 
                    value={creditModal.amount} 
                    onChange={(e) => setCreditModal(prev => prev ? ({...prev, amount: e.target.value}) : null)} 
                    autoFocus
                    className="w-full bg-transparent border-b border-app-border py-2 outline-none focus:border-app-text transition-colors font-mono text-lg text-app-text" 
                    placeholder="0.00" 
                  />
                </div>

                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Destination</label>
                   <div className="grid grid-cols-2 gap-px bg-app-border">
                      <button 
                        type="button"
                        onClick={() => setCreditModal(prev => prev ? ({...prev, type: 'capital'}) : null)}
                        className={`py-3 text-[10px] font-bold uppercase tracking-widest transition-colors ${creditModal.type === 'capital' ? 'bg-app-accent text-app-accent-text' : 'bg-app-bg text-app-muted hover:text-app-text'}`}
                      >
                        Wallet Balance
                      </button>
                      <button 
                        type="button"
                        onClick={() => setCreditModal(prev => prev ? ({...prev, type: 'profit'}) : null)}
                        className={`py-3 text-[10px] font-bold uppercase tracking-widest transition-colors ${creditModal.type === 'profit' ? 'bg-app-accent text-app-accent-text' : 'bg-app-bg text-app-muted hover:text-app-text'}`}
                      >
                        Profit Balance
                      </button>
                   </div>
                </div>
             </div>

             <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setCreditModal(null)}
                  className="flex-1 py-3 border border-app-border text-[10px] font-black uppercase tracking-widest text-app-muted hover:text-app-text hover:border-app-text transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isCrediting}
                  className="flex-1 py-3 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isCrediting ? 'Processing...' : 'Confirm Credit'}
                </button>
             </div>
          </form>
        </div>
      )}

      {/* Sweep Modal */}
      {sweepModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-6">
           <div className="bg-app-bg border border-app-border p-8 w-full max-w-lg space-y-8 shadow-2xl">
              <div className="space-y-2">
                 <h3 className="text-xl font-black uppercase tracking-tighter text-app-text">Manual Sweep</h3>
                 <p className="text-xs font-bold text-app-muted truncate">Target: {sweepModal.user.email}</p>
                 <p className="text-[10px] text-app-muted">Moves funds from User Wallet to Hot Wallet. <br/> <span className="text-app-accent">User's platform balance will remain unchanged.</span></p>
              </div>

              {isCheckingBalance ? (
                <div className="py-8 text-center space-y-4">
                   <div className="w-8 h-8 border-2 border-app-accent border-t-transparent rounded-full animate-spin mx-auto"></div>
                   <p className="text-[10px] font-bold uppercase tracking-widest text-app-muted">Scanning Blockchain...</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                     <div className="p-4 border border-app-border bg-app-surface">
                        <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">User USDT</p>
                        <p className="text-xl font-mono font-bold text-app-text">{sweepDetails.onChainUsdt.toFixed(2)}</p>
                     </div>
                     <div className="p-4 border border-app-border bg-app-surface">
                        <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">User TRX (Gas)</p>
                        <p className={`text-xl font-mono font-bold ${sweepDetails.onChainTrx < 30 ? 'text-yellow-500' : 'text-green-500'}`}>{sweepDetails.onChainTrx.toFixed(2)}</p>
                     </div>
                  </div>

                  <div className="p-4 border border-app-border bg-app-surface/50">
                    <div className="flex justify-between items-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">Admin Hot Wallet TRX (For Gas Injection)</p>
                        <p className={`text-lg font-mono font-bold ${sweepDetails.hotWalletTrx < 30 ? 'text-red-500' : 'text-green-500'}`}>
                            {sweepDetails.hotWalletTrx.toFixed(2)} TRX
                        </p>
                    </div>
                    {sweepDetails.hotWalletTrx < 30 && (
                        <p className="text-[9px] text-red-500 font-bold uppercase tracking-widest mt-2 animate-pulse">
                            ⚠️ Warning: Insufficient TRX in Hot Wallet to fund gas fees. Sweep may fail.
                        </p>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Destination (Hot Wallet)</label>
                      <input 
                        type="text" 
                        value={sweepDetails.destination}
                        onChange={(e) => setSweepDetails({...sweepDetails, destination: e.target.value})}
                        className="w-full bg-transparent border-b border-app-border py-2 text-xs font-mono text-app-text outline-none focus:border-app-accent"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Gas Payer Key (Private Key)</label>
                      <input 
                        type="password" 
                        value={sweepDetails.gasKey}
                        onChange={(e) => setSweepDetails({...sweepDetails, gasKey: e.target.value})}
                        className="w-full bg-transparent border-b border-app-border py-2 text-xs font-mono text-app-text outline-none focus:border-app-accent"
                      />
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button 
                      onClick={() => setSweepModal(null)}
                      className="flex-1 py-3 border border-app-border text-[10px] font-black uppercase tracking-widest text-app-muted hover:text-app-text transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={executeSweep}
                      disabled={isSweeping || sweepDetails.onChainUsdt === 0 || sweepDetails.hotWalletTrx < 1}
                      className="flex-1 py-3 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSweeping ? 'Sweeping...' : 'Confirm Sweep'}
                    </button>
                  </div>
                </>
              )}
           </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-24">
        {/* Hot Wallet Module */}
        <div className="space-y-12">
          <h2 className="text-xs font-black uppercase tracking-[0.4em] border-b border-app-border pb-4 text-app-text">Platform Wallet Settings</h2>
          <form onSubmit={saveHotWallet} className="p-10 border border-app-border space-y-8 bg-app-surface">
             <div className="space-y-4">
               <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Wallet Address (TRC20)</label>
               <input 
                type="text"
                value={hotWallet.address}
                onChange={(e) => setHotWallet({...hotWallet, address: e.target.value})}
                className="w-full bg-transparent border-b border-app-border py-4 outline-none focus:border-app-text transition-all font-mono text-sm text-app-text"
                placeholder="T..."
               />
             </div>
             <div className="space-y-4">
               <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Private Key</label>
               <input 
                type="password"
                value={hotWallet.privateKey}
                onChange={(e) => setHotWallet({...hotWallet, privateKey: e.target.value})}
                className="w-full bg-transparent border-b border-app-border py-4 outline-none focus:border-app-text transition-all font-mono text-sm text-app-text"
                placeholder="0x..."
               />
               <p className="text-[8px] text-red-500 font-bold uppercase tracking-widest animate-pulse">Warning: This key is used for automated payouts.</p>
             </div>
             <button 
              type="submit"
              disabled={isSavingWallet}
              className="w-full py-5 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-[0.3em] hover:opacity-90 transition-all"
             >
               {isSavingWallet ? 'Saving...' : 'Update Settings'}
             </button>
          </form>

          <h2 className="text-xs font-black uppercase tracking-[0.4em] border-b border-app-border pb-4 text-app-text">Platform Settings</h2>
          <div className="space-y-px bg-app-border border border-app-border">
            <div className="flex items-center justify-between p-10 bg-app-bg">
              <div className="space-y-1">
                <p className="text-xs font-black uppercase tracking-widest text-app-text">ROI System</p>
                <p className="text-[10px] text-app-muted uppercase font-bold tracking-widest">Daily Payouts</p>
              </div>
              <button 
                onClick={() => onUpdateSettings({ isRoiEnabled: !state.platformSettings.isRoiEnabled })}
                className={`px-6 py-2 border transition-all text-[10px] font-black uppercase tracking-widest ${
                  state.platformSettings.isRoiEnabled ? 'bg-app-accent text-app-accent-text border-app-accent' : 'bg-transparent text-app-muted border-app-border'
                }`}
              >
                {state.platformSettings.isRoiEnabled ? 'Active' : 'Offline'}
              </button>
            </div>

            <div className="flex items-center justify-between p-10 bg-app-bg">
              <div className="space-y-1">
                <p className="text-xs font-black uppercase tracking-widest text-app-text">Maintenance Mode</p>
                <p className="text-[10px] text-app-muted uppercase font-bold tracking-widest">Pause Platform</p>
              </div>
              <button 
                onClick={() => onUpdateSettings({ platformPaused: !state.platformSettings.platformPaused })}
                className={`px-6 py-2 border transition-all text-[10px] font-black uppercase tracking-widest ${
                  state.platformSettings.platformPaused ? 'bg-app-accent text-app-accent-text border-app-accent' : 'bg-transparent text-app-muted border-app-border'
                }`}
              >
                {state.platformSettings.platformPaused ? 'On' : 'Off'}
              </button>
            </div>
          </div>
        </div>

        {/* Withdrawal Terminal */}
        <div className="space-y-12">
          <h2 className="text-xs font-black uppercase tracking-[0.4em] border-b border-app-border pb-4 text-app-text">Withdrawal Requests</h2>

          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {pendingWithdrawals.length === 0 ? (
              <div className="p-20 text-center opacity-20 serif italic border border-app-border border-dashed text-app-muted">
                No pending withdrawals.
              </div>
            ) : (
              pendingWithdrawals.map(tx => {
                const txUser = users.find(u => u.id === tx.userId);
                return (
                  <div key={tx.id} className="p-10 border border-app-border space-y-8 bg-app-surface">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-4xl font-black mono tracking-tighter mb-1 text-app-text">{tx.amount.toFixed(2)}</p>
                        <p className="text-[10px] font-bold text-app-muted uppercase tracking-widest">{txUser?.email}</p>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 border border-app-border font-black uppercase tracking-widest text-app-text">Pending</span>
                    </div>
                    <p className="text-[10px] font-mono text-app-muted break-all">{tx.description}</p>
                    <div className="flex gap-px bg-app-border">
                      <button 
                        onClick={() => handleAuthorize(tx.id)}
                        className="flex-1 py-4 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all"
                      >
                        Approve
                      </button>
                      <button 
                        onClick={() => onManageWithdrawal(tx.id, TransactionStatus.REJECTED)}
                        className="flex-1 py-4 bg-transparent border border-app-border text-app-text text-[10px] font-black uppercase tracking-widest hover:bg-app-accent/5 transition-all"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;