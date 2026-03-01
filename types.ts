
export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  ROI = 'ROI',
  REFERRAL = 'REFERRAL',
  PURCHASE = 'PURCHASE',
  SWEEP = 'SWEEP',
  BONUS = 'BONUS',
  TASK_REWARD = 'TASK_REWARD',
  FIAT_DEPOSIT = 'FIAT_DEPOSIT',
  FIAT_WITHDRAWAL = 'FIAT_WITHDRAWAL'
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
  isActive?: boolean;
  imageUrl?: string; // New: Image for the front of the flip card
}

export interface GiveawayPool {
  id: string;
  code: string;
  totalAmount: number;
  rewardPerUser: number;
  maxClaims: number;
  claimsCount: number;
  isActive: boolean;
  expiryDate?: number;
  requireDeposit: boolean;
  createdAt: number;
}

export interface GiveawayClaim {
  id: string; // poolId_userId
  poolId: string;
  userId: string;
  amount: number;
  timestamp: number;
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
  depositPrivateKey?: string; 
  withdrawalAddress?: string;
  capitalBalance: number;
  profitBalance: number;
  totalEarned: number;
  isActive: boolean;
  isAdmin: boolean;
  referralCount: number;
  referralEarnings: number;
  welcomeBonus: number;
  joinedAt?: number;
  // Task Tracking
  whatsappShares?: number;
  lastWhatsappShare?: number;
  // API System
  apiKey?: string;
}

export interface ReferralRecord {
  userId: string;
  email: string;
  referredBy: string;
  joinedAt: number;
  status: 'active' | 'inactive';
  totalCommissions?: number;
}

export interface HotWalletConfig {
  address: string;
  privateKey: string;
  lastSyncTimestamp: number;
}

export interface PaymentSettings {
  isEnabled: boolean;
  provider: 'NOWPAYMENTS';
  apiKey: string;
  publicKey: string;
  ipnSecret: string;
}

export interface WhatsappTaskConfig {
  enabled: boolean;
  rewardAmount: number;
  cooldownHours: number;
  maxLifetimeShares: number;
  messageTemplate: string;
}

export interface GuideStep {
  id: string;
  stepNumber: string;
  title: string;
  description: string;
}

export interface GuideConfig {
  enabled: boolean;
  title: string;
  subtitle: string;
  steps: GuideStep[];
}

// --- NEW FIAT INTERFACES ---

export interface BankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  isActive: boolean;
}

export interface FiatRequest {
  id: string;
  userId: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  amountUsdt: number;
  amountNgn: number;
  exchangeRate: number;
  status: TransactionStatus;
  timestamp: number;
  // Deposit specific
  proofImage?: string; // Base64 string
  adminBankId?: string;
  // Withdrawal specific
  userBankName?: string;
  userAccountName?: string;
  userAccountNumber?: string;
  rejectionReason?: string;
}

export interface KorapaySettings {
  publicKey: string;
  secretKey: string;
  webhookSecret: string;
  mode: 'sandbox' | 'live';
  depositsEnabled: boolean;
  minDeposit: number;
  maxDeposit?: number;
  depositChargeType: 'fixed' | 'percentage' | 'none';
  depositChargeValue: number;
}

export interface AppState {
  currentUser: User | null;
  users: User[];
  packages: Package[];
  activePackages: UserPackage[];
  transactions: Transaction[];
  giveawayPools: GiveawayPool[];
  platformSettings: {
    appName?: string;
    isRoiEnabled: boolean;
    isReferralSystemEnabled: boolean; 
    referralLevels: { level: number; percentage: number }[];
    minWithdrawal: number;
    platformPaused: boolean;
    withdrawalTickerEnabled?: boolean; // New Flag
    roiOverride?: number;
    whatsappConfig?: WhatsappTaskConfig;
    guideConfig?: GuideConfig;
    // Fiat Settings
    fiatDepositEnabled: boolean;
    fiatWithdrawalEnabled: boolean;
    depositRateNgn: number; // NGN to 1 USDT
    withdrawalRateNgn: number; // 1 USDT to NGN
    paystackSecretKey?: string; // For Account Resolution
  };
  paymentSettings: PaymentSettings;
  korapaySettings?: KorapaySettings;
}
