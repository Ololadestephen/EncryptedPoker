// src/types/index.ts
import { PublicKey } from '@solana/web3.js';

export type GamePhase =
  | 'Waiting'
  | 'PreFlop'
  | 'Flop'
  | 'Turn'
  | 'River'
  | 'Showdown'
  | 'Complete';

// Helper to convert phase u8 to string
export const PHASE_MAP: Record<number, GamePhase> = {
  0: 'Waiting',
  1: 'PreFlop',
  2: 'Flop',
  3: 'Turn',
  4: 'River',
  5: 'Showdown',
  6: 'Complete',
};

export type PlayerAction = 'fold' | 'check' | 'call' | 'raise' | 'allin';

export interface TableData {
  tableId: any; // BN (u64)
  name: number[]; // [u8; 32]
  creator: PublicKey;
  smallBlind: any; // BN
  bigBlind: any; // BN
  minPlayers: number;
  maxPlayers: number;
  currentPlayers: number;
  phase: { waiting?: {}; preFlop?: {}; flop?: {}; turn?: {}; river?: {}; showdown?: {}; complete?: {} };
  pot: any; // BN
  currentBet: any; // BN
  dealerSeat: number;
  currentTurn: number;
  handNumber: any; // BN
  arciumMxeAccount: PublicKey;
  arciumComputationId: any; // BN
  encryptedDeckHash: number[]; // [u8; 32]
  communityCards: number[]; // [u8; 5]
  mainPot: any; // BN
  sidePots: any[]; // BN[6]
  sidePotCount: number;
  lastActionTs: any; // BN (i64)
  tokenGateMint: PublicKey | null;
  tokenGateAmount: any; // BN
  bump: number;
}

export interface PlayerData {
  playerId: number;
  wallet: PublicKey;
  table: PublicKey;
  seatIndex: number;
  chipCount: any; // BN
  currentBet: any; // BN
  totalContributed: any; // BN
  isActive: boolean;
  isAllIn: boolean;
  hasActed: boolean;
  timeBankRemaining: any; // BN (i64)
  encryptedHandHash: number[]; // [u8; 32]
  joinedAt: any; // BN (i64)
  lastReaction: number;
  lastReactionTs: any; // BN (i64)
  lastMessage: number[]; // [u8; 64]
  lastMessageTs: any; // BN (i64)
  actionCount: number;
  lastHand: any; // BN
  bump: number;
}

export interface GameResultData {
  table: PublicKey;
  handNumber: any; // BN
  winners: PublicKey[]; // [Pubkey; 6]
  winnerCount: number;
  payouts: any[]; // BN[6]
  winningHandCategory: number;
  communityCards: number[]; // [u8; 5]
  arciumProof: number[]; // [u8; 256]
  proofHash: number[]; // [u8; 32]
  timestamp: any; // BN
  bump: number;
}

// UI display types (converted from BN)
export interface TableListing {
  tableId: string;
  name: string;
  players: number;
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  phase: GamePhase;
  tokenGated: boolean;
  pot: number;
  handNumber: number;
}

export interface RecentGame {
  tableId: string;
  handNumber: number;
  result: 'win' | 'loss' | 'fold';
  chipDelta: number;
  handCategory?: number;
  timestamp: number;
  proofHash: string;
}

// Card helpers
export const SUITS = ['♣', '♦', '♥', '♠'] as const;
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export const HAND_NAMES: Record<number, string> = {
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

export function cardToDisplay(value: number): {
  rank: string;
  suit: string;
  isRed: boolean;
  display: string;
} {
  if (value === 255 || value < 0 || value > 51) {
    return { rank: '?', suit: '?', isRed: false, display: '??' };
  }
  const suit = Math.floor(value / 13);
  const rank = value % 13;
  const isRed = suit === 1 || suit === 2;
  return {
    rank: RANKS[rank],
    suit: SUITS[suit],
    isRed,
    display: `${RANKS[rank]}${SUITS[suit]}`,
  };
}

export function formatChips(n: number | any): string {
  const num = typeof n === 'number' ? n : (n?.toNumber ? n.toNumber() : 0);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return num.toString();
}

export function shortenWallet(wallet: string | PublicKey, chars = 4): string {
  const s = typeof wallet === 'string' ? wallet : wallet.toString();
  if (!s || s.length < 10) return s;
  return `${s.slice(0, chars)}…${s.slice(-chars)}`;
}

export function phaseLabel(phase: GamePhase): string {
  const labels: Record<GamePhase, string> = {
    Waiting: 'Waiting for Players',
    PreFlop: 'Pre-Flop',
    Flop: 'Flop',
    Turn: 'Turn',
    River: 'River',
    Showdown: 'Showdown',
    Complete: 'Hand Complete',
  };
  return labels[phase] ?? phase;
}

export function parseGamePhase(phase: any): GamePhase {
  if (phase.waiting) return 'Waiting';
  if (phase.preFlop) return 'PreFlop';
  if (phase.flop) return 'Flop';
  if (phase.turn) return 'Turn';
  if (phase.river) return 'River';
  if (phase.showdown) return 'Showdown';
  if (phase.complete) return 'Complete';
  return 'Waiting';
}

export function bytesToString(bytes: number[] | Uint8Array | Buffer): string {
  if (!bytes) return '';
  const arr = bytes instanceof Uint8Array || Buffer.isBuffer(bytes) ? bytes : Uint8Array.from(bytes);
  return new TextDecoder().decode(arr).replace(/\0/g, '');
}
