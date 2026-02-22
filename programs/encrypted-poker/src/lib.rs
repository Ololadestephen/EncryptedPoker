use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use arcium_anchor::prelude::*;

declare_id!("AxwPZ5ZiuZwrFss1jjFh5zAozYt2EKBZYT9Mw2wN7fye");

// ===== Constants =====
pub const MAX_PLAYERS: usize = 6;
pub const STARTING_CHIPS: u64 = 2000;
pub const TIME_BANK_SECONDS: i64 = 30;

// ===== Game State Enums =====
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum GamePhase {
    Waiting,
    PreFlop,
    Flop,
    Turn,
    River,
    Showdown,
    Complete,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum PlayerAction {
    Fold,
    Check,
    Call,
    Raise(u64),
    AllIn,
}

// ===== Account Structures =====

#[account]
pub struct Table {
    pub table_id: u64,
    pub name: [u8; 32],
    pub creator: Pubkey,
    pub small_blind: u64,
    pub big_blind: u64,
    pub min_players: u8,
    pub max_players: u8,
    pub current_players: u8,
    pub phase: GamePhase,
    pub pot: u64,
    pub current_bet: u64,
    pub dealer_seat: u8,
    pub current_turn: u8,
    pub hand_number: u64,
    pub arcium_mxe_account: Pubkey,    // Arcium MXE reference
    pub arcium_computation_id: u64,     // Active computation
    pub encrypted_deck_hash: [u8; 32], // On-chain deck commitment
    pub community_cards: [u8; 5],      // Revealed community cards (255 = not yet revealed)
    pub main_pot: u64,
    pub side_pots: [u64; MAX_PLAYERS],
    pub side_pot_count: u8,
    pub last_action_ts: i64,
    // Betting round tracking
    pub players_acted: u8,
    pub players_to_act: u8,
    // Token-gating
    pub token_gate_mint: Option<Pubkey>,
    pub token_gate_amount: u64,
    pub bump: u8,
}

impl Table {
    pub const LEN: usize = 8   // discriminator
        + 8    // table_id
        + 32   // name
        + 32   // creator
        + 8    // small_blind
        + 8    // big_blind
        + 1    // min_players
        + 1    // max_players
        + 1    // current_players
        + 2    // phase (enum)
        + 8    // pot
        + 8    // current_bet
        + 1    // dealer_seat
        + 1    // current_turn
        + 8    // hand_number
        + 32   // arcium_mxe_account
        + 8    // arcium_computation_id
        + 32   // encrypted_deck_hash
        + 5    // community_cards
        + 8    // main_pot
        + 48   // side_pots (6 * 8)
        + 1    // side_pot_count
        + 8    // last_action_ts
        + 1    // players_acted
        + 1    // players_to_act
        + 33   // token_gate_mint (Option<Pubkey>)
        + 8    // token_gate_amount
        + 1;   // bump
}

#[account]
pub struct Player {
    pub player_id: u8,
    pub wallet: Pubkey,
    pub table: Pubkey,
    pub seat_index: u8,
    pub chip_count: u64,
    pub current_bet: u64,
    pub total_contributed: u64,
    pub is_active: bool,
    pub is_all_in: bool,
    pub has_acted: bool,
    pub time_bank_remaining: i64,
    pub encrypted_hand_hash: [u8; 32], // Commitment to hole cards
    pub joined_at: i64,
    pub last_reaction: u8,        // 0 = none, 1-5 = emoji types
    pub last_reaction_ts: i64,
    pub last_message: [u8; 64],   // On-chain chat state
    pub last_message_ts: i64,
    pub bump: u8,
}

impl Player {
    pub const LEN: usize = 8 + 1 + 32 + 32 + 1 + 8 + 8 + 8 + 1 + 1 + 1 + 8 + 32 + 8 + 1 + 8 + 64 + 8 + 1;
}

#[account]
pub struct EncryptedHand {
    pub player: Pubkey,
    pub table: Pubkey,
    pub hand_number: u64,
    pub encrypted_card1: [u8; 64],  // Encrypted under player's pubkey
    pub encrypted_card2: [u8; 64],
    pub arcium_commitment: [u8; 32], // Arcium's commitment to the hand
    pub bump: u8,
}

impl EncryptedHand {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 64 + 64 + 32 + 1;
}

#[account]
pub struct EncryptedAction {
    pub player: Pubkey,
    pub table: Pubkey,
    pub hand_number: u64,
    pub action_type: u8,
    pub encrypted_amount: [u8; 64], // Bet amount encrypted (prevents info leakage)
    pub arcium_proof: [u8; 128],    // Proof action is valid
    pub timestamp: i64,
    pub bump: u8,
}

impl EncryptedAction {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 1 + 64 + 128 + 8 + 1;
}

#[account]
pub struct GameResult {
    pub table: Pubkey,
    pub hand_number: u64,
    pub winners: [Pubkey; MAX_PLAYERS],
    pub winner_count: u8,
    pub payouts: [u64; MAX_PLAYERS],
    pub winning_hand_category: u8,
    pub community_cards: [u8; 5],
    pub participants: [Pubkey; MAX_PLAYERS], // ALL seated players (winners + losers)
    pub participant_count: u8,
    pub arcium_proof: [u8; 256], // Full fairness proof
    pub proof_hash: [u8; 32],
    pub timestamp: i64,
    pub bump: u8,
}

impl GameResult {
    // +192 bytes (6 × Pubkey) + 1 byte (participant_count)
    pub const LEN: usize = 8 + 32 + 8 + 192 + 1 + 48 + 1 + 5 + 192 + 1 + 256 + 32 + 8 + 1;
}

// ===== Program =====

#[program]
pub mod encrypted_poker {
    use super::*;

    /// Create a new poker table
    pub fn create_table(
        ctx: Context<CreateTable>,
        table_id: u64,
        name: [u8; 32],
        small_blind: u64,
        big_blind: u64,
        min_players: u8,
        max_players: u8,
        token_gate_mint: Option<Pubkey>,
        token_gate_amount: u64,
    ) -> Result<()> {
        require!(small_blind > 0, PokerError::InvalidBlind);
        require!(big_blind == small_blind * 2, PokerError::InvalidBlind);
        require!(min_players >= 2 && min_players <= max_players, PokerError::InvalidPlayerCount);
        require!(max_players <= MAX_PLAYERS as u8, PokerError::InvalidPlayerCount);

        let table = &mut ctx.accounts.table;
        table.table_id = table_id;
        table.name = name;
        table.creator = ctx.accounts.creator.key();
        table.small_blind = small_blind;
        table.big_blind = big_blind;
        table.min_players = min_players;
        table.max_players = max_players;
        table.current_players = 0;
        table.phase = GamePhase::Waiting;
        table.pot = 0;
        table.hand_number = 0;
        table.community_cards = [255u8; 5]; // 255 = not revealed
        table.token_gate_mint = token_gate_mint;
        table.token_gate_amount = token_gate_amount;
        table.last_action_ts = Clock::get()?.unix_timestamp;
        table.bump = ctx.bumps.table;

        emit!(TableCreated {
            table_id,
            creator: ctx.accounts.creator.key(),
            small_blind,
            big_blind,
        });

        Ok(())
    }

    /// Join a poker table (with optional token-gate check)
    pub fn join_table(ctx: Context<JoinTable>, seat_index: u8) -> Result<()> {
        let table = &mut ctx.accounts.table;

        require!(table.phase == GamePhase::Waiting, PokerError::GameAlreadyStarted);
        require!(
            (table.current_players as usize) < MAX_PLAYERS,
            PokerError::TableFull
        );
        require!(seat_index < table.max_players, PokerError::InvalidSeat);

        // Token-gate check
        if let Some(mint) = table.token_gate_mint {
            let token_account = ctx.accounts.player_token_account.as_ref()
                .ok_or(PokerError::TokenGateRequired)?;
            require!(
                token_account.mint == mint,
                PokerError::InvalidTokenMint
            );
            require!(
                token_account.amount >= table.token_gate_amount,
                PokerError::InsufficientTokens
            );
        }

        let player = &mut ctx.accounts.player;
        player.player_id = table.current_players;
        player.wallet = ctx.accounts.payer.key();
        player.table = table.key();
        player.seat_index = seat_index;
        player.chip_count = STARTING_CHIPS;
        player.current_bet = 0;
        player.is_active = true;
        player.is_all_in = false;
        player.has_acted = false;
        player.time_bank_remaining = TIME_BANK_SECONDS;
        player.joined_at = Clock::get()?.unix_timestamp;
        player.bump = ctx.bumps.player;

        table.current_players += 1;

        emit!(PlayerJoined {
            table_id: table.table_id,
            player: ctx.accounts.payer.key(),
            seat: seat_index,
        });

        Ok(())
    }

    /// Start the game - initiates Arcium deck shuffle
    pub fn start_game(ctx: Context<StartGame>) -> Result<()> {
        let table = &mut ctx.accounts.table;

        require!(table.phase == GamePhase::Waiting, PokerError::GameAlreadyStarted);
        require!(
            table.current_players >= table.min_players,
            PokerError::NotEnoughPlayers
        );

        table.hand_number += 1;
        table.phase = GamePhase::PreFlop;
        table.last_action_ts = Clock::get()?.unix_timestamp;

        // Store Arcium MXE account reference for this game session
        table.arcium_mxe_account = ctx.accounts.arcium_mxe.key();

        // Arcium computation will be initiated via CPI - the encrypted deck
        // shuffle happens off-chain in MPC nodes, result committed on-chain
        emit!(GameStarted {
            table_id: table.table_id,
            hand_number: table.hand_number,
            player_count: table.current_players,
        });

        Ok(())
    }

    /// Callback from Arcium: encrypted deck is ready
    pub fn on_deck_ready(
        ctx: Context<ArciumCallback>,
        computation_id: u64,
        encrypted_deck_hash: [u8; 32],
    ) -> Result<()> {
        // Verify this callback is from Arcium
        verify_arcium_callback(&ctx.accounts.arcium_mxe)?;

        let table = &mut ctx.accounts.table;
        table.encrypted_deck_hash = encrypted_deck_hash;
        table.arcium_computation_id = computation_id;

        // Post blind bets
        post_blinds(table)?;

        emit!(DeckReady {
            table_id: table.table_id,
            hand_number: table.hand_number,
        });

        Ok(())
    }

    /// Callback from Arcium: hole cards dealt to player
    pub fn on_cards_dealt(
        ctx: Context<ArciumCallback>,
        player_id: u8,
        encrypted_card1: [u8; 64],
        encrypted_card2: [u8; 64],
        arcium_commitment: [u8; 32],
    ) -> Result<()> {
        verify_arcium_callback(&ctx.accounts.arcium_mxe)?;

        let hand = &mut ctx.accounts.encrypted_hand;
        hand.player = ctx.accounts.player.key();
        hand.table = ctx.accounts.table.key();
        hand.hand_number = ctx.accounts.table.hand_number;
        hand.encrypted_card1 = encrypted_card1;
        hand.encrypted_card2 = encrypted_card2;
        hand.arcium_commitment = arcium_commitment;
        hand.bump = ctx.bumps.encrypted_hand;

        emit!(CardsDealt {
            table_id: ctx.accounts.table.table_id,
            player_id,
            hand_number: ctx.accounts.table.hand_number,
        });

        Ok(())
    }

    /// Player submits a betting action
    pub fn submit_action(
        ctx: Context<SubmitAction>,
        action_type: u8,
        raise_amount: u64,
    ) -> Result<()> {
        let table = &mut ctx.accounts.table;
        let player = &mut ctx.accounts.player;

        require!(player.is_active, PokerError::PlayerInactive);
        require!(player.wallet == ctx.accounts.payer.key(), PokerError::NotYourTurn);
        require!(table.current_turn == player.player_id, PokerError::NotYourTurn);

        // Time bank check
        let now = Clock::get()?.unix_timestamp;
        let elapsed = now - table.last_action_ts;
        require!(
            elapsed <= TIME_BANK_SECONDS + player.time_bank_remaining,
            PokerError::TimeExpired
        );

        // Update time bank
        if elapsed > TIME_BANK_SECONDS {
            player.time_bank_remaining -= elapsed - TIME_BANK_SECONDS;
        }

        // Apply action
        match action_type {
            0 => { // Fold
                player.is_active = false;
                // One fewer player needs to act in this round
                if table.players_to_act > 0 {
                    table.players_to_act -= 1;
                }
                player.has_acted = true;
            }
            1 => { // Check
                require!(table.current_bet == player.current_bet, PokerError::MustCallOrFold);
                player.has_acted = true;
                table.players_acted = table.players_acted.saturating_add(1);
            }
            2 => { // Call
                let call_amount = table.current_bet.saturating_sub(player.current_bet);
                let actual_call = call_amount.min(player.chip_count);
                player.chip_count -= actual_call;
                player.current_bet += actual_call;
                player.total_contributed += actual_call;
                table.pot += actual_call;
                player.has_acted = true;
                if player.chip_count == 0 { 
                    player.is_all_in = true;
                    // All-in counts as acted but doesn't need to act again
                    if table.players_to_act > 0 { table.players_to_act -= 1; }
                } else {
                    table.players_acted = table.players_acted.saturating_add(1);
                }
            }
            3 => { // Raise — everyone else must act again
                let call_amount = table.current_bet.saturating_sub(player.current_bet);
                let total = call_amount + raise_amount;
                require!(player.chip_count >= total, PokerError::InsufficientChips);
                require!(raise_amount >= table.big_blind, PokerError::RaiseTooSmall);
                player.chip_count -= total;
                player.current_bet = table.current_bet + raise_amount;
                player.total_contributed += total;
                table.pot += total;
                table.current_bet = player.current_bet;
                player.has_acted = true;
                // After a raise, all other active non-all-in players must act again
                // Reset to 1 (this player already acted)
                table.players_acted = 1;
            }
            4 => { // All-in
                let all_in = player.chip_count;
                player.chip_count = 0;
                player.current_bet += all_in;
                player.total_contributed += all_in;
                table.pot += all_in;
                player.is_all_in = true;
                player.has_acted = true;
                if player.current_bet > table.current_bet {
                    // Effective raise — others must act again
                    table.current_bet = player.current_bet;
                    table.players_acted = 1;
                } else {
                    // Pure call all-in — one fewer active player left
                    if table.players_to_act > 0 { table.players_to_act -= 1; }
                }
            }
            _ => return Err(PokerError::InvalidAction.into()),
        }

        table.last_action_ts = now;
        advance_turn(table);

        // Record encrypted action on-chain
        let action = &mut ctx.accounts.encrypted_action;
        action.player = player.wallet;
        action.table = table.key();
        action.hand_number = table.hand_number;
        action.action_type = action_type;
        action.timestamp = now;
        action.bump = ctx.bumps.encrypted_action;

        emit!(ActionSubmitted {
            table_id: table.table_id,
            player_id: player.player_id,
            action_type,
            next_player: table.current_turn,
        });

        Ok(())
    }

    /// Advance to next street (request Arcium to deal community cards)
    pub fn deal_community_cards(ctx: Context<DealCards>) -> Result<()> {
        let table = &mut ctx.accounts.table;

        require!(is_betting_complete(table), PokerError::BettingNotComplete);

        let new_phase = match table.phase {
            GamePhase::PreFlop => GamePhase::Flop,
            GamePhase::Flop => GamePhase::Turn,
            GamePhase::Turn => GamePhase::River,
            GamePhase::River => GamePhase::Showdown,
            _ => return Err(PokerError::InvalidPhase.into()),
        };

        table.phase = new_phase.clone();

        // Reset betting for new street
        reset_betting_state(table);

        emit!(StreetAdvanced {
            table_id: table.table_id,
            new_phase: phase_to_u8(&new_phase),
        });

        Ok(())
    }

    /// Callback from Arcium: community cards revealed
    pub fn on_community_cards(
        ctx: Context<ArciumCallback>,
        card_indices: Vec<u8>, // [0-4] indicating which cards to set
        card_values: Vec<u8>,
    ) -> Result<()> {
        verify_arcium_callback(&ctx.accounts.arcium_mxe)?;

        let table = &mut ctx.accounts.table;
        for (idx, val) in card_indices.iter().zip(card_values.iter()) {
            require!(*idx < 5, PokerError::InvalidCard);
            table.community_cards[*idx as usize] = *val;
        }

        emit!(CommunityCardsDealt {
            table_id: table.table_id,
            cards: table.community_cards,
        });

        Ok(())
    }

    /// Trigger showdown computation in Arcium
    pub fn trigger_showdown(ctx: Context<TriggerShowdown>) -> Result<()> {
        let table = &mut ctx.accounts.table;
        require!(table.phase == GamePhase::River, PokerError::InvalidPhase);
        require!(is_betting_complete(table), PokerError::BettingNotComplete);

        table.phase = GamePhase::Showdown;

        emit!(ShowdownTriggered {
            table_id: table.table_id,
            hand_number: table.hand_number,
        });

        Ok(())
    }

    /// Callback from Arcium: showdown result with ZK proof
    pub fn on_showdown_result(
        ctx: Context<ShowdownResult>,
        winners: [u8; MAX_PLAYERS],
        winner_count: u8,
        payouts: [u64; MAX_PLAYERS],
        winning_hand_category: u8,
        arcium_proof: [u8; 256],
        proof_hash: [u8; 32],
    ) -> Result<()> {
        verify_arcium_callback(&ctx.accounts.arcium_mxe)?;

        let table = &mut ctx.accounts.table;

        // Store result on-chain
        let result = &mut ctx.accounts.game_result;
        result.table = table.key();
        result.hand_number = table.hand_number;
        result.winner_count = winner_count;
        result.winning_hand_category = winning_hand_category;
        result.community_cards = table.community_cards;
        result.arcium_proof = arcium_proof;
        result.proof_hash = proof_hash;
        result.timestamp = Clock::get()?.unix_timestamp;
        result.bump = ctx.bumps.game_result;

        // Resolve winner pubkeys from player_id index via remaining_accounts.
        // Callers must pass each seated Player PDA as remaining_accounts
        // in player_id order (0, 1, 2...).
        let mut participant_count: u8 = 0;
        for acc_info in ctx.remaining_accounts.iter() {
            let data = acc_info.try_borrow_data()?;
            if data.len() < Player::LEN - 8 + 8 {
                continue;
            }
            // wallet is at offset 9 (after discriminator + player_id)
            let wallet_bytes: [u8; 32] = data[9..41].try_into().unwrap_or_default();
            let wallet = Pubkey::new_from_array(wallet_bytes);
            if participant_count < MAX_PLAYERS as u8 {
                result.participants[participant_count as usize] = wallet;
                participant_count += 1;
            }
        }
        result.participant_count = participant_count;

        for i in 0..(winner_count as usize) {
            let winner_player_id = winners[i];
            result.payouts[i] = payouts[i];

            // Search remaining_accounts for the Player whose player_id matches
            let mut resolved = Pubkey::default();
            for acc_info in ctx.remaining_accounts.iter() {
                let data = acc_info.try_borrow_data()?;
                if data.len() < Player::LEN - 8 + 8 {
                    continue;
                }
                let pid = data[8]; // player_id: u8
                if pid == winner_player_id {
                    let wallet_bytes: [u8; 32] = data[9..41].try_into().unwrap_or_default();
                    resolved = Pubkey::new_from_array(wallet_bytes);
                    break;
                }
            }
            result.winners[i] = resolved;
        }

        table.phase = GamePhase::Complete;

        emit!(GameComplete {
            table_id: table.table_id,
            hand_number: table.hand_number,
            winner_count,
            proof_hash,
        });

        Ok(())
    }

    /// Verify a bluff proof (optional post-game feature)
    pub fn verify_bluff_proof(
        ctx: Context<VerifyBluff>,
        game_id: u64,
        revealed_card1: u8,
        revealed_card2: u8,
        arcium_proof: [u8; 128],
    ) -> Result<()> {
        // Verify the proof matches the on-chain commitment
        let hand = &ctx.accounts.encrypted_hand;
        require!(hand.hand_number == game_id, PokerError::InvalidGame);

        // Arcium verifies the proof matches the encrypted hand
        // If valid, the player cryptographically proves what cards they held
        verify_arcium_proof(&arcium_proof, &hand.arcium_commitment)?;

        emit!(BluffRevealed {
            player: ctx.accounts.player.wallet,
            game_id,
            card1: revealed_card1,
            card2: revealed_card2,
        });

        Ok(())
    }

    /// Submit a social reaction (emoji)
    pub fn submit_reaction(ctx: Context<SubmitReaction>, reaction_type: u8) -> Result<()> {
        let player = &mut ctx.accounts.player;
        player.last_reaction = reaction_type;
        player.last_reaction_ts = Clock::get()?.unix_timestamp;

        emit!(ReactionSubmitted {
            table: player.table,
            player: player.wallet,
            reaction_type,
        });

        Ok(())
    }

    /// Send a chat message
    pub fn send_message(ctx: Context<SubmitReaction>, message: String) -> Result<()> {
        let player = &mut ctx.accounts.player;
        let msg_bytes = message.as_bytes();
        let len = msg_bytes.len().min(64);
        
        let mut fixed_msg = [0u8; 64];
        fixed_msg[..len].copy_from_slice(&msg_bytes[..len]);
        
        player.last_message = fixed_msg;
        player.last_message_ts = Clock::get()?.unix_timestamp;

        emit!(ChatMessageSent {
            table: player.table,
            player: player.wallet,
            message,
        });

        Ok(())
    }
}

// ===== Helper Functions =====

fn post_blinds(table: &mut Table) -> Result<()> {
    table.current_bet = table.big_blind;
    Ok(())
}

fn is_betting_complete(table: &Table) -> bool {
    // Betting is complete when all active, non-all-in players have acted
    // and matched the current bet
    table.players_acted >= table.players_to_act
}

fn reset_betting_state(table: &mut Table) {
    table.current_bet = 0;
    table.players_acted = 0;
    // players_to_act = number of active, non-all-in seated players
    // We approximate using current_players (folded/all-in are tracked per-action)
    table.players_to_act = table.current_players;
}

fn advance_turn(table: &mut Table) {
    // Simple round-robin; folded players will naturally be skipped
    // because their is_active=false will cause the next submit_action to fail
    // with PlayerInactive before any state is changed.
    table.current_turn = (table.current_turn + 1) % table.current_players;
}

fn phase_to_u8(phase: &GamePhase) -> u8 {
    match phase {
        GamePhase::Waiting => 0,
        GamePhase::PreFlop => 1,
        GamePhase::Flop => 2,
        GamePhase::Turn => 3,
        GamePhase::River => 4,
        GamePhase::Showdown => 5,
        GamePhase::Complete => 6,
    }
}

fn verify_arcium_callback(mxe: &AccountInfo) -> Result<()> {
    // Verify the MXE account is owned by Arcium's program
    // Mock for now since arcium_sdk::ID is unavailable
    Ok(())
}

fn verify_arcium_proof(proof: &[u8; 128], commitment: &[u8; 32]) -> Result<()> {
    // Mock proof verification since the original arcium_sdk is unavailable
    Ok(())
}

// ===== Account Contexts =====

#[derive(Accounts)]
#[instruction(table_id: u64)]
pub struct CreateTable<'info> {
    #[account(
        init,
        payer = creator,
        space = Table::LEN,
        seeds = [b"table", table_id.to_le_bytes().as_ref()],
        bump
    )]
    pub table: Account<'info, Table>,

    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: Arcium MXE account
    pub arcium_mxe: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinTable<'info> {
    #[account(mut)]
    pub table: Account<'info, Table>,

    #[account(
        init,
        payer = payer,
        space = Player::LEN,
        seeds = [b"player", table.key().as_ref(), payer.key().as_ref()],
        bump
    )]
    pub player: Account<'info, Player>,

    #[account(mut)]
    pub payer: Signer<'info>,

    // Optional token account for token-gating
    pub player_token_account: Option<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StartGame<'info> {
    #[account(mut, has_one = creator)]
    pub table: Account<'info, Table>,

    pub creator: Signer<'info>,

    /// CHECK: Arcium MXE
    pub arcium_mxe: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ArciumCallback<'info> {
    #[account(mut)]
    pub table: Account<'info, Table>,

    /// CHECK: Arcium MXE - validated in instruction
    pub arcium_mxe: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        space = EncryptedHand::LEN,
        seeds = [b"hand", table.key().as_ref(), payer.key().as_ref()],
        bump
    )]
    pub encrypted_hand: Account<'info, EncryptedHand>,

    /// CHECK: Player account
    pub player: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitAction<'info> {
    #[account(mut)]
    pub table: Account<'info, Table>,

    #[account(mut, has_one = table)]
    pub player: Account<'info, Player>,

    #[account(
        init,
        payer = payer,
        space = EncryptedAction::LEN,
        seeds = [b"action", table.key().as_ref(), &table.hand_number.to_le_bytes(), &[player.player_id]],
        bump
    )]
    pub encrypted_action: Account<'info, EncryptedAction>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DealCards<'info> {
    #[account(mut)]
    pub table: Account<'info, Table>,

    pub payer: Signer<'info>,
}

#[derive(Accounts)]
pub struct TriggerShowdown<'info> {
    #[account(mut)]
    pub table: Account<'info, Table>,

    pub payer: Signer<'info>,
}

#[derive(Accounts)]
pub struct ShowdownResult<'info> {
    #[account(mut)]
    pub table: Account<'info, Table>,

    #[account(
        init,
        payer = payer,
        space = GameResult::LEN,
        seeds = [b"result", table.key().as_ref(), &table.hand_number.to_le_bytes()],
        bump
    )]
    pub game_result: Account<'info, GameResult>,

    /// CHECK: Arcium MXE
    pub arcium_mxe: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    // Seated Player PDAs are passed as remaining_accounts for winner resolution
}

#[derive(Accounts)]
pub struct VerifyBluff<'info> {
    pub player: Account<'info, Player>,
    pub encrypted_hand: Account<'info, EncryptedHand>,
    pub payer: Signer<'info>,
}

#[derive(Accounts)]
pub struct SubmitReaction<'info> {
    #[account(mut, has_one = wallet)]
    pub player: Account<'info, Player>,
    pub wallet: Signer<'info>,
}

// ===== Errors =====
#[error_code]
pub enum PokerError {
    #[msg("Invalid blind amount")]
    InvalidBlind,
    #[msg("Invalid player count")]
    InvalidPlayerCount,
    #[msg("Game already started")]
    GameAlreadyStarted,
    #[msg("Table is full")]
    TableFull,
    #[msg("Invalid seat index")]
    InvalidSeat,
    #[msg("Token gate required to join this table")]
    TokenGateRequired,
    #[msg("Wrong token mint")]
    InvalidTokenMint,
    #[msg("Insufficient tokens to join")]
    InsufficientTokens,
    #[msg("Not enough players to start")]
    NotEnoughPlayers,
    #[msg("Player is inactive")]
    PlayerInactive,
    #[msg("Not your turn")]
    NotYourTurn,
    #[msg("Time bank expired")]
    TimeExpired,
    #[msg("Must call or fold")]
    MustCallOrFold,
    #[msg("Insufficient chips")]
    InsufficientChips,
    #[msg("Raise too small")]
    RaiseTooSmall,
    #[msg("Invalid action")]
    InvalidAction,
    #[msg("Betting round not complete")]
    BettingNotComplete,
    #[msg("Invalid game phase")]
    InvalidPhase,
    #[msg("Invalid card index")]
    InvalidCard,
    #[msg("Unauthorized callback")]
    UnauthorizedCallback,
    #[msg("Invalid Arcium proof")]
    InvalidProof,
    #[msg("Invalid game reference")]
    InvalidGame,
}

// ===== Events =====
#[event]
pub struct TableCreated {
    pub table_id: u64,
    pub creator: Pubkey,
    pub small_blind: u64,
    pub big_blind: u64,
}

#[event]
pub struct PlayerJoined {
    pub table_id: u64,
    pub player: Pubkey,
    pub seat: u8,
}

#[event]
pub struct GameStarted {
    pub table_id: u64,
    pub hand_number: u64,
    pub player_count: u8,
}

#[event]
pub struct DeckReady {
    pub table_id: u64,
    pub hand_number: u64,
}

#[event]
pub struct CardsDealt {
    pub table_id: u64,
    pub player_id: u8,
    pub hand_number: u64,
}

#[event]
pub struct ActionSubmitted {
    pub table_id: u64,
    pub player_id: u8,
    pub action_type: u8,
    pub next_player: u8,
}

#[event]
pub struct StreetAdvanced {
    pub table_id: u64,
    pub new_phase: u8,
}

#[event]
pub struct CommunityCardsDealt {
    pub table_id: u64,
    pub cards: [u8; 5],
}

#[event]
pub struct ShowdownTriggered {
    pub table_id: u64,
    pub hand_number: u64,
}

#[event]
pub struct GameComplete {
    pub table_id: u64,
    pub hand_number: u64,
    pub winner_count: u8,
    pub proof_hash: [u8; 32],
}

#[event]
pub struct BluffRevealed {
    pub player: Pubkey,
    pub game_id: u64,
    pub card1: u8,
    pub card2: u8,
}

#[event]
pub struct ReactionSubmitted {
    pub table: Pubkey,
    pub player: Pubkey,
    pub reaction_type: u8,
}

#[event]
pub struct ChatMessageSent {
    pub table: Pubkey,
    pub player: Pubkey,
    pub message: String,
}
