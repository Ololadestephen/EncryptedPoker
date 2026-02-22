
export function parseTxError(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();

    if (lower.includes('insufficient funds for rent') || lower.includes('insufficient lamports')) {
        return 'Insufficient SOL — please top up your wallet and try again.';
    }
    if (lower.includes('insufficient funds')) {
        return 'Insufficient balance to complete this transaction.';
    }
    if (lower.includes('user rejected') || lower.includes('user denied')) {
        return 'Transaction cancelled.';
    }
    if (lower.includes('blockhash not found') || lower.includes('blockhash expired')) {
        return 'Transaction expired — please try again.';
    }
    if (lower.includes('already in use') || lower.includes('already initialized')) {
        return 'This account is already set up.';
    }
    if (lower.includes('already joined') || lower.includes('seat taken')) {
        return 'That seat is already taken.';
    }
    if (lower.includes('table full') || lower.includes('max players')) {
        return 'Table is full.';
    }
    if (lower.includes('not your turn')) {
        return "It's not your turn.";
    }
    if (lower.includes('game already started') || lower.includes('gamealreadystarted')) {
        return 'This table already has a game in progress. Create a new table to join.';
    }
    if (lower.includes('wrong phase') || lower.includes('invalidphase')) {
        return 'Action not allowed at this stage of the game.';
    }
    if (lower.includes('simulation failed')) {
        return 'Transaction failed — your wallet may not have enough SOL.';
    }
    if (lower.includes('timeout') || lower.includes('timed out')) {
        return 'Request timed out — check your connection and try again.';
    }
    if (lower.includes('network') || lower.includes('failed to fetch')) {
        return 'Network error — check your connection and try again.';
    }

    // Fallback: truncate the raw message so it's not a wall of text
    return msg.length > 80 ? msg.slice(0, 80) + '…' : msg;
}
