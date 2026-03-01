
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package } from '../types.ts';

interface MiningSimulatorProps {
  activePkg: Package;
  amount: number;
  timeLeft: string;
  dailyYield: number;
}

const MiningSimulator: React.FC<MiningSimulatorProps> = ({ activePkg, amount, timeLeft, dailyYield }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [metrics, setMetrics] = useState({
    entropy: 0.999,
    latency: 12,
    hashrate: (amount * 1.4).toFixed(0)
  });

  // Generate random hash-like strings for the simulator
  const generateHash = () => {
    const chars = '0123456789ABCDEF';
    let hash = '0x';
    for (let i = 0; i < 12; i++) hash += chars[Math.floor(Math.random() * 16)];
    return hash;
  };

  useEffect(() => {
    const logInterval = setInterval(() => {
      const actions = [
        `VAL: ${generateHash()} -> CONFIRMED`,
        `PING: NODE_${activePkg.id.toUpperCase()} -> STABLE`,
        `YIELD: +${(amount * (activePkg.dailyRoi / 86400)).toFixed(6)} USDT`,
        `NET: PEER_SYNC_OK`,
        `AUTH: PK_SIG_VERIFIED`,
        `BLOCK: SYNCED TO HEIGHT ${Math.floor(Math.random() * 9999999)}`
      ];
      const newLog = actions[Math.floor(Math.random() * actions.length)];
      setLogs(prev => [newLog, ...prev].slice(0, 10));

      // Fluctuate metrics
      setMetrics(prev => ({
        entropy: 0.998 + Math.random() * 0.002,
        latency: 10 + Math.floor(Math.random() * 8),
        hashrate: (amount * (1.35 + Math.random() * 0.1)).toFixed(0)
      }));
    }, 1200);

    return () => clearInterval(logInterval);
  }, [activePkg, amount]);

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col lg:flex-row gap-8 bg-app-surface/20 border border-app-border p-6 md:p-10 backdrop-blur-md">
      {/* Neural Flicker Overlay - Visual only, no physical movement */}
      <motion.div 
        animate={{ 
          opacity: [0.03, 0.07, 0.04, 0.09, 0.02, 0.05],
        }}
        transition={{ 
          duration: 0.4, 
          repeat: Infinity, 
          ease: "linear",
          times: [0, 0.2, 0.4, 0.6, 0.8, 1]
        }}
        className="absolute inset-0 bg-app-accent pointer-events-none z-10"
      />

      {/* Scanline Effect */}
      <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden opacity-20">
        <motion.div 
          animate={{ y: ["-100%", "100%"] }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="w-full h-[50%] bg-gradient-to-b from-transparent via-app-accent/5 to-transparent"
        />
      </div>

      {/* Static / Noise Texture */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none z-0" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}></div>

      {/* Background Grid Pattern */}
      <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
        <div className="w-full h-full" style={{ backgroundImage: 'radial-gradient(var(--accent) 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
      </div>

      {/* Visual Core Column */}
      <div className="relative z-30 flex-1 flex flex-col items-center justify-center min-h-[240px]">
        {/* The Core */}
        <motion.div 
          animate={{ 
            rotate: 360,
            scale: [1, 1.03, 1],
          }}
          transition={{ 
            rotate: { duration: 12, repeat: Infinity, ease: "linear" },
            scale: { duration: 3, repeat: Infinity, ease: "easeInOut" }
          }}
          className="relative w-32 h-32 md:w-48 md:h-48 flex items-center justify-center"
        >
          {/* Outer Ring */}
          <div className="absolute inset-0 border-2 border-app-accent rounded-full border-dashed opacity-20"></div>
          {/* Inner Pulsing Hexagon */}
          <div className="w-24 h-24 md:w-36 md:h-36 border border-app-accent/50 rotate-45 flex items-center justify-center">
            <div className="w-full h-full border border-app-accent animate-pulse flex items-center justify-center">
                <div className="w-4 h-4 bg-app-accent shadow-[0_0_20px_var(--accent)]"></div>
            </div>
          </div>
          
          {/* Orbiting particles */}
          {[0, 120, 240].map((deg) => (
            <motion.div
              key={deg}
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute w-full h-full"
              style={{ transform: `rotate(${deg}deg)` }}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-app-accent"></div>
            </motion.div>
          ))}
        </motion.div>

        <div className="mt-8 text-center space-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-app-accent animate-pulse">MINING ACTIVE</p>
          <p className="text-xs font-bold text-app-muted mono">PROTOCOL: {activePkg.name.toUpperCase()}</p>
          <div className="flex items-center gap-2 justify-center pt-2">
            <div className="w-1 h-1 bg-green-500 rounded-full animate-ping"></div>
            <span className="text-[8px] font-black text-green-500 uppercase tracking-widest">Core Synchronized</span>
          </div>
        </div>
      </div>

      {/* Data HUD Column */}
      <div className="relative z-30 lg:w-96 flex flex-col justify-between gap-8 border-l border-app-border lg:pl-8">
        {/* Real-time Metrics & Financials Integrated */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1 p-3 border border-app-border bg-app-surface/40">
            <span className="text-[8px] font-black uppercase tracking-widest text-app-muted block">Daily Target</span>
            <span className="text-sm font-black mono text-app-accent">+${dailyYield.toFixed(2)}</span>
          </div>
          <div className="space-y-1 p-3 border border-app-border bg-app-surface/40">
            <span className="text-[8px] font-black uppercase tracking-widest text-app-muted block">Next Cycle</span>
            <span className="text-sm font-black mono text-app-text">{timeLeft || 'CALC...'}</span>
          </div>
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase tracking-widest text-app-muted block">Entropy</span>
            <span className="text-xs font-bold mono text-app-text">{(metrics.entropy * 100).toFixed(3)}%</span>
          </div>
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase tracking-widest text-app-muted block">Hashrate</span>
            <span className="text-xs font-bold mono text-app-accent">{metrics.hashrate} GH/s</span>
          </div>
        </div>

        {/* Live Logs */}
        <div className="flex-1 bg-black/60 border border-app-border p-4 font-mono text-[8px] text-app-muted overflow-hidden min-h-[120px]">
          <div className="flex flex-col gap-1.5">
            <AnimatePresence initial={false}>
              {logs.map((log, i) => (
                <motion.div
                  key={log + i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="whitespace-nowrap flex gap-2"
                >
                  <span className="text-app-accent/30">[{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                  <span className={log.includes('YIELD') ? 'text-green-400 font-bold' : ''}>{log}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MiningSimulator;
