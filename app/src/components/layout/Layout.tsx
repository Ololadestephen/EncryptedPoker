// src/components/layout/Layout.tsx
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { shortenWallet } from '../../types';

interface ArciumStatusProps {
  status: 'connecting' | 'active' | 'error';
  nodeCount?: number;
}

export const ArciumStatus: React.FC<ArciumStatusProps> = ({ status, nodeCount }) => (
  <div
    className={`arcium-badge ${status}`}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.375rem 0.75rem',
      borderRadius: 20,
      fontSize: '0.75rem',
      fontWeight: 500,
      letterSpacing: '0.04em',
      fontFamily: 'var(--font-mono)',
      border: `1px solid ${status === 'active' ? 'rgba(0,229,176,0.3)' :
        status === 'error' ? 'rgba(239,68,68,0.3)' :
          'rgba(255,255,255,0.1)'
        }`,
      background: status === 'active' ? 'var(--arcium-dim)' :
        status === 'error' ? 'var(--red-dim)' :
          'rgba(255,255,255,0.04)',
      color: status === 'active' ? 'var(--arcium)' :
        status === 'error' ? '#fca5a5' :
          'rgba(255,255,255,0.4)',
      transition: 'all 0.3s',
    }}
  >
    <span
      style={{
        width: 6, height: 6,
        borderRadius: '50%',
        background: status === 'active' ? 'var(--arcium)' :
          status === 'error' ? 'var(--red)' :
            'rgba(255,255,255,0.3)',
        animation: status === 'active' ? 'pulse-arcium 2s infinite' : 'none',
        flexShrink: 0,
      }}
    />
    <span>
      {status === 'active'
        ? `ARCIUM · ${nodeCount ?? 5} NODES`
        : status === 'error'
          ? 'ARCIUM OFFLINE'
          : 'ARCIUM CONNECTING'}
    </span>
    {status === 'active' && (
      <span style={{ color: 'rgba(0,229,176,0.5)' }}>🔒</span>
    )}
  </div>
);

interface LayoutProps {
  children: React.ReactNode;
  arciumStatus?: 'connecting' | 'active' | 'error';
  nodeCount?: number;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  arciumStatus = 'connecting',
  nodeCount = 5,
}) => {
  const { publicKey } = useWallet();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const navLinks = [
    { to: '/', label: 'Tables' },
    { to: '/feed', label: 'Audit Feed' },
    { to: publicKey ? `/profile/${publicKey.toString()}` : '/profile', label: 'Profile' },
    { to: '/verify', label: 'Verify' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <nav style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        height: 60,
        display: 'flex',
        alignItems: 'center',
        padding: '0 1.5rem',
        gap: '1.5rem',
        background: scrolled
          ? 'rgba(10,12,15,0.92)'
          : 'transparent',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        borderBottom: scrolled
          ? '1px solid rgba(255,255,255,0.06)'
          : '1px solid transparent',
        transition: 'all 0.3s var(--ease-out)',
      }}>
        {/* Logo */}
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
          <span style={{ fontSize: '1.375rem' }}>🂱</span>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '1.0625rem',
            color: '#fff',
            letterSpacing: '-0.01em',
          }}>
            ENcrypted<span style={{ color: 'var(--gold)' }}>Poker</span>
          </span>
        </Link>

        {/* Nav links */}
        <div style={{ display: 'flex', gap: '0.25rem', flex: 1 }}>
          {navLinks.map(({ to, label }) => {
            const active = location.pathname === to || location.pathname.startsWith(to + '/');
            return (
              <Link
                key={to}
                to={to}
                style={{
                  padding: '0.375rem 0.875rem',
                  borderRadius: 6,
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: active ? '#fff' : 'rgba(255,255,255,0.5)',
                  background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  if (!active) (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.8)';
                }}
                onMouseLeave={e => {
                  if (!active) (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.5)';
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: 'auto' }}>
          <ArciumStatus status={arciumStatus} nodeCount={nodeCount} />
          <WalletMultiButton
            style={{
              background: 'linear-gradient(135deg, var(--gold), var(--gold-2))',
              color: '#0a0c0f',
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: '0.8125rem',
              padding: '0.4rem 0.875rem',
              borderRadius: 6,
              height: 34,
              border: 'none',
              letterSpacing: '0.01em',
            }}
          />
        </div>
      </nav>

      {/* Page content */}
      <main style={{ flex: 1 }}>
        {children}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.75rem',
        color: 'rgba(255,255,255,0.28)',
        gap: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>🂱</span>
          <span style={{ fontFamily: 'var(--font-display)' }}>ENcryptedPoker</span>
          <span>·</span>
          <span>Solana Devnet</span>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <span>Built on <span style={{ color: 'var(--arcium)' }}>Arcium MPC</span></span>
          <a
            href="https://github.com/arcium-hq/examples"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'rgba(255,255,255,0.28)', textDecoration: 'none' }}
            onMouseEnter={e => (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.6)'}
            onMouseLeave={e => (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.28)'}
          >
            GitHub
          </a>
          <Link to="/verify" style={{ color: 'rgba(255,255,255,0.28)', textDecoration: 'none' }}>
            Verify Proofs
          </Link>
        </div>
      </footer>
    </div>
  );
};
