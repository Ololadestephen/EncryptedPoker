// src/lib/constants.ts
import { PublicKey } from '@solana/web3.js';

export const POKER_PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_PROGRAM_ID || 'AxwPZ5ZiuZwrFss1jjFh5zAozYt2EKBZYT9Mw2wN7fye'
);

export const ARCIUM_MXE_PUBKEY = new PublicKey(
  import.meta.env.VITE_ARCIUM_MXE_PUBKEY || 'H8MGCGH5psG6dss4nZkJWazWEbRzvJG7Kbd2MAzK9n4x'
);

export const SOLANA_RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
export const SOLANA_NETWORK = import.meta.env.VITE_SOLANA_NETWORK || 'devnet';

// Hand info
export const STARTING_CHIPS = 2000;
export const MAX_PLAYERS = 6;

// Utility labels
export const HAND_CATEGORIES: Record<number, string> = {
  0: 'High Card',
  1: 'One Pair',
  2: 'Two Pair',
  3: 'Three of a Kind',
  4: 'Straight',
  5: 'Flush',
  6: 'Full House',
  7: 'Four of a Kind',
  8: 'Straight Flush',
  9: 'Royal Flush',
};
