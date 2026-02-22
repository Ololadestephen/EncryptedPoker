// src/hooks/useTableRealtime.ts
// Solana account subscription with real Anchor decoding

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { TableData, PlayerData } from '../types';
import { POKER_PROGRAM_ID } from '../lib/constants';
import idl from '../idl/encrypted_poker.json';

const HEARTBEAT_INTERVAL_MS = 3000; // Aggressive 3s poll for hackathon responsiveness

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
  } catch {
    // Not a number — fall through
  }

  // Case 2: the string is already a valid base58 pubkey (the table PDA itself)
  try {
    const pk = new PublicKey(cleaned);
    return pk; // Already the account address — use it directly
  } catch {
    // Not a valid pubkey — fall through
  }

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

  const fetchTableData = useCallback(async (tid: string) => {
    if (!mountedRef.current) return;
    try {
      const pda = deriveTablePDA(tid);
      const tableAcc = await (program.account as any).table.fetch(pda);

      if (mountedRef.current) {
        setTable(tableAcc);
      }

      // Fetch all players for this table
      const playerAccounts = await (program.account as any).player.all([
        { memcmp: { offset: 8 + 1 + 32, bytes: pda.toBase58() } }
      ]);

      if (mountedRef.current) {
        const sortedPlayers = playerAccounts
          .map((p: any) => ({
            ...(p.account as PlayerData),
            publicKey: p.publicKey,
          }))
          .sort((a: any, b: any) => a.seatIndex - b.seatIndex);

        setPlayers(sortedPlayers);
      }

      // Fetch current player's hand if seated
      if (publicKey && mountedRef.current) {
        try {
          const [handPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('hand'), pda.toBuffer(), publicKey.toBuffer()],
            POKER_PROGRAM_ID
          );
          const handAcc = await (program.account as any).encryptedHand.fetch(handPda);
          if (mountedRef.current) setMyHand(handAcc);
        } catch {
          if (mountedRef.current) setMyHand(null);
        }
      } else if (mountedRef.current) {
        setMyHand(null);
      }
    } catch (err: any) {
      console.error('[useTableRealtime] Fetch error:', err);
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [program, publicKey]);

  useEffect(() => {
    mountedRef.current = true;
    if (!tableId) { setIsLoading(false); return; }

    fetchTableData(tableId);

    const pda = deriveTablePDA(tableId);

    const tSub = connection.onAccountChange(pda, () => {
      fetchTableData(tableId);
      setConnectionMode('ws');
    }, 'confirmed');

    subIdsRef.current.push(tSub);

    const poll = setInterval(() => {
      fetchTableData(tableId);
      // If we're polling, we might have lost WS? 
      // This is a simplified check
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      subIdsRef.current.forEach(id => connection.removeAccountChangeListener(id));
      subIdsRef.current = [];
      clearInterval(poll);
    };
  }, [tableId, connection, fetchTableData, publicKey]);

  const refetch = useCallback(() => {
    if (tableId) fetchTableData(tableId);
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
