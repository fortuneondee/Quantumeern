
import React, { useState, useEffect, useRef } from 'react';
import { User, TransactionStatus, TransactionType, PaymentSettings, BankAccount, AppState, KorapaySettings } from '../types.ts';
import { QRCodeCanvas } from 'qrcode.react';
import { processExternalDeposit, requestFiatDeposit, requestFiatWithdrawal, fetchBankAccountsFirestore, verifyAndCreditKorapayDeposit } from '../store.ts';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase.ts';
import { motion, AnimatePresence } from 'framer-motion';
import { NIGERIAN_BANKS } from '../constants.tsx';

interface WalletProps {
  user: User;
  paymentSettings?: PaymentSettings;
  korapaySettings?: KorapaySettings;
  onDepositSim: () => void;
  onWithdrawRequest: (amount: number, address: string) => void;
}

const Wallet: React.FC<WalletProps> = ({ user, paymentSettings, korapaySettings, onDepositSim, onWithdrawRequest }) => {
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState(user.withdrawalAddress || '');
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Platform Settings
  const [settings, setSettings] = useState<AppState['platformSettings'] | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  // Payment Gateway State (Crypto)
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [activePayment, setActivePayment] = useState<any>(null);
  const [paymentStatus, setPaymentStatus] = useState<string>('waiting'); 
  const [isGeneratingPayment, setIsGeneratingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  
  // Fiat Deposit State
  const [activeTab, setActiveTab] = useState<'CRYPTO' | 'FIAT' | 'KORAPAY'>('CRYPTO');
  const [withdrawTab, setWithdrawTab] = useState<'CRYPTO' | 'FIAT'>('CRYPTO');
  
  const [fiatDepositAmountNgn, setFiatDepositAmountNgn] = useState('');
  const [selectedBankId, setSelectedBankId] = useState('');
  const [proofImage, setProofImage] = useState<string>('');
  const [isSubmittingFiat, setIsSubmittingFiat] = useState(false);

  // Korapay State
  const [korapayAmount, setKorapayAmount] = useState('');
  const [isInitializingKorapay, setIsInitializingKorapay] = useState(false);
  const [isVerifyingKorapay, setIsVerifyingKorapay] = useState(false);
  
  // Modal State
  const [showDepositModal, setShowDepositModal] = useState(false);

  // Fiat Withdrawal State
  const [fiatWithdrawAmountUsdt, setFiatWithdrawAmountUsdt] = useState('');
  const [fiatUserBank, setFiatUserBank] = useState({ bankName: '', accountName: '', accountNumber: '' });
  const [selectedBankCode, setSelectedBankCode] = useState('');

  // Refs for polling management
  const pollTimeoutRef = useRef<number | null>(null);
  const isMounted = useRef(true);

  const usePaymentGateway = paymentSettings?.isEnabled;

  useEffect(() => {
    return () => { isMounted.current = false; stopPolling(); };
  }, []);

  useEffect(() => {
    const loadData = async () => {
        try {
            const settingsSnap = await getDoc(doc(db, 'system', 'settings'));
            if (settingsSnap.exists()) {
                setSettings(settingsSnap.data() as AppState['platformSettings']);
            }
            const banks = await fetchBankAccountsFirestore();
            setBankAccounts(banks.filter(b => b.isActive));
        } catch (e) {
            console.warn("Wallet data sync restricted:", e);
        }
    };
    loadData();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference');
    
    if (reference && reference.startsWith('kp_') && korapaySettings?.secretKey && settings?.depositRateNgn) {
      const verifyPayment = async () => {
        setIsVerifyingKorapay(true);
        try {
          const targetUrl = `https://api.korapay.com/merchant/api/v1/charges/${reference}`;
          const fetchOptions = {
              method: 'GET',
              headers: {
                  'Authorization': `Bearer ${korapaySettings.secretKey}`,
                  'Content-Type': 'application/json'
              }
          };

          let res;
          let data;
          try {
              res = await fetch(targetUrl, fetchOptions);
              data = await res.json();
          } catch (directErr) {
              try {
                  res = await fetch('https://corsproxy.io/?' + encodeURIComponent(targetUrl), fetchOptions);
                  data = await res.json();
              } catch (proxy1Err) {
                  res = await fetch('https://thingproxy.freeboard.io/fetch/' + targetUrl, fetchOptions);
                  data = await res.json();
              }
          }

          if (data && data.status && data.data?.status === 'success') {
             // Extract original amount from reference (kp_{timestamp}_{amount}_{random})
             const parts = reference.split('_');
             let amountNgn = data.data.amount; // fallback to total paid
             if (parts.length >= 4) {
                 const parsedAmount = parseFloat(parts[2]);
                 if (!isNaN(parsedAmount)) {
                     amountNgn = parsedAmount;
                 }
             }

             await verifyAndCreditKorapayDeposit(reference, user.id, amountNgn, settings.depositRateNgn);
             alert("Deposit successful! Your wallet has been credited.");
          } else if (data && data.data?.status) {
             console.log(`Payment status: ${data.data.status}`);
          } else {
             throw new Error("Invalid response during verification");
          }
        } catch (err: any) {
          if (err.message !== "Transaction already processed") {
             console.error("Verification error:", err);
             alert(`Verification failed: ${err.message}`);
          }
        } finally {
          setIsVerifyingKorapay(false);
          // Remove reference from URL to prevent re-verification
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      };

      verifyPayment();
    }
  }, [korapaySettings, settings, user.id]);

  const stopPolling = () => {
    if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    await onDepositSim();
    setIsSyncing(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 500 * 1024) {
        alert("File too large. Please select an image under 500KB.");
        return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
        setProofImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleFiatDepositClick = () => {
      const amount = parseFloat(fiatDepositAmountNgn);
      if (!amount || amount <= 0 || !selectedBankId || !proofImage || !settings) {
          alert("Please complete all fields and upload proof.");
          return;
      }
      setShowDepositModal(true);
  };

  const confirmFiatDeposit = async () => {
      if (!settings) {
          alert("System settings not loaded. Please refresh.");
          return;
      }
      const amount = parseFloat(fiatDepositAmountNgn);
      if (isNaN(amount) || amount <= 0) {
          alert("Invalid amount.");
          return;
      }

      // Fallback for undefined rate
      const currentRate = settings.depositRateNgn || 1500;
      
      setIsSubmittingFiat(true);
      try {
          console.log("Submitting deposit...", { userId: user.id, amount, rate: currentRate });
          await requestFiatDeposit(user.id, amount, currentRate, proofImage, selectedBankId);
          alert("Deposit request submitted! Awaiting admin approval.");
          
          // Reset Form
          setFiatDepositAmountNgn('');
          setProofImage('');
          setSelectedBankId('');
          setShowDepositModal(false);
      } catch (err: any) {
          console.error("Deposit Error:", err);
          alert("Submission Error: " + (err.message || "Unknown error"));
      } finally {
          setIsSubmittingFiat(false);
      }
  };

  const handleFiatWithdrawal = async () => {
      const amount = parseFloat(fiatWithdrawAmountUsdt);
      if (!amount || amount <= 0 || !fiatUserBank.accountNumber || !fiatUserBank.accountName || !settings) {
          alert("Please check all fields.");
          return;
      }

      // Fallback for undefined rate
      const currentRate = settings.withdrawalRateNgn || 1500;

      setIsSubmittingFiat(true);
      try {
          await requestFiatWithdrawal(user.id, amount, currentRate, fiatUserBank);
          alert("Withdrawal request submitted! Funds will be sent after review.");
          setFiatWithdrawAmountUsdt('');
      } catch (err: any) {
          alert(err.message);
      } finally {
          setIsSubmittingFiat(false);
      }
  };

  const handleKorapayDeposit = async () => {
    if (!korapaySettings || !korapaySettings.depositsEnabled) {
      alert("Korapay deposits are disabled.");
      return;
    }
    
    const amount = parseFloat(korapayAmount);
    if (!amount || amount < korapaySettings.minDeposit) {
      alert(`Minimum deposit is ${korapaySettings.minDeposit} NGN.`);
      return;
    }

    setIsInitializingKorapay(true);
    try {
      console.log('Initiating Korapay deposit...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const res = await fetch('/api/deposits/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          amount,
          email: user.email,
          name: user.email.split('@')[0] // Fallback name
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      const data = await res.json();
      console.log('Korapay init response:', data);

      if (data.error) throw new Error(data.error);
      if (!data.checkoutUrl) throw new Error("Invalid server response: Missing checkout URL");

      // Redirect to checkout
      console.log('Redirecting to:', data.checkoutUrl);
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      console.error('Korapay server init error:', err);
      
      // FALLBACK: Client-Side Initialization (For Static Hosts like Netlify)
      if (korapaySettings?.secretKey) {
          console.log("Attempting client-side fallback...");
          try {
              // Format: kp_{timestamp}_{amount}_{random}
              const reference = `kp_${Date.now()}_${amount}_${Math.random().toString(36).substring(7)}`;
              const charge = korapaySettings.depositChargeType === 'fixed' 
                  ? korapaySettings.depositChargeValue 
                  : korapaySettings.depositChargeType === 'percentage'
                  ? (amount * korapaySettings.depositChargeValue) / 100
                  : 0;
              const totalAmount = amount + charge;

              const targetUrl = 'https://api.korapay.com/merchant/api/v1/charges/initialize';
              const payload = {
                  reference,
                  amount: totalAmount,
                  currency: 'NGN',
                  customer: {
                      name: user.email.split('@')[0],
                      email: user.email
                  },
                  redirect_url: `${window.location.origin}/wallet?status=success`,
                  notification_url: `${window.location.origin}/api/korapay/webhook`
              };

              const fetchOptions = {
                  method: 'POST',
                  headers: {
                      'Authorization': `Bearer ${korapaySettings.secretKey}`,
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(payload)
              };

              let res;
              let data;
              
              try {
                  // 1. Try direct fetch (in case Korapay allows CORS or we are on localhost)
                  res = await fetch(targetUrl, fetchOptions);
                  data = await res.json();
              } catch (directErr) {
                  console.log("Direct fetch failed (likely CORS), trying proxy 1...");
                  try {
                      // 2. Try corsproxy.io
                      res = await fetch('https://corsproxy.io/?' + encodeURIComponent(targetUrl), fetchOptions);
                      data = await res.json();
                  } catch (proxy1Err) {
                      console.log("Proxy 1 failed, trying proxy 2...");
                      // 3. Try thingproxy
                      res = await fetch('https://thingproxy.freeboard.io/fetch/' + targetUrl, fetchOptions);
                      data = await res.json();
                  }
              }

              if (data && data.status && data.data?.checkout_url) {
                  console.log("Client-side init success. Redirecting...");
                  window.location.href = data.data.checkout_url;
                  return;
              } else {
                  console.error("Korapay API returned error:", data);
                  throw new Error(data?.message || "Invalid response from Korapay. Check your API keys.");
              }
          } catch (clientErr: any) {
              console.error("Client-side fallback failed:", clientErr);
              alert(`Payment Error: ${clientErr.message || "Service Unavailable."}`);
          }
      } else {
          // Original Error Handling
          let msg = err.message || "Payment initialization failed";
          if (err.name === 'AbortError') msg = "Request timed out. Please check your connection.";
          if (err instanceof SyntaxError) msg = "Server configuration error (Backend not found). Please contact admin.";
          alert(msg);
      }
    } finally {
      // Only reset if we didn't redirect (or if redirect fails/takes time)
      // Actually, if we redirect, the page unloads. But if we don't, we must reset.
      // We can reset after a short delay or immediately.
      // If we reset immediately, the button becomes clickable again.
      // If the redirect is happening, the user might click again.
      // But better to reset than to hang.
      setIsInitializingKorapay(false);
    }
  };

  const generatePayment = async () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0 || !paymentSettings?.apiKey) {
        setPaymentError("Invalid amount or missing API configuration.");
        return;
    }
    
    setIsGeneratingPayment(true);
    setPaymentError(null);
    setPaymentStatus('waiting');

    try {
        const proxyUrl = 'https://corsproxy.io/?';
        const targetUrl = 'https://api.nowpayments.io/v1/payment';
        
        const payload: any = {
            price_amount: amount,
            price_currency: 'usd',
            pay_currency: 'usdttrc20', // Enforced TRC20
            order_description: `Deposit User:${user.id}`
        };

        const response = await fetch(proxyUrl + encodeURIComponent(targetUrl), {
            method: 'POST',
            headers: {
                'x-api-key': paymentSettings.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `API Error: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.pay_address && data.payment_id) {
            setActivePayment(data);
            pollStatus(data.payment_id);
        } else {
            setPaymentError("Gateway failed to generate address. Please try again.");
        }
    } catch (err: any) {
        console.error("Payment Gen Error:", err);
        setPaymentError(err.message || "Connection failed. Please check your internet.");
    } finally {
        if(isMounted.current) setIsGeneratingPayment(false);
    }
  };

  const pollStatus = async (paymentId: string) => {
    if (!isMounted.current) return;

    try {
        const proxyUrl = 'https://corsproxy.io/?';
        const targetUrl = `https://api.nowpayments.io/v1/payment/${paymentId}`;
        
        const res = await fetch(proxyUrl + encodeURIComponent(targetUrl), {
            headers: { 'x-api-key': paymentSettings!.apiKey }
        });
        
        if (!res.ok) throw new Error("Status check failed");
        
        const data = await res.json();
        const status = data.payment_status;
        
        if(isMounted.current) setPaymentStatus(status);

        if (['finished', 'confirmed', 'sending'].includes(status)) {
            await handlePaymentSuccess(data);
            return; // Stop polling
        }
        
        if (status === 'expired' || status === 'failed') {
            setPaymentError("Transaction expired or failed. Please create a new deposit.");
            stopPolling();
            return;
        }

        pollTimeoutRef.current = window.setTimeout(() => pollStatus(paymentId), 5000);

    } catch (e) { 
        console.debug("Poll failed (retrying...):", e); 
        pollTimeoutRef.current = window.setTimeout(() => pollStatus(paymentId), 5000);
    }
  };

  const handlePaymentSuccess = async (data: any) => {
    stopPolling();
    try {
        const verifiedAmount = data.pay_amount || data.price_amount || parseFloat(depositAmount); 
        await processExternalDeposit(user.id, verifiedAmount, data.payment_id);
        alert(`Deposit of ${verifiedAmount} USDT confirmed successfully!`);
        if(isMounted.current) {
            setActivePayment(null);
            setDepositAmount('');
            setPaymentStatus('waiting');
        }
    } catch (e) {
        console.error("Credit error", e);
        setPaymentError("Payment confirmed but failed to update balance. Contact support with ID: " + data.payment_id);
    }
  };

  const getStatusDisplay = () => {
    switch(paymentStatus) {
        case 'waiting': return { text: 'Waiting for Funds...', color: 'text-app-muted', icon: 'fa-spinner fa-spin' };
        case 'confirming': return { text: 'Confirming on Blockchain...', color: 'text-blue-500', icon: 'fa-circle-notch fa-spin' };
        case 'confirmed': 
        case 'sending':
        case 'finished': return { text: 'Payment Successful!', color: 'text-green-500', icon: 'fa-check-circle' };
        case 'expired': return { text: 'Expired', color: 'text-red-500', icon: 'fa-times-circle' };
        default: return { text: paymentStatus.toUpperCase(), color: 'text-app-text', icon: 'fa-info-circle' };
    }
  };

  const statusInfo = getStatusDisplay();
  const selectedBank = bankAccounts.find(b => b.id === selectedBankId);

  return (
    <div className="max-w-7xl mx-auto space-y-24 pb-24 lg:pb-0 relative">
      {isVerifyingKorapay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/80 backdrop-blur-sm">
            <div className="bg-app-bg border border-app-border p-8 flex flex-col items-center gap-4 max-w-sm w-full mx-4 shadow-2xl">
                <i className="fa-solid fa-circle-notch fa-spin text-4xl text-app-accent"></i>
                <h3 className="text-sm font-black uppercase tracking-widest text-app-text text-center">Verifying Payment</h3>
                <p className="text-xs text-app-muted text-center">Please wait while we confirm your deposit with Korapay...</p>
            </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <h1 className="text-6xl lg:text-9xl font-black uppercase tracking-tighter leading-[0.85] text-app-text">My<br/>Wallet.</h1>
        <p className="serif italic text-2xl text-app-muted max-w-xl">
          Secure multi-channel funding and withdrawal system.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-app-border border border-app-border">
        
        {/* Deposit Section */}
        <div className="bg-app-bg p-12 lg:p-20 space-y-12">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h2 className="text-xs font-black uppercase tracking-[0.4em] text-app-text">
                Add Funds
            </h2>
            <div className="flex gap-2">
                <button onClick={() => setActiveTab('CRYPTO')} className={`px-4 py-1 text-[9px] font-black uppercase tracking-widest border border-app-border transition-colors ${activeTab === 'CRYPTO' ? 'bg-app-accent text-app-accent-text' : 'text-app-muted hover:text-app-text'}`}>Crypto</button>
                {settings?.fiatDepositEnabled && (
                    <button onClick={() => setActiveTab('FIAT')} className={`px-4 py-1 text-[9px] font-black uppercase tracking-widest border border-app-border transition-colors ${activeTab === 'FIAT' ? 'bg-app-accent text-app-accent-text' : 'text-app-muted hover:text-app-text'}`}>Bank (NGN)</button>
                )}
                {korapaySettings?.depositsEnabled && (
                    <button onClick={() => setActiveTab('KORAPAY')} className={`px-4 py-1 text-[9px] font-black uppercase tracking-widest border border-app-border transition-colors ${activeTab === 'KORAPAY' ? 'bg-app-accent text-app-accent-text' : 'text-app-muted hover:text-app-text'}`}>Instant (NGN)</button>
                )}
            </div>
          </div>

          {activeTab === 'CRYPTO' && (
              usePaymentGateway ? (
                // NowPayments Flow
                <div className="space-y-8">
                    {!activePayment ? (
                        <div className="space-y-6 animate-in fade-in">
                            <div className="p-6 bg-app-surface border border-app-border space-y-2">
                            <p className="text-[10px] font-black uppercase text-app-muted tracking-widest">TRC20 Gateway</p>
                            <p className="text-xs text-app-text/60 leading-relaxed font-medium">
                                Secure automated crypto deposit. Funds are credited instantly after blockchain confirmation.
                            </p>
                            </div>
                            <div className="space-y-2 group">
                                <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Amount (USD)</label>
                                <input 
                                    type="number" 
                                    value={depositAmount} 
                                    onChange={(e) => setDepositAmount(e.target.value)}
                                    className="w-full bg-transparent border-b border-app-border py-4 text-4xl font-black mono text-app-text outline-none focus:border-app-accent transition-colors"
                                    placeholder="100.00"
                                />
                            </div>
                            {paymentError && <p className="text-xs text-red-500 font-bold uppercase animate-pulse">{paymentError}</p>}
                            <button 
                                onClick={generatePayment}
                                disabled={isGeneratingPayment || !depositAmount}
                                className="w-full py-6 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-[0.4em] hover:opacity-90 transition-all flex items-center justify-center gap-4 disabled:opacity-50"
                            >
                                {isGeneratingPayment ? 'Generating...' : 'Deposit Funds'}
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-8 py-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Payment Status UI */}
                            <div className={`w-full p-4 border border-app-border flex items-center justify-center gap-3 ${paymentStatus === 'expired' ? 'bg-red-500/10' : 'bg-app-surface'}`}>
                                <i className={`fa-solid ${statusInfo.icon} ${statusInfo.color}`}></i>
                                <span className={`text-xs font-black uppercase tracking-widest ${statusInfo.color}`}>{statusInfo.text}</span>
                            </div>

                            {paymentStatus !== 'expired' && (
                                <div className="bg-white p-4 relative shadow-2xl">
                                <QRCodeCanvas value={activePayment.pay_address} size={200} level={"H"} />
                                </div>
                            )}

                            <div className="w-full text-center space-y-6">
                            <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">Send Exactly</p>
                                    <p className="text-4xl font-black mono text-app-text">{activePayment.pay_amount} USDT</p>
                            </div>
                            
                            {paymentStatus !== 'expired' && (
                                <div className="space-y-2">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">To Address (TRC20)</p>
                                    <p 
                                        onClick={() => { navigator.clipboard.writeText(activePayment.pay_address); alert('Address Copied!'); }}
                                        className="text-xs mono break-all text-app-text border border-app-border p-4 hover:border-app-text transition-colors cursor-pointer bg-app-surface select-all flex items-center justify-between gap-4 text-left"
                                    >
                                        <span>{activePayment.pay_address}</span>
                                        <i className="fa-regular fa-copy"></i>
                                    </p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={() => pollStatus(activePayment.payment_id)} className="py-3 border border-app-border text-[9px] font-black uppercase hover:bg-app-surface">Check Status</button>
                                <button onClick={() => { stopPolling(); setActivePayment(null); }} className="py-3 border border-app-border text-[9px] font-black uppercase hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors">Cancel</button>
                            </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                // Manual Crypto Flow
                <div className="space-y-8 animate-in fade-in">
                    <div className="bg-white p-4 w-fit mx-auto relative group">
                        <QRCodeCanvas value={user.usdtDepositAddress} size={200} level={"H"} />
                    </div>
                    <div className="space-y-4 text-center">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-app-muted">Your Wallet Address</p>
                        <div className="relative group cursor-pointer" onClick={() => { navigator.clipboard.writeText(user.usdtDepositAddress); alert('Address copied!'); }}>
                        <p className="text-xs sm:text-sm font-bold mono break-all border border-app-border p-4 hover:border-app-accent transition-colors bg-app-surface select-all">
                            {user.usdtDepositAddress}
                        </p>
                        </div>
                        <p className="text-[10px] text-app-muted max-w-sm mx-auto leading-relaxed">
                        Send only USDT (TRC20) to this address.
                        </p>
                    </div>
                    <button 
                        onClick={handleManualSync} 
                        disabled={isSyncing}
                        className="w-full py-6 border border-app-border text-[10px] font-black uppercase tracking-[0.4em] hover:bg-app-text hover:text-app-bg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isSyncing ? <div className="w-3 h-3 border-2 border-app-text/30 border-t-app-text rounded-full animate-spin"/> : 'Check for Deposit'}
                    </button>
                </div>
            )
          )}
          {activeTab === 'FIAT' && (
            // FIAT DEPOSIT FLOW
            <div className="space-y-8 animate-in fade-in">
                <div className="p-6 bg-app-surface border border-app-border space-y-2">
                    <p className="text-[10px] font-black uppercase text-app-muted tracking-widest">Manual Bank Transfer</p>
                    <p className="text-xs text-app-text/60 leading-relaxed font-medium">
                        Transfer funds to our verified bank account. Upload proof of payment to receive USDT.
                    </p>
                    <div className="pt-2">
                        <span className="text-[10px] font-bold text-app-accent">Rate: {settings?.depositRateNgn || 1500} NGN = 1 USDT</span>
                    </div>
                </div>

                <div className="space-y-4">
                     <div className="space-y-2">
                         <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Select Bank</label>
                         <select 
                            value={selectedBankId}
                            onChange={(e) => setSelectedBankId(e.target.value)}
                            className="w-full bg-app-bg border-b border-app-border py-3 text-sm text-app-text outline-none focus:border-app-accent"
                         >
                            <option value="">-- Choose Account --</option>
                            {bankAccounts.map(bank => (
                                <option key={bank.id} value={bank.id}>{bank.bankName} - {bank.accountNumber}</option>
                            ))}
                         </select>
                     </div>

                     {selectedBank && (
                         <div className="p-4 bg-app-surface/50 border border-app-border border-dashed space-y-1">
                             <p className="text-xs font-bold text-app-text">{selectedBank.bankName}</p>
                             <p className="text-sm font-black mono text-app-accent">{selectedBank.accountNumber}</p>
                             <p className="text-xs text-app-muted uppercase">{selectedBank.accountName}</p>
                         </div>
                     )}

                     <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Amount Sent (NGN)</label>
                        <input 
                            type="number"
                            value={fiatDepositAmountNgn}
                            onChange={(e) => setFiatDepositAmountNgn(e.target.value)}
                            className="w-full bg-transparent border-b border-app-border py-3 text-xl font-mono text-app-text outline-none focus:border-app-accent"
                            placeholder="e.g. 150000"
                        />
                        {fiatDepositAmountNgn && settings && (
                            <p className="text-[10px] text-app-muted text-right">
                                You receive: <span className="text-app-accent font-bold">~{(parseFloat(fiatDepositAmountNgn) / (settings.depositRateNgn || 1500)).toFixed(2)} USDT</span>
                            </p>
                        )}
                     </div>

                     <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Proof of Payment</label>
                        <input 
                            type="file" 
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="w-full text-xs text-app-muted file:mr-4 file:py-2 file:px-4 file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-app-accent file:text-app-accent-text hover:file:opacity-80"
                        />
                        {proofImage && <p className="text-[10px] text-green-500 font-bold">Image attached.</p>}
                     </div>
                </div>

                <button 
                    onClick={handleFiatDepositClick}
                    disabled={isSubmittingFiat}
                    className="w-full py-6 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-[0.4em] hover:opacity-90 transition-all flex items-center justify-center gap-4 disabled:opacity-50"
                >
                    Submit Deposit
                </button>
            </div>
          )}
          {activeTab === 'KORAPAY' && (
            // KORAPAY DEPOSIT FLOW
            <div className="space-y-8 animate-in fade-in">
                <div className="p-6 bg-app-surface border border-app-border space-y-2">
                    <p className="text-[10px] font-black uppercase text-app-muted tracking-widest">Instant Bank Transfer / Card</p>
                    <p className="text-xs text-app-text/60 leading-relaxed font-medium">
                        Deposit NGN instantly via Korapay. Funds are credited automatically.
                    </p>
                    <div className="pt-2">
                        <span className="text-[10px] font-bold text-app-accent">Rate: {settings?.depositRateNgn || 1500} NGN = 1 USDT</span>
                    </div>
                </div>

                <div className="space-y-4">
                     <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Amount (NGN)</label>
                        <input 
                            type="number"
                            value={korapayAmount}
                            onChange={(e) => setKorapayAmount(e.target.value)}
                            className="w-full bg-transparent border-b border-app-border py-3 text-xl font-mono text-app-text outline-none focus:border-app-accent"
                            placeholder={`Min: ${korapaySettings?.minDeposit || 1000}`}
                        />
                        {korapayAmount && settings && (
                            <p className="text-[10px] text-app-muted text-right">
                                You receive: <span className="text-app-accent font-bold">~{(parseFloat(korapayAmount) / (settings.depositRateNgn || 1500)).toFixed(2)} USDT</span>
                            </p>
                        )}
                        {korapaySettings?.depositChargeType !== 'none' && (
                             <p className="text-[10px] text-app-muted">
                                Charge: {korapaySettings?.depositChargeType === 'fixed' ? `${korapaySettings.depositChargeValue} NGN` : `${korapaySettings?.depositChargeValue}%`}
                             </p>
                        )}
                     </div>
                </div>

                <button 
                    onClick={handleKorapayDeposit}
                    disabled={isInitializingKorapay || !korapayAmount}
                    className="w-full py-6 bg-green-600 text-white text-[10px] font-black uppercase tracking-[0.4em] hover:opacity-90 transition-all flex items-center justify-center gap-4 disabled:opacity-50"
                >
                    {isInitializingKorapay ? 'Initializing...' : 'Pay with Korapay'}
                </button>
            </div>
          )}
        </div>

        {/* Withdrawal Section */}
        <div className="bg-app-surface p-12 lg:p-20 space-y-12">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h2 className="text-xs font-black uppercase tracking-[0.4em] text-app-text">Withdraw</h2>
            <div className="flex gap-2">
                <button onClick={() => setWithdrawTab('CRYPTO')} className={`px-4 py-1 text-[9px] font-black uppercase tracking-widest border border-app-border transition-colors ${withdrawTab === 'CRYPTO' ? 'bg-app-text text-app-bg' : 'text-app-muted hover:text-app-text'}`}>Crypto</button>
                {settings?.fiatWithdrawalEnabled && (
                    <button onClick={() => setWithdrawTab('FIAT')} className={`px-4 py-1 text-[9px] font-black uppercase tracking-widest border border-app-border transition-colors ${withdrawTab === 'FIAT' ? 'bg-app-text text-app-bg' : 'text-app-muted hover:text-app-text'}`}>Bank (NGN)</button>
                )}
            </div>
          </div>

          <div className="space-y-8">
            <div className="space-y-2">
               <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">Available Profit</p>
               <p className="text-5xl font-black mono text-app-text">${user.profitBalance.toFixed(2)}</p>
            </div>

            {withdrawTab === 'CRYPTO' ? (
                <div className="space-y-6 animate-in fade-in">
                    <div className="space-y-2 group">
                        <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Amount (USDT)</label>
                        <input 
                        type="number" 
                        value={withdrawAmount} 
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        className="w-full bg-transparent border-b border-app-border py-4 text-2xl font-black mono text-app-text outline-none focus:border-app-accent transition-colors"
                        placeholder="0.00"
                        />
                    </div>
                    <div className="space-y-2 group">
                        <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Address (TRC20)</label>
                        <input 
                        type="text" 
                        value={withdrawAddress} 
                        onChange={(e) => setWithdrawAddress(e.target.value)}
                        className="w-full bg-transparent border-b border-app-border py-4 text-xs font-mono text-app-text outline-none focus:border-app-accent transition-colors"
                        placeholder="Enter TRC20 address..."
                        />
                    </div>
                    <button 
                        onClick={() => {
                            const amt = parseFloat(withdrawAmount);
                            if (!amt || amt <= 0 || !withdrawAddress) {
                                alert("Please enter valid amount and address");
                                return;
                            }
                            onWithdrawRequest(amt, withdrawAddress);
                            setWithdrawAmount('');
                        }}
                        className="w-full py-6 bg-app-text text-app-bg text-[10px] font-black uppercase tracking-[0.4em] hover:bg-app-accent hover:text-app-accent-text transition-all"
                    >
                        Request Payout
                    </button>
                </div>
            ) : (
                <div className="space-y-6 animate-in fade-in">
                    <div className="p-4 border border-app-border bg-app-bg">
                        <span className="text-[10px] font-bold text-app-accent block mb-1">Exchange Rate</span>
                        <span className="text-xs text-app-muted">1 USDT = {settings?.withdrawalRateNgn || 1500} NGN</span>
                    </div>

                    <div className="space-y-2 group">
                        <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Amount to Withdraw (USDT)</label>
                        <input 
                            type="number" 
                            value={fiatWithdrawAmountUsdt} 
                            onChange={(e) => setFiatWithdrawAmountUsdt(e.target.value)}
                            className="w-full bg-transparent border-b border-app-border py-4 text-2xl font-black mono text-app-text outline-none focus:border-app-accent transition-colors"
                            placeholder="0.00"
                        />
                        {fiatWithdrawAmountUsdt && settings && (
                            <p className="text-[10px] text-app-muted text-right">
                                You receive: <span className="text-app-accent font-bold">~{(parseFloat(fiatWithdrawAmountUsdt) * (settings.withdrawalRateNgn || 1500)).toLocaleString()} NGN</span>
                            </p>
                        )}
                    </div>
                    
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Select Your Bank</label>
                            <select 
                                value={selectedBankCode}
                                onChange={(e) => {
                                    const code = e.target.value;
                                    const bankName = NIGERIAN_BANKS.find(b => b.code === code)?.name || '';
                                    setSelectedBankCode(code);
                                    setFiatUserBank(prev => ({ ...prev, bankName }));
                                }}
                                className="w-full bg-app-bg border border-app-border p-3 text-sm text-app-text outline-none focus:border-app-accent"
                            >
                                <option value="">-- Select Bank --</option>
                                {NIGERIAN_BANKS.map((bank) => (
                                    <option key={bank.code} value={bank.code}>
                                        {bank.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Account Number</label>
                            <input 
                                placeholder="1234567890"
                                maxLength={10}
                                value={fiatUserBank.accountNumber}
                                onChange={(e) => setFiatUserBank({...fiatUserBank, accountNumber: e.target.value.replace(/\D/g,'')})}
                                className="w-full bg-transparent border-b border-app-border py-2 text-sm text-app-text outline-none focus:border-app-accent"
                            />
                         </div>

                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-app-muted">Account Name</label>
                            <input 
                                placeholder="Account Name"
                                value={fiatUserBank.accountName}
                                onChange={(e) => setFiatUserBank({...fiatUserBank, accountName: e.target.value})}
                                className="w-full bg-transparent border-b border-app-border py-2 text-sm font-bold text-app-text outline-none focus:border-app-accent"
                            />
                         </div>
                    </div>

                    <button 
                        onClick={handleFiatWithdrawal}
                        disabled={isSubmittingFiat || !fiatUserBank.accountName}
                        className="w-full py-6 bg-app-text text-app-bg text-[10px] font-black uppercase tracking-[0.4em] hover:bg-app-accent hover:text-app-accent-text transition-all disabled:opacity-50"
                    >
                        {isSubmittingFiat ? 'Processing...' : 'Request NGN Payout'}
                    </button>
                </div>
            )}
          </div>
        </div>

      </div>

      {/* CONFIRMATION MODAL */}
      <AnimatePresence>
        {showDepositModal && selectedBank && settings && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-6">
                <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }} 
                    animate={{ scale: 1, opacity: 1 }} 
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-app-bg border border-app-border p-8 w-full max-w-md space-y-6 shadow-2xl"
                >
                    <div className="space-y-2">
                        <h3 className="text-xl font-black uppercase tracking-tighter text-app-text">Confirm Deposit</h3>
                        <p className="text-xs text-app-muted">Please verify transfer details.</p>
                    </div>

                    <div className="space-y-4 border-y border-app-border py-6">
                        <div className="flex justify-between text-xs">
                            <span className="text-app-muted">Bank</span>
                            <span className="font-bold text-app-text text-right">{selectedBank.bankName}<br/>{selectedBank.accountNumber}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-app-muted">Amount Sent</span>
                            <span className="font-bold text-app-text mono">{parseFloat(fiatDepositAmountNgn).toLocaleString()} NGN</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-app-muted">Rate</span>
                            <span className="font-bold text-app-text mono">{settings.depositRateNgn || 1500} NGN/USDT</span>
                        </div>
                        <div className="flex justify-between text-sm pt-2 border-t border-app-border">
                            <span className="font-black uppercase tracking-widest text-app-accent">You Receive</span>
                            <span className="font-black mono text-app-accent">~{(parseFloat(fiatDepositAmountNgn) / (settings.depositRateNgn || 1500)).toFixed(2)} USDT</span>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <button 
                            type="button"
                            onClick={() => setShowDepositModal(false)}
                            className="flex-1 py-3 border border-app-border text-[10px] font-black uppercase tracking-widest text-app-muted hover:text-app-text"
                        >
                            Cancel
                        </button>
                        <button 
                            type="button"
                            onClick={confirmFiatDeposit}
                            disabled={isSubmittingFiat}
                            className="flex-1 py-3 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-50"
                        >
                            {isSubmittingFiat ? 'Submitting...' : 'Confirm'}
                        </button>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Wallet;
