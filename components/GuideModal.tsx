import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110] p-6">
        <motion.div 
          initial={{ scale: 0.95, opacity: 0, y: 20 }} 
          animate={{ scale: 1, opacity: 1, y: 0 }} 
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="bg-app-bg border border-app-border w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]"
        >
          <div className="p-8 border-b border-app-border bg-app-surface flex justify-between items-center">
             <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter text-app-text">Quick Start Guide</h3>
                <p className="text-xs font-bold text-app-muted uppercase tracking-widest mt-1">Welcome to Quantum Earn</p>
             </div>
             <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-app-muted hover:text-app-text transition-colors">
                <i className="fa-solid fa-xmark text-xl"></i>
             </button>
          </div>

          <div className="p-8 overflow-y-auto space-y-8 custom-scrollbar">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 {/* Step 1 */}
                 <div className="space-y-4 p-6 border border-app-border bg-app-bg hover:border-app-accent transition-colors group">
                    <div className="w-10 h-10 bg-app-accent text-app-accent-text flex items-center justify-center font-black text-lg">01</div>
                    <div className="space-y-2">
                       <h4 className="text-sm font-black uppercase tracking-widest text-app-text">Deposit USDT</h4>
                       <p className="text-xs text-app-muted leading-relaxed font-medium">
                          Navigate to <strong>Wallet</strong>. Copy your personal TRC20 address and transfer USDT. Your balance updates automatically upon network confirmation.
                       </p>
                    </div>
                 </div>

                 {/* Step 2 */}
                 <div className="space-y-4 p-6 border border-app-border bg-app-bg hover:border-app-accent transition-colors group">
                    <div className="w-10 h-10 border border-app-border text-app-text flex items-center justify-center font-black text-lg">02</div>
                    <div className="space-y-2">
                       <h4 className="text-sm font-black uppercase tracking-widest text-app-text">Activate Node</h4>
                       <p className="text-xs text-app-muted leading-relaxed font-medium">
                          Visit <strong>Nodes</strong>. Select a plan that fits your budget. Higher tiers provide higher deposit limits. Click "Deploy Node" to start.
                       </p>
                    </div>
                 </div>

                 {/* Step 3 */}
                 <div className="space-y-4 p-6 border border-app-border bg-app-bg hover:border-app-accent transition-colors group">
                    <div className="w-10 h-10 border border-app-border text-app-text flex items-center justify-center font-black text-lg">03</div>
                    <div className="space-y-2">
                       <h4 className="text-sm font-black uppercase tracking-widest text-app-text">Earn Yield</h4>
                       <p className="text-xs text-app-muted leading-relaxed font-medium">
                          Your active node generates ROI every 24 hours. Profits are credited to your <strong>Profit Balance</strong> instantly and are visible on the Dashboard.
                       </p>
                    </div>
                 </div>

                 {/* Step 4 */}
                 <div className="space-y-4 p-6 border border-app-border bg-app-bg hover:border-app-accent transition-colors group">
                    <div className="w-10 h-10 border border-app-border text-app-text flex items-center justify-center font-black text-lg">04</div>
                    <div className="space-y-2">
                       <h4 className="text-sm font-black uppercase tracking-widest text-app-text">Withdraw</h4>
                       <p className="text-xs text-app-muted leading-relaxed font-medium">
                          Cash out your earnings anytime via the <strong>Wallet</strong> section. Withdrawals are processed to your saved TRC20 address.
                       </p>
                    </div>
                 </div>
             </div>

             <div className="p-6 bg-app-surface border border-app-border">
                <h4 className="text-xs font-black uppercase tracking-widest text-app-text mb-2">How It Works</h4>
                <p className="text-xs text-app-muted leading-relaxed font-medium">
                   Quantum Earn leverages high-frequency algorithmic trading nodes to generate liquidity rewards. By renting a node, you are providing capital for these operations and receiving a share of the daily profits. All operations are automated and transparent.
                </p>
             </div>
          </div>

          <div className="p-6 border-t border-app-border bg-app-bg flex justify-end">
             <button 
                onClick={onClose}
                className="px-10 py-4 bg-app-text text-app-bg text-[10px] font-black uppercase tracking-[0.3em] hover:bg-app-accent hover:text-app-accent-text transition-all"
             >
                I Understand
             </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default GuideModal;