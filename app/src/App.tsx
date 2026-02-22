// src/App.tsx
import React, { useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { SOLANA_RPC_URL } from './lib/constants';

// Pages
import { LobbyPage } from './pages/Lobby';
import { CreateTablePage } from './pages/CreateTable';
import { GameTablePage } from './pages/GameTable';
import { HandResultPage } from './pages/HandResult';
import { ProofVerifierPage } from './pages/ProofVerifier';
import { PlayerProfilePage } from './pages/PlayerProfile';
import { BluffFeedPage } from './pages/BluffFeed';

// Styles
import './styles/globals.css';
import '@solana/wallet-adapter-react-ui/styles.css';

// RPC endpoint — change SOLANA_RPC_URL in src/lib/constants.ts to switch networks
const ENDPOINT = SOLANA_RPC_URL;

export default function App() {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={ENDPOINT}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <BrowserRouter>
            <Routes>
              {/* Lobby */}
              <Route path="/" element={<LobbyPage />} />

              {/* Audit Feed */}
              <Route path="/feed" element={<BluffFeedPage />} />

              {/* Create table */}
              <Route path="/create" element={<CreateTablePage />} />

              {/* Game table */}
              <Route path="/table/:tableId" element={<GameTablePage />} />

              {/* Hand result */}
              <Route path="/table/:tableId/result/:handNumber" element={<HandResultPage />} />

              {/* Proof verifier — also accepts ?hash= param */}
              <Route path="/verify" element={<ProofVerifierPage />} />
              <Route path="/verify/:hash" element={<ProofVerifierPage />} />

              {/* Player profile */}
              <Route path="/profile/:wallet" element={<PlayerProfilePage />} />
              <Route path="/profile" element={<PlayerProfilePage />} />

              {/* 404 fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
