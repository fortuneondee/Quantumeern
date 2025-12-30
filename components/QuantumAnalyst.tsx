
import React, { useState, useRef, useEffect } from 'react';
import { User, Transaction, UserPackage } from '../types.ts';
import { GoogleGenAI } from "@google/genai";
import { motion } from 'framer-motion';

interface AnalystProps {
  user: User;
  transactions: Transaction[];
  activePackages: UserPackage[];
}

const QuantumAnalyst: React.FC<AnalystProps> = ({ user, transactions, activePackages }) => {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const analyzePortfolio = async () => {
    if (!query.trim()) return;
    setIsAnalyzing(true);
    setResponse(null);

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const context = `
      User Profile: Capital=${user.capitalBalance} USDT, Profit=${user.profitBalance} USDT, Total Earned=${user.totalEarned} USDT.
      Nodes Active: ${activePackages.length}.
      Transactions: ${transactions.length} total.
      The platform is QuantumEarn, a high-yield TRC20 staking protocol.
      Answer professionally as the "Quantum AI Analyst".
    `;

    try {
      const result = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `${context}\n\nUser Question: ${query}`,
        config: {
            thinkingConfig: { thinkingBudget: 4000 }
        }
      });
      setResponse(result.text || "Protocol analysis inconclusive. Try again.");
    } catch (err: any) {
      setResponse(`Analysis interrupted: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-16">
      <div className="flex flex-col gap-4">
        <h1 className="text-6xl lg:text-9xl font-black uppercase tracking-tighter leading-[0.85]">Quantum<br/>Analyst.</h1>
        <p className="serif italic text-2xl text-white/40 max-w-xl">
          Powered by Gemini 3 Pro reasoning. Get real-time protocol insights and growth strategies.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-8 space-y-8">
           <div className="min-h-[400px] border border-white/10 p-10 bg-white/[0.02] flex flex-col justify-end">
              {response ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-[10px] font-black uppercase tracking-widest">Protocol Response</span>
                  </div>
                  <div className="prose prose-invert prose-sm max-w-none text-white/80 leading-relaxed font-medium">
                    {response.split('\n').map((line, i) => (
                      <p key={i} className="mb-4">{line}</p>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full opacity-20 serif italic text-xl">
                   Awaiting neural uplink...
                </div>
              )}
           </div>

           <div className="flex gap-px bg-white/10 border border-white/10 p-px">
              <input 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && analyzePortfolio()}
                placeholder="Ask about your yield strategy or node performance..."
                className="flex-1 bg-black p-6 outline-none text-sm font-medium"
              />
              <button 
                onClick={analyzePortfolio}
                disabled={isAnalyzing}
                className="bg-white text-black px-12 text-[10px] font-black uppercase tracking-widest hover:bg-white/90 transition-all disabled:opacity-50"
              >
                {isAnalyzing ? 'Processing...' : 'Analyze'}
              </button>
           </div>
        </div>

        <div className="lg:col-span-4 space-y-12">
           <div className="p-10 border border-white/10 space-y-8">
              <h3 className="text-xs font-black uppercase tracking-[0.4em]">Suggested Queries</h3>
              <div className="flex flex-col gap-4">
                {[
                  "How can I optimize my daily ROI?",
                  "Analyze my network growth potential.",
                  "Explain the security of my TRC20 nodes.",
                  "Predict my earnings for the next 30 days."
                ].map((q, i) => (
                  <button 
                    key={i}
                    onClick={() => setQuery(q)}
                    className="text-left text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors border-b border-white/5 pb-2"
                  >
                    {q}
                  </button>
                ))}
              </div>
           </div>

           <div className="p-10 bg-white text-black space-y-4">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-microchip text-xs"></i>
                <h4 className="text-[10px] font-black uppercase tracking-[0.4em]">Gemini 3 Pro Active</h4>
              </div>
              <p className="text-xs font-bold leading-relaxed">
                The Quantum Analyst utilizes advanced reasoning models to decode blockchain patterns and provide tailor-made financial guidance for your staking identity.
              </p>
           </div>
        </div>
      </div>
    </div>
  );
};

export default QuantumAnalyst;
