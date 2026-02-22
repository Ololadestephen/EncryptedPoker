// src/hooks/useTableRealtime.ts
// Solana account subscription with real Anchor decoding

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { TableData, PlayerData } from '../types';
import { POKER_PROGRAM_ID } from '../lib/constants';
import idl from '../idl/encrypted_poker.json';

const HEARTBEAT_BASE_MS = 3000; // Faster refresh as requested (Helius)
const FETCH_COOLDOWN_MS = 1000; // Lower cooldown for snappier UI

function getCacheKey(tid: string) {
  return `enpoker_players_${tid}`;
}

export function deriveTablePDA(tableId: string): PublicKey {
  const cleaned = tableId.replace('table-', '');

  // Case 1: numeric u64 table_id — derive PDA from seeds
  try {
    const tid = new anchor.BN(cleaned);
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('table'), tid.toArrayLike(Buffer, 'le', 8)],
      POKER_PROGRAM_ID
    );
    return pda;
  } catch { /* ignored */ }

  // Case 2: the string is already a valid base58 pubkey (the table PDA itself)
  try {
    const pk = new PublicKey(cleaned);
    return pk; // Already the account address — use it directly
  } catch { /* ignored */ }

  // Case 3: raw string fallback (local dev / test)
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('table'), Buffer.from(cleaned)],
    POKER_PROGRAM_ID
  );
  return pda;
}

export function useTableRealtime(tableId: string | null) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [table, setTable] = useState<TableData | null>(null);
  const [players, setPlayers] = useState<(PlayerData & { publicKey: PublicKey })[]>([]);
  const [myHand, setMyHand] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState<'ws' | 'polling' | 'disconnected'>('ws');

  const program = useMemo(() => {
    const provider = new anchor.AnchorProvider(connection, {} as any, { commitment: 'confirmed' });
    return new anchor.Program(idl as any, provider);
  }, [connection]);

  const mountedRef = useRef(true);
  const subIdsRef = useRef<number[]>([]);
  const lastFetchRef = useRef<number>(0);

  // High-performance state tracking to avoid stale closures
  const tableRef = useRef<TableData | null>(null);
  const playersRef = useRef<(PlayerData & { publicKey: PublicKey })[]>([]);

  // Sync refs with state
  useEffect(() => { tableRef.current = table; }, [table]);
  useEffect(() => { playersRef.current = players; }, [players]);

  // Load from cache on startup
  useEffect(() => {
    if (!tableId) return;
    try {
      const cached = localStorage.getItem(getCacheKey(tableId));
      if (cached) {
        const parsed = JSON.parse(cached);
        // Convert string pubkeys back to PublicKey objects
        const hydrated = parsed.map((p: any) => ({
          ...p,
          publicKey: new PublicKey(p.publicKey),
          wallet: new PublicKey(p.wallet),
        }));
        setPlayers(hydrated);
        playersRef.current = hydrated;
        console.log('[useTableRealtime] Loaded players from cache');
      }
    } catch (e) {
      console.warn('Failed to load player cache', e);
    }
  }, [tableId]);

  // Decoupled fetching with recovery logic
  const fetchTableData = useCallback(async (tid: string, force = false) => {
    if (!mountedRef.current) return;

    const now = Date.now();
    if (!force && now - lastFetchRef.current < FETCH_COOLDOWN_MS) return;
    lastFetchRef.current = now;

    let tableToUse = tableRef.current;

    // 1. Fetch Table (The root of truth)
    try {
      const pda = deriveTablePDA(tid);
      const tableAcc = await (program.account as any).table.fetch(pda);
      if (mountedRef.current) {
        setTable(tableAcc);
        tableRef.current = tableAcc;
        tableToUse = tableAcc;
        setError(null);
      }
    } catch (err: any) {
      if (err.message?.includes('429')) {
        console.warn('[useTableRealtime] Table fetch limited (429)');
      } else {
        console.error('[useTableRealtime] Table fetch failed:', err);
        if (mountedRef.current) setError(err.message); // Only set error if table fetch fails
      }
    }

    if (!tableToUse) {
      if (mountedRef.current && isLoading) setIsLoading(false);
      return;
    }

    // 2. Fetch Players (Only if count changed or forced)
    // We fetch if: count mismatch, list empty, or forced
    const currentList = playersRef.current;
    const shouldFetchPlayers = force ||
      tableToUse.currentPlayers !== currentList.length ||
      currentList.length === 0;

    if (shouldFetchPlayers) {
      try {
        const pda = deriveTablePDA(tid);
        const playerAccounts = await (program.account as any).player.all([
          { memcmp: { offset: 41, bytes: pda.toBase58() } }
        ]);

        if (mountedRef.current) {
          const sorted = playerAccounts
            .map((p: any) => ({ ...(p.account as PlayerData), publicKey: p.publicKey }))
            .sort((a: any, b: any) => a.seatIndex - b.seatIndex);

          setPlayers(sorted);
          playersRef.current = sorted;

          // Save to cache
          localStorage.setItem(getCacheKey(tid), JSON.stringify(sorted.map((p: any) => ({
            ...p,
            publicKey: p.publicKey.toBase58(),
            wallet: p.wallet.toBase58(),
          }))));
        }
      } catch (err: any) {
        if (err.message?.includes('429')) {
          console.warn('[useTableRealtime] Player fetch limited (429) - keeping stale list');
        } else {
          console.error('[useTableRealtime] Player fetch failed:', err);
        }
        // Don't clear players on error, keep "stale" state for continuity
      }
    }

    // 3. Fetch Hand (Only if seated and game running)
    const isSeated = playersRef.current.some(p => p.wallet.toBase58() === publicKey?.toBase58());
    const gameRunning = tableToUse.phase && !('waiting' in tableToUse.phase);

    if (publicKey && isSeated && gameRunning) {
      try {
        const pda = deriveTablePDA(tid);
        const [handPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('hand'), pda.toBuffer(), publicKey.toBuffer()],
          POKER_PROGRAM_ID
        );
        const handAcc = await (program.account as any).encryptedHand.fetch(handPda);
        if (mountedRef.current) setMyHand(handAcc);
      } catch {
        // Silently preserve cards or stay empty if not dealt yet
      }
    } else if (mountedRef.current) {
      setMyHand(null);
    }

    if (mountedRef.current && isLoading) setIsLoading(false);
  }, [program, publicKey, isLoading]);

  useEffect(() => {
    mountedRef.current = true;
    if (!tableId) { setIsLoading(false); return; }

    fetchTableData(tableId, true);

    const pda = deriveTablePDA(tableId);
    const tSub = connection.onAccountChange(pda, () => {
      fetchTableData(tableId);
      setConnectionMode('ws');
    }, 'confirmed');

    subIdsRef.current.push(tSub);

    // Dynamic Polling with Jitter (5s jitter on 15s base)
    const pollWithJitter = () => {
      if (!mountedRef.current) return;
      fetchTableData(tableId);
      const nextInterval = HEARTBEAT_BASE_MS + (Math.random() * 5000);
      setTimeout(pollWithJitter, nextInterval);
    };

    const jitterTimeout = setTimeout(pollWithJitter, HEARTBEAT_BASE_MS);

    return () => {
      mountedRef.current = false;
      subIdsRef.current.forEach(id => connection.removeAccountChangeListener(id));
      subIdsRef.current = [];
      clearTimeout(jitterTimeout);
    };
  }, [tableId, connection, fetchTableData]);

  const refetch = useCallback(() => {
    if (tableId) fetchTableData(tableId, true);
  }, [tableId, fetchTableData]);

  return { table, players, myHand, isLoading, error, connectionMode, refetch };
}

export function useTurnTimer(lastActionTs: number | anchor.BN, timeBankSecs: number | anchor.BN) {
  const ts = typeof lastActionTs === 'number' ? lastActionTs : (lastActionTs as anchor.BN).toNumber();
  const bank = typeof timeBankSecs === 'number' ? timeBankSecs : (timeBankSecs as anchor.BN).toNumber();

  const [remaining, setRemaining] = useState(bank);

  useEffect(() => {
    if (ts === 0) {
      setRemaining(bank);
      return;
    }
    const tick = () => {
      const elapsed = Date.now() / 1000 - ts;
      const left = Math.max(0, bank - elapsed);
      setRemaining(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [ts, bank]);

  const pct = (remaining / bank) * 100;
  const urgent = remaining < 10;
  const critical = remaining < 5;

  return { remaining: Math.ceil(remaining), pct, urgent, critical };
}
