use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    // ===== Types =====
    pub type Deck = Pack<[u8; 52]>;
    pub type HoleCards = Pack<[u8; 2]>;
    pub type CommunityFlop = Pack<[u8; 3]>;

    // ===== Data Structs (Stored on-chain) =====
    pub struct EncryptedDeck {
        pub cards: Enc<Mxe, Deck>,
        pub next_index: u8,
        pub burn_count: u8,
    }

    pub struct PlayerHand {
        pub player_id: u8,
        pub cards: Enc<Shared, HoleCards>,
    }

    pub struct CommunityCards {
        pub flop: Enc<Shared, CommunityFlop>,
        pub turn: Enc<Shared, u8>,
        pub river: Enc<Shared, u8>,
        pub revealed_count: u8,
    }

    pub struct HandResult {
        pub player_id: u8,
        pub hand_rank: u16,
        pub hand_category: u8,
        pub kicker_value: u16,
        pub is_winner: u8, // 0 or 1
    }

    pub struct PlayerState {
        pub player_id: u8,
        pub chip_count: u64,
        pub current_bet: u64,
        pub total_contributed: u64,
        pub is_active: u8,
        pub is_all_in: u8,
        pub has_acted: u8,
        pub seat_index: u8,
    }

    pub struct PotState {
        pub main_pot: u64,
        pub side_pot_count: u8,
        pub current_bet: u64,
        pub min_raise: u64,
        pub last_aggressor: u8,
    }

    // ===== Instructions =====

    #[instruction]
    pub fn create_encrypted_deck() -> (Enc<Mxe, Deck>, u8, u8) {
        let mut cards = [0u8; 52];
        for i in 0..52 {
            cards[i] = i as u8;
        }
        ArcisRNG::shuffle(&mut cards);
        
        (Mxe::get().from_arcis(Pack::new(cards)), 0, 0)
    }

    #[instruction]
    pub fn deal_hole_cards(
        deck_cards: Enc<Mxe, Deck>,
        deck_next_index: u8,
        player_id: u8,
        player_key: Shared,
    ) -> (Enc<Shared, HoleCards>, u8) {
        let deck_array = deck_cards.to_arcis().unpack();
        let mut hole = [0u8; 2];
        hole[0] = deck_array[deck_next_index as usize];
        hole[1] = deck_array[(deck_next_index + 1) as usize];
        
        (player_key.from_arcis(Pack::new(hole)), (deck_next_index + 2).reveal())
    }

    #[instruction]
    pub fn evaluate_hand(
        hole_cards_enc: Enc<Shared, HoleCards>,
        player_id: u8,
    ) -> (u8, u16, u8, u16, u8) {
        let hole = hole_cards_enc.to_arcis().unpack();
        let c1 = hole[0];
        let c2 = hole[1];
        
        let rank: u16 = (c1 as u16 + c2 as u16) * 10;
        
        (
            player_id.reveal(),
            rank.reveal(),
            (rank / 100).reveal() as u8,
            (c1 as u16).reveal(),
            0u8.reveal() // is_winner
        )
    }

    #[instruction]
    pub fn process_action(
        action_type: u8,
        player_chip_count: u64,
        player_current_bet: u64,
        pot_current_bet: u64,
        pot_main_pot: u64,
        player_seat_index: u8,
    ) -> (u64, u64, u64, u8) {
        let mut new_chips = player_chip_count;
        let mut new_p_bet = player_current_bet;
        let mut new_main_pot = pot_main_pot;
        
        if action_type == 2 { // Call
            let mut diff = 0u64;
            if pot_current_bet > player_current_bet {
                diff = pot_current_bet - player_current_bet;
            }
            new_chips = player_chip_count - diff;
            new_p_bet = player_current_bet + diff;
            new_main_pot = pot_main_pot + diff;
        }
        
        (new_chips.reveal(), new_p_bet.reveal(), new_main_pot.reveal(), ((player_seat_index + 1) % 6).reveal())
    }
}
