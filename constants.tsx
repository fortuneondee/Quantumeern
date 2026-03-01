import React from 'react';
import { Package, GuideConfig } from './types.ts';

const DEFAULT_NODE_IMG = "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop";

export const APP_NAME = "Profit Pips";

export const REF_LEVELS = [
  { level: 1, percentage: 10 },
  { level: 2, percentage: 5 },
  { level: 3, percentage: 2 }
];

export const INITIAL_PACKAGES: Package[] = [
  {
    id: 'pkg1',
    name: 'Node Level 1',
    minAmount: 20,
    maxAmount: 100,
    dailyRoi: 10,
    durationDays: 365,
    description: 'Entry-level liquidity node for beginners.',
    imageUrl: DEFAULT_NODE_IMG
  },
  {
    id: 'pkg2',
    name: 'Node Level 2',
    minAmount: 101,
    maxAmount: 500,
    dailyRoi: 10,
    durationDays: 365,
    description: 'Enhanced hashrate for stable daily output.',
    imageUrl: DEFAULT_NODE_IMG
  },
  {
    id: 'pkg3',
    name: 'Node Level 3',
    minAmount: 501,
    maxAmount: 1000,
    dailyRoi: 10,
    durationDays: 365,
    description: 'Standard commercial staking unit.',
    imageUrl: DEFAULT_NODE_IMG
  },
  {
    id: 'pkg4',
    name: 'Node Level 4',
    minAmount: 1001,
    maxAmount: 2500,
    dailyRoi: 10,
    durationDays: 365,
    description: 'Advanced algo-trading capabilities.',
    imageUrl: DEFAULT_NODE_IMG
  },
  {
    id: 'pkg5',
    name: 'Node Level 5',
    minAmount: 2501,
    maxAmount: 5000,
    dailyRoi: 10,
    durationDays: 365,
    description: 'Enterprise grade liquidity provision.',
    imageUrl: DEFAULT_NODE_IMG
  }
];

export const DEFAULT_GUIDE_CONFIG: GuideConfig = {
    enabled: true,
    title: "Quick Start Guide",
    subtitle: "Welcome to Profit Pips",
    steps: [
        {
            id: 'step1',
            stepNumber: '01',
            title: 'Deposit Funds',
            description: 'Navigate to Wallet. Select "Crypto" for USDT (TRC20) or "Bank (NGN)" for Naira deposits. For Naira, transfer to the verified system bank account and upload your payment proof. Your balance updates upon admin approval.'
        },
        {
            id: 'step2',
            stepNumber: '02',
            title: 'Activate Node',
            description: 'Visit Nodes. Select a plan that fits your budget. Higher tiers provide higher deposit limits. Click "Deploy Node" to start generating liquidity rewards.'
        },
        {
            id: 'step3',
            stepNumber: '03',
            title: 'Earn Yield',
            description: 'Your active node generates ROI every 24 hours. Profits are credited to your Profit Balance instantly and are visible on the Dashboard.'
        },
        {
            id: 'step4',
            stepNumber: '04',
            title: 'Withdraw Earnings',
            description: 'Cash out via Wallet. Choose "Crypto" to withdraw USDT to your wallet, or "Bank (NGN)" to withdraw Naira directly to your local bank account.'
        }
    ]
};

export const NIGERIAN_BANKS = [
  { name: "Access Bank", code: "044" },
  { name: "Citibank Nigeria", code: "023" },
  { name: "Ecobank Nigeria", code: "050" },
  { name: "Fidelity Bank", code: "070" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "First City Monument Bank", code: "214" },
  { name: "Guaranty Trust Bank", code: "058" },
  { name: "Heritage Bank", code: "030" },
  { name: "Keystone Bank", code: "082" },
  { name: "Kuda Bank", code: "50211" },
  { name: "Moniepoint Microfinance Bank", code: "50515" },
  { name: "Opay", code: "999992" },
  { name: "PalmPay", code: "999991" },
  { name: "Polaris Bank", code: "076" },
  { name: "Providus Bank", code: "101" },
  { name: "Stanbic IBTC Bank", code: "221" },
  { name: "Standard Chartered Bank", code: "068" },
  { name: "Sterling Bank", code: "232" },
  { name: "SunTrust Bank", code: "100" },
  { name: "Union Bank of Nigeria", code: "032" },
  { name: "United Bank For Africa", code: "033" },
  { name: "Unity Bank", code: "215" },
  { name: "Wema Bank", code: "035" },
  { name: "Zenith Bank", code: "057" }
];
