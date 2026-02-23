import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Layout } from '../components/layout/Layout';
import { PlayingCard } from '../components/ui/PlayingCard';
import { Card } from '../components/ui/Card';
import { useTableRealtime, useTurnTimer, deriveTablePDA } from '../hooks/useTableRealtime';
import {
  TableData, PlayerData, GamePhase, phaseLabel, formatChips,
  shortenWallet, parseGamePhase, bytesToString, HAND_NAMES,
} from '../types';
import { evaluateHand } from '../lib/hand-evaluator';
import * as anchor from '@coral-xyz/anchor';
import { POKER_PROGRAM_ID, ARCIUM_MXE_PUBKEY, SOLANA_NETWORK } from '../lib/constants';
import idl from '../idl/encrypted_poker.json';
import { PublicKey } from '@solana/web3.js';
import { parseTxError } from '../lib/parseTxError';
import { getStandinCards, isCardRevealed, getStandinHoleCards, buildDeck } from '../lib/card-utils';

// forceReveal: only affects HOLE CARDS (we always show the player their own cards).
// Community cards are still gated by game phase so they appear at the right street.
const forceReveal = true;

const SEAT_POSITIONS = [
  { bottom: '2rem', left: '50%', transform: 'translateX(-50%)' },   // 0 hero bottom
  { bottom: '4rem', right: '6rem' },                                  // 1 bottom-right
  { top: '50%', right: '1.5rem', transform: 'translateY(-50%)' },   // 2 mid-right
  { top: '4rem', right: '6rem' },                                     // 3 top-right
  { top: '2rem', left: '50%', transform: 'translateX(-50%)' },      // 4 top-center
  { bottom: '4rem', left: '6rem' },                                   // 5 bottom-left
];

// Custom hook for window dimensions
function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const handleResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return size;
}

interface CardProps {
  value?: number;
  encryptedData?: number[] | Uint8Array;
  revealed?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

interface SeatProps {
  player: PlayerData | null;
  seatIndex: number;
  isMyTurn: boolean;
  isMe: boolean;
  myCards?: number[];
  lastActionTs: number;
  gamePhase: string;
  onJoin?: (seat: number) => void;
  onReact?: (type: number) => void;
  myHand?: any;
  communityCards: number[];
  pos: any;
  tableId: string;
}

const PlayerSeat: React.FC<SeatProps & { table: any }> = ({
  player, seatIndex, isMyTurn, isMe, myCards, lastActionTs, gamePhase, onJoin, table, communityCards, pos, tableId,
}) => {

  const { remaining, pct, urgent, critical } = useTurnTimer(
    isMyTurn ? lastActionTs : 0,
    player?.timeBankRemaining ?? 30
  );

  if (!player) {
    const canJoin = gamePhase === 'Waiting';
    return (
      <button
        onClick={() => canJoin && onJoin?.(seatIndex)}
        disabled={isMe || !canJoin}
        title={canJoin ? `Join seat ${seatIndex + 1}` : 'Game already in progress'}
        style={{
          position: 'absolute', ...pos as any,
          width: 90, height: 56,
          border: `1.5px dashed ${canJoin ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)'}`,
          borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.7rem',
          color: canJoin ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
          background: 'transparent',
          cursor: canJoin ? 'pointer' : 'default',
        }}>
        {canJoin ? `Join Seat ${seatIndex + 1}` : '—'}
      </button>
    );
  }

  const folded = !player.isActive;

  return (
    <div style={{
      position: 'absolute', ...pos as any,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem',
      zIndex: isMyTurn ? 10 : 1,
    }}>
      {/* Timer bar */}
      {isMyTurn && (
        <div className="timer-bar" style={{ width: '100%', minWidth: 110 }}>
          <div className="timer-bar-fill" style={{
            width: `${pct}%`,
            background: critical ? 'var(--red)' : urgent ? 'var(--amber)' : 'var(--arcium)',
          }} />
        </div>
      )}

      {/* Hole cards above seat */}
      {player.isActive && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.2rem',
          marginBottom: '0.2rem',
          transform: 'translateY(10px)',
          opacity: folded ? 0.4 : 1,
          transition: 'all 0.3s var(--ease-out)',
        }}>
          {isMe && myCards && myCards.length === 2 ? (() => {
            const hNum = table?.handNumber?.toNumber() || 0;
            const revealedCommunity = communityCards.filter((_, idx) => isCardRevealed(idx, gamePhase));
            const { label } = evaluateHand([...myCards, ...revealedCommunity]);
            return (
              <>
                <div style={{ display: 'flex', gap: '0.2rem' }}>
                  <PlayingCard value={myCards[0]} size="sm" animate />
                  <PlayingCard value={myCards[1]} size="sm" animate />
                </div>
                <div style={{
                  fontSize: '0.625rem', color: 'var(--gold)',
                  background: 'rgba(201,168,76,0.18)', padding: '1px 8px',
                  borderRadius: 4, display: 'inline-block',
                  fontFamily: 'var(--font-mono)', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.03em',
                  border: '1px solid rgba(201,168,76,0.25)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  whiteSpace: 'nowrap',
                }}>
                  {label}
                </div>
              </>
            );
          })() : (
            <div style={{ display: 'flex', gap: '0.2rem' }}>
              <Card revealed={false} size="sm" />
              <Card revealed={false} size="sm" />
            </div>
          )}
        </div>
      )}

      {/* Name plate */}
      <div style={{
        position: 'relative',
        background: isMyTurn
          ? 'rgba(0,229,176,0.12)'
          : folded
            ? 'rgba(0,0,0,0.4)'
            : 'rgba(10,12,15,0.85)',
        border: `1.5px solid ${isMyTurn ? 'rgba(0,229,176,0.45)' :
          isMe ? 'rgba(201,168,76,0.4)' :
            folded ? 'rgba(255,255,255,0.06)' :
              'rgba(255,255,255,0.1)'
          }`,
        borderRadius: 10,
        padding: '0.5rem 0.75rem',
        minWidth: 120,
        backdropFilter: 'blur(12px)',
        boxShadow: isMyTurn ? '0 0 30px rgba(0,229,176,0.2), var(--shadow-arcium)' : 'var(--shadow-sm)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: folded ? 0.5 : 1,
      }}>
        {/* Orbit Glow for active player */}
        {isMyTurn && (
          <div className="orbit-glow" style={{
            position: 'absolute', inset: -3,
            borderRadius: 'inherit',
            border: '2px solid var(--arcium)',
            opacity: 0.6,
            pointerEvents: 'none',
          }} />
        )}

        <div style={{
          fontSize: '0.7rem', fontFamily: 'var(--font-mono)',
          color: isMe ? 'var(--gold)' : 'rgba(255,255,255,0.55)',
          marginBottom: 2,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {isMe ? 'You' : shortenWallet(player.wallet, 4)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.9375rem',
            color: player.chipCount.toNumber() < 200 ? 'var(--red)' : '#fff',
          }}>
            {formatChips(player.chipCount)}
          </span>
          {player.isAllIn && (
            <span className="badge badge-error" style={{ fontSize: '0.6rem', padding: '1px 4px' }}>ALL IN</span>
          )}
          {folded && (
            <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>FOLDED</span>
          )}
        </div>
        {player.currentBet.toNumber() > 0 && (
          <div style={{
            fontSize: '0.75rem', color: 'var(--gold)', fontFamily: 'var(--font-mono)',
            marginTop: 4, display: 'flex', alignItems: 'center', gap: '0.375rem'
          }}>
            <span style={{ opacity: 0.4 }}>•</span> {formatChips(player.currentBet)}
          </div>
        )}
      </div>

      {/* Turn timer text */}
      {isMyTurn && (
        <div style={{
          fontSize: '0.7rem', fontFamily: 'var(--font-mono)',
          color: critical ? 'var(--red)' : urgent ? 'var(--amber)' : 'var(--arcium)',
        }}>
          {remaining}s
        </div>
      )}

      {/* Dealer button */}
      {table && seatIndex === table.dealerSeat && (
        <div style={{
          position: 'absolute', top: -10, left: -10,
          width: 22, height: 22, borderRadius: '50%',
          background: 'var(--gold)',
          color: '#0a0c0f', fontSize: '0.65rem', fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 10px rgba(201,168,76,0.5), var(--shadow-gold)',
          zIndex: 5,
        }}>D</div>
      )}
    </div>
  );
};

// ===== Bet controls =====
const BetControls: React.FC<{
  table: any; myPlayer: PlayerData;
  onAction: (type: string, amount?: number) => void;
  isLoading: boolean;
  isBigBlindPreflop?: boolean; // BB gets a free check option on preflop
}> = ({ table, myPlayer, onAction, isLoading, isBigBlindPreflop }) => {
  const [showRaise, setShowRaise] = useState(false);
  const tableBigBlind = table.bigBlind.toNumber ? table.bigBlind.toNumber() : table.bigBlind;
  const tableCurrentBet = table.currentBet.toNumber ? table.currentBet.toNumber() : table.currentBet;
  const tablePot = table.pot.toNumber ? table.pot.toNumber() : table.pot;

  const [raiseAmt, setRaiseAmt] = useState(tableBigBlind * 2);
  const callAmt = Math.min(tableCurrentBet - myPlayer.currentBet.toNumber(), myPlayer.chipCount.toNumber());
  // Big Blind gets a "check" option on PreFlop even though callAmt > 0
  // (the BB post is reflected in current_bet but not in player.current_bet per on-chain state)
  const canCheck = callAmt <= 0 || !!isBigBlindPreflop;
  const minRaise = tableCurrentBet + tableBigBlind;

  const quickAmts = [
    { label: 'Min', v: minRaise },
    { label: '½ Pot', v: Math.ceil(tablePot / 2) },
    { label: 'Pot', v: tablePot },
    { label: '2× Pot', v: tablePot * 2 },
  ].filter(q => q.v <= myPlayer.chipCount.toNumber());

  return (
    <div style={{
      background: 'rgba(10,12,15,0.92)',
      border: '1px solid var(--border-bright)',
      borderRadius: 14,
      padding: '1rem',
      backdropFilter: 'blur(16px)',
      display: 'flex', flexDirection: 'column', gap: '0.75rem',
    }}>
      {/* Main buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.625rem' }}>
        <button
          className="btn btn-danger"
          style={{ justifyContent: 'center', padding: '0.875rem' }}
          onClick={() => onAction('fold')} disabled={isLoading}
        >
          Fold
        </button>

        {canCheck ? (
          <button
            className="btn btn-ghost"
            style={{ justifyContent: 'center', padding: '0.875rem' }}
            onClick={() => onAction('check')} disabled={isLoading}
          >
            Check
          </button>
        ) : (
          <button
            className="btn btn-arcium"
            style={{ justifyContent: 'center', padding: '0.875rem', flexDirection: 'column', gap: 0 }}
            onClick={() => onAction('call')} disabled={isLoading}
          >
            <span>Call</span>
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', opacity: 0.8 }}>
              {formatChips(callAmt)}
            </span>
          </button>
        )}

        {myPlayer.chipCount.toNumber() > callAmt ? (
          <button
            className="btn btn-gold"
            style={{
              justifyContent: 'center', padding: '0.875rem',
              background: showRaise ? 'var(--gold-dim)' : undefined,
              color: showRaise ? 'var(--gold-2)' : undefined,
            }}
            onClick={() => setShowRaise(!showRaise)} disabled={isLoading}
          >
            Raise {showRaise ? '▲' : '▾'}
          </button>
        ) : (
          <button
            className="btn"
            style={{
              justifyContent: 'center', padding: '0.875rem',
              background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)',
              color: 'var(--amber)',
            }}
            onClick={() => onAction('allin')} disabled={isLoading}
          >
            All-In
          </button>
        )}
      </div>

      {/* Raise panel */}
      {showRaise && (
        <div style={{
          background: 'var(--ink-2)', borderRadius: 10, padding: '0.875rem',
          border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.625rem',
        }}>
          {/* Quick amount chips */}
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            {quickAmts.map(({ label, v }) => (
              <button
                key={label}
                type="button"
                onClick={() => setRaiseAmt(v)}
                style={{
                  background: raiseAmt === v ? 'var(--gold-dim)' : 'var(--surface)',
                  border: `1px solid ${raiseAmt === v ? 'rgba(201,168,76,0.4)' : 'var(--border)'}`,
                  color: raiseAmt === v ? 'var(--gold-2)' : 'rgba(255,255,255,0.55)',
                  borderRadius: 6, padding: '0.25rem 0.625rem',
                  fontSize: '0.8125rem', cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                }}>
                {label} ({formatChips(v)})
              </button>
            ))}
            <button
              type="button"
              onClick={() => setRaiseAmt(myPlayer.chipCount.toNumber())}
              style={{
                background: raiseAmt === myPlayer.chipCount.toNumber() ? 'rgba(245,158,11,0.2)' : 'var(--surface)',
                border: `1px solid ${raiseAmt === myPlayer.chipCount.toNumber() ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
                color: raiseAmt === myPlayer.chipCount.toNumber() ? 'var(--amber)' : 'rgba(255,255,255,0.55)',
                borderRadius: 6, padding: '0.25rem 0.625rem',
                fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'var(--font-mono)',
              }}>
              All-In
            </button>
          </div>

          {/* Slider */}
          <input
            type="range" min={minRaise} max={myPlayer.chipCount.toNumber()}
            value={raiseAmt} onChange={e => setRaiseAmt(+e.target.value)}
            style={{ width: '100%', accentColor: 'var(--gold)' }}
          />

          {/* Confirm */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="number" className="input" min={minRaise} max={myPlayer.chipCount.toNumber()}
              value={raiseAmt} onChange={e => setRaiseAmt(+e.target.value)}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <button
              className="btn btn-gold"
              style={{ whiteSpace: 'nowrap', padding: '0 1.25rem' }}
              onClick={() => { onAction('raise', raiseAmt); setShowRaise(false); }}
              disabled={raiseAmt < minRaise || isLoading}
            >
              Raise to {formatChips(raiseAmt)}
            </button>
          </div>
        </div>
      )}

      {/* Stack info */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-mono)',
      }}>
        <span>Stack: <span style={{ color: 'rgba(255,255,255,0.6)' }}>{formatChips(myPlayer.chipCount)}</span></span>
        {!canCheck && <span>To call: <span style={{ color: 'var(--arcium)' }}>{formatChips(callAmt)}</span></span>}
        <span>Pot: <span style={{ color: 'var(--gold)' }}>{formatChips(table.pot)}</span></span>
      </div>
    </div>
  );
};

// ===== Main page =====

// =====================================================================
// ORACLE SIMULATION HELPERS
// Because Arcium MPC is not live in the demo, the frontend has to act
// as the oracle and call the on_community_cards / on_showdown_result
// callbacks itself, immediately after each matching instruction.
// =====================================================================

/** Simulate hole cards for any player — unique per wallet × table × hand */
function simulateHoleCards(walletBytes: Uint8Array, tableId: string, handNum: number): [number, number] {
  const suffix = tableId.replace('table-', '');
  const sb = new TextEncoder().encode(suffix);
  const tb0 = sb[0] ?? 3;
  const tb1 = sb[1] ?? 17;
  const tb2 = sb[2] ?? 31;
  const c1 = Math.abs((walletBytes[0] ^ walletBytes[4] ^ tb0 ^ (handNum & 0xff))) % 52;
  const c2r = Math.abs((walletBytes[1] ^ walletBytes[5] ^ tb1 ^ tb2 ^ ((handNum >> 8) & 0xff) ^ 7)) % 52;
  const c2 = c2r === c1 ? (c2r + 1) % 52 : c2r;
  return [c1, c2];
}

/** Score a poker hand (higher = better) — checks pairs/sets against 7-card pool */
function scoreHand(cards: number[]): number {
  const v = cards.filter(c => c >= 0 && c < 52);
  if (v.length === 0) return 0;
  const ranks = v.map(c => c % 13);
  const suits = v.map(c => Math.floor(c / 13));
  const rankCnt: Record<number, number> = {};
  const suitCnt: Record<number, number> = {};
  ranks.forEach(r => { rankCnt[r] = (rankCnt[r] || 0) + 1; });
  suits.forEach(s => { suitCnt[s] = (suitCnt[s] || 0) + 1; });
  const byCount = Object.values(rankCnt).sort((a, b) => b - a);
  const hasFlush = Object.values(suitCnt).some(n => n >= 5);
  const sortedRanks = [...new Set(ranks)].sort((a, b) => a - b);
  let straight = false;
  for (let i = 0; i <= sortedRanks.length - 5; i++) {
    if (sortedRanks[i + 4] - sortedRanks[i] === 4) { straight = true; break; }
  }
  // Broadway straight (10-J-Q-K-A)
  if ([0, 9, 10, 11, 12].every(r => sortedRanks.includes(r))) straight = true;
  const rankMax = Math.max(...ranks);
  const sum = ranks.reduce((s, r) => s + r, 0);

  if (straight && hasFlush) return 8e5 + rankMax;
  if (byCount[0] === 4) return 7e5 + sum;
  if (byCount[0] === 3 && byCount[1] === 2) return 6e5 + sum;
  if (hasFlush) return 5e5 + sum;
  if (straight) return 4e5 + rankMax;
  if (byCount[0] === 3) return 3e5 + sum;
  if (byCount[0] === 2 && byCount[1] === 2) return 2e5 + sum;
  if (byCount[0] === 2) return 1e5 + sum;
  return sum;
}

function handCategoryFromScore(score: number): number {
  if (score >= 8e5) return 8; // Straight flush
  if (score >= 7e5) return 7; // Four of a kind
  if (score >= 6e5) return 6; // Full house
  if (score >= 5e5) return 5; // Flush
  if (score >= 4e5) return 4; // Straight
  if (score >= 3e5) return 3; // Three of a kind
  if (score >= 2e5) return 2; // Two pair
  if (score >= 1e5) return 1; // One pair
  return 0;                   // High card
}

export const GameTablePage: React.FC = () => {

  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey } = wallet;
  const { table, players, myHand, isLoading, connectionMode, refetch } = useTableRealtime(tableId ?? null);
  const { width: windowWidth } = useWindowSize();
  const [isActing, setIsActing] = useState(false);
  const prevPhaseRef = useRef<string>('');
  const prevTurnRef = useRef<number | null>(null);

  // Decode hole cards. If Arcium hand account doesn't exist yet, derive visible
  // placeholder cards from the wallet pubkey (debug/plaintext mode).
  const myCards = useMemo(() => {
    if (myHand) {
      const decode = (bytes: any): number => {
        if (!bytes) return 0;
        const arr = Array.from(bytes as any);
        const b = (arr as number[]).slice(0, 4);
        const u32 = ((b[0] ?? 0) | ((b[1] ?? 0) << 8) | ((b[2] ?? 0) << 16) | ((b[3] ?? 0) << 24)) >>> 0;
        return Math.abs(u32) % 52;
      };
      const card1_raw = myHand.encryptedCard1 || myHand.encrypted_card1;
      const card2_raw = myHand.encryptedCard2 || myHand.encrypted_card2;
      const card1 = decode(card1_raw);
      const card2 = decode(card2_raw);
      return [card1, card2 === card1 ? (card2 + 1) % 52 : card2];
    }

    // Debug fallback: derive placeholder cards unique per wallet × table × hand.
    // IMPORTANT: tableId is in the form "table-1771859309616".
    // The first 6 chars ('table-') are identical across all tables, so we skip them
    // and use the numeric suffix for entropy.
    if (forceReveal && publicKey) {
      const hNum = table?.handNumber?.toNumber() || 0;
      return getStandinHoleCards(publicKey.toBase58(), tableId ?? '', hNum);
    }

    return undefined;
  }, [myHand, publicKey, tableId, table?.handNumber]);

  const program = useMemo(() => {
    const provider = new anchor.AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
    return new anchor.Program(idl as any, provider);
  }, [connection, wallet]);

  const phase = table ? parseGamePhase(table.phase) : 'Waiting';
  const communityCards = (table?.communityCards || (table as any)?.community_cards) ?? [255, 255, 255, 255, 255];
  const myPlayer = players.find(p => p.wallet.toBase58() === publicKey?.toBase58()) ?? null;
  const isMyTurn = !!(
    myPlayer &&
    table &&
    table.currentTurn === myPlayer.playerId &&
    table.currentTurn !== 255 &&
    !myPlayer.isAllIn &&
    myPlayer.isActive
  );
  // Show the dealing spinner only while we have no cards yet and Arcium hasn't called back
  const isDealing = phase === 'PreFlop' && !myCards && players.some(p => p.wallet.toBase58() === publicKey?.toBase58());

  // ===== ORACLE: Reveal community cards for the given street =====
  // Simulates the Arcium on_community_cards callback.
  // fromPhase = the phase BEFORE the advance (PreFlop→Flop, Flop→Turn, Turn→River)
  const oracleRevealCommunityCards = useCallback(async (
    fromPhase: string,
    tablePda: PublicKey,
    handNum: anchor.BN,
  ) => {
    if (!publicKey || !tableId || players.length === 0) return;
    const handNumber = handNum.toNumber();
    const deck = buildDeck(tableId, handNumber);
    // Convention: community cards start at deck index 4 (0-3 are hole pairs for 2 players)
    // deck[4..6] = flop, deck[7] = turn, deck[8] = river
    let indices: number[];
    let values: number[];
    if (fromPhase === 'PreFlop') {
      indices = [0, 1, 2];
      values = [deck[4] ?? 2, deck[5] ?? 16, deck[6] ?? 30];
    } else if (fromPhase === 'Flop') {
      indices = [3];
      values = [deck[7] ?? 44];
    } else if (fromPhase === 'Turn') {
      indices = [4];
      values = [deck[8] ?? 9];
    } else {
      return; // River → no community cards; showdown handles it
    }

    // Use first player as the dummy "calling player" for the ArciumCallback accounts
    const firstPlayer = players[0];
    const [handPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('hand'),
        tablePda.toBuffer(),
        handNum.toArrayLike(Buffer, 'le', 8),
        firstPlayer.publicKey.toBuffer(),
      ],
      POKER_PROGRAM_ID
    );

    console.log('[Oracle] Revealing community cards for', fromPhase, '→ indices:', indices, 'values:', values);
    await (program.methods as any).onCommunityCards(indices, values)
      .accounts({
        table: tablePda,
        arciumMxe: ARCIUM_MXE_PUBKEY,
        payer: publicKey,
        encryptedHand: handPda,
        player: firstPlayer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  }, [publicKey, tableId, players, program]);

  // ===== ORACLE: Evaluate hands, pick winner, settle showdown =====
  // Simulates the Arcium on_showdown_result callback.
  const oracleSettleShowdown = useCallback(async (
    tablePda: PublicKey,
    handNum: anchor.BN,
    boardCards: number[], // up to 5 community cards (255 = not yet revealed)
    finalDeck?: number[]  // optional forced deck for sync
  ) => {
    if (!publicKey || !tableId || players.length === 0 || !table) return;
    const handNumber = handNum.toNumber();

    // Fill any missing board cards with simulated values
    const deck = finalDeck || buildDeck(tableId, handNumber);
    const board = boardCards.map((c, i) =>
      (c === 255 || c === 0) ? (deck[4 + i] ?? (i * 7 + 2)) : c
    );

    // Evaluate each active player's hand
    const activePlayers = players.filter(p => p.isActive || p.isAllIn);
    let bestScore = -1;
    let winnerIdx = 0;
    activePlayers.forEach((p, idx) => {
      const wb = p.wallet.toBytes();
      const [h1, h2] = simulateHoleCards(wb, tableId, handNumber);
      const score = scoreHand([h1, h2, ...board]);
      console.log(`[Oracle] Player ${p.playerId} (${p.wallet.toBase58().slice(0, 8)}) score: ${score}`);
      if (score > bestScore) { bestScore = score; winnerIdx = idx; }
    });

    const winner = activePlayers[winnerIdx];
    if (!winner) return;

    const pot = table.pot.toNumber ? table.pot.toNumber() : table.pot;
    const winnersArr = new Array(6).fill(255);
    winnersArr[0] = winner.playerId;
    const payoutsArr = new Array(6).fill(new anchor.BN(0));
    payoutsArr[0] = new anchor.BN(pot);

    const [resultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('result'), tablePda.toBuffer(), handNum.toArrayLike(Buffer, 'le', 8)],
      POKER_PROGRAM_ID
    );

    const finalBoard: [number, number, number, number, number] = [
      board[0] ?? deck[4] ?? 2,
      board[1] ?? deck[5] ?? 16,
      board[2] ?? deck[6] ?? 30,
      board[3] ?? deck[7] ?? 44,
      board[4] ?? deck[8] ?? 9,
    ];

    console.log(`[Oracle] Winner: player ${winner.playerId}, score: ${bestScore}, hand: ${handCategoryFromScore(bestScore)}, board:`, finalBoard);

    const dummyProof = new Array(256).fill(0);
    const randomHashArray = Array.from({ length: 32 }, () => Math.floor(Math.random() * 256));

    await (program.methods as any).onShowdownResult(
      winnersArr,
      1,
      payoutsArr,
      handCategoryFromScore(bestScore),
      finalBoard,
      dummyProof,
      randomHashArray,
    )
      .accounts({
        table: tablePda,
        gameResult: resultPda,
        arciumMxe: ARCIUM_MXE_PUBKEY,
        creator: publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .remainingAccounts(players.map(p => ({ pubkey: p.publicKey, isSigner: false, isWritable: true })))
      .rpc();

    console.log('[Oracle] Showdown settled — hand complete');
  }, [publicKey, tableId, players, program, table]);



  const handleJoin = useCallback(async (seatIndex: number) => {
    if (!publicKey || !tableId) return;

    // Guard: don't join if already seated
    if (myPlayer) {
      alert('You are already seated at this table.');
      return;
    }

    // Guard: don't join an occupied seat
    const seatTaken = players.some(p => p.seatIndex === seatIndex);
    if (seatTaken) {
      alert('That seat is already taken. Please choose another.');
      return;
    }

    setIsActing(true);
    try {
      const tablePda = deriveTablePDA(tableId);
      const [playerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('player'), tablePda.toBuffer(), publicKey.toBuffer()],
        POKER_PROGRAM_ID
      );

      await (program.methods as any).joinTable(seatIndex)
        .accounts({
          table: tablePda,
          player: playerPda,
          payer: publicKey,
          playerTokenAccount: null,
          tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      refetch();
    } catch (err) {
      console.error('[GameTable] Join failed:', err);
      alert(parseTxError(err));
    } finally {
      setIsActing(false);
    }
  }, [publicKey, tableId, program, refetch, myPlayer, players]);

  const handleStart = useCallback(async () => {
    if (!publicKey || !tableId) return;
    setIsActing(true);
    try {
      const tablePda = deriveTablePDA(tableId);
      await (program.methods as any).startGame()
        .accounts({
          table: tablePda,
          creator: publicKey,
          arciumMxe: ARCIUM_MXE_PUBKEY,
        })
        .remainingAccounts(players.map(p => ({
          pubkey: p.publicKey,
          isSigner: false,
          isWritable: true,
        })))
        .rpc();
      refetch();
    } catch (err) {
      console.error('[GameTable] Start failed:', err);
      alert(parseTxError(err));
    } finally {
      setIsActing(false);
    }
  }, [publicKey, tableId, program, refetch]);

  const handleAction = useCallback(async (type: string, amount?: number) => {
    if (!publicKey || !table || !tableId) return;
    setIsActing(true);
    try {
      const tablePda = deriveTablePDA(tableId);
      const typeMap: Record<string, number> = { fold: 0, check: 1, call: 2, raise: 3, allin: 4 };
      const actionType = typeMap[type] ?? 1;

      // The Rust program expects raise_amount as the INCREMENT above the current table bet,
      // NOT the total raise-to amount that the UI slider/button shows.
      // e.g. if currentBet=50 and user clicks "Raise to 200", we pass 200-50=150.
      let programAmount = amount ?? 0;
      if (type === 'raise' && amount !== undefined) {
        const tableCurBet = table.currentBet.toNumber ? table.currentBet.toNumber() : table.currentBet;
        programAmount = Math.max(0, amount - tableCurBet);
        console.log(`[GameTable] Raise: UI amount=${amount}, tableBet=${tableCurBet}, increment sent=${programAmount}`);
      }

      // Always re-derive the player PDA from canonical seeds so we never pass
      // a stale cache address → fixes AccountDidNotDeserialize on player account.
      const [playerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('player'), tablePda.toBuffer(), publicKey.toBuffer()],
        POKER_PROGRAM_ID
      );

      // Fetch fresh player data to get current action_count and player_id
      let freshActionCount = 0;
      let freshPlayerId = myPlayer?.playerId ?? 0;
      try {
        const freshPlayer = await (program.account as any).player.fetch(playerPda);
        freshActionCount = freshPlayer.actionCount ?? 0;
        freshPlayerId = freshPlayer.playerId ?? freshPlayerId;
        console.log('[GameTable] Fresh player state — action_count:', freshActionCount, 'player_id:', freshPlayerId);
      } catch (fetchErr: any) {
        console.error('[GameTable] Player fetch failed — is the player account on-chain?', fetchErr.message);
        alert(`Could not load your player account. Make sure you have joined this table. (${fetchErr.message})`);
        return;
      }

      const [actionPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('action'),
          tablePda.toBuffer(),
          table.handNumber.toArrayLike(Buffer, 'le', 8),
          Buffer.from([freshPlayerId]),
          Buffer.from([freshActionCount]),
        ],
        POKER_PROGRAM_ID
      );

      console.log('[GameTable] Submitting action:', type, 'amount:', programAmount, '| playerPda:', playerPda.toBase58());

      await (program.methods as any).submitAction(actionType, new anchor.BN(programAmount))
        .accounts({
          table: tablePda,
          player: playerPda,
          encryptedAction: actionPda,
          payer: publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .remainingAccounts(players.map(p => ({
          pubkey: p.publicKey,
          isSigner: false,
          isWritable: true,
        })))
        .rpc();

      refetch();
    } catch (err) {
      console.error('[GameTable] Action failed:', err);
      alert(parseTxError(err));
    } finally {
      setIsActing(false);
    }
  }, [publicKey, table, myPlayer, tableId, program, players, refetch]);

  const handleDealCommunityCards = useCallback(async () => {
    if (!publicKey || !tableId) return;
    setIsActing(true);
    try {
      const tablePda = deriveTablePDA(tableId);
      await (program.methods as any).dealCommunityCards()
        .accounts({
          table: tablePda,
          creator: publicKey,
        })
        .remainingAccounts(players.map(p => ({
          pubkey: p.publicKey,
          isSigner: false,
          isWritable: true,
        })))
        .rpc();
      console.log('[GameTable] Deal community cards sent');
      refetch();
    } catch (err) {
      console.error('[GameTable] Deal community cards failed:', err);
      alert(parseTxError(err));
    } finally {
      setIsActing(false);
    }
  }, [publicKey, tableId, program, refetch]);

  const handleForceReveal = useCallback(async () => {
    if (!publicKey || !tableId || !table) return;
    setIsActing(true);
    try {
      const tablePda = deriveTablePDA(tableId);
      const currentPhaseStr = parseGamePhase(table.phase);
      let indices: number[] = [];

      if (currentPhaseStr === 'Flop') indices = [0, 1, 2];
      else if (currentPhaseStr === 'Turn') indices = [3];
      else if (currentPhaseStr === 'River') indices = [4];
      else if (currentPhaseStr === 'Showdown' || currentPhaseStr === 'Complete') {
        // Reveal all locked cards
        indices = communityCards
          .map((v: any, i: number) => (v === 255 ? i : -1))
          .filter((i: number) => i !== -1);
      }

      if (indices.length === 0) {
        alert('All cards already revealed or nothing to reveal.');
        return;
      }

      // Generate random card values for the demo/stuck state
      const values = indices.map(() => Math.floor(Math.random() * 52));

      await (program.methods as any).onCommunityCards(indices, values)
        .accounts({
          table: tablePda,
          arciumMxe: ARCIUM_MXE_PUBKEY,
        })
        .rpc();
      console.log('[GameTable] Debug Reveal sent');
      refetch();
    } catch (err) {
      console.error('[GameTable] Reveal failed:', err);
      alert(parseTxError(err));
    } finally {
      setIsActing(false);
    }
  }, [publicKey, tableId, table, program, refetch]);

  const handleForceComplete = useCallback(async () => {
    if (!publicKey || !tableId || !table) return;
    setIsActing(true);
    try {
      const tablePda = deriveTablePDA(tableId);
      const [resultPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('result'),
          tablePda.toBuffer(),
          table.handNumber.toArrayLike(Buffer, 'le', 8)
        ],
        POKER_PROGRAM_ID
      );

      // Dummy results for debug: Player 0 wins the pot
      const winners = new Uint8Array(6).fill(0);
      winners[0] = 0;
      const payouts = new Array(6).fill(new anchor.BN(0));
      payouts[0] = table.pot;

      // Ensure we pass some cards for the board if they are 255
      const finalBoard = [...communityCards].map(c => (c === 255 ? Math.floor(Math.random() * 52) : c));

      await (program.methods as any).onShowdownResult(
        Array.from(winners),
        1,          // winner_count
        payouts,
        0,          // winning_hand_category (u8) — required positional arg
        finalBoard, // final_community_cards
        new Array(256).fill(0), // Dummy proof
        new Array(32).fill(0)   // Dummy proof hash
      )
        .accounts({
          table: tablePda,
          gameResult: resultPda,
          arciumMxe: ARCIUM_MXE_PUBKEY,
          creator: publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .remainingAccounts(players.map(p => ({
          pubkey: p.publicKey,
          isSigner: false,
          isWritable: true,
        })))
        .rpc();

      console.log('[GameTable] Debug manual complete sent');
      refetch();
    } catch (err) {
      console.error('[GameTable] Manual complete failed:', err);
      alert(parseTxError(err));
    } finally {
      setIsActing(false);
    }
  }, [publicKey, tableId, table, program, refetch, players]);

  const handleTriggerShowdown = useCallback(async () => {
    if (!publicKey || !tableId) return;
    setIsActing(true);
    try {
      const tablePda = deriveTablePDA(tableId);
      await (program.methods as any).triggerShowdown()
        .accounts({
          table: tablePda,
          creator: publicKey,
        })
        .remainingAccounts(players.map(p => ({
          pubkey: p.publicKey,
          isSigner: false,
          isWritable: true,
        })))
        .rpc();
      console.log('[GameTable] Showdown triggered — Arcium computing winner...');
      refetch();
    } catch (err) {
      console.error('[GameTable] Trigger showdown failed:', err);
      alert(parseTxError(err));
    } finally {
      setIsActing(false);
    }
  }, [publicKey, tableId, program, refetch, players]);

  const handleAdvancePhase = useCallback(async () => {
    if (phase === 'River') {
      await handleTriggerShowdown();
    } else {
      await handleDealCommunityCards();
    }
  }, [phase, handleTriggerShowdown, handleDealCommunityCards]);


  // Log automated table actions
  useEffect(() => {
    if (!table) return;

    const phase = parseGamePhase(table.phase);
    if (phase !== prevPhaseRef.current) {
      prevPhaseRef.current = phase;
    }

    if (table.currentTurn !== prevTurnRef.current) {
      prevTurnRef.current = table.currentTurn;
    }
  }, [table?.phase, table?.currentTurn, players]);


  // Auto-navigation to results when game over
  useEffect(() => {
    if (table && parseGamePhase(table.phase) === 'Complete') {
      const hNum = table.handNumber.toString();
      console.log(`[GameTable] Hand completed, navigating to result for #${hNum}`);
      navigate(`/table/${tableId}/result/${hNum}`);
    }
  }, [table, tableId, navigate]);

  // ===== AUTO-WIN: last player standing (everyone else folded) =====
  // The on-chain program still needs deal_community_cards + trigger_showdown even
  // when only 1 active player is left. We fast-forward through all remaining streets,
  // calling the oracle callbacks at each step so community cards appear on screen.
  const autoWinRef = useRef('');
  useEffect(() => {
    if (!table || !publicKey || !tableId) return;
    const currentPhase = parseGamePhase(table.phase);
    if (!['PreFlop', 'Flop', 'Turn', 'River'].includes(currentPhase)) return;
    if (autoWinRef.current === currentPhase) return;

    // Fast-forward to showdown if everyone but one player has folded.
    const activePlayersDuringHand = players.filter(p => p.isActive);
    const isOnlyOneLeft = activePlayersDuringHand.length === 1 && players.length > 1;

    // Only the creator triggers the auto-win sequence on-chain
    const isCreator = publicKey.toBase58() === table.creator.toBase58();
    if (!isOnlyOneLeft || !isCreator) return;

    autoWinRef.current = currentPhase;
    console.log('[GameTable:AutoWin] Only 1 player left — fast-forwarding to showdown');

    const run = async () => {
      try {
        const tablePda = deriveTablePDA(tableId);
        const playerAccs = players.map(p => ({ pubkey: p.publicKey, isSigner: false, isWritable: true }));
        const handNum = table.handNumber;
        const deck = buildDeck(tableId || '', handNum.toNumber());

        // Advance through remaining streets, revealing cards at each step
        const orderedPhases: string[] = [];
        if (currentPhase === 'PreFlop') orderedPhases.push('PreFlop', 'Flop', 'Turn');
        else if (currentPhase === 'Flop') orderedPhases.push('Flop', 'Turn');
        else if (currentPhase === 'Turn') orderedPhases.push('Turn');
        // River → go straight to showdown

        for (const fromPhase of orderedPhases) {
          await (program.methods as any).dealCommunityCards()
            .accounts({ table: tablePda, creator: publicKey })
            .remainingAccounts(playerAccs)
            .rpc();
          await oracleRevealCommunityCards(fromPhase, tablePda, handNum);
          await new Promise(r => setTimeout(r, 600));
        }

        await (program.methods as any).triggerShowdown()
          .accounts({ table: tablePda, creator: publicKey })
          .remainingAccounts(playerAccs)
          .rpc();
        await new Promise(r => setTimeout(r, 800));

        // Settle — sole active player wins the pot
        // Pass the same deck we used to reveal cards to ensure perfect sync
        await oracleSettleShowdown(tablePda, handNum, communityCards, deck);
        refetch();
      } catch (err: any) {
        console.error('[GameTable:AutoWin] Failed:', err);
        autoWinRef.current = ''; // allow retry
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players.map(p => `${p.isActive}-${p.isAllIn}`).join(','), table?.phase]);

  // ===== AUTO-ADVANCE =====
  // Mirrors the on-chain is_betting_complete() condition EXACTLY:
  //   - turn=255 means everyone is all-in (no one can act)
  //   - playersActed >= playersToAct means normal betting is finished
  //   - activeNonAllIn <= 1 means only 0 or 1 player can still act
  //
  // When the condition is met, calls deal_community_cards (Flop/Turn/River)
  // or trigger_showdown (River done). Then calls oracle callbacks as a
  // FALLBACK — if Arcium fires its own callbacks first, the try-catch
  // swallows the duplicate-account error and Arcium's values win.
  const autoAdvancingRef = useRef<string>('');
  useEffect(() => {
    if (!table || !publicKey || !tableId) return;
    const currentPhase = parseGamePhase(table.phase);
    if (!['PreFlop', 'Flop', 'Turn', 'River'].includes(currentPhase)) return;
    if (autoAdvancingRef.current === currentPhase) return;

    // Mirror the on-chain is_betting_complete logic
    const activeNonAllIn = players.filter(p => p.isActive && !p.isAllIn).length;
    const allInOnly = activeNonAllIn <= 1;
    const normalBettingDone =
      table.currentTurn === 255 ||
      (table.playersToAct > 0 && table.playersActed >= table.playersToAct);
    const bettingDone = allInOnly || normalBettingDone;

    // Only the creator triggers the next street advance on-chain
    const isCreator = publicKey.toBase58() === table.creator.toBase58();
    if (!bettingDone || !isCreator) return;

    autoAdvancingRef.current = currentPhase;
    console.log(`[GameTable:AutoAdvance] Street ${currentPhase} done — advancing (allInOnly=${allInOnly}, acted=${table.playersActed}/${table.playersToAct})`);

    const run = async () => {
      try {
        const tablePda = deriveTablePDA(tableId);
        const playerAccs = players.map(p => ({ pubkey: p.publicKey, isSigner: false, isWritable: true }));
        const handNum = table.handNumber;

        if (currentPhase === 'River') {
          await (program.methods as any).triggerShowdown()
            .accounts({ table: tablePda, creator: publicKey })
            .remainingAccounts(playerAccs)
            .rpc();

          // Fallback oracle: if Arcium doesn't settle within 3 s, do it ourselves.
          // If Arcium already fired, the duplicate init error is caught and ignored.
          await new Promise(r => setTimeout(r, 3000));
          try {
            await oracleSettleShowdown(tablePda, handNum, communityCards);
          } catch (e: any) {
            console.log('[Oracle] Showdown already settled by Arcium (or error):', e.message);
          }
        } else {
          await (program.methods as any).dealCommunityCards()
            .accounts({ table: tablePda, creator: publicKey })
            .remainingAccounts(playerAccs)
            .rpc();

          // Fallback oracle: feed community cards if Arcium hasn't yet.
          await new Promise(r => setTimeout(r, 2000));
          try {
            await oracleRevealCommunityCards(currentPhase, tablePda, handNum);
          } catch (e: any) {
            console.log('[Oracle] Community cards already revealed by Arcium (or error):', e.message);
          }
        }

        refetch();
      } catch (err: any) {
        console.error('[GameTable:AutoAdvance] Failed:', err);
        autoAdvancingRef.current = ''; // allow retry
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table?.currentTurn, table?.phase, table?.playersActed, table?.playersToAct]);





  if (!table && !isLoading) {
    return (
      <Layout arciumStatus="error">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.4 }}>⚠️</div>
            <div style={{ color: 'rgba(255,255,255,0.4)' }}>Table not found</div>
            <button className="btn btn-ghost mt-4" onClick={() => navigate('/')}>Back to Lobby</button>
          </div>
        </div>
      </Layout>
    );
  }
  if (isLoading) {
    return (
      <Layout arciumStatus="connecting">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.4 }}>🂠</div>
            <div style={{ color: 'rgba(255,255,255,0.4)' }}>Loading table…</div>
          </div>
        </div>
      </Layout>
    );
  }

  const isMobile = windowWidth <= 768;

  // Mobile-optimized seat positions (portrait oval)
  const MOBILE_SEAT_POSITIONS = [
    { bottom: '6rem', left: '50%', transform: 'translateX(-50%)' },     // 0 hero bottom
    { bottom: '20%', right: '0.5rem' },                                   // 1 bottom-right
    { top: '30%', right: '0.5rem', transform: 'translateY(-50%)' },     // 2 mid-right
    { top: '10%', right: '3rem' },                                        // 3 top-right
    { top: '6%', left: '50%', transform: 'translateX(-50%)' },          // 4 top-center
    { bottom: '20%', left: '0.5rem' },                                    // 5 bottom-left
  ];

  const tableName = table ? (bytesToString(table.name) || `Table #${tableId?.slice(-6) ?? ''}`) : `Table ${tableId?.slice(-6) ?? ''}`;

  if (isMobile) {
    return (
      <div style={{
        width: '100vw', height: '100vh', overflow: 'hidden',
        background: 'linear-gradient(180deg, #0a1628 0%, #0a0c0f 100%)',
        display: 'flex', flexDirection: 'column', position: 'relative',
      }}>
        {/* Mobile mini top bar */}
        <div style={{
          height: 48, display: 'flex', alignItems: 'center',
          padding: '0 0.75rem', gap: '0.5rem', zIndex: 200,
          background: 'rgba(10,12,15,0.7)', backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'transparent', border: 'none',
              color: 'rgba(255,255,255,0.6)', fontSize: '1rem', cursor: 'pointer', padding: '0 0.25rem',
            }}
          >←</button>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--gold)', flex: 1 }}>
            {tableName}
          </span>
          <span className="badge badge-gold" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
            {table ? table.smallBlind.toNumber() : 25}/{table ? table.bigBlind.toNumber() : 50}
          </span>
          <span className={`badge ${phase === 'Waiting' ? 'badge-green' : 'badge-arcium'}`} style={{ fontSize: '0.65rem' }}>
            {phaseLabel(phase)}
          </span>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: connectionMode === 'ws' ? 'var(--arcium)' : 'var(--amber)',
          }} />
        </div>

        {/* Portrait poker table — fills all available space */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {/* Outer rail */}
          <div style={{
            position: 'absolute',
            top: '3%', left: '4%', right: '4%', bottom: '2%',
            background: '#2d1a0a',
            borderRadius: '50%',
            boxShadow: 'inset 0 0 60px rgba(0,0,0,0.8), 0 20px 60px rgba(0,0,0,0.7)',
            border: '6px solid #4a2c12',
          }} />
          {/* Felt inner */}
          <div style={{
            position: 'absolute',
            top: 'calc(3% + 14px)', left: 'calc(4% + 14px)',
            right: 'calc(4% + 14px)', bottom: 'calc(2% + 14px)',
            background: 'radial-gradient(ellipse at center, #0f4535 0%, #0a2e21 70%)',
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.04)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: '0.5rem',
          }}>
            {/* Logo watermark */}
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: '0.75rem',
              color: 'rgba(255,255,255,0.06)', letterSpacing: '0.15em', userSelect: 'none',
            }}>ENcryptedPoker</div>

            {/* Community cards */}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              {(() => {
                const hNum = table?.handNumber?.toNumber() || 0;
                const STANDIN = getStandinCards(tableId, hNum);
                const cards: number[] = communityCards || [255, 255, 255, 255, 255];
                return cards.map((v: number, i: number) => {
                  const flopped = isCardRevealed(i, phase);
                  const displayVal = flopped ? (v === 255 ? STANDIN[i] : v) : 255;
                  return <PlayingCard key={i} value={displayVal} size="sm" animate={flopped} />;
                });
              })()}
            </div>

            {/* Pot */}
            {table && table.pot.toNumber() > 0 && (
              <div style={{
                background: 'rgba(10,12,15,0.5)', padding: '4px 16px', borderRadius: 100,
                border: '1px solid var(--border-bright)', backdropFilter: 'blur(8px)',
                color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '0.875rem',
                display: 'flex', alignItems: 'center', gap: '0.4rem',
              }}>
                <span style={{ opacity: 0.5, fontSize: '0.7rem' }}>POT</span>
                <span style={{ fontWeight: 700 }}>{formatChips(table.pot)}</span>
              </div>
            )}
          </div>

          {/* Players positioned around the oval */}
          {Array.from({ length: 6 }).map((_, i) => {
            const p = players.find(pl => pl.seatIndex === i) ?? null;
            const isMeLocal = p?.wallet.toBase58() === publicKey?.toBase58();
            const pos = MOBILE_SEAT_POSITIONS[i];
            if (!p) {
              return (
                <button
                  key={i}
                  onClick={() => handleJoin(i)}
                  style={{
                    position: 'absolute', ...pos as any,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px dashed rgba(255,255,255,0.15)',
                    borderRadius: 8, padding: '0.3rem 0.5rem',
                    color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem',
                    cursor: 'pointer', zIndex: 10,
                  }}
                >
                  + Seat {i + 1}
                </button>
              );
            }
            const isThisTurn = p?.playerId === table?.currentTurn;
            return (
              <PlayerSeat
                player={p}
                seatIndex={i}
                isMyTurn={p?.playerId === table?.currentTurn}
                isMe={isMeLocal}
                myCards={isMeLocal ? myCards : undefined}
                lastActionTs={table ? table.lastActionTs : 0}
                gamePhase={phase}
                onJoin={handleJoin}
                table={table}
                communityCards={communityCards}
                pos={MOBILE_SEAT_POSITIONS[i]}
                tableId={tableId ?? ''}
              />
            );
          })}

          {/* Waiting overlay */}
          {phase === 'Waiting' && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 100,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <div style={{
                background: 'var(--surface-2)', padding: '1.5rem 2rem', borderRadius: 16,
                border: '1px solid var(--border-bright)', textAlign: 'center',
                pointerEvents: 'auto',
              }}>
                <div style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', marginBottom: '0.5rem', fontSize: '1.1rem' }}>Waiting Room</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>{table?.currentPlayers ?? 0}/{table?.maxPlayers ?? 6} players</div>
                {publicKey && table?.creator.equals(publicKey) && (table?.currentPlayers ?? 0) >= (table?.minPlayers ?? 2) && (
                  <button className="btn btn-gold" style={{ marginTop: '1rem', width: '100%' }} onClick={handleStart} disabled={isActing}>
                    Start Game
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Dealing overlay */}
          {isDealing && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 150,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(10,12,15,0.5)', backdropFilter: 'blur(4px)',
              pointerEvents: 'none',
            }}>
              <div className="badge badge-arcium" style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', gap: '0.75rem', pointerEvents: 'auto' }}>
                <div className="spinner-sm" /> Dealing...
              </div>
            </div>
          )}
        </div>

        {/* Mobile action bar — pinned to bottom */}
        <div style={{
          flexShrink: 0, zIndex: 200,
          background: 'rgba(10,12,15,0.95)', borderTop: '1px solid var(--border-bright)',
          backdropFilter: 'blur(16px)',
        }}>
          {isMyTurn && myPlayer && table ? (() => {
            const activePlayers = players.filter(p => p.isActive);
            const bbIndex = (table.dealerSeat + 2) % (activePlayers.length || 1);
            const bbPlayer = activePlayers.find(p => p.seatIndex === bbIndex);
            const isBigBlindPreflop = phase === 'PreFlop' && bbPlayer?.wallet.toBase58() === publicKey?.toBase58();
            return (
              <div style={{ padding: '0.625rem' }}>
                {/* Hero hole cards in action bar for better visibility */}
                <div style={{
                  display: 'flex', justifyContent: 'center', gap: '0.625rem', marginBottom: '0.625rem'
                }}>
                  <PlayingCard value={myCards?.[0] ?? 255} size="md" animate />
                  <PlayingCard value={myCards?.[1] ?? 255} size="md" animate />
                </div>
                <BetControls table={table} myPlayer={myPlayer} onAction={handleAction} isLoading={isActing} isBigBlindPreflop={isBigBlindPreflop} />
              </div>
            );
          })() : (
            <div style={{
              padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)' }}>
                Hand #{table ? table.handNumber.toNumber() : 0}
              </span>
              {myPlayer && (
                <span style={{ fontSize: '0.875rem', fontFamily: 'var(--font-mono)', color: 'var(--gold)', fontWeight: 700 }}>
                  {formatChips(myPlayer.chipCount)}
                </span>
              )}
              <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>
                {isMyTurn ? '⚡ YOUR TURN' : phase === 'Waiting' ? 'Waiting...' : 'Watching...'}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== DESKTOP LAYOUT =====
  return (
    <Layout arciumStatus="active">
      {/* Top bar */}
      <div style={{
        height: 56, display: 'flex', alignItems: 'center',
        padding: '0 1.5rem', gap: '1rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-2)',
        zIndex: 100, position: 'relative',
      }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← Lobby</button>
          <button className="btn btn-ghost btn-sm" onClick={refetch} title="Force Refresh RPC State">↻</button>
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--gold)' }}>
          {tableName}
        </div>
        <div style={{ display: 'flex', gap: '0.625rem' }}>
          <span className="badge badge-gold" style={{ fontFamily: 'var(--font-mono)' }}>
            {table ? table.smallBlind.toNumber() : 25}/{table ? table.bigBlind.toNumber() : 50}
          </span>
          <span className={`badge ${phase === 'Waiting' ? 'badge-green' : 'badge-arcium'}`}>
            {phaseLabel(phase)}
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
            Hand #{table ? table.handNumber.toNumber() : 0}
          </span>
          <div className="badge" style={{
            background: 'transparent', border: '1px solid var(--border)',
            color: connectionMode === 'ws' ? 'var(--arcium)' : 'var(--amber)',
            fontFamily: 'var(--font-mono)', fontSize: '0.6875rem',
          }}>
            {connectionMode === 'ws' ? '⚡ LIVE' : '↻ POLLING'}
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex', height: 'calc(100vh - 56px)', gap: '1rem', padding: '1rem',
        maxWidth: 1600, margin: '0 auto', overflow: 'hidden'
      }}>
        {/* Left: Main Game Area */}
        <div style={{
          flex: 1, position: 'relative', background: 'rgba(0,0,0,0.2)', borderRadius: 20,
          border: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
        }}>
          {(() => {
            const tableBaseWidth = 900;
            const tableScale = Math.min(1.1, (windowWidth - 400) / tableBaseWidth);
            return (
              <div style={{
                position: 'relative', width: tableBaseWidth * tableScale,
                aspectRatio: '16/9', transform: `scale(${tableScale})`,
                transformOrigin: 'center center',
              }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'var(--felt-rail)', borderRadius: 200,
                  boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8), 0 20px 60px rgba(0,0,0,0.5)',
                  border: '8px solid #3c2415',
                }} />
                <div style={{
                  position: 'absolute', inset: '1.5rem',
                  background: 'var(--felt)', borderRadius: 180,
                  border: '2px solid rgba(255,255,255,0.05)',
                  overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {/* Community Cards */}
                  <div style={{ position: 'relative', zIndex: 10, display: 'flex', gap: '0.5rem' }}>
                    {(() => {
                      const hNum = table?.handNumber?.toNumber() || 0;
                      const STANDIN = getStandinCards(tableId, hNum);
                      return [0, 1, 2, 3, 4].map((i) => {
                        const val = communityCards[i] ?? 255;
                        const shouldReveal = isCardRevealed(i, phase);
                        const displayVal = shouldReveal ? (val === 255 ? STANDIN[i] : val) : 255;
                        return (
                          <PlayingCard
                            key={i}
                            value={displayVal}
                            size="lg"
                            animate={shouldReveal}
                          />
                        );
                      });
                    })()}
                  </div>

                  {/* Total Pot */}
                  {table && table.pot.toNumber() > 0 && (
                    <div style={{
                      position: 'absolute', bottom: '28%', left: '50%', transform: 'translateX(-50%)',
                      background: 'rgba(10,12,15,0.6)', padding: '6px 20px', borderRadius: 100,
                      border: '1px solid var(--border-bright)', backdropFilter: 'blur(10px)',
                      color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '1.1rem',
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                    }}>
                      <span style={{ opacity: 0.5, fontSize: '0.8rem' }}>POT</span>
                      <span style={{ fontWeight: 700 }}>{formatChips(table.pot)}</span>
                    </div>
                  )}

                  {/* Players */}
                  {Array.from({ length: 6 }).map((_, i) => {
                    const p = players.find(pl => pl.seatIndex === i) ?? null;
                    const isMeLocal = p?.wallet.toBase58() === publicKey?.toBase58();
                    return (
                      <PlayerSeat
                        key={i}
                        player={p}
                        seatIndex={i}
                        isMyTurn={p?.playerId === table?.currentTurn}
                        isMe={isMeLocal}
                        myCards={isMeLocal ? myCards : undefined}
                        lastActionTs={table ? table.lastActionTs : 0}
                        gamePhase={phase}
                        onJoin={handleJoin}
                        table={table}
                        communityCards={communityCards}
                        pos={SEAT_POSITIONS[i]}
                        tableId={tableId ?? ''}
                      />
                    );
                  })}
                </div>

                {/* Overlays */}
                {phase === 'Waiting' && (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.4)', borderRadius: 200, backdropFilter: 'blur(4px)',
                    pointerEvents: 'none',
                  }}>
                    <div style={{
                      background: 'var(--surface-2)', padding: '2rem 3.5rem', borderRadius: 24,
                      border: '1px solid var(--border-bright)', boxShadow: 'var(--shadow-xl)', textAlign: 'center',
                      pointerEvents: 'auto',
                    }}>
                      <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', marginBottom: '0.5rem' }}>Waiting Room</h3>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.875rem' }}>{table?.currentPlayers ?? 0}/{table?.maxPlayers ?? 6} joined</p>
                      {publicKey && table?.creator.equals(publicKey) && (table?.currentPlayers ?? 0) >= (table?.minPlayers ?? 2) && (
                        <button className="btn btn-gold btn-lg mt-4" onClick={handleStart} disabled={isActing}>Start Game</button>
                      )}
                    </div>
                  </div>
                )}

                {isDealing && (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(10,12,15,0.7)', borderRadius: 200, backdropFilter: 'blur(8px)',
                    pointerEvents: 'none',
                  }}>
                    <div className="badge badge-arcium" style={{ padding: '0.875rem 1.75rem', fontSize: '1.2rem', gap: '1rem', pointerEvents: 'auto' }}>
                      <div className="spinner-sm" /> Arcium is Dealing...
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Action Overlay Bottom */}
          {isMyTurn && myPlayer && table && (() => {
            // Determine if this player is the Big Blind on PreFlop so they can Check
            const activePlayers = players.filter(p => p.isActive);
            const bbIndex = (table.dealerSeat + 2) % (activePlayers.length || 1);
            const bbPlayer = activePlayers.find(p => p.seatIndex === bbIndex);
            const isBigBlindPreflop = phase === 'PreFlop' && bbPlayer?.wallet.toBase58() === publicKey?.toBase58();
            return (
              <div style={{
                position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
                width: '100%', maxWidth: 560, zIndex: 200,
              }}>
                <BetControls table={table} myPlayer={myPlayer} onAction={handleAction} isLoading={isActing} isBigBlindPreflop={isBigBlindPreflop} />
              </div>
            );
          })()}
        </div>

        {/* Right: Sidebar */}
        <div style={{ width: 340, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {myPlayer && (
            <div style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em' }}>Your Stack</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{formatChips(myPlayer.chipCount)}</span>
              </div>
              <div className={`badge ${isMyTurn ? 'badge-arcium' : 'badge-ghost'}`}>
                {isMyTurn ? 'YOUR TURN' : 'WAITING'}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};
