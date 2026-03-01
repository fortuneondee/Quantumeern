
import React, { useState } from 'react';
import { User } from '../types.ts';
import { regenerateUserApiKey } from '../store.ts';
import { motion } from 'framer-motion';

interface ProfileProps {
  user: User;
  onUpdate: (data: Partial<User>) => Promise<void>;
  appName: string;
}

const Profile: React.FC<ProfileProps> = ({ user, onUpdate, appName }) => {
  const [withdrawalAddress, setWithdrawalAddress] = useState(user.withdrawalAddress || '');
  const [isSaving, setIsSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isRegeneratingKey, setIsRegeneratingKey] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onUpdate({ withdrawalAddress });
      alert('Profile updated successfully.');
    } catch (err: any) {
      alert(`Error updating profile: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerateKey = async () => {
    if (!confirm("Are you sure? This will invalidate your old API key.")) return;
    setIsRegeneratingKey(true);
    try {
        await regenerateUserApiKey(user.id);
        alert("New API Key generated.");
    } catch (err: any) {
        alert("Error: " + err.message);
    } finally {
        setIsRegeneratingKey(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-24 pb-24 lg:pb-0">
      <div className="flex flex-col gap-4">
        <h1 className="text-6xl lg:text-9xl font-black uppercase tracking-tighter leading-[0.85] text-app-text">My<br/>Profile.</h1>
        <p className="serif italic text-2xl text-app-muted max-w-xl">
          Manage your account details and security settings.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
        <div className="lg:col-span-7 space-y-16">
          <section className="space-y-8">
            <h2 className="text-xs font-black uppercase tracking-[0.4em] border-b border-app-border pb-4 text-app-text">Account Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-app-border border border-app-border">
              <div className="p-8 bg-app-bg space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">User ID</p>
                <p className="text-sm font-bold mono truncate text-app-text">0x{user.id.toUpperCase()}</p>
              </div>
              <div className="p-8 bg-app-bg space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">Email</p>
                <p className="text-sm font-bold text-app-text truncate">{user.email}</p>
              </div>
              <div className="p-8 bg-app-bg space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">Status</p>
                <p className="text-sm font-bold text-app-text">Verified User</p>
              </div>
              <div className="p-8 bg-app-bg space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">Account Status</p>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <p className="text-sm font-bold text-app-text uppercase tracking-tighter">Active</p>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-8">
            <h2 className="text-xs font-black uppercase tracking-[0.4em] border-b border-app-border pb-4 text-app-text">Withdrawal Settings</h2>
            <form onSubmit={handleSave} className="p-10 border border-app-border space-y-8 bg-app-surface">
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Default Withdrawal Address (TRC20)</label>
                <input 
                  type="text"
                  value={withdrawalAddress}
                  onChange={(e) => setWithdrawalAddress(e.target.value)}
                  className="w-full bg-transparent border-b border-app-border py-4 outline-none focus:border-app-text transition-all font-mono text-sm text-app-text"
                  placeholder="T..."
                />
                <p className="text-[9px] font-bold text-app-muted/50 uppercase tracking-widest">
                  Withdrawals will be sent to this address automatically.
                </p>
              </div>
              <button 
                type="submit"
                disabled={isSaving}
                className="px-12 py-5 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-[0.3em] hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-4"
              >
                {isSaving ? (
                  <div className="w-4 h-4 border-2 border-app-accent-text/20 border-t-app-accent-text rounded-full animate-spin"></div>
                ) : 'Save Changes'}
              </button>
            </form>
          </section>

          <section className="space-y-8">
            <h2 className="text-xs font-black uppercase tracking-[0.4em] border-b border-app-border pb-4 text-app-text">Developer Access</h2>
            <div className="p-10 border border-app-border bg-app-surface space-y-6">
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Personal API Key</label>
                        <button onClick={() => setShowApiKey(!showApiKey)} className="text-[10px] font-bold text-app-accent uppercase">{showApiKey ? 'Hide' : 'Reveal'}</button>
                    </div>
                    <div className="flex gap-2">
                        <input 
                            readOnly 
                            type={showApiKey ? "text" : "password"} 
                            value={user.apiKey || "No API Key"} 
                            className="flex-1 bg-app-bg border border-app-border p-3 font-mono text-xs text-app-text" 
                        />
                        <button 
                            onClick={() => { navigator.clipboard.writeText(user.apiKey || ""); alert("Copied"); }} 
                            className="px-4 border border-app-border hover:bg-app-text hover:text-app-bg transition-colors"
                        >
                            <i className="fa-regular fa-copy"></i>
                        </button>
                    </div>
                    <p className="text-[9px] text-app-muted">Use this key to connect external AI agents or portfolio trackers to your account.</p>
                </div>
                <button 
                    onClick={handleRegenerateKey}
                    disabled={isRegeneratingKey}
                    className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-400"
                >
                    {isRegeneratingKey ? 'Generating...' : 'Regenerate API Key'}
                </button>
            </div>
          </section>
        </div>

        <div className="lg:col-span-5 space-y-12">
          <div className="p-12 border border-app-border bg-app-bg space-y-8">
            <h3 className="text-xs font-black uppercase tracking-[0.4em] text-app-text">Security</h3>
            <div className="space-y-6">
              <div className="flex items-start gap-4 p-4 border border-app-border bg-app-surface">
                <i className="fa-solid fa-shield-halved text-xs text-green-500 mt-1"></i>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-app-text">Secure Encryption</p>
                  <p className="text-[10px] text-app-muted leading-relaxed">Your session is protected by standard encryption.</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-4 border border-app-border bg-app-surface">
                <i className="fa-solid fa-key text-xs text-app-muted mt-1"></i>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-app-text">Password</p>
                  <p className="text-[10px] text-app-muted leading-relaxed">If you need to reset your password, please use the logout screen.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-12 bg-app-accent text-app-accent-text space-y-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em]">Account Info</h3>
            <p className="text-xs font-medium leading-relaxed">
              Your profile is linked to the {appName} Network. All your investments and earnings are tied to this account.
            </p>
            <div className="pt-4 border-t border-app-accent-text/10">
               <p className="text-[8px] font-black uppercase tracking-widest opacity-40">Referred By</p>
               <p className="text-xs font-bold mono truncate">{user.referredBy || 'None'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
