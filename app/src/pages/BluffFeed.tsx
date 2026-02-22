import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { Layout } from '../components/layout/Layout';
import { GameResultData, HAND_NAMES, formatChips, shortenWallet } from '../types';
import { POKER_PROGRAM_ID } from '../lib/constants';
import idl from '../idl/encrypted_poker.json';

export const BluffFeedPage: React.FC = () => {
    const { connection } = useConnection();
    const navigate = useNavigate();
    const [results, setResults] = useState<{ publicKey: PublicKey; account: GameResultData }[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const program = useMemo(() => {
        const provider = new anchor.AnchorProvider(connection, {} as any, { commitment: 'confirmed' });
        return new anchor.Program(idl as any, provider);
    }, [connection]);

    useEffect(() => {
        async function fetchResults() {
            try {
                const allResults = await (program.account as any).gameResult.all();
                // Sort by timestamp descending
                const sorted = allResults.sort((a: any, b: any) =>
                    b.account.timestamp.toNumber() - a.account.timestamp.toNumber()
                );
                setResults(sorted);
            } catch (err) {
                console.error('[BluffFeed] Error fetching results:', err);
            } finally {
                setIsLoading(false);
            }
        }
        fetchResults();
    }, [program]);

    return (
        <Layout arciumStatus="active">
            <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.5rem' }}>
                <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
                    <h1 style={{
                        fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 800,
                        marginBottom: '0.75rem', letterSpacing: '-0.02em'
                    }}>
                        The <span className="gradient-text">Liar's Den</span>
                    </h1>
                    <p style={{ color: 'rgba(255,255,255,0.45)', maxWidth: 600, margin: '0 auto', fontSize: '1rem' }}>
                        A global audit log of every Arcium-verified hand. Transparency, guaranteed by multi-party computation.
                    </p>
                </div>

                {isLoading ? (
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {[1, 2, 3].map(i => (
                            <div key={i} className="skeleton" style={{ height: 100, borderRadius: 12 }} />
                        ))}
                    </div>
                ) : results.length === 0 ? (
                    <div style={{
                        textAlign: 'center', padding: '4rem 2rem',
                        background: 'var(--surface)', borderRadius: 16, border: '1px dashed var(--border)'
                    }}>
                        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📜</div>
                        <h3 style={{ marginBottom: '0.5rem' }}>No Hands Recorded Yet</h3>
                        <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: '1.5rem' }}>
                            Be the first to create a table and settle a hand on Arcium.
                        </p>
                        <Link to="/create" className="btn btn-gold">Create Table</Link>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {results.map(({ publicKey, account }) => {
                            const elapsed = Math.floor((Date.now() - account.timestamp.toNumber() * 1000) / 1000);
                            const timeStr = elapsed < 60 ? `${elapsed}s ago` :
                                elapsed < 3600 ? `${Math.floor(elapsed / 60)}m ago` :
                                    `${Math.floor(elapsed / 3600)}h ago`;

                            const winner = account.winners[0];
                            const winnerName = shortenWallet(winner.toBase58());
                            const handName = HAND_NAMES[account.winningHandCategory] ?? 'Hand';

                            return (
                                <div
                                    key={publicKey.toBase58()}
                                    className="glass-card animate-fade-up"
                                    style={{
                                        padding: '1.25rem 1.5rem',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        cursor: 'pointer',
                                        transition: 'transform 0.2s',
                                    }}
                                    onClick={() => navigate(`/table/${account.table.toBase58()}/result/${account.handNumber.toString()}`)}
                                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                        <div style={{
                                            width: 48, height: 48, borderRadius: 12,
                                            background: 'rgba(0,229,176,0.1)', border: '1px solid rgba(0,229,176,0.2)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '1.25rem'
                                        }}>
                                            🃏
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 600, color: '#fff', fontSize: '1rem', marginBottom: '0.25rem' }}>
                                                {winnerName} won with <span style={{ color: 'var(--gold)' }}>{handName}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono)' }}>
                                                    Table: {account.table.toBase58().slice(0, 4)}...
                                                </span>
                                                <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                                                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono)' }}>
                                                    Hand #{account.handNumber.toString()}
                                                </span>
                                                <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                                                <span style={{ fontSize: '0.75rem', color: 'var(--arcium)' }}>
                                                    Verified ✓
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{
                                            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.125rem',
                                            color: 'var(--gold)', marginBottom: '0.125rem'
                                        }}>
                                            +{formatChips(account.payouts[0])}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {timeStr}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Layout>
    );
};
