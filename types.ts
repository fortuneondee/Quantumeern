

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  ROI = 'ROI',
  REFERRAL = 'REFERRAL',
  PURCHASE = 'PURCHASE',
  SWEEP = 'SWEEP'
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED'
}

export interface Package {
  id: string;
  name: string;
  minAmount: number;
  maxAmount: number;
  dailyRoi: number;
  durationDays: number;
  description: string;
}

export interface UserPackage {
  id: string;
  packageId: string;
  amount: number;
  activatedAt: number;
  lastPayoutAt?: number;
  isActive: boolean;
  totalEarned: number;
  userId: string;
}

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  txHash?: string;
  timestamp: number;
  description: string;
}

export interface User {
  id: string;
  email: string;
  referralCode: string;
  referredBy?: string;
  usdtDepositAddress: string;
  depositPrivateKey?: string; // Encrypted in real apps
  withdrawalAddress?: string;
  capitalBalance: number;
  profitBalance: number;
  totalEarned: number;
  isActive: boolean;
  isAdmin: boolean;
  referralCount: number;
  referralEarnings: number;
  welcomeBonus: number;
}

export interface HotWalletConfig {
  address: string;
  privateKey: string;
  lastSyncTimestamp: number;
}

export interface AppState {
  currentUser: User | null;
  users: User[];
  packages: Package[];
  activePackages: UserPackage[];
  transactions: Transaction[];
  platformSettings: {
    isRoiEnabled: boolean;
    referralLevels: { level: number; percentage: number }[];
    minWithdrawal: number;
    platformPaused: boolean;
    roiOverride?: number;
  };
}