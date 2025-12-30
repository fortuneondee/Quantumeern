import React, { useState } from 'react';
import { User, TransactionStatus, TransactionType } from '../types.ts';
import { motion } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react';

interface WalletProps {
  user: User;
  onDepositSim: () => void;
  onWithdrawRequest: (amount: number, address: string) => void;
}

const Wallet: React.FC<WalletProps> = ({ user, onDepositSim, onWithdrawRequest }) => {
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState(user.withdrawalAddress || '');
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    await onDepositSim();
    setIsSyncing(false);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-24">
      <div className="flex flex-col gap-4">
        <h1 className="text-6xl lg:text-9xl font-black uppercase tracking-tighter leading-[0.85] text-app-text">My<br/>Wallet.</h1>
        <p className="serif italic text-2xl text-app-muted max-w-xl">
          Deposit USDT (TRC20) to fund your account or withdraw your profits.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-app-border border border-app-border">
        <div className="bg-app-bg p-12 lg:p-20 space-y-12">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-[0.4em] text-app-text">Deposit USDT</h2>
            <span className="text-[10px] px-2 py-0.5 border border-app-border font-bold uppercase text-green-500">TRC20 Network</span>
          </div>

          <div className="flex flex-col items-center gap-8 py-8 border-y border-app-border">
            <div className="bg-white p-4">
               <QRCodeCanvas 
                  value={user.usdtDepositAddress}
                  size={180}
                  level={"H"}
                  bgColor={"#FFFFFF"}
                  fgColor={"#000000"}
                  includeMargin={false}
               />
            </div>
            <div className="w-full text-center space-y-2">
               <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">Your Deposit Address</p>
               <p 
                onClick={() => { navigator.clipboard.writeText(user.usdtDepositAddress); alert('Copied!'); }}
                className="text-xs mono break-all text-app-text border border-app-border p-4 hover:border-app-text transition-colors cursor-pointer bg-app-surface"
               >
                 {user.usdtDepositAddress}
               </p>
            </div>
          </div>

          <div className="space-y-8">
            <div className="p-6 bg-app-surface border border-app-border space-y-2">
              <p className="text-[10px] font-black uppercase text-app-muted tracking-widest">Instructions</p>
              <ul className="text-[10px] text-app-text/60 space-y-1 font-medium">
                <li>• Send any amount of USDT via TRC20 network.</li>
                <li>• Wait about 1-2 minutes for the transaction to clear.</li>
                <li>• Click the button below to update your balance.</li>
              </ul>
            </div>
            <button 
              onClick={handleSync}
              disabled={isSyncing}
              className="w-full py-6 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-[0.4em] hover:opacity-90 transition-all flex items-center justify-center gap-4"
            >
              {isSyncing ? <div className="w-4 h-4 border-2 border-app-accent-text/20 border-t-app-accent-text rounded-full animate-spin"></div> : 'Check for Deposit'}
            </button>
          </div>
        </div>

        <div className="bg-app-bg p-12 lg:p-20 space-y-12">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-[0.4em] text-app-text">Withdraw Funds</h2>
            <div className="text-right">
               <p className="text-[10px] font-bold text-app-muted uppercase tracking-widest">Available</p>
               <p className="text-sm font-bold mono text-app-text">${user.profitBalance.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px bg-app-border pt-px">
             <div className="bg-app-accent text-app-accent-text p-8 flex flex-col items-center justify-center">
                <p className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-2">Available</p>
                <h3 className="text-4xl font-black mono tracking-tighter">${user.profitBalance.toFixed(0)}</h3>
             </div>
             <div className="bg-app-bg text-app-text p-8 flex flex-col items-center justify-center border border-app-border">
                <p className="text-[8px] font-black uppercase tracking-widest text-app-muted mb-2">Bonus (Locked)</p>
                <h3 className="text-4xl font-black mono tracking-tighter">${user.welcomeBonus}</h3>
             </div>
          </div>

          <div className="space-y-8 pt-4">
             <div className="space-y-8">
                <div className="space-y-2 group">
                  <label className="text-[10px] font-black uppercase tracking-widest text-app-muted group-focus-within:text-app-text transition-colors">Amount (USDT)</label>
                  <input 
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full bg-transparent border-b border-app-border py-4 outline-none focus:border-app-text transition-all text-4xl font-black mono tracking-tighter text-app-text"
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2 group">
                  <label className="text-[10px] font-black uppercase tracking-widest text-app-muted group-focus-within:text-app-text transition-colors">Your Wallet Address (TRC20)</label>
                  <input 
                    type="text"
                    value={withdrawAddress}
                    onChange={(e) => setWithdrawAddress(e.target.value)}
                    className="w-full bg-transparent border-b border-app-border py-4 outline-none focus:border-app-text transition-all font-mono text-sm text-app-text"
                    placeholder="T..."
                  />
                </div>
             </div>

            <button 
              onClick={() => onWithdrawRequest(Number(withdrawAmount), withdrawAddress)}
              disabled={Number(withdrawAmount) > user.profitBalance || Number(withdrawAmount) < 10}
              className="w-full py-6 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-[0.4em] disabled:bg-app-surface disabled:text-app-muted hover:opacity-90 transition-all"
            >
              Withdraw Now
            </button>

            <div className="grid grid-cols-2 gap-px bg-app-border pt-px">
               <div className="bg-app-bg p-4 text-center">
                  <p className="text-[9px] font-black text-app-muted uppercase tracking-widest mb-1">Network Fee</p>
                  <p className="text-xs font-bold mono text-app-text">$1.00</p>
               </div>
               <div className="bg-app-bg p-4 text-center">
                  <p className="text-[9px] font-black text-app-muted uppercase tracking-widest mb-1">Min Withdrawal</p>
                  <p className="text-xs font-bold mono text-app-text">$10.00</p>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Wallet;