
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GuideConfig } from '../types.ts';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  config?: GuideConfig;
}

const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose, config }) => {
  if (!isOpen || !config) return null;

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
                <h3 className="text-2xl font-black uppercase tracking-tighter text-app-text">{config.title}</h3>
                <p className="text-xs font-bold text-app-muted uppercase tracking-widest mt-1">{config.subtitle}</p>
             </div>
             <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-app-muted hover:text-app-text transition-colors">
                <i className="fa-solid fa-xmark text-xl"></i>
             </button>
          </div>

          <div className="p-8 overflow-y-auto space-y-8 custom-scrollbar">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 {config.steps.map((step, index) => (
                    <div key={step.id || index} className="space-y-4 p-6 border border-app-border bg-app-bg hover:border-app-accent transition-colors group">
                        <div className={`w-10 h-10 flex items-center justify-center font-black text-lg transition-colors ${index === 0 ? 'bg-app-accent text-app-accent-text' : 'border border-app-border text-app-text group-hover:bg-app-accent group-hover:text-app-accent-text group-hover:border-app-accent'}`}>
                            {step.stepNumber}
                        </div>
                        <div className="space-y-2">
                           <h4 className="text-sm font-black uppercase tracking-widest text-app-text">{step.title}</h4>
                           <p className="text-xs text-app-muted leading-relaxed font-medium">
                              {step.description}
                           </p>
                        </div>
                    </div>
                 ))}
             </div>

             <div className="p-6 bg-app-surface border border-app-border">
                <h4 className="text-xs font-black uppercase tracking-widest text-app-text mb-2">System Architecture</h4>
                <p className="text-xs text-app-muted leading-relaxed font-medium">
                   Our platform leverages high-frequency algorithmic trading nodes to generate liquidity rewards. By renting a node, you are providing capital for these operations and receiving a share of the daily profits. All operations are automated and transparent.
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