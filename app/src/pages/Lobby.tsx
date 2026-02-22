// src/pages/Lobby.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { Layout } from '../components/layout/Layout';
import { TableListing, formatChips, phaseLabel, bytesToString, parseGamePhase } from '../types';
import { SOLANA_NETWORK } from '../lib/constants';
import idl from '../idl/encrypted_poker.json';

const StatPill: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div style={{
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '0.875rem 1.25rem',
    textAlign: 'center',
  }}>
    <div style={{ fontSize: '1.375rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--gold)' }}>
      {value}
    </div>
    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginTop: 2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      {label}
    </div>
  </div>
);

const TableCard: React.FC<{ table: TableListing; onJoin: () => void; canJoin: boolean }> = ({
  table, onJoin, canJoin,
}) => {
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const isActive = table.phase !== 'Waiting';
  const isFull = table.players >= table.maxPlayers;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x, y });

    // Calculate tilt (max 4 degrees)
    const tiltX = (y - 50) / 12.5;
    const tiltY = (x - 50) / -12.5;
    setTilt({ x: tiltX, y: tiltY });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
    setMousePos({ x: 50, y: 50 });
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="glass-card"
      style={{
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.875rem',
        borderRadius: 14,
        transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateY(${tilt.x !== 0 ? -4 : 0}px)`,
        boxShadow: tilt.x !== 0 ? '0 20px 40px rgba(0,0,0,0.4), var(--shadow-gold)' : 'var(--shadow-sm)',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      {/* Mouse Halo Effect */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `radial-gradient(circle at ${mousePos.x}% ${mousePos.y}%, rgba(201,168,76,0.1) 0%, transparent 60%)`,
        opacity: tilt.x !== 0 ? 1 : 0,
        transition: 'opacity 0.3s',
      }} />

      {/* Top highlight line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: 1, background: 'linear-gradient(90deg, transparent, var(--gold), transparent)',
        opacity: 0.3,
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.125rem', color: '#fff', letterSpacing: '0.01em' }}>
            {table.name}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
            {table.smallBlind}/{table.bigBlind} · Hand #{table.handNumber}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', alignItems: 'flex-end' }}>
          <span className={`badge ${isActive ? 'badge-gold' : 'badge-green'}`}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: isActive ? 'var(--gold)' : 'var(--green)',
              animation: isActive ? 'none' : 'pulse-arcium 2s infinite',
            }} />
            {isActive ? phaseLabel(table.phase) : 'Open'}
          </span>
          {table.tokenGated && (
            <span className="badge badge-purple">🔑 Token-Gated</span>
          )}
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${table.maxPlayers}, 1fr)`,
          gap: '0.3rem',
          marginBottom: '0.5rem',
        }}>
          {Array.from({ length: table.maxPlayers }, (_, i) => (
            <div key={i} style={{
              height: 4,
              borderRadius: 2,
              background: i < table.players
                ? 'var(--gold)'
                : 'rgba(255,255,255,0.06)',
              boxShadow: i < table.players ? '0 0 8px var(--gold-glow)' : 'none',
              transition: 'all 0.3s',
            }} />
          ))}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.38)', display: 'flex', justifyContent: 'space-between' }}>
          <span>{table.players}/{table.maxPlayers} players</span>
          {table.pot > 0 && (
            <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
              Pot: {formatChips(table.pot)}
            </span>
          )}
        </div>
      </div>

      <button
        className={`btn ${isFull ? 'btn-ghost' : 'btn-gold'} btn-sm`}
        onClick={onJoin}
        disabled={!canJoin || isFull}
        style={{ width: '100%', justifyContent: 'center', position: 'relative' }}
      >
        {!canJoin ? 'Connect Wallet' : isFull ? 'Spectate' : isActive ? 'Join Mid-Game' : 'Join Table'}
      </button>
    </div>
  );
};

const EmptyState: React.FC<{ onCreate: () => void; canCreate: boolean }> = ({ onCreate, canCreate }) => (
  <div style={{
    textAlign: 'center', padding: '5rem 2rem',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem',
  }}>
    <div style={{ fontSize: '4rem', filter: 'grayscale(0.5)', opacity: 0.6 }}>🂠</div>
    <div>
      <h3 style={{ fontFamily: 'var(--font-display)', color: 'rgba(255,255,255,0.6)', marginBottom: '0.5rem' }}>
        No Tables Yet
      </h3>
      <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.9375rem' }}>
        Be the first to create an encrypted table.
      </p>
    </div>
    <button className="btn btn-gold btn-lg" onClick={onCreate} disabled={!canCreate}>
      Create First Table
    </button>
  </div>
);

export const LobbyPage: React.FC = () => {
  const navigate = useNavigate();
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [tables, setTables] = useState<TableListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'active'>('all');
  const [sortBy, setSortBy] = useState<'players' | 'pot' | 'stakes'>('players');

  const program = useMemo(() => {
    const mockWallet = {
      publicKey: publicKey || PublicKey.default,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any) => txs,
    };
    const provider = new anchor.AnchorProvider(connection, mockWallet as any, { commitment: 'confirmed' });
    return new anchor.Program(idl as any, provider);
  }, [connection, publicKey]);

  const loadTables = useCallback(async () => {
    setIsLoading(true);
    setLobbyError(null);
    try {
      const allTables = await (program.account as any).table.all();
      const mapped: TableListing[] = allTables.map((t: any) => {
        const acc = t.account;
        return {
          tableId: `table-${acc.tableId.toString()}`,
          name: bytesToString(acc.name) || `Table ${acc.tableId.toString().slice(-4)}`,
          players: acc.currentPlayers,
          maxPlayers: acc.maxPlayers,
          smallBlind: acc.smallBlind.toNumber(),
          bigBlind: acc.bigBlind.toNumber(),
          phase: parseGamePhase(acc.phase),
          tokenGated: !!acc.tokenGateMint,
          pot: acc.pot.toNumber(),
          handNumber: acc.handNumber.toNumber(),
        };
      });
      setTables(mapped);
    } catch (err: any) {
      console.error('[Lobby] Error loading tables:', err);
      setLobbyError(err?.message ?? 'Failed to load tables from RPC');
    } finally {
      setIsLoading(false);
    }
  }, [program]);

  useEffect(() => { loadTables(); }, [loadTables]);

  const filtered = tables
    .filter(t => filter === 'all' ? true : filter === 'open' ? t.phase === 'Waiting' : t.phase !== 'Waiting')
    .sort((a, b) => sortBy === 'players' ? b.players - a.players : sortBy === 'pot' ? b.pot - a.pot : b.bigBlind - a.bigBlind);

  const openCount = tables.filter(t => t.phase === 'Waiting').length;
  const activePlayers = tables.reduce((s, t) => s + t.players, 0);
  const totalPot = tables.reduce((s, t) => s + t.pot, 0);

  return (
    <Layout arciumStatus="active">
      <div style={{
        position: 'relative',
        borderBottom: '1px solid var(--border)',
        overflow: 'hidden',
        paddingBottom: '3.5rem',
      }}>
        {/* Atmospheric Backdrops */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(15,61,46,0.5) 0%, transparent 70%)',
        }} />

        {/* Drifting Card Silhouettes */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.15 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="animate-fade-in"
              style={{
                position: 'absolute',
                width: 100, height: 140,
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                background: 'linear-gradient(135deg, rgba(255,255,255,0.05), transparent)',
                top: `${20 + Math.random() * 60}%`,
                left: `${10 + Math.random() * 80}%`,
                transform: `rotate(${Math.random() * 45}deg)`,
                animation: `float-card ${15 + Math.random() * 10}s linear infinite`,
                animationDelay: `-${Math.random() * 10}s`,
              }}
            />
          ))}
        </div>

        <div style={{
          maxWidth: 960, margin: '0 auto', padding: '4.5rem 1.5rem 0',
          position: 'relative', textAlign: 'center',
        }}>
          <div className="badge badge-arcium animate-fade-up" style={{ marginBottom: '1.5rem', display: 'inline-flex', boxShadow: 'var(--shadow-arcium)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--arcium)', animation: 'pulse-arcium 2s infinite' }} />
            Arcium MPC · {SOLANA_NETWORK === 'devnet' ? 'Solana Devnet' : SOLANA_NETWORK === 'mainnet' ? 'Solana Mainnet' : 'Localnet'}
          </div>

          <h1 className="animate-fade-up delay-1 gradient-text" style={{ marginBottom: '1.25rem', paddingBottom: '0.2rem' }}>
            Texas Hold'em<br />
            Without Secrets
          </h1>

          <p className="animate-fade-up delay-2" style={{
            color: 'rgba(255,255,255,0.5)', fontSize: '1.125rem', maxWidth: 540,
            margin: '0 auto 2.75rem', lineHeight: 1.6, fontWeight: 300,
          }}>
            The first poker game where your hole cards are provably private
            evaluated inside Arcium's MPC, verified on Solana.
          </p>

          <div className="animate-fade-up delay-3" style={{
            display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap',
            marginBottom: '3.5rem',
          }}>
            <button
              className="btn btn-gold btn-xl"
              onClick={() => navigate('/create')}
              disabled={!publicKey}
              style={{ minWidth: 200 }}
            >
              Create Table
            </button>
            <button className="btn btn-ghost btn-xl" onClick={() => navigate('/verify')} style={{ minWidth: 200 }}>
              Verify Proofs
            </button>
          </div>

          <div className="animate-fade-up delay-4" style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem', maxWidth: 480, margin: '0 auto',
          }}>
            <StatPill label="Open Tables" value={openCount} />
            <StatPill label="Active Players" value={activePlayers} />
            <StatPill label="Total Pot" value={formatChips(totalPot)} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem',
        }}>
          <div style={{ display: 'flex', gap: '0.375rem' }}>
            {(['all', 'open', 'active'] as const).map(f => (
              <button
                key={f}
                className="btn btn-ghost btn-sm"
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? 'rgba(255,255,255,0.07)' : 'transparent',
                  color: filter === f ? '#fff' : 'rgba(255,255,255,0.45)',
                  borderColor: filter === f ? 'var(--border-bright)' : 'transparent',
                  textTransform: 'capitalize',
                }}
              >
                {f}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)' }}>Sort:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="input"
              style={{ width: 'auto', padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
            >
              <option value="players">Players</option>
              <option value="pot">Pot Size</option>
              <option value="stakes">Stakes</option>
            </select>
            <button className="btn btn-ghost btn-sm" onClick={loadTables}>↻ Refresh</button>
          </div>
        </div>

        {lobbyError && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10, padding: '0.875rem 1.25rem', marginBottom: '1.5rem',
            color: '#fca5a5', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            ⚠️ <strong>RPC Error:</strong> {lobbyError}
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={loadTables}>Retry</button>
          </div>
        )}

        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="skeleton" style={{ height: 180 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState onCreate={() => navigate('/create')} canCreate={!!publicKey} />
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem',
          }}>
            {filtered.map((table, i) => (
              <div
                key={table.tableId}
                className="animate-fade-up"
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <TableCard
                  table={table}
                  canJoin={!!publicKey}
                  onJoin={() => navigate(`/table/${table.tableId}`)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};
