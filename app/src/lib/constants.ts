// src/lib/constants.ts
import { PublicKey } from '@solana/web3.js';

export const POKER_PROGRAM_ID = new PublicKey(
  'AxwPZ5ZiuZwrFss1jjFh5zAozYt2EKBZYT9Mw2wN7fye'
);

// Arcium MXE account for devnet (cluster-offset 456, derived PDA)
export const ARCIUM_MXE_PUBKEY = new PublicKey(
  'H8MGCGH5psG6dss4nZkJWazWEbRzvJG7Kbd2MAzK9n4x'
);

export const SOLANA_RPC_URL = 'https://api.devnet.solana.com';
export const SOLANA_NETWORK = 'devnet';

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
