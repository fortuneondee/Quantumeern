
import React, { useState, useEffect } from 'react';
import { User, Transaction, UserPackage, TransactionType, WhatsappTaskConfig, Package } from '../types.ts';
import { motion } from 'framer-motion';
import { performWhatsappShareTask } from '../store.ts';

interface DashboardProps {
  user: User;
  transactions: Transaction[];
  activePackages: UserPackage[];
  packages: Package[];
  whatsappConfig?: WhatsappTaskConfig;
}

const Dashboard: React.FC<DashboardProps> = ({ user, transactions, activePackages, packages, whatsappConfig }) => {
  const activeStakes = activePackages.filter(p => p.isActive).reduce((sum, p) => sum + p.amount, 0);
  
  const currentPkg = activePackages.find(p => p.isActive);
  // Resolve package details from the passed packages prop (dynamic source) instead of static constant
  const pkgDetails = currentPkg ? packages.find(p => p.id === currentPkg.packageId) : null;

  const [timeLeft, setTimeLeft] = useState<string>('');
  
  // WhatsApp Task State
  const [isWaTaskProcessing, setIsWaTaskProcessing] = useState(false);
  const [waTaskStatus, setWaTaskStatus] = useState<'IDLE' | 'SHARED' | 'CLAIMING'>('IDLE');

  // Transaction Ledger State
  const [viewAllTx, setViewAllTx] = useState(false);
  
  // Terminal State
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);

  useEffect(() => {
    // Only run simulator if there is an active package
    if (!currentPkg) return;

    const interval = setInterval(() => {
        const ops = ['SYNC', 'HASH', 'BLOCK', 'VAL', 'NET'];
        const op = ops[Math.floor(Math.random() * ops.length)];
        const val = Math.floor(Math.random() * 9999);
        const hash = Math.random().toString(36).substring(7).toUpperCase();
        setTerminalLogs(prev => [`> ${op}_${val}::${hash} [OK]`, ...prev].slice(0, 5));
    }, 1200);
    return () => clearInterval(interval);
  }, [currentPkg]);

  useEffect(() => {
    if (!currentPkg) {
      setTimeLeft('');
      return;
    }

    const lastPayout = currentPkg.lastPayoutAt || currentPkg.activatedAt;
    const nextPayoutTime = lastPayout + (24 * 60 * 60 * 1000);
    const dateObj = new Date(nextPayoutTime);
    
    // Format: "Oct 25, 01:00 AM"
    const formatted = dateObj.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
    
    setTimeLeft(formatted);
  }, [currentPkg]);

  const stats = [
    { label: 'Total Asset Value', value: user.capitalBalance + user.profitBalance + activeStakes + user.welcomeBonus, type: 'currency', icon: 'fa-vault' },
    { label: 'Wallet Balance', value: user.capitalBalance, type: 'currency', icon: 'fa-wallet' },
    { label: 'Active Staked', value: activeStakes, type: 'currency', icon: 'fa-server' },
    { 
      label: 'Yield Generated', 
      value: user.profitBalance, 
      type: 'currency', 
      icon: 'fa-arrow-trend-up',
      countdown: timeLeft 
    },
    { label: 'Welcome Bonus', value: user.welcomeBonus, type: 'currency', icon: 'fa-gift', highlight: true },
    // Only show terminal card if user has an active node
    ...(currentPkg ? [{ isTerminal: true }] : [])
  ];

  const getTxSign = (type: TransactionType) => {
    return (type === TransactionType.WITHDRAWAL || type === TransactionType.PURCHASE) ? '-' : '+';
  };

  const getTxIcon = (type: TransactionType) => {
    if (type === TransactionType.WITHDRAWAL) return 'fa-arrow-up';
    if (type === TransactionType.PURCHASE) return 'fa-cart-shopping';
    if (type === TransactionType.TASK_REWARD) return 'fa-check-circle';
    return 'fa-arrow-down';
  };

  // Calculate Daily Earnings from ALL active packages
  const dailyEarnings = activePackages
    .filter(p => p.isActive)
    .reduce((total, p) => {
        const pkgInfo = packages.find(pkg => pkg.id === p.packageId);
        return total + (pkgInfo ? (p.amount * (pkgInfo.dailyRoi / 100)) : 0);
    }, 0);

  // Task Handlers
  const handleShareClick = () => {
     if (!whatsappConfig || !whatsappConfig.enabled) return;
     
     // Construct Message
     const refLink = `${window.location.origin}?ref=${user.referralCode}`;
     const message = whatsappConfig.messageTemplate.replace('{link}', refLink);
     const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
     
     // Open WhatsApp
     window.open(url, '_blank');
     
     // Update UI State to prompt claim
     setWaTaskStatus('SHARED');
  };

  const handleClaimReward = async () => {
    setIsWaTaskProcessing(true);
    try {
        await performWhatsappShareTask(user.id);
        alert(`Success! Reward of $${whatsappConfig?.rewardAmount} added to Profit Balance.`);
        setWaTaskStatus('IDLE');
    } catch (err: any) {
        alert(err.message);
        // If cooldown error, reset status
        if (err.message.includes('Cooldown')) setWaTaskStatus('IDLE');
    } finally {
        setIsWaTaskProcessing(false);
    }
  };

  const displayedTransactions = viewAllTx ? transactions : transactions.slice(0, 5);

  return (
    <div className="space-y-16 max-w-7xl mx-auto pb-24 lg:pb-0">
      
      {/* Hero / Node Status Section */}
      <div className="flex flex-col gap-12">
        <div className="flex flex-col gap-2">
            <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-4xl lg:text-6xl font-black uppercase tracking-tighter leading-none text-app-text"
            >
            Node Status: <br />
            <span className={pkgDetails ? "text-app-accent" : "text-app-muted/50"}>
                {pkgDetails ? 'Operational' : 'Standby'}
            </span>
            </motion.h1>
            <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="serif italic text-xl text-app-muted max-w-xl"
            >
            {pkgDetails 
                ? `Running ${activePackages.length} active protocol node(s). High-yield liquidity provision is active.` 
                : "No active liquidity node detected. Deploy a node to commence yield generation."}
            </motion.p>
        </div>

        {/* Node Performance HUD - 2x2 Command Grid (Strict Side-by-Side Mobile Layout) */}
        {pkgDetails && currentPkg ? (
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-2 gap-px bg-app-border border border-app-border overflow-hidden"
            >
              {/* Row 1, Col 1: Expected Yield */}
              <div className="p-5 sm:p-8 lg:p-12 bg-app-bg space-y-2 sm:space-y-4">
                <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.4em] text-app-muted">Expected Yield</span>
                <p className="text-xl sm:text-4xl lg:text-5xl font-black mono text-app-accent leading-none truncate">+${dailyEarnings.toFixed(2)}</p>
                <p className="text-[7px] sm:text-[9px] font-bold uppercase text-app-muted/50 tracking-widest">Est. 24h Output (Total)</p>
              </div>

              {/* Row 1, Col 2: Timer */}
              <div className="p-5 sm:p-8 lg:p-12 bg-app-bg space-y-2 sm:space-y-4">
                <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.4em] text-app-muted">Next Payout</span>
                <p className="text-xl sm:text-2xl lg:text-4xl font-black mono text-app-text leading-none">{timeLeft || 'SYNC'}</p>
                <p className="text-[7px] sm:text-[9px] font-bold uppercase text-app-muted/50 tracking-widest">Scheduled Auto-Credit</p>
              </div>

              {/* Row 2, Col 1: Integrity */}
              <div className="p-5 sm:p-8 lg:p-12 bg-app-accent text-app-accent-text space-y-2 sm:space-y-4">
                <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.4em] opacity-60">Integrity</span>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-2 h-2 sm:w-3 sm:h-3 bg-app-accent-text rounded-full animate-pulse shrink-0"></div>
                  <p className="text-xl sm:text-4xl lg:text-5xl font-black mono uppercase leading-none">OPTIMAL</p>
                </div>
                <p className="text-[7px] sm:text-[9px] font-black uppercase opacity-60 tracking-widest">Health: 100%</p>
              </div>

              {/* Row 2, Col 2: Signal */}
              <div className="p-5 sm:p-8 lg:p-12 bg-app-bg space-y-2 sm:space-y-4">
                <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.4em] text-app-muted">Signal</span>
                <div className="flex items-end gap-0.5 sm:gap-1 mb-1 sm:mb-2 overflow-hidden">
                    {[0.4, 0.6, 0.8, 1].map((op, i) => (
                        <div key={i} className="w-1 sm:w-1.5 bg-app-text shrink-0" style={{ height: `${(i+1)*6}px`, opacity: op }}></div>
                    ))}
                    <p className="text-xl sm:text-4xl lg:text-5xl font-black mono text-app-text leading-none ml-2 sm:ml-4">STABLE</p>
                </div>
                <p className="text-[7px] sm:text-[9px] font-bold uppercase text-app-muted/50 tracking-widest">Latency: 12ms</p>
              </div>
            </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-16 border border-app-border border-dashed text-center space-y-8 bg-app-surface/10"
          >
            <div className="w-20 h-20 bg-app-surface border border-app-border flex items-center justify-center mx-auto rounded-full">
              <i className="fa-solid fa-bolt-lightning text-2xl text-app-muted opacity-50"></i>
            </div>
            <div className="space-y-4">
              <h3 className="text-xl font-black uppercase tracking-widest text-app-text">Neural Link Offline</h3>
              <p className="text-sm text-app-muted max-w-sm mx-auto font-medium">Your account is currently in standby mode. Deploy a Liquidity Node to begin participating in network rewards.</p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-app-border border border-app-border">
        {stats.map((stat: any, idx) => {
            if (stat.isTerminal) {
                return (
                    <motion.div 
                        key={idx}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="bg-black p-6 relative overflow-hidden flex flex-col justify-between min-h-[140px] lg:hidden"
                    >
                         <div className="absolute inset-0 bg-green-500/5 pointer-events-none"></div>
                         <div className="flex justify-between items-start mb-2 relative z-10">
                            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40">NET_CLI</span>
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_#22c55e]"></div>
                         </div>
                         <div className="font-mono text-[9px] text-green-500/90 leading-relaxed relative z-10">
                            {terminalLogs.map((log, i) => (
                               <div key={i} className={i === 0 ? "font-bold text-green-400" : "opacity-50"}>{log}</div>
                            ))}
                         </div>
                    </motion.div>
                );
            }

            return (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                whileHover={{ y: -5, backgroundColor: 'var(--bg-primary)', zIndex: 10 }}
                className={`bg-app-bg p-6 md:p-8 group relative transition-all duration-300 ${stat.highlight ? 'bg-app-surface' : ''}`}
              >
                <div className="absolute inset-0 bg-app-accent/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                <div className="relative z-10 flex justify-between items-start mb-4 md:mb-6">
                  <div className="flex flex-col">
                    <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-app-muted group-hover:text-app-text transition-colors">
                      {stat.label}
                    </p>
                  </div>
                  <i className={`fa-solid ${stat.icon} text-[8px] md:text-[10px] opacity-20 group-hover:opacity-100 group-hover:text-app-accent transition-all`}></i>
                </div>
                <div className="relative z-10 flex flex-col items-start gap-1">
                  <div className="flex items-baseline gap-1 md:gap-2">
                    <h3 className="text-xl md:text-3xl font-black mono tracking-tighter text-app-text group-hover:scale-105 transition-transform origin-left">
                      {stat.type === 'currency' ? stat.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : stat.value}
                    </h3>
                    {stat.type === 'currency' && <span className="text-[8px] md:text-[10px] font-bold text-app-muted/50 group-hover:text-app-accent transition-colors">USDT</span>}
                  </div>
                  {stat.countdown && (
                    <p className="text-[8px] font-black uppercase tracking-widest text-app-accent animate-pulse mt-1">
                      Next Payout: {stat.countdown}
                    </p>
                  )}
                </div>
              </motion.div>
            );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
        {/* Transactions Section */}
        <div className="lg:col-span-8 space-y-8">
          <div className="flex items-center justify-between border-b border-app-border pb-4">
            <h2 className="text-xs font-black uppercase tracking-[0.4em] text-app-text">Transaction Ledger</h2>
            <span className="text-[10px] font-bold text-app-muted uppercase tracking-widest">Historical Logs</span>
          </div>
          
          <div className="space-y-0 border border-app-border bg-app-bg">
            {transactions.length === 0 ? (
              <div className="p-20 text-center opacity-20 italic text-app-muted">No entries detected in protocol ledger.</div>
            ) : (
              <>
                {displayedTransactions.map((tx, idx) => (
                    <motion.div 
                        key={tx.id} 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className={`flex items-center justify-between p-6 group hover:bg-app-surface transition-all ${idx !== 0 ? 'border-t border-app-border' : ''}`}
                    >
                      <div className="flex items-center gap-6">
                        <span className="mono text-[10px] text-app-muted group-hover:text-app-accent transition-colors">{(idx + 1).toString().padStart(2, '0')}</span>
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest leading-none mb-1 text-app-text group-hover:text-app-accent transition-colors">
                            <i className={`fa-solid ${getTxIcon(tx.type)} mr-2 text-[8px] opacity-50`}></i>
                            {tx.type}
                          </p>
                          <p className="text-[10px] opacity-50 uppercase font-bold tracking-tighter text-app-text truncate max-w-[200px]">{tx.description}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold mono ${tx.type === TransactionType.DEPOSIT || tx.type === TransactionType.ROI || tx.type === TransactionType.TASK_REWARD ? 'text-green-500' : 'text-app-text'}`}>
                          {getTxSign(tx.type)}{tx.amount.toFixed(2)}
                        </p>
                        <p className="text-[10px] opacity-30 font-bold uppercase text-app-text">{new Date(tx.timestamp).toLocaleDateString()}</p>
                      </div>
                    </motion.div>
                ))}
                
                {transactions.length > 5 && (
                    <button 
                        onClick={() => setViewAllTx(!viewAllTx)}
                        className="w-full py-4 text-[10px] font-black uppercase tracking-widest text-app-muted hover:text-app-text hover:bg-app-surface transition-colors border-t border-app-border"
                    >
                        {viewAllTx ? 'View Less' : 'View All Entries'}
                    </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="lg:col-span-4 space-y-8">
            {/* WhatsApp Share Task Card */}
            {whatsappConfig && whatsappConfig.enabled && (
                <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="p-10 bg-[#25D366] text-black border border-app-border space-y-6 relative overflow-hidden"
                >
                   <div className="absolute top-0 right-0 p-4 opacity-20">
                      <i className="fa-brands fa-whatsapp text-6xl"></i>
                   </div>
                   
                   <div className="relative z-10 space-y-2">
                      <h3 className="text-xs font-black uppercase tracking-[0.4em] text-black">Daily Task</h3>
                      <p className="text-2xl font-black uppercase tracking-tighter leading-none">Share & Earn</p>
                      <p className="text-xs font-bold opacity-80">Reward: {whatsappConfig.rewardAmount} USDT</p>
                   </div>

                   {waTaskStatus === 'IDLE' ? (
                        <button 
                            onClick={handleShareClick}
                            className="w-full py-4 bg-black text-white text-[10px] font-black uppercase tracking-[0.3em] hover:opacity-80 transition-all flex items-center justify-center gap-2 relative z-10"
                        >
                            <i className="fa-solid fa-share-nodes"></i>
                            Share Now
                        </button>
                   ) : (
                        <button 
                            onClick={handleClaimReward}
                            disabled={isWaTaskProcessing}
                            className="w-full py-4 bg-white text-black text-[10px] font-black uppercase tracking-[0.3em] hover:bg-gray-100 transition-all flex items-center justify-center gap-2 relative z-10 animate-pulse"
                        >
                            {isWaTaskProcessing ? 'Verifying...' : 'Claim Reward'}
                        </button>
                   )}
                   <p className="text-[9px] font-bold uppercase tracking-widest opacity-60 relative z-10">
                     Reset: Every {whatsappConfig.cooldownHours} Hours
                   </p>
                </motion.div>
            )}

            <motion.div 
                whileHover={{ scale: 1.02 }}
                className="p-10 border border-app-border space-y-8 bg-app-bg hover:border-app-text transition-colors"
            >
                <h3 className="text-xs font-black uppercase tracking-[0.4em] text-app-text">Referral Uplink</h3>
                <div className="space-y-6">
                    <div className="flex justify-between items-baseline border-b border-app-border pb-2 group">
                        <span className="text-[10px] font-bold text-app-muted uppercase tracking-widest group-hover:text-app-text transition-colors">Commission</span>
                        <span className="text-xl font-black mono tracking-tighter text-app-text group-hover:text-app-accent transition-colors">{user.referralEarnings.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-baseline border-b border-app-border pb-2 group">
                        <span className="text-[10px] font-bold text-app-muted uppercase tracking-widest group-hover:text-app-text transition-colors">Total Nodes</span>
                        <span className="text-xl font-black mono tracking-tighter text-app-text">{user.referralCount}</span>
                    </div>
                </div>
                <button 
                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}?ref=${user.referralCode}`).then(() => alert("Referral Link Copied"))}
                    className="w-full py-4 bg-app-text text-app-bg text-[10px] font-black uppercase tracking-[0.3em] hover:bg-app-accent hover:text-app-accent-text transition-all flex items-center justify-center gap-2"
                >
                    <i className="fa-solid fa-link text-[10px]"></i>
                    Link Profile
                </button>
            </motion.div>

            <motion.div 
                whileHover={{ scale: 1.02 }}
                className="p-10 bg-app-surface border border-app-border text-app-text space-y-4"
            >
                <div className="flex items-center gap-2 text-app-accent">
                    <i className="fa-solid fa-shield-virus text-xs"></i>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.4em]">Vault Protection</h4>
                </div>
                <p className="text-xs font-bold leading-relaxed opacity-80">
                    All mining cycles are secured by multi-signature smart contracts on the TRON network.
                </p>
            </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
