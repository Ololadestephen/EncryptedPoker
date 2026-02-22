# 🂱 ENcryptedPoker

> Texas Hold'em where **your cards are cryptographically private** — not even the server can see your hole cards.

Built for the **Arcium Gaming Track Hackathon**. Uses Arcium's multi-party computation (MPC) to shuffle decks, deal cards, and evaluate hands entirely in encrypted space—all settled on Solana.

[![Solana](https://img.shields.io/badge/Solana-Devnet-9945FF?logo=solana)](https://devnet.solana.com)
[![Arcium](https://img.shields.io/badge/Arcium-MPC-00D4AA)](https://arcium.com)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

---

## ✨ What Makes This Different

Traditional poker servers know every card. ENcryptedPoker uses **threshold MPC** — the deck exists only as a distributed secret across Arcium nodes. No server, no node, no player can see hole cards until the moment of reveal.

| Feature | Traditional Poker | ENcryptedPoker |
|---|---|---|
| Deck knowledge | Server knows all cards | No one sees the deck |
| Hand privacy | Server sees your cards | Only you can decrypt yours |
| Showdown fairness | Trust the server | ZK proof on-chain |
| Bluff proof | "Trust me bro" | Cryptographic minimum-disclosure proof |

---

## 🚀 Features

- **🔐 MPC deck shuffling** — Fisher-Yates inside Arcium, unbiasable by any party
- **🃏 Private hole cards** — encrypted under your public key, only you can decrypt
- **♟️ Full betting rounds** — pre-flop → flop → turn → river with fold/check/call/raise/all-in
- **⚖️ MPC hand evaluation** — winner computed without revealing losing hands
- **🏆 ZK proof showdown** — cryptographic proof of fairness posted on-chain
- **🎭 Prove You Bluffed** — optional post-hand minimum-disclosure proof you can share
- **💬 Encrypted table chat** — in-game messaging synced to Solana
- **😂 Emoji reactions** — on-chain encrypted reactions per player
- **📡 Real-time subscriptions** — Solana account change streams (no polling)
- **🌐 Liar's Den feed** — global bluff history auditable by anyone

---

## 🏗️ Architecture

```
encrypted-poker/
├── programs/encrypted-poker/    # Anchor Solana program (lib.rs)
├── encrypted-ixs/               # Arcium MPC circuits (deck, hand_ranking, showdown)
├── app/                         # React + Vite frontend
│   └── src/
│       ├── pages/               # GameTable, Lobby, HandResult, etc.
│       ├── components/          # UI components (PlayingCard, Layout, etc.)
│       ├── hooks/               # useTableRealtime, useTurnTimer, etc.
│       └── lib/                 # Constants, Anchor program wrapper
└── tests/                       # Integration tests
```

### How It Works

```
Player Keys ──┐
              ├─→ [Arcium MPC Nodes] ─→ Encrypted hands (only owner can decrypt)
Shared RNG ───┘         │
                         └─→ Showdown eval ─→ Winner + ZK Proof ─→ Solana
```

---

## 🚀 Quick Start

### Prerequisites

```bash
# Solana CLI + Anchor
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install latest && avm use latest

# Arcium CLI
cargo install arcium-cli
```

### 1. Clone & Install

```bash
git clone https://github.com/Ololadestephen/EncryptedPoker.git
cd encrypted-poker
cd app && npm install && cd ..
```

### 2. Configure Environment

```bash
cp app/.env.example app/.env
# Edit app/.env with your program ID and Arcium MXE pubkey
```

### 3. Set Up Arcium

```bash
arcium mxe init
arcium build
arcium deploy --network devnet
arcium mxe show  # Copy pubkey → app/.env + Arcium.toml
```

### 4. Deploy Solana Program

```bash
solana config set --url devnet
solana airdrop 2
anchor build
anchor deploy
```

### 5. Run Frontend

```bash
cd app
npm run dev
# → http://localhost:5173
```

---

## 🎮 Game Flow

```
Create Table → Join (up to 6 players) → Start Game
  → Arcium shuffles deck (MPC RNG)
  → Hole cards dealt (encrypted per player)
  → Pre-flop betting
  → Flop / Turn / River (Arcium reveals community cards)
  → Showdown (MPC evaluation — no cards revealed until necessary)
  → ZK proof + payout posted on-chain
  → [Optional] "Prove You Bluffed" minimum-disclosure reveal
```

---

## 📋 On-Chain Accounts

| Account | Description |
|---|---|
| `Table` | Blinds, phase, pot, community cards, current turn |
| `Player` | Chips, seat index, action status |
| `EncryptedHand` | Hole cards encrypted under player's public key |
| `GameResult` | Winner, payout, ZK proof hash |

---

## 🔒 Security Properties

1. **Unbiasable shuffle** — MPC RNG requires threshold of nodes to collude to bias
2. **Hand privacy** — hole cards never exist unencrypted outside player's own decryption
3. **Fair evaluation** — hand comparison in MPC, no info leaked
4. **Verifiable outcomes** — every game result has an on-chain ZK proof hash
5. **Minimum disclosure** — only winning hands revealed at showdown

---

## 🧪 Testing

```bash
# Local integration tests
anchor test

# vs Devnet
anchor test --provider.cluster devnet

# Arcium circuit tests
arcium test deck
arcium test hand_ranking
arcium test showdown
```

---

## 📚 Resources

- [Arcium Docs](https://docs.arcium.com)
- [Arcium Examples](https://github.com/arcium-hq/examples)
- [Anchor Docs](https://www.anchor-lang.com/)
- [Solana Wallet Adapter](https://github.com/solana-labs/wallet-adapter)

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

*Built with ❤️ for the Arcium | ENcryptedPoker: the only poker where the house literally cannot cheat.*
