// src/lib/card-utils.ts

/**
 * Deterministically shuffle a deck using a seed.
 * Fisher-Yates algorithm.
 */
function seededShuffle(seed: number): number[] {
    const deck = Array.from({ length: 52 }, (_, i) => i);
    let s = seed || 1;
    const next = () => {
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
        return (s >>> 0) / 0xffffffff;
    };

    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}
/**
 * Deterministically derive the full deck for a table/hand.
 */
export function buildDeck(tableId: string | number, handNum: number): number[] {
    const idStr = tableId.toString();
    const base = parseInt(idStr.slice(-10), 10) || 0;
    const seed = (base ^ (handNum * 1000003)) >>> 0;
    return seededShuffle(seed || 1);
}

/**
 * Deterministically derive stand-in cards for a table and hand.
 * @param tableId The table's unique identifier
 * @param handNumber The current hand number
 * @returns Array of 5 community cards [0-51]
 */
export function getStandinCards(tableId: any, handNumber: number = 0): number[] {
    const idStr = (tableId ?? '').toString();
    // Table IDs are numeric (e.g. 1771867061311). Hex parsing was a mistake for these IDs.
    // We'll use the last 10 digits as a base or the whole string if shorter.
    const base = parseInt(idStr.slice(-10), 10) || 0;
    // Mix in the hand number for entropy
    const seed = (base ^ (handNumber * 1000003)) >>> 0;
    const deck = seededShuffle(seed || 1);

    // Return the "board" slice of the deck.
    // We'll use deck[4..8] to allow for deck[0..3] to be hole cards if needed.
    return deck.slice(4, 9);
}

/**
 * Deterministically derive hole cards for a player.
 * @param walletBase58 The player's wallet address
 * @param tableId The table ID
 * @param handNumber The hand number
 */
export function getStandinHoleCards(walletBase58: string, tableId: string, handNumber: number): number[] {
    const idStr = tableId.toString();
    const base = parseInt(idStr.slice(-10), 10) || 0;
    // Unique seed per player/hand/table
    let walletSum = 0;
    for (let i = 0; i < walletBase58.length; i++) walletSum += walletBase58.charCodeAt(i);

    const seed = (base ^ (handNumber * 1000003) ^ walletSum) >>> 0;
    const deck = seededShuffle(seed || 1);
    return [deck[0], deck[1]];
}

export function isCardRevealed(index: number, phase: string): boolean {
    if (['Showdown', 'Complete'].includes(phase)) return true;
    if (phase === 'Waiting') return false;

    if (phase === 'PreFlop') return index < 2;
    if (phase === 'Flop') return index < 3;
    if (phase === 'Turn') return index < 4;
    if (phase === 'River') return index < 5;
    return false;
}
