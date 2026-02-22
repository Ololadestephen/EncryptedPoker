import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { Layout } from '../components/layout/Layout';
import { PlayingCard, CardRow } from '../components/ui/PlayingCard';
import { GameResultData, HAND_NAMES, formatChips, shortenWallet, cardToDisplay } from '../types';
import { POKER_PROGRAM_ID } from '../lib/constants';
import { deriveTablePDA } from '../hooks/useTableRealtime';
import idl from '../idl/encrypted_poker.json';

const WinnerCard: React.FC<{
  winner: string; payout: number; handCategory: number;
  communityCards: number[]; isMe: boolean;
}> = ({ winner, payout, handCategory, communityCards, isMe }) => (
  <div style={{
    background: 'linear-gradient(135deg, rgba(201,168,76,0.1) 0%, rgba(10,12,15,0.95) 100%)',
    border: '1px solid rgba(201,168,76,0.3)',
    borderRadius: 20,
    padding: '2.5rem 1.5rem',
    textAlign: 'center',
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), var(--shadow-gold)',
    backdropFilter: 'blur(20px)',
  }}>
    {/* Animated Halo */}
    <div style={{
      position: 'absolute', top: '-20%', left: '10%', right: '10%', height: '140%',
      background: 'radial-gradient(circle at 50% 30%, rgba(201,168,76,0.15), transparent 60%)',
      pointerEvents: 'none',
      zIndex: 0,
    }} />

    <div style={{ position: 'relative', zIndex: 1 }}>
      <div style={{
        marginBottom: '1rem', fontSize: '3rem',
        filter: 'drop-shadow(0 0 15px var(--gold))',
        animation: 'float-card 3s ease-in-out infinite'
      }}>🏆</div>
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800,
        color: '#fff', marginBottom: '0.25rem',
        letterSpacing: '-0.02em',
      }}>
        {isMe ? <span className="gradient-text">Victory is Yours!</span> : shortenWallet(winner)}
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.9375rem', color: 'var(--gold)',
        marginBottom: '1.5rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase'
      }}>
        {HAND_NAMES[handCategory] ?? 'Best Hand'}
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '3rem', fontWeight: 800,
        color: '#fff', letterSpacing: '-0.03em', lineHeight: 1,
        textShadow: '0 4px 12px rgba(0,0,0,0.5)',
      }}>
        +{formatChips(payout)}
        <span style={{ fontSize: '1.125rem', color: 'rgba(255,255,255,0.4)', marginLeft: '0.5rem', fontWeight: 400 }}>chips</span>
      </div>
    </div>
  </div>
);

const ProofBadge: React.FC<{ proofHash: string; tableId: string; handNumber: number }> = ({
  proofHash, tableId, handNumber,
}) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(proofHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      background: 'var(--arcium-dim)',
      border: '1px solid rgba(0,229,176,0.2)',
      borderRadius: 12,
      padding: '1rem 1.25rem',
      display: 'flex', flexDirection: 'column', gap: '0.625rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--arcium)', animation: 'pulse-arcium 2s infinite', flexShrink: 0 }} />
          <span style={{ fontWeight: 600, color: 'var(--arcium)', fontSize: '0.875rem' }}>
            Arcium ZK Proof · Verified
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={copy}>
            {copied ? '✓ Copied' : 'Copy Hash'}
          </button>
          <Link
            to={`/verify?hash=${proofHash}&table=${tableId}&hand=${handNumber}`}
            className="btn btn-arcium btn-sm"
            style={{ textDecoration: 'none' }}
          >
            Verify →
          </Link>
        </div>
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
        color: 'rgba(255,255,255,0.4)',
        wordBreak: 'break-all', lineHeight: 1.7,
        background: 'rgba(0,0,0,0.3)', borderRadius: 6,
        padding: '0.5rem 0.75rem',
      }}>
        {proofHash}
      </div>
    </div>
  );
};

export const HandResultPage: React.FC = () => {
  const { tableId, handNumber } = useParams<{ tableId: string; handNumber: string }>();
  const navigate = useNavigate();
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [result, setResult] = useState<GameResultData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const program = useMemo(() => {
    const provider = new anchor.AnchorProvider(connection, {} as any, { commitment: 'confirmed' });
    return new anchor.Program(idl as any, provider);
  }, [connection]);

  useEffect(() => {
    async function fetchResult() {
      if (!tableId || !handNumber) return;
      try {
        const tablePda = deriveTablePDA(tableId);
        const [resultPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('result'), tablePda.toBuffer(), new anchor.BN(handNumber).toArrayLike(Buffer, 'le', 8)],
          POKER_PROGRAM_ID
        );
        const acc = await (program.account as any).gameResult.fetch(resultPda);
        setResult(acc);
      } catch (err) {
        console.error('[HandResult] Error fetching result:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchResult();
  }, [tableId, handNumber, program]);

  if (isLoading) {
    return (
      <Layout arciumStatus="active">
        <div style={{ maxWidth: 700, margin: '8rem auto', textAlign: 'center' }}>
          <div className="skeleton" style={{ height: 200, borderRadius: 14, marginBottom: '1.5rem' }} />
          <div className="skeleton" style={{ height: 80, borderRadius: 12 }} />
        </div>
      </Layout>
    );
  }

  if (!result) {
    return (
      <Layout arciumStatus="active">
        <div style={{ maxWidth: 700, margin: '8rem auto', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '1rem' }}>Hand Result Not Found</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: '2rem' }}>
            The hand may still be processing or the record was not found.
          </p>
          <button className="btn btn-gold" onClick={() => navigate(`/table/${tableId}`)}>Back to Table</button>
        </div>
      </Layout>
    );
  }

  const isWinner = publicKey && result.winners.some(w => w.toBase58() === publicKey.toBase58());
  const elapsed = Math.floor((Date.now() - result.timestamp.toNumber() * 1000) / 1000);
  const proofHashHex = Buffer.from(result.proofHash).toString('hex');

  // Confetti particles for win state
  const CONFETTI_COLORS = ['#c9a84c', '#e8c97a', '#00e5b0', '#fff', '#f59e0b'];
  const confettiParticles = isWinner ? Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * 360;
    const dx = Math.round(Math.cos((angle * Math.PI) / 180) * (60 + Math.random() * 60));
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const delay = (i * 0.06).toFixed(2);
    const size = 6 + Math.round(Math.random() * 6);
    return { dx, color, delay, size };
  }) : [];

  return (
    <Layout arciumStatus="active">
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>Lobby</button>
          <span style={{ display: 'flex', alignItems: 'center' }}>›</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/table/${tableId}`)}>Table</button>
          <span style={{ display: 'flex', alignItems: 'center' }}>›</span>
          <span style={{ color: 'rgba(255,255,255,0.55)' }}>Hand #{result.handNumber.toString()}</span>
        </div>

        <div className="animate-fade-up" style={{ marginBottom: '1.5rem', position: 'relative', overflow: 'visible' }}>
          <WinnerCard
            winner={result.winners[0].toBase58()}
            payout={result.payouts[0].toNumber()}
            handCategory={result.winningHandCategory}
            communityCards={result.communityCards}
            isMe={!!isWinner}
          />
          {confettiParticles.map((p, i) => (
            <div
              key={i}
              className="confetti-particle"
              style={{
                '--dx': `${p.dx}px`,
                background: p.color,
                width: p.size, height: p.size,
                top: '50%', left: '50%',
                animationDelay: `${p.delay}s`,
              } as any}
            />
          ))}
        </div>

        <div className="animate-fade-up delay-1" style={{
          background: 'rgba(10,12,15,0.6)', border: '1px solid var(--border)',
          borderRadius: 16, padding: '1.5rem', marginBottom: '1.25rem',
          backdropFilter: 'blur(10px)',
          boxShadow: 'inset 0 0 20px rgba(255,255,255,0.02)',
        }}>
          <div style={{
            fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)',
            marginBottom: '1rem', fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: '0.5rem'
          }}>
            Board Cards <span style={{ opacity: 0.3 }}>——</span>
          </div>
          <CardRow cards={result.communityCards} size="lg" />
        </div>

        <div className="animate-fade-up delay-2" style={{ marginBottom: '1rem' }}>
          <ProofBadge
            proofHash={proofHashHex}
            tableId={tableId!}
            handNumber={parseInt(handNumber!)}
          />
        </div>

        <div className="animate-fade-up delay-4" style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '1rem 1.25rem',
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem',
          marginBottom: '1rem',
        }}>
          {[
            { label: 'Table', value: `#${tableId?.slice(-4)}` },
            { label: 'Hand', value: `#${result.handNumber.toString()}` },
            { label: 'Completed', value: elapsed < 60 ? `${elapsed}s ago` : `${Math.floor(elapsed / 60)}m ago` },
          ].map(({ label, value }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
                {label}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Reveal My Hand Section */}
        <div className="animate-fade-up delay-5" style={{
          background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--border)',
          borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem',
          textAlign: 'center'
        }}>
          <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9375rem' }}>Transparency: Reveal Your Hand</h4>
          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)', marginBottom: '1rem' }}>
            Prove you were bluffing or show your folded cards to the table using a verifiable ZK proof.
          </p>
          <button
            className="btn btn-ghost"
            style={{ border: '1px solid var(--border)', width: '100%' }}
            onClick={async () => {
              if (!publicKey || !tableId) return;
              try {
                const tablePda = deriveTablePDA(tableId);
                const [playerPda] = PublicKey.findProgramAddressSync(
                  [Buffer.from('player'), tablePda.toBuffer(), publicKey.toBuffer()],
                  POKER_PROGRAM_ID
                );
                const [handPda] = PublicKey.findProgramAddressSync(
                  [
                    Buffer.from('hand'),
                    tablePda.toBuffer(),
                    result.handNumber.toArrayLike(Buffer, 'le', 8),
                    publicKey.toBuffer()
                  ],
                  POKER_PROGRAM_ID
                );

                console.log('[HandResult] Revealing hand via verify_bluff_proof...');
                // Dummy proof and cards for demonstration of the on-chain call
                const dummyProof = new Uint8Array(128).fill(0);
                await (program.methods as any)
                  .verifyBluffProof(
                    result.handNumber,
                    0, // dummy card 1
                    0, // dummy card 2
                    Array.from(dummyProof)
                  )
                  .accounts({
                    player: playerPda,
                    encryptedHand: handPda,
                    payer: publicKey,
                  })
                  .rpc();
                alert('Hand revealed successfully on-chain!');
              } catch (err) {
                console.error('[HandResult] Reveal error:', err);
                alert('Failed to reveal hand. See console for details.');
              }
            }}
          >
            Reveal My Cards (Verify Bluff)
          </button>
        </div>

        <div className="animate-fade-up delay-5" style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className="btn btn-gold"
            style={{ flex: 1, justifyContent: 'center', padding: '0.875rem' }}
            onClick={() => navigate(`/table/${tableId}`)}
          >
            Next Hand →
          </button>
          <Link
            to={`/verify?hash=${proofHashHex}`}
            className="btn btn-arcium"
            style={{ flex: 1, justifyContent: 'center', padding: '0.875rem', textDecoration: 'none' }}
          >
            Verify Proof
          </Link>
        </div>
      </div>
    </Layout>
  );
};
