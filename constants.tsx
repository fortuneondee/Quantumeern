import React from 'react';
import { Package } from './types.ts';

export const INITIAL_PACKAGES: Package[] = [
  {
    id: 'pkg1',
    name: 'Node Level 1',
    minAmount: 20,
    maxAmount: 100,
    dailyRoi: 10,
    durationDays: 365,
    description: 'Entry-level liquidity node for beginners.'
  },
  {
    id: 'pkg2',
    name: 'Node Level 2',
    minAmount: 101,
    maxAmount: 500,
    dailyRoi: 4.5,
    durationDays: 365,
    description: 'Enhanced hashrate for stable daily output.'
  },
  {
    id: 'pkg3',
    name: 'Node Level 3',
    minAmount: 501,
    maxAmount: 1000,
    dailyRoi: 4.5,
    durationDays: 365,
    description: 'Standard commercial staking unit.'
  },
  {
    id: 'pkg4',
    name: 'Node Level 4',
    minAmount: 1001,
    maxAmount: 2500,
    dailyRoi: 4.5,
    durationDays: 365,
    description: 'Advanced algo-trading capabilities.'
  },
  {
    id: 'pkg5',
    name: 'Node Level 5',
    minAmount: 2501,
    maxAmount: 5000,
    dailyRoi: 4.5,
    durationDays: 365,
    description: 'Professional grade liquidity mining.'
  },
  {
    id: 'pkg6',
    name: 'Node Level 6',
    minAmount: 5001,
    maxAmount: 10000,
    dailyRoi: 4.5,
    durationDays: 365,
    description: 'High-frequency trading node.'
  },
  {
    id: 'pkg7',
    name: 'Node Level 7',
    minAmount: 10001,
    maxAmount: 25000,
    dailyRoi: 4.5,
    durationDays: 365,
    description: 'Priority network access and speed.'
  },
  {
    id: 'pkg8',
    name: 'Node Level 8',
    minAmount: 25001,
    maxAmount: 50000,
    dailyRoi: 4.5,
    durationDays: 365,
    description: 'Elite infrastructure for volume staking.'
  },
  {
    id: 'pkg9',
    name: 'Node Level 9',
    minAmount: 50001,
    maxAmount: 75000,
    dailyRoi: 4.5,
    durationDays: 365,
    description: 'Dedicated server rack for maximum yield.'
  },
  {
    id: 'pkg10',
    name: 'Node Level 10',
    minAmount: 75001,
    maxAmount: 100000,
    dailyRoi: 4.5,
    durationDays: 365,
    description: 'Institutional grade validator node.'
  },
  {
    id: 'pkg11',
    name: 'Quantum Node I',
    minAmount: 100001,
    maxAmount: 150000,
    dailyRoi: 4.5,
    durationDays: 365,
    description: 'Exclusive partner infrastructure.'
  },
  {
    id: 'pkg12',
    name: 'Quantum Node II',
    minAmount: 150001,
    maxAmount: 250000,
    dailyRoi: 4.5,
    durationDays: 365,
    description: 'Core network validator status.'
  },
  {
    id: 'pkg13',
    name: 'Quantum Node III',
    minAmount: 250001,
    maxAmount: 500000,
    dailyRoi: 4.5,
    durationDays: 365,
    description: 'Interstellar computation capacity.'
  },
  {
    id: 'pkg14',
    name: 'Quantum Node IV',
    minAmount: 500001,
    maxAmount: 1000000,
    dailyRoi: 4.5,
    durationDays: 365,
    description: 'Empire-building yield generation.'
  },
  {
    id: 'pkg15',
    name: 'Quantum Node V',
    minAmount: 1000001,
    maxAmount: 2500000,
    dailyRoi: 4.5,
    durationDays: 365,
    description: 'Massive scale accumulation engine.'
  },
  {
    id: 'pkg16',
    name: 'Quantum Node VI',
    minAmount: 2500001,
    maxAmount: 5000000,
    dailyRoi: 4.5,
    durationDays: 365,
    description: 'Global liquidity provider status.'
  },
  {
    id: 'pkg17',
    name: 'Quantum Node VII',
    minAmount: 5000001,
    maxAmount: 10000000,
    dailyRoi: 4.5,
    durationDays: 365,
    description: 'Boundless earning potential.'
  },
  {
    id: 'pkg18',
    name: 'Quantum Node VIII',
    minAmount: 10000001,
    maxAmount: 25000000,
    dailyRoi: 4.5,
    durationDays: 365,
    description: 'Dimensional asset management.'
  },
  {
    id: 'pkg19',
    name: 'Quantum Node IX',
    minAmount: 25000001,
    maxAmount: 50000000,
    dailyRoi: 4.5,
    durationDays: 365,
    description: 'Limitless possibilities for growth.'
  },
  {
    id: 'pkg20',
    name: 'Omega Node',
    minAmount: 50000001,
    maxAmount: 100000000,
    dailyRoi: 4.5,
    durationDays: 365,
    description: 'The ultimate investment tier.'
  }
];

export const REF_LEVELS = [
  { level: 1, percentage: 10 },
  { level: 2, percentage: 5 },
  { level: 3, percentage: 2 }
];

export const APP_NAME = "QuantumEarn";