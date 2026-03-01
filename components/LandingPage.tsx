
import React from 'react';
import { motion } from 'framer-motion';

interface LandingPageProps {
  onLogin: () => void;
  onRegister: () => void;
  appName: string;
}

const LandingPage: React.FC<LandingPageProps> = ({ onLogin, onRegister, appName }) => {
  const fadeInUp = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "circOut" } }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  return (
    <div className="min-h-screen bg-app-bg text-app-text overflow-hidden selection:bg-app-accent selection:text-app-accent-text">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-app-border bg-app-bg/80 backdrop-blur-md">
        <div className="max-w-[1400px] mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-app-accent flex items-center justify-center">
              <div className="w-4 h-4 bg-app-bg"></div>
            </div>
            <span className="text-xl font-black tracking-tighter uppercase">{appName}</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-app-muted">
            <a href="#features" className="hover:text-app-text transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-app-text transition-colors">How It Works</a>
            <a href="#stats" className="hover:text-app-text transition-colors">Market Data</a>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={onLogin} className="text-[10px] font-black uppercase tracking-[0.2em] hover:text-app-muted transition-colors">
              Log In
            </button>
            <button onClick={onRegister} className="px-6 py-2 bg-app-accent text-app-accent-text text-[10px] font-black uppercase tracking-[0.2em] hover:opacity-90 transition-opacity">
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-20 lg:pt-60 lg:pb-40 px-6 border-b border-app-border">
        <div className="max-w-[1400px] mx-auto relative z-10">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="max-w-4xl"
          >
            <motion.div variants={fadeInUp} className="flex items-center gap-4 mb-8">
              <span className="px-3 py-1 border border-app-border text-[9px] font-black uppercase tracking-[0.3em] rounded-full">
                Protocol V2.0 Live
              </span>
              <div className="h-px w-20 bg-app-border"></div>
            </motion.div>
            
            <motion.h1 variants={fadeInUp} className="text-7xl lg:text-9xl font-black uppercase tracking-tighter leading-[0.85] mb-8">
              Profit Node <br/>
              <span className="text-app-muted">Infrastructure.</span>
            </motion.h1>
            
            <motion.p variants={fadeInUp} className="serif italic text-2xl lg:text-3xl text-app-muted max-w-2xl leading-relaxed mb-12">
              Maximize your digital assets with our automated high-yield algo-trading nodes. Secure, transparent, and built for growth.
            </motion.p>
            
            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-6">
              <button onClick={onRegister} className="px-10 py-5 bg-app-accent text-app-accent-text text-xs font-black uppercase tracking-[0.3em] hover:scale-[1.02] transition-transform">
                Start Mining
              </button>
              <button onClick={onLogin} className="px-10 py-5 border border-app-border text-app-text text-xs font-black uppercase tracking-[0.3em] hover:bg-app-text hover:text-app-bg transition-colors">
                View Demo
              </button>
            </motion.div>
          </motion.div>
        </div>

        {/* Abstract Background Element */}
        <div className="absolute top-0 right-0 w-[50%] h-full opacity-10 pointer-events-none overflow-hidden hidden lg:block">
           <div className="w-full h-full border-l border-app-border grid grid-cols-6">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="border-r border-app-border/20 h-full relative">
                  <motion.div 
                    animate={{ height: ["0%", "100%", "0%"] }} 
                    transition={{ duration: Math.random() * 5 + 5, repeat: Infinity, ease: "linear" }}
                    className="absolute top-0 left-0 w-full bg-app-text/10"
                  ></motion.div>
                </div>
              ))}
           </div>
        </div>
      </section>

      {/* Infinite Ticker */}
      <div className="border-b border-app-border bg-app-bg py-4 overflow-hidden flex relative">
        <motion.div 
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="flex gap-16 whitespace-nowrap"
        >
          {[...Array(2)].map((_, i) => (
             <React.Fragment key={i}>
                <span className="text-xs font-bold mono uppercase text-app-muted">BTC/USDT <span className="text-green-500">$64,231.40 (+1.2%)</span></span>
                <span className="text-xs font-bold mono uppercase text-app-muted">ETH/USDT <span className="text-green-500">$3,452.12 (+0.8%)</span></span>
                <span className="text-xs font-bold mono uppercase text-app-muted">TRX/USDT <span className="text-green-500">$0.142 (+2.4%)</span></span>
                <span className="text-xs font-bold mono uppercase text-app-muted">SOL/USDT <span className="text-red-500">$148.50 (-0.5%)</span></span>
                <span className="text-xs font-bold mono uppercase text-app-muted">BNB/USDT <span className="text-green-500">$590.20 (+0.2%)</span></span>
                <span className="text-xs font-bold mono uppercase text-app-muted">PLATFORM VOL <span className="text-app-text">$14,290,102.00</span></span>
             </React.Fragment>
          ))}
        </motion.div>
      </div>

      {/* Stats Section */}
      <section id="stats" className="grid grid-cols-2 lg:grid-cols-4 border-b border-app-border">
        {[
          { label: "Active Nodes", value: "12,402", icon: "fa-users" },
          { label: "Total Value Locked", value: "$42M+", icon: "fa-lock" },
          { label: "Daily Payouts", value: "$1.2M", icon: "fa-money-bill-wave" },
          { label: "Uptime", value: "99.99%", icon: "fa-server" },
        ].map((stat, idx) => (
          <div key={idx} className="p-10 md:p-16 border-r border-b lg:border-b-0 border-app-border flex flex-col justify-between h-48 lg:h-64 group hover:bg-app-accent hover:text-app-accent-text transition-colors duration-500">
            <div className="flex justify-between items-start">
               <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">{stat.label}</span>
               <i className={`fa-solid ${stat.icon} text-lg opacity-40 group-hover:opacity-100`}></i>
            </div>
            <span className="text-4xl lg:text-5xl font-black mono tracking-tighter">{stat.value}</span>
          </div>
        ))}
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 lg:py-32 px-6 bg-app-surface">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex flex-col lg:flex-row justify-between items-end mb-24 gap-10">
             <div className="max-w-2xl">
               <h2 className="text-5xl lg:text-7xl font-black uppercase tracking-tighter leading-[0.9] mb-6">
                 Engineered for <br/>
                 Performance.
               </h2>
               <p className="serif text-xl text-app-muted italic">
                 Our proprietary architecture leverages AI-driven arbitrage and liquidity provision to generate sustainable daily yields.
               </p>
             </div>
             <button onClick={onRegister} className="px-8 py-4 border border-app-border text-[10px] font-black uppercase tracking-[0.2em] hover:bg-app-text hover:text-app-bg transition-colors">
               Explore Nodes
             </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-app-border border border-app-border">
            {[
              { title: "Daily Payouts", desc: "Mining yields are calculated and credited to your available balance every 24 hours automatically.", icon: "fa-clock" },
              { title: "Instant Withdrawals", desc: "Access your profits anytime. Our hot wallet system processes requests within minutes.", icon: "fa-bolt" },
              { title: "Asset Security", desc: "Multi-signature cold storage and real-time monitoring ensure your capital is always protected.", icon: "fa-shield-halved" },
              { title: "Referral Rewards", desc: "Build your own network and earn up to 10% commissions from your partners' activities.", icon: "fa-network-wired" },
              { title: "Transparency", desc: "All transactions are verifiable on the blockchain. Real-time dashboards provide full visibility.", icon: "fa-eye" },
              { title: "24/7 Support", desc: "Our dedicated financial experts are available around the clock to assist you.", icon: "fa-headset" },
            ].map((feature, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
                className="bg-app-bg p-12 hover:bg-app-surface transition-colors"
              >
                <div className="w-12 h-12 border border-app-border flex items-center justify-center mb-8 text-app-accent bg-app-accent/5">
                  <i className={`fa-solid ${feature.icon}`}></i>
                </div>
                <h3 className="text-lg font-black uppercase tracking-tight mb-4">{feature.title}</h3>
                <p className="text-sm text-app-muted leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 lg:py-32 px-6 border-y border-app-border">
         <div className="max-w-[1400px] mx-auto">
            <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-app-muted mb-16 text-center">Operational Workflow</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
               {[
                 { step: "01", title: "Create Account", desc: "Register in seconds with just your email. No complex KYC required for basic tiers." },
                 { step: "02", title: "Deposit USDT", desc: "Transfer USDT via the TRC20 network to your unique, secure deposit address." },
                 { step: "03", title: "Deploy Node", desc: "Select a computing node tier that fits your goals and activate your staking capacity." },
                 { step: "04", title: "Withdraw Yield", desc: "Watch your balance grow daily and withdraw your earnings whenever you choose." },
               ].map((item, i) => (
                 <div key={i} className="relative group">
                    <div className="text-9xl font-black text-app-border/30 absolute -top-10 -left-4 z-0 group-hover:text-app-accent/10 transition-colors select-none">
                      {item.step}
                    </div>
                    <div className="relative z-10 pt-16 pl-6">
                       <h3 className="text-xl font-bold uppercase tracking-tight mb-4">{item.title}</h3>
                       <p className="text-sm text-app-muted leading-relaxed font-medium">{item.desc}</p>
                    </div>
                 </div>
               ))}
            </div>
         </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 px-6 bg-app-surface">
         <div className="max-w-4xl mx-auto space-y-16">
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-black uppercase tracking-tighter">Frequently Asked Questions</h2>
              <p className="serif italic text-app-muted">Everything you need to know about the {appName} Platform.</p>
            </div>

            <div className="space-y-4">
               {[
                 { q: "What is the minimum deposit amount?", a: "The minimum deposit to start staking is $20 USDT. Different nodes have different minimum requirements." },
                 { q: "How are profits generated?", a: "We utilize high-frequency arbitrage trading across decentralized exchanges and liquidity provision rewards." },
                 { q: "Is there a lock-in period?", a: "Capital is locked for the duration of the chosen node lease (usually 365 days), but yields are available for withdrawal daily." },
                 { q: "What network do you support?", a: "We exclusively support USDT on the TRON (TRC20) network due to its low transaction fees and high speed." },
                 { q: "How secure are my funds?", a: "We use a hybrid cold/hot wallet system. 95% of funds are stored in offline cold storage." }
               ].map((faq, i) => (
                 <details key={i} className="group border border-app-border bg-app-bg open:bg-app-accent open:text-app-accent-text transition-colors">
                    <summary className="flex justify-between items-center p-6 cursor-pointer list-none">
                       <span className="text-xs font-black uppercase tracking-widest">{faq.q}</span>
                       <span className="group-open:rotate-180 transition-transform duration-300">
                         <i className="fa-solid fa-chevron-down text-xs"></i>
                       </span>
                    </summary>
                    <div className="px-6 pb-6 pt-0 text-sm leading-relaxed opacity-80 font-medium">
                       {faq.a}
                    </div>
                 </details>
               ))}
            </div>
         </div>
      </section>

      {/* CTA Footer */}
      <footer className="bg-app-bg border-t border-app-border pt-24 pb-12 px-6">
         <div className="max-w-[1400px] mx-auto flex flex-col items-center text-center space-y-12">
            <h2 className="text-6xl lg:text-9xl font-black uppercase tracking-tighter text-app-text">
              Join The <br/> <span className="text-app-muted">Revolution.</span>
            </h2>
            <p className="max-w-xl text-app-muted text-lg serif italic">
              Don't let your assets sit idle. Put them to work with the most advanced staking platform in the market.
            </p>
            <button onClick={onRegister} className="px-12 py-6 bg-app-accent text-app-accent-text text-xs font-black uppercase tracking-[0.4em] hover:scale-105 transition-transform shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]">
              Create Free Account
            </button>
         </div>

         <div className="max-w-[1400px] mx-auto mt-32 pt-8 border-t border-app-border flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] font-bold uppercase tracking-widest text-app-muted">
            <p>© 2024 {appName} Protocol. All rights reserved.</p>
            <div className="flex gap-8">
               <a href="#" className="hover:text-app-text">Privacy Policy</a>
               <a href="#" className="hover:text-app-text">Terms of Service</a>
               <a href="#" className="hover:text-app-text">Support</a>
            </div>
         </div>
      </footer>

      {/* Floating Telegram Support Button */}
      <a
        href="https://t.me/Profitpipsnodes"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-[100] w-14 h-14 bg-app-accent text-app-accent-text rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-all duration-300"
        title="Contact Support"
      >
        <i className="fa-brands fa-telegram text-3xl"></i>
      </a>
    </div>
  );
};

export default LandingPage;
