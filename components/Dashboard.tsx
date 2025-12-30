import React, { useState, useEffect } from 'react';
import { User, Transaction, UserPackage, TransactionType } from '../types.ts';
import { motion } from 'framer-motion';
import { INITIAL_PACKAGES } from '../constants.tsx';
import { checkAndProcessUserYield } from '../store.ts';

interface DashboardProps {
  user: User;
  transactions: Transaction[];
  activePackages: UserPackage[];
}

const Dashboard: React.FC<DashboardProps> = ({ user, transactions, activePackages }) => {
  const activeStakes = activePackages.filter(p => p.isActive).reduce((sum, p) => sum + p.amount, 0);
  
  const currentPkg = activePackages.find(p => p.isActive);
  const pkgDetails = currentPkg ? INITIAL_PACKAGES.find(p => p.id === currentPkg.packageId) : null;

  const [timeLeft, setTimeLeft] = useState<string>('');

  // Auto-process yield when dashboard loads
  useEffect(() => {
    if (user.id) {
        checkAndProcessUserYield(user.id);
    }
  }, [user.id]);

  useEffect(() => {
    if (!currentPkg) {
      setTimeLeft('');
      return;
    }

    const interval = setInterval(() => {
      const lastPayout = currentPkg.lastPayoutAt || currentPkg.activatedAt;
      const nextPayout = lastPayout + (24 * 60 * 60 * 1000);
      const now = Date.now();
      const diff = nextPayout - now;

      if (diff <= 0) {
        setTimeLeft('Processing...');
        // Optionally trigger check again if timer hits 0 while watching
        if (diff > -5000) checkAndProcessUserYield(user.id);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentPkg, user.id]);

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
  ];

  const getTxSign = (type: TransactionType) => {
    return (type === TransactionType.WITHDRAWAL || type === TransactionType.PURCHASE) ? '-' : '+';
  };

  const getTxIcon = (type: TransactionType) => {
    if (type === TransactionType.WITHDRAWAL) return 'fa-arrow-up';
    if (type === TransactionType.PURCHASE) return 'fa-cart-shopping';
    return 'fa-arrow-down';
  };

  // Calculate estimated daily earnings if active
  const dailyEarnings = currentPkg && pkgDetails 
    ? (currentPkg.amount * (pkgDetails.dailyRoi / 100)) 
    : 0;

  return (
    <div className="space-y-16 max-w-7xl mx-auto pb-24 lg:pb-0">
      
      {/* Hero / Node Status Section */}
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
            <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-6xl lg:text-8xl font-black uppercase tracking-tighter leading-none text-app-text"
            >
            Node Status: <br />
            <span className={pkgDetails ? "text-green-500" : "text-app-muted/50"}>
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
                ? `Running ${pkgDetails.name} protocol. Yield generation active.` 
                : "No active liquidity node detected. Deploy a node to commence yield generation."}
            </motion.p>
        </div>

        {/* Active Node Card - Prominent Display */}
        {pkgDetails && currentPkg && (
            <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="p-8 lg:p-12 border border-app-accent bg-app-accent/5 relative overflow-hidden group"
            >
                {/* Background Pulse Animation */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-app-accent/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 animate-pulse"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
                            <h3 className="text-xs font-black uppercase tracking-[0.4em] text-app-accent">Active Configuration</h3>
                        </div>
                        <p className="text-4xl md:text-5xl font-black uppercase tracking-tighter text-app-text">
                            {pkgDetails.name}
                        </p>
                        <div className="flex gap-8">
                             <div>
                                 <p className="text-[10px] font-bold text-app-muted uppercase tracking-widest">Staked Amount</p>
                                 <p className="text-xl font-mono font-bold text-app-text">${currentPkg.amount.toLocaleString()}</p>
                             </div>
                             <div>
                                 <p className="text-[10px] font-bold text-app-muted uppercase tracking-widest">Duration</p>
                                 <p className="text-xl font-mono font-bold text-app-text">{pkgDetails.durationDays} Days</p>
                             </div>
                        </div>
                    </div>
                    <div className="text-left md:text-right space-y-2 bg-app-bg/50 p-6 border border-app-border backdrop-blur-sm">
                        <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">Est. Daily Earnings</p>
                        <p className="text-3xl font-black mono text-app-text">+${dailyEarnings.toFixed(2)}</p>
                    </div>
                </div>
            </motion.div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-app-border border border-app-border">
        {stats.map((stat, idx) => (
          <motion.div 
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            whileHover={{ y: -5, backgroundColor: 'var(--bg-primary)', zIndex: 10, boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5)' }}
            className={`bg-app-bg p-6 md:p-8 group relative transition-all duration-300 ${stat.highlight ? 'bg-app-surface' : ''}`}
          >
            <div className="absolute inset-0 bg-app-accent/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
            <div className="relative z-10 flex justify-between items-start mb-4 md:mb-6">
              <div className="flex flex-col">
                <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-app-muted group-hover:text-app-text transition-colors">
                  {stat.label}
                </p>
                {stat.countdown && (
                   <span className="text-[9px] font-mono text-app-accent mt-1 animate-pulse">
                     Next: {stat.countdown}
                   </span>
                )}
              </div>
              <i className={`fa-solid ${stat.icon} text-[8px] md:text-[10px] opacity-20 group-hover:opacity-100 group-hover:text-app-accent transition-all`}></i>
            </div>
            <div className="relative z-10 flex items-baseline gap-1 md:gap-2">
              <h3 className="text-xl md:text-3xl font-black mono tracking-tighter text-app-text group-hover:scale-105 transition-transform origin-left">
                {stat.type === 'currency' ? stat.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : stat.value}
              </h3>
              {stat.type === 'currency' && <span className="text-[8px] md:text-[10px] font-bold text-app-muted/50 group-hover:text-app-accent transition-colors">USDT</span>}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
        {/* Transactions Section */}
        <div className="lg:col-span-8 space-y-8">
          <div className="flex items-center justify-between border-b border-app-border pb-4">
            <h2 className="text-xs font-black uppercase tracking-[0.4em] text-app-text">Transactions</h2>
            <span className="text-[10px] font-bold text-app-muted uppercase tracking-widest">Recent Activity</span>
          </div>
          
          <div className="space-y-0 border border-app-border bg-app-bg">
            {transactions.length === 0 ? (
              <div className="p-20 text-center opacity-20 italic text-app-muted">No transactions yet.</div>
            ) : (
              transactions.slice(0, 10).map((tx, idx) => (
                <motion.div 
                    key={tx.id} 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`flex items-center justify-between p-6 group hover:bg-app-surface transition-all ${idx !== 0 ? 'border-t border-app-border' : ''}`}
                >
                  <div className="flex items-center gap-6">
                    <span className="mono text-[10px] text-app-muted group-hover:text-app-accent transition-colors">{idx + 1}</span>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest leading-none mb-1 text-app-text group-hover:text-app-accent transition-colors">
                        <i className={`fa-solid ${getTxIcon(tx.type)} mr-2 text-[8px] opacity-50`}></i>
                        {tx.type}
                      </p>
                      <p className="text-[10px] opacity-50 uppercase font-bold tracking-tighter text-app-text">{tx.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold mono ${tx.type === TransactionType.DEPOSIT || tx.type === TransactionType.ROI ? 'text-green-500' : 'text-app-text'}`}>
                      {getTxSign(tx.type)}{tx.amount.toFixed(2)}
                    </p>
                    <p className="text-[10px] opacity-30 font-bold uppercase text-app-text">{new Date(tx.timestamp).toLocaleDateString()}</p>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="lg:col-span-4 space-y-8">
            <motion.div 
                whileHover={{ scale: 1.02 }}
                className="p-10 border border-app-border space-y-8 bg-app-bg hover:border-app-text transition-colors"
            >
                <h3 className="text-xs font-black uppercase tracking-[0.4em] text-app-text">Network</h3>
                <div className="space-y-6">
                    <div className="flex justify-between items-baseline border-b border-app-border pb-2 group">
                        <span className="text-[10px] font-bold text-app-muted uppercase tracking-widest group-hover:text-app-text transition-colors">Referral Earnings</span>
                        <span className="text-xl font-black mono tracking-tighter text-app-text group-hover:text-green-500 transition-colors">{user.referralEarnings.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-baseline border-b border-app-border pb-2 group">
                        <span className="text-[10px] font-bold text-app-muted uppercase tracking-widest group-hover:text-app-text transition-colors">Total Partners</span>
                        <span className="text-xl font-black mono tracking-tighter text-app-text">{user.referralCount}</span>
                    </div>
                </div>
                <button className="w-full py-4 bg-app-text text-app-bg text-[10px] font-black uppercase tracking-[0.3em] hover:bg-app-accent hover:text-app-accent-text transition-all flex items-center justify-center gap-2">
                    <i className="fa-solid fa-link text-[10px]"></i>
                    Invite
                </button>
            </motion.div>

            <motion.div 
                whileHover={{ scale: 1.02 }}
                className="p-10 bg-app-surface border border-app-border text-app-text space-y-4"
            >
                <div className="flex items-center gap-2 text-app-accent">
                    <i className="fa-solid fa-gift text-xs"></i>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.4em]">Bonus Active</h4>
                </div>
                <p className="text-xs font-bold leading-relaxed opacity-80">
                    A locked balance of <span className="text-app-accent">${user.welcomeBonus}</span> is generating compounded rewards for your account.
                </p>
            </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;