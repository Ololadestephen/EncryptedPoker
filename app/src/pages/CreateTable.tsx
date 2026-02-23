// src/pages/CreateTable.tsx
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import * as anchor from '@coral-xyz/anchor';
import { Layout } from '../components/layout/Layout';
import { POKER_PROGRAM_ID, ARCIUM_MXE_PUBKEY } from '../lib/constants';
import idl from '../idl/encrypted_poker.json';
import { parseTxError } from '../lib/parseTxError';

const BLIND_PRESETS = [
  { label: 'Nano', sb: 1, bb: 2, desc: 'Learning stakes' },
  { label: 'Micro', sb: 5, bb: 10, desc: 'Low variance' },
  { label: 'Low', sb: 25, bb: 50, desc: 'Casual play' },
  { label: 'Mid', sb: 100, bb: 200, desc: 'Serious game' },
  { label: 'High', sb: 500, bb: 1000, desc: 'High stakes' },
  { label: 'Nosebleed', sb: 2000, bb: 4000, desc: 'Max action' },
];

const FormSection: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({
  title, subtitle, children,
}) => (
  <div style={{
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    overflow: 'hidden',
  }}>
    <div style={{
      padding: '1rem 1.25rem',
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface-2)',
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>{title}</div>
      {subtitle && <div style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{subtitle}</div>}
    </div>
    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {children}
    </div>
  </div>
);

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
  label, hint, children,
}) => (
  <div>
    <div className="input-label">{label}</div>
    {children}
    {hint && <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.375rem' }}>{hint}</div>}
  </div>
);


export const CreateTablePage: React.FC = () => {
  const navigate = useNavigate();
  const { connection } = useConnection();
  const { publicKey, wallet } = useWallet();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const program = useMemo(() => {
    const provider = new anchor.AnchorProvider(connection, wallet?.adapter as any, { commitment: 'confirmed' });
    return new anchor.Program(idl as anchor.Idl, provider);
  }, [connection, wallet]);

  const [form, setForm] = useState({
    name: '',
    smallBlind: 25,
    bigBlind: 50,
    minPlayers: 2,
    maxPlayers: 6,
    timeBankSecs: 30,
    tokenGated: false,
    tokenMint: '',
    tokenAmount: 1,
    noLimit: true,
  });

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const handlePreset = (sb: number, bb: number) => {
    set('smallBlind', sb);
    set('bigBlind', bb);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const tableId = new anchor.BN(Date.now());
      const nameBuffer = Buffer.alloc(32);
      Buffer.from(form.name.slice(0, 32)).copy(nameBuffer);
      const nameArray = Array.from(nameBuffer);
      const tokenMint = form.tokenGated && form.tokenMint
        ? new anchor.web3.PublicKey(form.tokenMint)
        : null;

      await (program.methods as any).createTable(
        tableId,
        nameArray,
        new anchor.BN(form.smallBlind),
        new anchor.BN(form.bigBlind),
        form.minPlayers,
        form.maxPlayers,
        tokenMint,
        new anchor.BN(form.tokenAmount)
      )
        .accounts({
          arciumMxe: ARCIUM_MXE_PUBKEY,
        })
        .rpc();

      navigate(`/table/table-${tableId.toString()}`);
    } catch (err) {
      console.error('[CreateTable] Error:', err);
      setError(parseTxError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const preview = {
    startingChips: 2000,
    bbRatio: Math.floor(2000 / form.bigBlind),
  };

  return (
    <Layout arciumStatus="active">
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => navigate('/')}
          style={{ marginBottom: '1.5rem' }}
        >
          ← Back to Lobby
        </button>

        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ flex: '1 1 340px', minWidth: 0 }}>
            <h1 className="animate-fade-up gradient-text" style={{ marginBottom: '0.5rem', fontSize: '2.5rem' }}>
              Create Table
            </h1>
            <p className="animate-fade-up delay-1" style={{
              color: 'rgba(255,255,255,0.45)', marginBottom: '2.5rem', fontSize: '1rem',
              fontWeight: 300,
            }}>
              Configure your provably fair high-stakes lounge. Every manual shuffle is replaced by MPC.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <div className="animate-fade-up delay-1">
                <FormSection title="Identity" subtitle="Choose a name for your table">
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                      <div className="input-label">Table Name</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: form.name.length > 28 ? 'var(--gold)' : 'rgba(255,255,255,0.25)' }}>
                        {form.name.length}/32
                      </div>
                    </div>
                    <input
                      className="input"
                      placeholder="e.g. The Whale Lounge"
                      value={form.name}
                      onChange={e => set('name', e.target.value)}
                      maxLength={32}
                      style={{ fontSize: '1rem', padding: '0.75rem 1rem' }}
                    />
                  </div>
                </FormSection>
              </div>

              <div className="animate-fade-up delay-2">
                <FormSection title="Stakes" subtitle="Starting stack is fixed at 2,000 chips">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '0.75rem' }}>
                    {BLIND_PRESETS.map(p => {
                      const selected = form.smallBlind === p.sb;
                      return (
                        <button
                          type="button"
                          key={p.label}
                          onClick={() => handlePreset(p.sb, p.bb)}
                          className="glass-card"
                          style={{
                            border: `1px solid ${selected ? 'var(--gold)' : 'rgba(255,255,255,0.06)'}`,
                            padding: '1rem',
                            cursor: 'pointer',
                            textAlign: 'left',
                            background: selected ? 'var(--gold-dim)' : 'rgba(255,255,255,0.02)',
                          }}
                        >
                          <div style={{ fontWeight: 600, color: selected ? 'var(--gold-2)' : '#fff', fontSize: '0.9375rem' }}>
                            {p.label}
                          </div>
                          <div style={{ fontSize: '0.8125rem', color: selected ? 'var(--gold)' : 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono)' }}>
                            {p.sb}/{p.bb}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div style={{
                    background: 'var(--ink-2)', borderRadius: 12, padding: '1rem',
                    border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div>
                      <div className="subtle" style={{ fontSize: '0.75rem' }}>Stack Depth</div>
                      <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>
                        {preview.bbRatio} <span className="gold-text">BBs</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="subtle" style={{ fontSize: '0.75rem' }}>Betting Mode</div>
                      <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>No Limit</div>
                    </div>
                  </div>
                </FormSection>
              </div>

              <div className="animate-fade-up delay-3">
                <FormSection title="Configuration">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '1rem' }}>
                    <Field label="Min Players">
                      <select className="input" value={form.minPlayers} onChange={e => set('minPlayers', +e.target.value)}>
                        {[2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </Field>
                    <Field label="Max Players">
                      <select className="input" value={form.maxPlayers} onChange={e => set('maxPlayers', +e.target.value)}>
                        {[2, 3, 4, 5, 6].filter(n => n >= form.minPlayers).map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </Field>
                    <Field label="Time Bank">
                      <select className="input" value={form.timeBankSecs} onChange={e => set('timeBankSecs', +e.target.value)}>
                        {[15, 30, 45, 60].map(s => <option key={s} value={s}>{s}s</option>)}
                      </select>
                    </Field>
                  </div>
                </FormSection>
              </div>

              <div className="animate-fade-up delay-4">
                <FormSection title="Access Control">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
                    <div onClick={() => set('tokenGated', !form.tokenGated)} style={{
                      width: 44, height: 24, borderRadius: 12,
                      background: form.tokenGated ? 'var(--gold)' : 'rgba(255,255,255,0.1)',
                      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                    }}>
                      <div style={{
                        position: 'absolute', top: 3, left: form.tokenGated ? 23 : 3,
                        width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                      }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 500 }}>Token-Gated Access</div>
                      <div className="subtle" style={{ fontSize: '0.8125rem' }}>Require an SPL token to join</div>
                    </div>
                  </label>
                  {form.tokenGated && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '0.5rem' }}>
                      <div style={{ flex: '2 1 180px' }}>
                        <Field label="Mint Address">
                          <input className="input mono" placeholder="Token Mint..." value={form.tokenMint} onChange={e => set('tokenMint', e.target.value)} />
                        </Field>
                      </div>
                      <div style={{ flex: '1 1 80px' }}>
                        <Field label="Min Amount">
                          <input type="number" className="input" value={form.tokenAmount} onChange={e => set('tokenAmount', +e.target.value)} />
                        </Field>
                      </div>
                    </div>
                  )}
                </FormSection>
              </div>

              {error && (
                <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '1rem', color: '#fca5a5' }}>
                  {error}
                </div>
              )}

              <div className="animate-fade-up delay-5" style={{ display: 'flex', gap: '1rem' }}>
                <button type="submit" className="btn btn-gold btn-xl" disabled={isSubmitting || !publicKey} style={{ flex: 1, height: '3.75rem' }}>
                  {isSubmitting ? 'Creating Table...' : !publicKey ? 'Connect Wallet' : 'Initialize on Solana'}
                </button>
                <button type="button" className="btn btn-ghost btn-xl" onClick={() => navigate('/')}>Cancel</button>
              </div>
            </form>
          </div>

        </div>
      </div>
    </Layout>
  );
};
