import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const PwaInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    console.log('[PWA] Checking install eligibility...');
    
    // Detect Standalone Mode
    const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || 
                               (window.navigator as any).standalone || 
                               document.referrer.includes('android-app://');
    
    console.log('[PWA] Is standalone:', isInStandaloneMode);
    setIsStandalone(isInStandaloneMode);
    if (isInStandaloneMode) return;

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    console.log('[PWA] Is iOS:', isIosDevice);
    setIsIOS(isIosDevice);

    // Check if user has already dismissed
    const isDismissed = localStorage.getItem('pwa_prompt_dismissed');
    console.log('[PWA] Is dismissed:', isDismissed);
    
    const handleBeforeInstallPrompt = (e: any) => {
      console.log('[PWA] beforeinstallprompt event fired!');
      e.preventDefault();
      setDeferredPrompt(e);
      if (!isDismissed) {
        // Delay to ensure user has seen the landing
        setTimeout(() => setShowPrompt(true), 2500);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // iOS Trigger
    if (isIosDevice && !isDismissed) {
      console.log('[PWA] iOS trigger scheduled');
      setTimeout(() => setShowPrompt(true), 4000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setShowPrompt(false);
      }
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa_prompt_dismissed', 'true');
  };

  if (!showPrompt || isStandalone) return null;

  return (
    <AnimatePresence>
      {showPrompt && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-4 md:p-8 bg-black/60 backdrop-blur-sm pointer-events-auto">
          <motion.div
            initial={{ y: 200, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 200, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-full max-w-md bg-[#0a0a0a] border border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,1)] p-8 md:p-10 rounded-[2rem] flex flex-col gap-8 relative overflow-hidden"
          >
            {/* Background Decorative Element */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl pointer-events-none"></div>

            <div className="flex items-start justify-between relative z-10">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 bg-white text-black rounded-2xl flex items-center justify-center font-black text-xl shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                  PP
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-widest text-white leading-none mb-1">Profit Pips</h3>
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-[0.2em]">Native Experience</p>
                </div>
              </div>
              <button onClick={handleDismiss} className="text-white/20 hover:text-white transition-colors p-2 -mr-2">
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>

            <div className="space-y-4 relative z-10">
              <h4 className="text-white font-black uppercase tracking-widest text-xs opacity-60">Why Install?</h4>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { icon: 'fa-bolt', title: 'Instant Loading', desc: 'Protocol access without browser delays' },
                  { icon: 'fa-expand', title: 'Standalone UI', desc: 'No browser bars for maximum focus' },
                  { icon: 'fa-shield-check', title: 'Secure Link', desc: 'Verified app identity for safety' }
                ].map((item, i) => (
                  <div key={i} className="flex gap-4 items-start p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                      <i className={`fa-solid ${item.icon} text-[10px] text-white`}></i>
                    </div>
                    <div>
                      <h5 className="text-[11px] font-black uppercase tracking-widest text-white">{item.title}</h5>
                      <p className="text-[10px] text-white/40 font-medium leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {isIOS ? (
              <div className="bg-white/5 border border-white/10 p-5 rounded-2xl space-y-4 text-center relative z-10">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">iOS Installation Guide</p>
                <div className="text-[11px] font-medium text-white flex flex-col items-center justify-center gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">1</span>
                    <span>Tap the <i className="fa-solid fa-share-from-square text-blue-400"></i> share button below</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">2</span>
                    <span>Select <span className="font-black text-white">"Add to Home Screen"</span></span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 relative z-10">
                <button 
                  onClick={handleInstallClick}
                  className="w-full py-5 bg-white text-black rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] hover:scale-[1.02] active:scale-95 transition-all shadow-[0_20px_40px_-10px_rgba(255,255,255,0.2)] flex items-center justify-center gap-3"
                >
                  <i className="fa-solid fa-download"></i>
                  Install Protocol
                </button>
                <button 
                  onClick={handleDismiss}
                  className="w-full py-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/30 hover:text-white transition-colors"
                >
                  Continue in Browser
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default PwaInstallPrompt;