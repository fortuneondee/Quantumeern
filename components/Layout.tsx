import React from 'react';
import { User } from '../types.ts';
import { APP_NAME } from '../constants.tsx';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../ThemeContext.tsx';

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
  onLogout: () => void;
  onNavigate: (view: string) => void;
  currentView: string;
}

const Layout: React.FC<LayoutProps> = ({ children, user, onLogout, onNavigate, currentView }) => {
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

  return (
    <div className="min-h-screen flex bg-app-bg transition-colors duration-300">
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
            <span className="text-xl font-black tracking-tighter uppercase text-app-text transition-colors">{APP_NAME}</span>
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
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-20 bg-app-bg border-b border-app-border flex items-center justify-between px-8 lg:px-12 sticky top-0 z-40 transition-colors duration-300">
          <div className="lg:hidden flex items-center gap-4">
            <div className="w-6 h-6 bg-app-accent transition-colors"></div>
            <span className="text-lg font-black uppercase tracking-tighter text-app-text transition-colors">{APP_NAME}</span>
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

        <main className="flex-1 p-8 lg:p-12 overflow-x-hidden bg-app-bg transition-colors duration-300">
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
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-app-bg border-t border-app-border flex justify-around items-center z-50 transition-colors duration-300">
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
    </div>
  );
};

export default Layout;