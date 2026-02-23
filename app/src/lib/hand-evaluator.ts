// src/lib/hand-evaluator.ts
import { HAND_NAMES } from '../types';

/**
 * Very basic poker hand evaluator for UI hints.
 * Not meant for authoritative showdown resolution (that's Arcium's job).
 * Returns the index into HAND_NAMES and a descriptive string.
 */
export function evaluateHand(cards: number[]): { category: number; label: string } {
    if (!cards || cards.length < 2) return { category: 0, label: 'Waiting...' };

    // Filter out invalid/face-down cards
    const validCards = cards.filter(v => v >= 0 && v < 52);
    if (validCards.length < 2) return { category: 0, label: 'High Card' };

    const ranks = validCards.map(v => v % 13).sort((a, b) => b - a);
    const suits = validCards.map(v => Math.floor(v / 13));
    const RANK_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King', 'Ace'];

    // Count frequencies
    const rankCounts: Record<number, number> = {};
    ranks.forEach(r => rankCounts[r] = (rankCounts[r] || 0) + 1);
    const sortedCounts = Object.entries(rankCounts)
        .map(([r, c]) => ({ rank: parseInt(r), count: c }))
        .sort((a, b) => b.count - a.count || b.rank - a.rank);

    const counts = sortedCounts.map(x => x.count);

    // Check for flush
    const suitCounts: Record<number, number> = {};
    suits.forEach(s => suitCounts[s] = (suitCounts[s] || 0) + 1);
    const flushSuitEntry = Object.entries(suitCounts).find(([_, c]) => c >= 5);
    const isFlush = !!flushSuitEntry;
    const isFlushDraw = !isFlush && Object.values(suitCounts).some(c => c === 4);

    // Check for straight
    const uniqueRanks = Array.from(new Set(ranks)).sort((a, b) => b - a);
    let isStraight = false;
    let straightHigh = -1;
    if (uniqueRanks.length >= 5) {
        for (let i = 0; i <= uniqueRanks.length - 5; i++) {
            if (uniqueRanks[i] - uniqueRanks[i + 4] === 4) {
                isStraight = true;
                straightHigh = uniqueRanks[i];
                break;
            }
        }
        // Ace-low straight
        if (!isStraight && uniqueRanks.includes(12) && [0, 1, 2, 3].every(r => uniqueRanks.includes(r))) {
            isStraight = true;
            straightHigh = 3; // 5 is high
        }
    }

    // Straight Draw detection (4 in a row)
    let isStraightDraw = false;
    if (!isStraight && uniqueRanks.length >= 4) {
        for (let i = 0; i <= uniqueRanks.length - 4; i++) {
            if (uniqueRanks[i] - uniqueRanks[i + 3] === 3) {
                isStraightDraw = true;
                break;
            }
        }
        // Ace-low draw
        if (!isStraightDraw && [12, 0, 1, 2].every(r => uniqueRanks.includes(r))) isStraightDraw = true;
        if (!isStraightDraw && [0, 1, 2, 3].every(r => uniqueRanks.includes(r))) isStraightDraw = true;
    }

    // Return the best category
    if (isStraight && isFlush) return { category: 8, label: 'Straight Flush' };
    if (counts[0] === 4) return { category: 7, label: `Four of a Kind (${RANK_LABELS[sortedCounts[0].rank]}s)` };
    if (counts[0] === 3 && counts[1] >= 2) return { category: 6, label: `Full House (${RANK_LABELS[sortedCounts[0].rank]}s over ${RANK_LABELS[sortedCounts[1].rank]}s)` };
    if (isFlush) return { category: 5, label: `Flush` };
    if (isStraight) return { category: 4, label: `Straight (${RANK_LABELS[straightHigh]} High)` };
    if (counts[0] === 3) return { category: 3, label: `Three of a Kind (${RANK_LABELS[sortedCounts[0].rank]}s)` };
    if (counts[0] === 2 && counts[1] === 2) return { category: 2, label: `Two Pair (${RANK_LABELS[sortedCounts[0].rank]}s & ${RANK_LABELS[sortedCounts[1].rank]}s)` };
    if (counts[0] === 2) return { category: 1, label: `Pair of ${RANK_LABELS[sortedCounts[0].rank]}s` };

    // Draw hints (only show if nothing else)
    if (isFlushDraw && isStraightDraw) return { category: 0.5, label: 'Straight & Flush Draw' };
    if (isFlushDraw) return { category: 0.5, label: 'Flush Draw' };
    if (isStraightDraw) return { category: 0.5, label: 'Straight Draw' };

    return { category: 0, label: `High Card ${RANK_LABELS[ranks[0]]}` };
}
