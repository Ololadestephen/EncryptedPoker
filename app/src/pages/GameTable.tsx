import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Layout } from '../components/layout/Layout';
import { PlayingCard } from '../components/ui/PlayingCard';
import { useTableRealtime, useTurnTimer, deriveTablePDA } from '../hooks/useTableRealtime';
import { PlayerData, formatChips, shortenWallet, phaseLabel, HAND_NAMES, parseGamePhase, bytesToString } from '../types';
import * as anchor from '@coral-xyz/anchor';
import { POKER_PROGRAM_ID, ARCIUM_MXE_PUBKEY, SOLANA_NETWORK } from '../lib/constants';
import idl from '../idl/encrypted_poker.json';
import { PublicKey } from '@solana/web3.js';
import { parseTxError } from '../lib/parseTxError';

// ===== Player Seat =====
const SEAT_POSITIONS = [
  { bottom: '2rem', left: '50%', transform: 'translateX(-50%)' },   // 0 hero bottom
  { bottom: '4rem', right: '6rem' },                                  // 1 bottom-right
  { top: '50%', right: '1.5rem', transform: 'translateY(-50%)' },   // 2 mid-right
  { top: '4rem', right: '6rem' },                                     // 3 top-right
  { top: '2rem', left: '50%', transform: 'translateX(-50%)' },      // 4 top-center
  { bottom: '4rem', left: '6rem' },                                   // 5 bottom-left
];

const EMOJI_MAP: Record<number, string> = {
  1: '🔥',
  2: '💩',
  3: '🤡',
  4: '👑',
  5: '💸',
};

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  type: string;
  timestamp: number;
}

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
}

const PlayerSeat: React.FC<SeatProps & { table: any }> = ({
  player, seatIndex, isMyTurn, isMe, myCards, lastActionTs, gamePhase, onJoin, onReact, table,
}) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeEmoji, setActiveEmoji] = useState<{ type: number; id: number } | null>(null);
  const [activeMessage, setActiveMessage] = useState<{ text: string; id: number } | null>(null);

  // Trigger local animation when last_reaction changes
  useEffect(() => {
    if (player?.lastReaction && player.lastReaction > 0) {
      setActiveEmoji({ type: player.lastReaction, id: Date.now() });
      const timer = setTimeout(() => setActiveEmoji(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [player?.lastReaction, player?.lastReactionTs?.toString()]);

  // Trigger local bubble when last_message changes
  useEffect(() => {
    if (player?.lastMessage) {
      const msg = bytesToString(player.lastMessage);
      if (msg && msg.trim().length > 0) {
        setActiveMessage({ text: msg, id: Date.now() });
        const timer = setTimeout(() => setActiveMessage(null), 4000);
        return () => clearTimeout(timer);
      }
    }
  }, [player?.lastMessage?.toString(), player?.lastMessageTs?.toString()]);

  const pos = SEAT_POSITIONS[seatIndex];
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
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {isMe && myCards?.length === 2 ? (
            <>
              <PlayingCard value={myCards[0]} size="sm" />
              <PlayingCard value={myCards[1]} size="sm" />
            </>
          ) : (
            <>
              <PlayingCard value={255} size="sm" />
              <PlayingCard value={255} size="sm" />
            </>
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

        {/* Reaction trigger for ME */}
        {isMe && (
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            style={{
              position: 'absolute', top: -12, right: -12,
              width: 24, height: 24, borderRadius: '50%',
              background: 'var(--surface-2)', border: '1px solid var(--border-bright)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.9rem', cursor: 'pointer', zIndex: 20,
            }}>
            💬
          </button>
        )}

        {/* Emoji Picker Popover */}
        {showEmojiPicker && (
          <div style={{
            position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--ink-2)', border: '1px solid var(--border-bright)',
            borderRadius: 12, padding: '0.5rem', display: 'flex', gap: '0.5rem',
            boxShadow: 'var(--shadow-lg)', zIndex: 100, backdropFilter: 'blur(12px)',
          }}>
            {[1, 2, 3, 4, 5].map(type => (
              <button
                key={type}
                onClick={() => { onReact?.(type); setShowEmojiPicker(false); }}
                style={{
                  fontSize: '1.25rem', background: 'transparent', border: 'none',
                  cursor: 'pointer', transition: 'transform 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.3)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                {EMOJI_MAP[type]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Floating Emoji Animation */}
      {activeEmoji && (
        <div key={activeEmoji.id} className="emoji-reaction">
          {EMOJI_MAP[activeEmoji.type]}
        </div>
      )}

      {/* Chat Bubble Overlay */}
      {activeMessage && (
        <div style={{
          position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(255,255,255,0.95)', color: '#000', padding: '6px 12px', borderRadius: 14,
          fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)', pointerEvents: 'none',
          animation: 'emoji-pop 0.3s var(--ease-out)', zIndex: 50,
        }}>
          {activeMessage.text}
          <div style={{
            position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
            borderTop: '6px solid rgba(255,255,255,0.95)',
          }} />
        </div>
      )}

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
}> = ({ table, myPlayer, onAction, isLoading }) => {
  const [showRaise, setShowRaise] = useState(false);
  const tableBigBlind = table.bigBlind.toNumber ? table.bigBlind.toNumber() : table.bigBlind;
  const tableCurrentBet = table.currentBet.toNumber ? table.currentBet.toNumber() : table.currentBet;
  const tablePot = table.pot.toNumber ? table.pot.toNumber() : table.pot;

  const [raiseAmt, setRaiseAmt] = useState(tableBigBlind * 2);
  const callAmt = Math.min(tableCurrentBet - myPlayer.currentBet.toNumber(), myPlayer.chipCount.toNumber());
  const canCheck = callAmt <= 0;
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
// ===== Chat Window =====
const ChatWindow: React.FC<{
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isMeSeated: boolean;
}> = ({ messages, onSendMessage, isMeSeated }) => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !isMeSeated) return;
    onSendMessage(input);
    setInput('');
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'rgba(10,12,15,0.4)', borderRadius: 12, border: '1px solid var(--border)',
      overflow: 'hidden', backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)',
        fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
        color: 'var(--arcium-glow)', display: 'flex', justifyContent: 'space-between',
      }}>
        <span>Table Log</span>
        <span style={{ opacity: 0.5 }}>Live</span>
      </div>

      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.625rem',
      }}>
        {messages.map(m => (
          <div key={m.id} style={{
            fontSize: '0.8125rem', lineBreak: 'anywhere',
            color: m.type === 'system' ? 'var(--gold-2)' : 'rgba(255,255,255,0.8)',
            fontStyle: m.type === 'system' ? 'italic' : 'normal',
          }}>
            {m.type === 'chat' && (
              <span style={{ fontWeight: 700, color: 'var(--arcium)' }}>{m.sender}: </span>
            )}
            {m.text}
          </div>
        ))}
        {messages.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', textAlign: 'center', marginTop: '2rem' }}>
            No messages yet.
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ padding: '0.75rem', borderTop: '1px solid var(--border)' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={isMeSeated ? "Say something..." : "Spectating..."}
          disabled={!isMeSeated}
          maxLength={64}
          style={{
            width: '100%', background: 'var(--ink-3)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '0.625rem 0.875rem', color: '#fff', fontSize: '0.875rem',
            outline: 'none', transition: 'border-color 0.2s',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'var(--arcium)'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
        />
      </form>
    </div>
  );
};

export const GameTablePage: React.FC = () => {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey } = wallet;
  const { table, players, myHand, isLoading, connectionMode, refetch } = useTableRealtime(tableId ?? null);
  const { width: windowWidth } = useWindowSize();
  const [isActing, setIsActing] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const prevPhaseRef = useRef<string>('');
  const prevTurnRef = useRef<number | null>(null);

  // Decrypt hole cards from the Arcium-encrypted byte arrays.
  const myCards = useMemo(() => {
    if (!myHand) return undefined;
    const decode = (bytes: any): number => {
      if (!bytes) return 255;
      const arr = Array.from(bytes as any);
      const b = (arr as number[]).slice(0, 4);
      const u32 = ((b[0] ?? 0) | ((b[1] ?? 0) << 8) | ((b[2] ?? 0) << 16) | ((b[3] ?? 0) << 24)) >>> 0;
      return Math.abs(u32) % 52;
    };
    // Support both snake_case (raw) and camelCase (mapped)
    const card1_raw = myHand.encryptedCard1 || myHand.encrypted_card1;
    const card2_raw = myHand.encryptedCard2 || myHand.encrypted_card2;
    const card1 = decode(card1_raw);
    const card2 = decode(card2_raw);
    return [card1, card2 === card1 ? (card2 + 1) % 52 : card2];
  }, [myHand]);

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
  const isDealing = phase === 'PreFlop' && !myHand && players.some(p => p.wallet.toBase58() === publicKey?.toBase58());

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
    if (!publicKey || !table || !myPlayer || !tableId) return;
    setIsActing(true);
    try {
      const tablePda = deriveTablePDA(tableId);
      const typeMap: Record<string, number> = { fold: 0, check: 1, call: 2, raise: 3, allin: 4 };
      const actionType = typeMap[type] ?? 1;

      const [actionPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('action'),
          tablePda.toBuffer(),
          table.handNumber.toArrayLike(Buffer, 'le', 8),
          Buffer.from([myPlayer.playerId]),
          Buffer.from([myPlayer.actionCount])
        ],
        POKER_PROGRAM_ID
      );

      await (program.methods as any).submitAction(actionType, new anchor.BN(amount ?? 0))
        .accounts({
          table: tablePda,
          player: myPlayer.publicKey,
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
  }, [publicKey, table, myPlayer, tableId, program, refetch]);

  const handleDealCommunityCards = useCallback(async () => {
    if (!publicKey || !tableId) return;
    setIsActing(true);
    try {
      const tablePda = deriveTablePDA(tableId);
      await (program.methods as any).dealCommunityCards()
        .accounts({
          table: tablePda,
          payer: publicKey,
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

      await (program.methods as any).onShowdownResult(
        Array.from(winners),
        1, // winner_count
        payouts,
        0, // High Card
        new Array(256).fill(0), // Dummy proof
        new Array(32).fill(0)   // Dummy proof hash
      )
        .accounts({
          table: tablePda,
          gameResult: resultPda,
          arciumMxe: ARCIUM_MXE_PUBKEY,
          payer: publicKey,
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
          payer: publicKey,
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
  }, [publicKey, tableId, program, refetch]);

  const handleReact = useCallback(async (reactionType: number) => {
    if (!publicKey || !myPlayer) return;
    try {
      // Non-blocking call for UX
      (program.methods as any).submitReaction(reactionType)
        .accounts({
          player: myPlayer.publicKey,
          wallet: publicKey,
        })
        .rpc();

      // OPTIONAL: Optimistic update can happen here if needed
      // But let's trust the WebSocket to push the state back fast
    } catch (err) {
      console.error('[GameTable] Reaction failed:', err);
    }
  }, [publicKey, myPlayer, program]);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!publicKey || !myPlayer) return;
    try {
      (program.methods as any).sendMessage(text)
        .accounts({
          player: myPlayer.publicKey,
          wallet: publicKey,
        })
        .rpc();
    } catch (err) {
      console.error('[GameTable] Chat failed:', err);
    }
  }, [publicKey, myPlayer, program]);

  // Log automated table actions
  useEffect(() => {
    if (!table) return;

    const phase = parseGamePhase(table.phase);
    if (phase !== prevPhaseRef.current) {
      if (phase !== 'Waiting') {
        const entry: ChatMessage = {
          id: `sys-${Date.now()}`,
          type: 'system',
          sender: 'Dealer',
          text: `Street: ${phase}`,
          timestamp: Date.now(),
        };
        setChatMessages(prev => [...prev.slice(-49), entry]);
      }
      prevPhaseRef.current = phase;
    }

    if (table.currentTurn !== prevTurnRef.current) {
      const activePlayer = players.find(p => p.playerId === table.currentTurn);
      if (activePlayer && phase !== 'Waiting' && phase !== 'Complete') {
        const entry: ChatMessage = {
          id: `sys-turn-${Date.now()}`,
          type: 'system',
          sender: 'Dealer',
          text: `Action to ${shortenWallet(activePlayer.wallet, 4)}`,
          timestamp: Date.now(),
        };
        setChatMessages(prev => [...prev.slice(-49), entry]);
      }
      prevTurnRef.current = table.currentTurn;
    }
  }, [table?.phase, table?.currentTurn, players]);

  // Sync incoming on-chain messages to chat log
  useEffect(() => {
    players.forEach(p => {
      const msg = bytesToString(p.lastMessage);
      if (msg && msg.trim().length > 0) {
        const timestamp = p.lastMessageTs.toNumber ? p.lastMessageTs.toNumber() * 1000 : 0;
        // Only add if not already in log (using timestamp + text as heuristic)
        setChatMessages(prev => {
          const exists = prev.some(m => m.timestamp === timestamp && m.text === msg);
          if (exists) return prev;

          return [...prev.slice(-49), {
            id: `msg-${p.wallet.toBase58()}-${timestamp}`,
            type: 'chat' as const,
            sender: shortenWallet(p.wallet, 4),
            text: msg,
            timestamp,
          }].sort((a, b) => a.timestamp - b.timestamp);
        });
      }
    });
  }, [players]);

  // Auto-navigation to results when game over
  useEffect(() => {
    if (table && parseGamePhase(table.phase) === 'Complete') {
      const hNum = table.handNumber.toString();
      console.log(`[GameTable] Hand completed, navigating to result for #${hNum}`);
      navigate(`/table/${tableId}/result/${hNum}`);
    }
  }, [table, tableId, navigate]);

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
              {communityCards.map((val: any, i: number) => {
                const flopped = (i < 3 && phase !== 'PreFlop') || (i < 4 && phase === 'Turn') || (i < 5 && (phase === 'River' || phase === 'Complete' || phase === 'Showdown'));
                return <PlayingCard key={i} value={flopped ? val : -1} size="sm" />;
              })}
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
              <div key={i} style={{ position: 'absolute', ...pos as any, zIndex: isThisTurn ? 20 : 10 }}>
                {/* Hole cards for hero */}
                {isMeLocal && p.isActive && myCards?.length === 2 && (
                  <div style={{ display: 'flex', gap: '0.25rem', marginBottom: 2, justifyContent: 'center' }}>
                    <PlayingCard value={myCards[0]} size="sm" />
                    <PlayingCard value={myCards[1]} size="sm" />
                  </div>
                )}
                <div style={{
                  background: isThisTurn ? 'rgba(0,229,176,0.15)' : 'rgba(10,12,15,0.88)',
                  border: `1.5px solid ${isThisTurn ? 'rgba(0,229,176,0.5)' : isMeLocal ? 'rgba(201,168,76,0.4)' : 'rgba(255,255,255,0.12)'}`,
                  borderRadius: 8, padding: '0.3rem 0.5rem',
                  backdropFilter: 'blur(12px)', minWidth: 72, textAlign: 'center',
                  boxShadow: isThisTurn ? '0 0 20px rgba(0,229,176,0.25)' : 'none',
                  opacity: !p.isActive ? 0.5 : 1,
                }}>
                  <div style={{ fontSize: '0.6rem', color: isMeLocal ? 'var(--gold)' : 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                    {isMeLocal ? 'You' : shortenWallet(p.wallet, 3)}
                  </div>
                  <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: p.chipCount.toNumber() < 200 ? 'var(--red)' : '#fff' }}>
                    {formatChips(p.chipCount)}
                  </div>
                  {p.isAllIn && <div style={{ fontSize: '0.55rem', color: 'var(--red)', fontWeight: 700 }}>ALL IN</div>}
                  {!p.isActive && <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.35)' }}>FOLDED</div>}
                </div>
                {/* Dealer chip */}
                {table && i === table.dealerSeat && (
                  <div style={{
                    position: 'absolute', top: -8, left: -8,
                    width: 18, height: 18, borderRadius: '50%',
                    background: 'var(--gold)', color: '#0a0c0f',
                    fontSize: '0.55rem', fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>D</div>
                )}
              </div>
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
          {isMyTurn && myPlayer && table ? (
            <div style={{ padding: '0.625rem' }}>
              <BetControls table={table} myPlayer={myPlayer} onAction={handleAction} isLoading={isActing} />
            </div>
          ) : (
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
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    {communityCards.map((val: any, i: number) => {
                      const flopped = (i < 3 && phase !== 'PreFlop') || (i < 4 && phase === 'Turn') || (i < 5 && (phase === 'River' || phase === 'Complete' || phase === 'Showdown'));
                      return <PlayingCard key={i} value={flopped ? val : -1} size="md" />;
                    })}
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
                        onReact={handleReact}
                        table={table}
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
          {isMyTurn && myPlayer && table && (
            <div style={{
              position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
              width: '100%', maxWidth: 560, zIndex: 200,
            }}>
              <BetControls table={table} myPlayer={myPlayer} onAction={handleAction} isLoading={isActing} />
            </div>
          )}
        </div>

        {/* Right: Sidebar (Log and Chat) */}
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

          {/* Creator Controls (Deal button) */}
          {table && publicKey && table.creator.toBase58() === publicKey.toBase58() && (['PreFlop', 'Flop', 'Turn', 'River'].includes(phase)) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button
                onClick={handleDealCommunityCards}
                disabled={isActing}
                className="btn btn-gold"
                style={{ width: '100%', padding: '0.75rem', fontSize: '0.9rem', gap: '0.5rem' }}
              >
                {isActing ? <div className="spinner-sm" /> : '🎴'} ADVANCE PHASE
              </button>
              <button
                onClick={handleForceReveal}
                disabled={isActing}
                className="btn btn-ghost"
                style={{ width: '100%', border: '1px solid var(--arcium)', color: 'var(--arcium)' }}
              >
                👁️ FORCE REVEAL BOARD
              </button>
              {phase === 'Showdown' && (
                <button
                  onClick={handleForceComplete}
                  disabled={isActing}
                  className="btn btn-ghost"
                  style={{ width: '100%', border: '1px solid var(--red)', color: 'var(--red)', marginTop: '0.25rem' }}
                >
                  🏁 FORCE FINISH HAND
                </button>
              )}
            </div>
          )}

          <div style={{ flex: 1, minHeight: 0 }}>
            <ChatWindow
              messages={chatMessages}
              onSendMessage={handleSendMessage}
              isMeSeated={!!myPlayer}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
};
