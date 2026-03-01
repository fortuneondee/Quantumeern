
import React, { useMemo } from 'react';
import { User, AppState } from '../types.ts';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../ThemeContext.tsx';

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
  onLogout: () => void;
  onNavigate: (view: string) => void;
  currentView: string;
  appName: string;
  platformSettings?: AppState['platformSettings'];
}

// Simulated User Data (Nigerian Names)
const NIGERIAN_NAMES = [
  "Adebayo", "Chioma", "Emeka", "Funke", "Ibrahim", "Ngozi", "Oluwaseun", "Yusuf", "Zainab", 
  "Chinedu", "Folake", "Musa", "Kemi", "Tunde", "Amaka", "Bolaji", "Uche", "Fatima", "Sola", 
  "Habiba", "Tope", "Chika", "Ahmed", "Bisi", "Gambo", "Idris", "Kehinde", "Lola", "Mohammed", 
  "Nneka", "Olamide", "Patience", "Rasheed", "Simi", "Tolu", "Umar", "Victor", "Wale", "Xavier", 
  "Yemi", "Zahra", "Abiodun", "Blessing", "Chijioke", "Damilola", "Efe", "Femi", "Gideon", 
  "Halima", "Iyabo", "Jide", "Kelechi", "Lukman", "Maryam", "Nnamdi", "Osas", "Peter", "Queen"
];

const Layout: React.FC<LayoutProps> = ({ children, user, onLogout, onNavigate, currentView, appName, platformSettings }) => {
  // Allow access if explicitly admin OR if email contains 'admin' (failsafe)
  const hasAdminAccess = user ? (user.isAdmin || user.email.toLowerCase().includes('admin')) : false;
  const { theme, toggleTheme } = useTheme();

  const menuItems = user ? [
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-compass' },
    { id: 'packages', label: 'Nodes', icon: 'fa-server' },
    { id: 'wallet', label: 'Wallet', icon: 'fa-wallet' },
    { id: 'referrals', label: 'Referrals', icon: 'fa-network-wired' },
    { id: 'profile', label: 'Profile', icon: 'fa-user-gear' },
    ...(hasAdminAccess ? [{ id: 'admin', label: 'Admin', icon: 'fa-terminal' }] : [])
  ] : [];

  // Generate the ticker items once
  const tickerItems = useMemo(() => {
    // Create a deterministic but randomized-looking list based on the static array
    const baseItems = NIGERIAN_NAMES.map(name => {
      const amount = (Math.random() * 500 + 50).toFixed(2);
      return { name, amount };
    });
    // Duplicate for smooth loop
    return [...baseItems, ...baseItems];
  }, []);

  return (
    <div className="min-h-screen flex bg-app-bg transition-colors duration-300 relative pb-16 lg:pb-0">
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          display: flex;
          animation: marquee 120s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
      `}</style>
      
      {/* High-Contrast Sidebar (Desktop) */}
      {user && (
        <aside className="hidden lg:flex flex-col w-64 h-screen sticky top-0 bg-app-bg border-r border-app-border p-8 transition-colors duration-300">
          <div 
            className="flex items-center gap-3 mb-16 cursor-pointer group" 
            onClick={() => onNavigate('dashboard')}
          >
            <div className="w-8 h-8 bg-app-accent flex items-center justify-center transition-colors">
              <div className="w-4 h-4 bg-app-bg transition-colors"></div>
            </div>
            <span className="text-xl font-black tracking-tighter uppercase text-app-text transition-colors">{appName}</span>
          </div>

          <nav className="flex-1 space-y-4">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 py-2 text-sm font-semibold transition-all group ${
                  currentView === item.id 
                    ? 'text-app-text' 
                    : 'text-app-muted hover:text-app-text'
                }`}
              >
                <div className={`w-1 h-4 transition-all ${currentView === item.id ? 'bg-app-accent' : 'bg-transparent'}`}></div>
                <i className={`fa-solid ${item.icon} w-5 text-xs opacity-50`}></i>
                <span className="tracking-wide uppercase">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="mt-auto space-y-6">
            <div className="pt-8 border-t border-app-border">
              <p className="text-[10px] text-app-muted uppercase font-bold tracking-widest mb-1">Logged in as</p>
              <p className="text-xs font-medium text-app-text/70 truncate">{user.email}</p>
            </div>
            <button 
              onClick={onLogout}
              className="text-[10px] font-black uppercase tracking-[0.2em] text-app-muted hover:text-app-text transition-colors flex items-center gap-2"
            >
              <i className="fa-solid fa-power-off text-[8px]"></i>
              Log Out
            </button>
          </div>
        </aside>
      )}

      {/* Main viewport */}
      <div className="flex-1 flex flex-col min-w-0 z-0">
        <header className="h-20 bg-app-bg border-b border-app-border flex items-center justify-between px-8 lg:px-12 sticky top-0 z-40 transition-colors duration-300">
          <div className="lg:hidden flex items-center gap-4">
            <div className="w-6 h-6 bg-app-accent transition-colors"></div>
            <span className="text-lg font-black uppercase tracking-tighter text-app-text transition-colors">{appName}</span>
          </div>
          
          <div className="hidden lg:block">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-app-muted transition-colors">
              {currentView} / ID: {user?.id.slice(0, 6).toUpperCase()}
            </h2>
          </div>

          {user && (
            <div className="flex items-center gap-3 lg:gap-8">
              <div className="hidden sm:flex flex-col items-end">
                <p className="text-[8px] lg:text-[10px] font-black text-app-muted uppercase tracking-widest transition-colors">Wallet Balance</p>
                <p className="text-xs lg:text-sm font-bold mono tracking-tighter text-app-text transition-colors">{user.capitalBalance.toFixed(2)} USDT</p>
              </div>
              <div className="h-8 w-px bg-app-border hidden sm:block transition-colors"></div>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={toggleTheme}
                  title="Toggle Theme"
                  className="w-10 h-10 border border-app-border hover:border-app-accent hover:text-app-accent text-app-muted hover:text-app-text flex items-center justify-center transition-all"
                >
                  <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'} text-sm`}></i>
                </button>

                <div 
                  onClick={() => onNavigate('profile')}
                  title="Profile Settings"
                  className={`w-10 h-10 border flex items-center justify-center transition-colors cursor-pointer ${
                    currentView === 'profile' ? 'border-app-accent bg-app-accent text-app-accent-text' : 'border-app-border hover:border-app-accent text-app-text'
                  }`}
                >
                  <i className="fa-solid fa-user text-sm"></i>
                </div>
                
                <button 
                  onClick={onLogout}
                  title="Logout"
                  className="w-10 h-10 border border-app-border hover:border-red-500 hover:text-red-500 flex items-center justify-center transition-all text-app-muted"
                >
                  <i className="fa-solid fa-power-off text-sm"></i>
                </button>
              </div>
            </div>
          )}
        </header>

        {/* Withdrawal Ticker */}
        {user && platformSettings?.withdrawalTickerEnabled && (
          <div className="bg-app-surface border-b border-app-border overflow-hidden h-8 flex items-center relative z-0">
             <div className="animate-marquee whitespace-nowrap">
                {tickerItems.map((item, idx) => (
                   <div key={idx} className="inline-flex items-center gap-2 mx-8 opacity-70">
                      <i className="fa-solid fa-circle-check text-green-500 text-[8px]"></i>
                      <span className="text-[9px] font-bold text-app-text uppercase">{item.name}</span>
                      <span className="text-[9px] font-medium text-app-muted">just withdrew daily profit</span>
                   </div>
                ))}
             </div>
             {/* Gradient fade masks */}
             <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-app-bg to-transparent pointer-events-none"></div>
             <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-app-bg to-transparent pointer-events-none"></div>
          </div>
        )}

        <main className="flex-1 p-8 lg:p-12 pb-24 overflow-x-hidden bg-app-bg transition-colors duration-300">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, x: 5 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -5 }}
              transition={{ duration: 0.3, ease: "circOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Footer Navigation */}
      {user && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-app-bg border-t border-app-border flex justify-around items-center z-[100] transition-colors duration-300">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center justify-center transition-all ${
                currentView === item.id ? 'text-app-text' : 'text-app-muted'
              }`}
            >
              <i className={`fa-solid ${item.icon} text-lg`}></i>
            </button>
          ))}
          
          <button
            onClick={onLogout}
            className="flex flex-col items-center justify-center text-app-muted hover:text-red-500 transition-all"
          >
            <i className="fa-solid fa-power-off text-lg"></i>
          </button>
        </nav>
      )}

      {/* Floating Telegram Support Button */}
      <a
        href="https://t.me/Profitpipsnodes"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-20 right-4 lg:bottom-8 lg:right-8 z-[60] w-12 h-12 lg:w-14 lg:h-14 bg-app-accent text-app-accent-text rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-all duration-300"
        title="Contact Support"
      >
        <i className="fa-brands fa-telegram text-2xl lg:text-3xl"></i>
      </a>
    </div>
  );
};

export default Layout;
