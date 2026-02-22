// src/pages/PlayerProfile.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { Layout } from '../components/layout/Layout';
import { HAND_NAMES, formatChips, shortenWallet, bytesToString } from '../types';
import { POKER_PROGRAM_ID } from '../lib/constants';
import idl from '../idl/encrypted_poker.json';

// ===== Deterministic avatar from wallet pubkey =====
function walletToColor(walletStr: string): string {
  let hash = 0;
  for (let i = 0; i < walletStr.length; i++) {
    hash = walletStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 60%, 40%)`;
}

function walletToEmoji(walletStr: string): string {
  const EMOJIS = ['🃏', '♠️', '♥️', '♦️', '♣️', '🎰', '🎲', '👑', '💎', '🌊', '🔥', '⚡', '🏆', '🎭', '🌙', '⭐'];
  let hash = 0;
  for (let i = 0; i < walletStr.length; i++) hash = (hash * 31 + walletStr.charCodeAt(i)) >>> 0;
  return EMOJIS[hash % EMOJIS.length];
}

// ===== Sub-components =====

const StatCard: React.FC<{ label: string; value: string | number; sub?: string; highlight?: boolean }> = ({
  label, value, sub, highlight,
}) => (
  <div style={{
    background: highlight ? 'var(--gold-dim)' : 'var(--surface)',
    border: `1px solid ${highlight ? 'rgba(201,168,76,0.25)' : 'var(--border)'}`,
    borderRadius: 12, padding: '1.25rem',
    textAlign: 'center',
    transition: 'all 0.2s',
  }}>
    <div style={{
      fontFamily: 'var(--font-display)',
      fontSize: '1.75rem', fontWeight: 700,
      color: highlight ? 'var(--gold-2)' : '#fff',
      letterSpacing: '-0.02em',
      lineHeight: 1.1,
    }}>
      {value}
    </div>
    {sub && (
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: highlight ? 'var(--gold)' : 'rgba(255,255,255,0.4)', marginTop: '0.125rem' }}>
        {sub}
      </div>
    )}
    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginTop: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {label}
    </div>
  </div>
);

const WinRateBar: React.FC<{ rate: number; handsPlayed: number }> = ({ rate, handsPlayed }) => (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
      <span style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.5)' }}>Win Rate</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: rate >= 40 ? 'var(--green)' : rate >= 30 ? 'var(--gold)' : 'rgba(255,255,255,0.55)' }}>
        {rate}%
      </span>
    </div>
    <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${rate}%`,
        background: rate >= 40
          ? 'linear-gradient(90deg, var(--green), #4ade80)'
          : rate >= 30
            ? 'linear-gradient(90deg, var(--gold), var(--gold-2))'
            : 'linear-gradient(90deg, #94a3b8, #cbd5e1)',
        borderRadius: 3,
        transition: 'width 1s var(--ease-out)',
      }} />
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
      <span>Based on {handsPlayed} hands played</span>
      <span>Network avg ~33%</span>
    </div>
  </div>
);

const AchievementBadge: React.FC<{ icon: string; label: string; earned: boolean; tooltip?: string }> = ({ icon, label, earned, tooltip }) => (
  <div
    title={tooltip}
    style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem',
      padding: '0.875rem 0.5rem',
      opacity: earned ? 1 : 0.28,
      filter: earned ? 'none' : 'grayscale(1)',
      transition: 'all 0.2s',
      cursor: earned ? 'default' : 'not-allowed',
    }}
  >
    <div style={{
      width: 44, height: 44, borderRadius: '50%',
      background: earned ? 'var(--gold-dim)' : 'var(--surface)',
      border: `2px solid ${earned ? 'rgba(201,168,76,0.4)' : 'var(--border)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '1.375rem',
      boxShadow: earned ? 'var(--shadow-gold)' : 'none',
    }}>
      {icon}
    </div>
    <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', textAlign: 'center', maxWidth: 60, lineHeight: 1.3 }}>
      {label}
    </span>
  </div>
);

const GameRow: React.FC<{ game: any; isMe: boolean }> = ({ game, isMe }) => {
  const isWin = game.result === 'win';
  const isFold = game.result === 'fold';
  const elapsed = Math.floor((Date.now() - game.timestamp) / 60000);
  const timeLabel = elapsed < 60
    ? `${elapsed}m ago`
    : elapsed < 1440
      ? `${Math.floor(elapsed / 60)}h ago`
      : `${Math.floor(elapsed / 1440)}d ago`;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.875rem',
      padding: '0.875rem 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: isWin ? 'var(--green-dim)' : isFold ? 'rgba(100,116,139,0.15)' : 'var(--red-dim)',
        border: `1px solid ${isWin ? 'rgba(34,197,94,0.25)' : isFold ? 'rgba(100,116,139,0.2)' : 'rgba(239,68,68,0.25)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.875rem',
      }}>
        {isWin ? '🏆' : isFold ? '🃏' : '❌'}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.2rem' }}>
          <span style={{ fontWeight: 500, fontSize: '0.9375rem' }}>
            {isWin ? 'Won' : isFold ? 'Folded' : 'Lost'} · Hand #{game.handNumber}
          </span>
          {game.handCategory !== undefined && (
            <span className="badge badge-gold" style={{ fontSize: '0.7rem', padding: '0.125rem 0.5rem' }}>
              {HAND_NAMES[game.handCategory]}
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-mono)' }}>
          {game.tableName || `Table ...${game.tableId.slice(-6)}`} · {timeLabel}
        </div>
      </div>

      <div style={{
        fontFamily: 'var(--font-mono)', fontWeight: 600,
        color: isWin ? 'var(--green)' : isFold ? 'rgba(255,255,255,0.35)' : 'var(--red)',
        fontSize: '0.9375rem', flexShrink: 0,
        textAlign: 'right',
      }}>
        {game.chipDelta > 0 ? '+' : ''}{formatChips(game.chipDelta)}
      </div>
    </div>
  );
};

// ===== Main page =====
export const PlayerProfilePage: React.FC = () => {
  const { wallet: walletParam } = useParams<{ wallet: string }>();
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'history' | 'badges'>('history');
  const [balance, setBalance] = useState<number | null>(null);
  const [activeTables, setActiveTables] = useState<any[]>([]);
  const [gameHistory, setGameHistory] = useState<any[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const walletStr = walletParam || publicKey?.toString();
  const isMe = !!(publicKey && (publicKey.toString() === walletStr));

  const program = useMemo(() => {
    const mockWallet = {
      publicKey: publicKey || PublicKey.default,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any) => txs,
    };
    const provider = new anchor.AnchorProvider(connection, mockWallet as any, { commitment: 'confirmed' });
    return new anchor.Program(idl as any, provider);
  }, [connection, publicKey]);

  const loadProfileData = useCallback(async () => {
    if (!walletStr) return;
    setIsDataLoading(true);
    setHistoryError(null);
    try {
      const pubkey = new PublicKey(walletStr);

      // 1. SOL balance
      const bal = await connection.getBalance(pubkey);
      setBalance(bal / LAMPORTS_PER_SOL);

      // 2. Active tables (Player PDAs where this wallet is seated)
      const playerAccounts = await (program.account as any).player.all([
        { memcmp: { offset: 8 + 1, bytes: pubkey.toBase58() } }
      ]);
      const tableData = await Promise.all(playerAccounts.map(async (p: any) => {
        try {
          const tableAcc = await (program.account as any).table.fetch(p.account.table);
          return {
            id: p.account.table.toBase58(),
            name: bytesToString(tableAcc.name) || `Table ...${p.account.table.toBase58().slice(-6)}`,
            chips: p.account.chipCount.toNumber(),
          };
        } catch { return null; }
      }));
      setActiveTables(tableData.filter(Boolean));

      // 3. Game history — fetch all GameResult PDAs, filter by wallet in winners[]
      const allResults = await (program.account as any).gameResult.all();
      const myGames: any[] = [];

      for (const r of allResults) {
        const acc = r.account;
        const walletBase58 = pubkey.toBase58();

        // Check winners (up to winner_count entries)
        const winnerCount: number = acc.winnerCount ?? 0;
        const winnerAddresses: string[] = (acc.winners as PublicKey[])
          .slice(0, winnerCount)
          .map((w: PublicKey) => w.toBase58());
        const isWinner = winnerAddresses.includes(walletBase58);

        // Check participants (up to participant_count entries) — new field
        const participantCount: number = acc.participantCount ?? 0;
        const participantAddresses: string[] = acc.participants
          ? (acc.participants as PublicKey[]).slice(0, participantCount).map((p: PublicKey) => p.toBase58())
          : winnerAddresses; // fallback: old accounts without participants field

        const isParticipant = isWinner || participantAddresses.includes(walletBase58);
        if (!isParticipant) continue; // not involved in this hand

        const myWinnerIdx = winnerAddresses.indexOf(walletBase58);
        const payout = isWinner ? (acc.payouts[myWinnerIdx]?.toNumber() ?? 0) : 0;

        // For losses, chipDelta is negative. We don't have exact loss amount on-chain
        // (pot was split to winners), so show as negative payout of the winner's pot share
        // as a proxy. If we can't compute, mark as -bigBlind.
        const chipDelta = isWinner ? payout : -(acc.payouts[0]?.toNumber() ?? 0) / Math.max(winnerCount, 1);
        const timestamp = acc.timestamp?.toNumber ? acc.timestamp.toNumber() * 1000 : Date.now();

        // Fetch the table name
        let tableName = '';
        try {
          const tableAcc = await (program.account as any).table.fetch(acc.table);
          tableName = bytesToString(tableAcc.name) || '';
        } catch { /* table may be closed */ }

        myGames.push({
          tableId: acc.table.toBase58(),
          tableName,
          handNumber: acc.handNumber?.toNumber() ?? 0,
          result: isWinner ? 'win' : 'loss',
          chipDelta: Math.round(chipDelta),
          handCategory: isWinner ? acc.winningHandCategory : undefined,
          timestamp,
          proofHash: Buffer.from(acc.proofHash).toString('hex').slice(0, 16) + '...',
        });
      }

      // Sort by most recent first
      myGames.sort((a, b) => b.timestamp - a.timestamp);
      setGameHistory(myGames);

    } catch (err: any) {
      console.error('[Profile] Error loading data:', err);
      setHistoryError(err?.message ?? 'Failed to load profile data');
    } finally {
      setIsDataLoading(false);
    }
  }, [walletStr, connection, program]);

  useEffect(() => { loadProfileData(); }, [loadProfileData]);

  // ===== Computed stats from real history =====
  const stats = useMemo(() => {
    const wins = gameHistory.filter(g => g.result === 'win').length;
    const handsPlayed = gameHistory.length;
    const winRate = handsPlayed > 0 ? Math.round((wins / handsPlayed) * 100) : 0;
    const totalChipsWon = gameHistory.filter(g => g.chipDelta > 0).reduce((s, g) => s + g.chipDelta, 0);
    const bestHand = gameHistory.find(g => g.handCategory !== undefined)?.handCategory;
    return { wins, handsPlayed, winRate, totalChipsWon, bestHand };
  }, [gameHistory]);

  // ===== Achievements from real data =====
  const achievements = useMemo(() => [
    {
      icon: '🃏', label: 'First Hand',
      earned: stats.handsPlayed >= 1,
      tooltip: 'Play your first hand',
    },
    {
      icon: '🏆', label: 'First Win',
      earned: stats.wins >= 1,
      tooltip: 'Win your first hand',
    },
    {
      icon: '🔥', label: 'Win Streak',
      earned: stats.wins >= 3,
      tooltip: 'Win 3 or more hands',
    },
    {
      icon: '💎', label: 'Royal Flush',
      earned: gameHistory.some(g => g.handCategory === 9),
      tooltip: 'Win with a Royal Flush',
    },
    {
      icon: '🎭', label: 'Bluff Proven',
      earned: false, // requires verify_bluff_proof on-chain tx — future feature
      tooltip: 'Reveal a winning bluff via ZK proof',
    },
    {
      icon: '🌊', label: '10 Hands',
      earned: stats.handsPlayed >= 10,
      tooltip: 'Play 10 hands total',
    },
    {
      icon: '💰', label: 'Big Win 2k',
      earned: gameHistory.some(g => g.chipDelta >= 2000),
      tooltip: 'Win a pot of 2,000+ chips',
    },
    {
      icon: '🔒', label: 'MPC Believer',
      earned: activeTables.length > 0 || stats.handsPlayed > 0,
      tooltip: 'Play on Arcium MPC',
    },
  ], [stats, gameHistory, activeTables]);

  if (!walletStr) {
    return (
      <Layout arciumStatus="active">
        <div style={{ maxWidth: 700, margin: '8rem auto', padding: '2rem 1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1.5rem', opacity: 0.3 }}>👤</div>
          <h2 style={{ marginBottom: '1rem' }}>Profile Not Found</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: '2rem' }}>
            Please connect your wallet to view your personal stats.
          </p>
          <button className="btn btn-gold btn-lg" onClick={() => navigate('/')}>Return to Lobby</button>
        </div>
      </Layout>
    );
  }

  const avatarColor = walletToColor(walletStr);
  const avatarEmoji = walletToEmoji(walletStr);

  return (
    <Layout arciumStatus="active">
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Header */}
        <div className="animate-fade-up" style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14, padding: '1.5rem',
          marginBottom: '1.25rem',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 80,
            background: `linear-gradient(135deg, ${avatarColor}22 0%, transparent 100%)`,
            pointerEvents: 'none',
          }} />

          <div style={{ position: 'relative', display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Deterministic avatar */}
            <div style={{
              width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
              background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}88)`,
              border: '2px solid rgba(201,168,76,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.75rem', boxShadow: 'var(--shadow-gold)',
            }}>
              {avatarEmoji}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.0625rem' }}>
                  {isMe ? 'Your Profile' : shortenWallet(walletStr, 6)}
                </h3>
                {isMe && <span className="badge badge-gold">You</span>}
                <span className="badge badge-arcium">Arcium Player</span>
                {stats.handsPlayed > 0 && <span className="badge badge-green">{stats.wins} wins</span>}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', marginBottom: '0.75rem', wordBreak: 'break-all' }}>
                {walletStr}
              </div>
            </div>

            <button className="btn btn-ghost btn-sm" onClick={loadProfileData}>↻ Reload</button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="animate-fade-up delay-1" style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '0.75rem', marginBottom: '1.25rem',
        }}>
          <StatCard label="SOL Balance" value={balance !== null ? balance.toFixed(3) : '...'} sub="SOL on devnet" highlight />
          <StatCard label="Active Tables" value={activeTables.length} sub={activeTables.length === 1 ? 'table' : 'tables'} highlight={activeTables.length > 0} />
          <StatCard label="Hands Won" value={isDataLoading ? '…' : stats.wins} sub={`of ${stats.handsPlayed} played`} />
          <StatCard label="Chips Won" value={isDataLoading ? '…' : formatChips(stats.totalChipsWon)} sub="lifetime" highlight={stats.totalChipsWon > 0} />
        </div>

        {/* Win Rate */}
        <div className="animate-fade-up delay-2" style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '1.25rem',
          marginBottom: '1.25rem',
        }}>
          <WinRateBar rate={stats.winRate} handsPlayed={stats.handsPlayed} />
        </div>

        {/* Active Tables */}
        {activeTables.length > 0 && (
          <>
            <h4 style={{ marginBottom: '0.75rem', color: 'rgba(255,255,255,0.45)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Currently Seated
            </h4>
            <div className="animate-fade-up" style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, overflow: 'hidden', marginBottom: '1.5rem',
            }}>
              {activeTables.map((t, i) => (
                <div key={i} style={{ padding: '1rem 1.25rem', borderBottom: i < activeTables.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono)' }}>Seated</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--gold)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{formatChips(t.chips)} chips</div>
                    <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.25rem' }} onClick={() => navigate(`/table/table-${t.id}`)}>Rejoin →</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Tabs: History / Badges */}
        <div className="animate-fade-up">
          <div style={{
            display: 'flex', gap: '0.375rem', marginBottom: '1rem',
            borderBottom: '1px solid var(--border)', paddingBottom: '0',
          }}>
            {(['history', 'badges'] as const).map(tab => (
              <button
                key={tab}
                className="btn btn-ghost btn-sm"
                onClick={() => setActiveTab(tab)}
                style={{
                  background: 'transparent', border: 'none',
                  borderBottom: `2px solid ${activeTab === tab ? 'var(--gold)' : 'transparent'}`,
                  borderRadius: 0, padding: '0.5rem 0.875rem 0.75rem',
                  color: activeTab === tab ? '#fff' : 'rgba(255,255,255,0.45)',
                  textTransform: 'capitalize',
                  marginBottom: -1,
                }}
              >
                {tab === 'history' ? `History${stats.handsPlayed > 0 ? ` (${stats.handsPlayed})` : ''}` : 'Achievements'}
              </button>
            ))}
          </div>

          {activeTab === 'history' && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, overflow: 'hidden',
            }}>
              {historyError && (
                <div style={{ padding: '1rem 1.25rem', color: '#fca5a5', fontSize: '0.875rem', background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid var(--border)' }}>
                  ⚠️ {historyError}
                </div>
              )}
              {isDataLoading ? (
                <div style={{ padding: '0 1.25rem' }}>
                  {[1, 2, 3].map(i => (
                    <div key={i} className="skeleton" style={{ height: 52, margin: '0.75rem 0', borderRadius: 8 }} />
                  ))}
                </div>
              ) : gameHistory.length === 0 ? (
                <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.4 }}>🃏</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9375rem', marginBottom: '0.5rem' }}>No hand history yet</div>
                  <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.8125rem' }}>
                    Win a hand to see it appear here.{' '}
                    <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                      (Losses require an indexer — coming soon)
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '0 1.25rem' }}>
                  {gameHistory.map((game, i) => (
                    <GameRow key={i} game={game} isMe={isMe} />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'badges' && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '1.25rem',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                {achievements.map(b => (
                  <AchievementBadge key={b.label} {...b} />
                ))}
              </div>
              <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
                Achievements are computed from your on-chain game results
              </div>
            </div>
          )}
        </div>

        {/* Verify link */}
        <div className="animate-fade-up" style={{ marginTop: '2rem' }}>
          <Link
            to="/verify"
            className="btn btn-arcium"
            style={{ width: '100%', justifyContent: 'center', padding: '0.875rem', textDecoration: 'none', display: 'flex' }}
          >
            🔒 Verify On-Chain MPC Proofs →
          </Link>
        </div>
      </div>
    </Layout>
  );
};
