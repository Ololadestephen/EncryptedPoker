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
  const [menuOpen, setMenuOpen] = useState(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

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
        padding: '0 1rem',
        gap: '1rem',
        background: scrolled ? 'rgba(10,12,15,0.92)' : 'rgba(10,12,15,0.7)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        transition: 'all 0.3s var(--ease-out)',
      }}>
        {/* Logo */}
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <span style={{ fontSize: '1.375rem' }}>🂱</span>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '1rem',
            color: '#fff',
            letterSpacing: '-0.01em',
          }}>
            ENcrypted<span style={{ color: 'var(--gold)' }}>Poker</span>
          </span>
        </Link>

        {/* Desktop nav links */}
        <div style={{ display: isMobile ? 'none' : 'flex', gap: '0.25rem', flex: 1 }}>
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
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
          {/* Hide Arcium status on small mobile */}
          <div style={{ display: isMobile ? 'none' : 'flex' }}>
            <ArciumStatus status={arciumStatus} nodeCount={nodeCount} />
          </div>
          <WalletMultiButton
            style={{
              background: 'linear-gradient(135deg, var(--gold), var(--gold-2))',
              color: '#0a0c0f',
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: isMobile ? '0.75rem' : '0.8125rem',
              padding: isMobile ? '0.35rem 0.625rem' : '0.4rem 0.875rem',
              borderRadius: 6,
              height: 34,
              border: 'none',
              letterSpacing: '0.01em',
            }}
          />
          {/* Hamburger for mobile */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              display: isMobile ? 'flex' : 'none',
              flexDirection: 'column', gap: 5, padding: '0.5rem',
              background: 'transparent', border: 'none', cursor: 'pointer',
            }}
            aria-label="Menu"
          >
            <span style={{ width: 22, height: 2, background: 'rgba(255,255,255,0.7)', borderRadius: 2, display: 'block', transition: 'all 0.2s', transform: menuOpen ? 'rotate(45deg) translateY(7px)' : 'none' }} />
            <span style={{ width: 22, height: 2, background: 'rgba(255,255,255,0.7)', borderRadius: 2, display: 'block', opacity: menuOpen ? 0 : 1, transition: 'all 0.2s' }} />
            <span style={{ width: 22, height: 2, background: 'rgba(255,255,255,0.7)', borderRadius: 2, display: 'block', transition: 'all 0.2s', transform: menuOpen ? 'rotate(-45deg) translateY(-7px)' : 'none' }} />
          </button>
        </div>
      </nav>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div style={{
          position: 'fixed', top: 60, left: 0, right: 0,
          background: 'rgba(10,12,15,0.97)', backdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border)', zIndex: 99,
          display: 'flex', flexDirection: 'column', padding: '0.5rem',
        }}>
          {navLinks.map(({ to, label }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                style={{
                  padding: '0.875rem 1rem', textDecoration: 'none',
                  fontSize: '1rem', fontWeight: 500,
                  color: active ? 'var(--gold)' : 'rgba(255,255,255,0.75)',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 6,
                }}
              >
                {label}
              </Link>
            );
          })}
          <div style={{ padding: '0.75rem 1rem' }}>
            <ArciumStatus status={arciumStatus} nodeCount={nodeCount} />
          </div>
        </div>
      )}

      {/* Page content */}
      <main style={{ flex: 1 }}>
        {children}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '1rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.75rem',
        color: 'rgba(255,255,255,0.28)',
        gap: '1rem',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>🂱</span>
          <span style={{ fontFamily: 'var(--font-display)' }}>ENcryptedPoker</span>
          <span>·</span>
          <span>Solana Devnet</span>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <span>Built on <span style={{ color: 'var(--arcium)' }}>Arcium MPC</span></span>
          <a
            href="https://github.com/Ololadestephen/EncryptedPoker"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'rgba(255,255,255,0.28)', textDecoration: 'none' }}
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
