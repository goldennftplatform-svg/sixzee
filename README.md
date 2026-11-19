# SIXZEE 🎲⚡

**Six dice. One champion.** An 8-bit six-dice scorecard game built from the complete LITEcrib full-stack setup: browser game, SSE multiplayer relay, Litecoin custody wallet, SSO/credit economy, and a LitVM-ready settlement seam.

Public build: **https://github.com/goldennftplatform-svg/sixzee**

## What changed from LITEcrib / 29

- Cribbage cards, crib, starter, 31-count and 121-hole board are gone.
- New `sixzee-engine.js`: 6 dice, 3 rolls per turn, 13 categories, uppercase/lowercase scorecard, AI opponent, and a server-authoritative adapter.
- New dice UI: click dice to hold, reroll, then click a category to score. Live previews show what each open category would score.
- Relay, wallet, auth, credits, staking, LitVM seam and 1v1 / 3-player tables are preserved and rebranded.
- Safari-knights artwork from the supplied reference is used as the page background.

## Rules

### Turn
- Six dice, three rolls. Roll 1 is automatic; hold any dice and roll up to two more times.
- Assign the result to one unfilled category. A category can only be used once; a bad fit scores 0.
- 13 rounds per player. Highest total wins.

### Upper section
| Category | Score |
| --- | --- |
| Ones … Sixes | face × matching dice |
| Upper bonus | +35 if upper subtotal reaches **84** (four of each face) |

### Lower section
| Category | Requirement | Score |
| --- | --- | --- |
| Three of a Kind | ≥3 matching | sum of all 6 dice |
| Four of a Kind | ≥4 matching | sum of all 6 dice |
| Five of a Kind | ≥5 matching | 45 |
| SIXZEE | all 6 matching | 60 |
| Full House | exactly 3+3 | 30 |
| Small Straight | 4 consecutive faces | 30 |
| Large Straight | 5 consecutive faces | 40 |

No Chance category, no joker / extra-roll bonus in v1.

## Play modes

- **Play vs AI** — free solo 1v1 or 3-player. AI rolls, holds and scores automatically.
- **Create table / open tables** — real cross-device 1v1 or 3-player over the Node relay (SSE + HTTP POST).
- **Token matches** — signed-in accounts can stake 20 test pts (0.02 tLTC) against the funded AI bankroll. Test coins have no cash value.

Static GitHub Pages hosts play solo; human tables need the relay because Pages has no `/api/*` backend. `config.js` decides this in one place.

## Run locally

```bash
npm install
npm run dev
```

Open **http://localhost:8080**. Health check: `/api/health` must return `multiplayerProtocol: 1`.

Environment: copy `.env.example` to `.env`. Important values:

- `PORT=8080`
- `LTC_NETWORK=testnet`
- `SIXZEE_SEED` — BIP39 seed for deterministic player deposit addresses (generated and printed once if blank; pin it).
- `SIXZEE_ADMIN_TOKEN` — enables `/api/wallet/payout`.
- LitVM: `LITVM_RPC_URL`, `LITVM_CHAIN_ID=4441`, `LITVM_EXPLORER`.

## Deploy

- **GitHub Pages** — the repo root is the static frontend (`.nojekyll` included). It uses `config.js → relayUrl` to find the shared relay.
- **Render** — `render.yaml` is a zero-config Blueprint for a Node web service that serves the game *and* the SSE relay. Vercel-style serverless is not supported for SSE.
- `render.yaml` repo/branch point at `goldennftplatform-svg/sixzee`, `main`. The service is named `sixzee-relay`, so its public URL is `https://sixzee-relay.onrender.com` — the same value as `config.js → relayUrl`. If you deploy under a different name, update `relayUrl` to match.
- Until the relay is deployed, the GitHub Pages build still plays solo; human tables need the relay and its `/api/*` routes.

## Litecoin / LitVM wiring

- `lit-wallet.js` — server-custody BIP84 HD wallet, PSBT payouts, broadcast via Litecoin Space / Core RPC.
- `payments.js` — deposit address, status, balance and payout provider seam.
- `auth.js` / `store.js` — email login, salted-scrypt passwords, bearer sessions, exportable custody mnemonics.
- `wallet.js` / `metamask.js` — LTC panel, points economy, one-click LiteForge network add.
- `/api/wallet/litvm` — read-only LiteForge testnet seam (chain 4441). `contracts/Settlement.sol` is the on-chain escrow target when settlement goes live.

## Architecture

```
index.html            markup, branding, script order
game.js               Sixzee UI/state machine, AI turns, wallet/staking flows
sixzee-engine.js      pure dice rules + server-authoritative adapter
network.js            SSE/HTTP relay client (local fallback)
server.js             static host + SSE table relay + wallet/auth/credits API
config.js             shared public config (brand, relay, static hosts, LitVM)
styles.css            shared wallet/shell styles
sixzee.css            safari-knights dice/scorecard theme
assets/               safari artwork reference
tests/                scoring, multiplayer relay, wallet, SSO, credits, MetaMask
```

## Tests

```bash
npm test
npm run test:multiplayer
```

`tests/scoring.cjs` covers 6-dice scoring, bonus and turn flow; `tests/multiplayer-e2e.cjs` boots the real relay in-process and plays a full 13-round human match.

## Credits

Forked from the complete LITEcrib / "29" build. Safari knights artwork supplied by the project owner. Fonts: Press Start 2P, VT323.
