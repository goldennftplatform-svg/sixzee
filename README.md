# SIXZEE 🎲⚡

**Six dice. One champion.** An 8-bit six-dice scorecard game built from the complete LITEcrib full-stack setup: browser game, SSE multiplayer relay, Litecoin custody wallet, SSO/credit economy, and a LitVM-ready settlement seam.

Public build: **https://github.com/goldennftplatform-svg/sixzee**

## What changed from LITEcrib / 29

- Cribbage cards, crib, starter, 31-count and 121-hole board are gone.
- New `sixzee-engine.js`: 6 dice, 3 rolls per turn, 13 categories, uppercase/lowercase scorecard, AI opponent, and a server-authoritative adapter.
- New dice UI: click dice to hold, reroll, then click a category to score. Live previews show what each open category would score.
- Legacy Yahtzee-style table play: **2–6 seats**, dice carried between players, and classic extra-Sixzee bonuses/jokers.
- Relay, wallet, auth, credits, staking and LitVM seam are preserved and rebranded.
- Safari-knights artwork from the supplied reference is used as the page background.

## Rules

### Turn
- Six dice, three rolls per turn. Roll 1 is automatic; hold any dice and roll up to two more times.
- The dice stay on the table between players. The next player can hold any of them and reroll the rest; only the very first roll of the game starts from a blank tray.
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

### Classic extras
- Once the SIXZEE box holds 60, every later six-of-a-kind earns **+100** — even when its dice are parked in another category.
- A later six-of-a-kind is also a **joker**: it may score Full House (30), Small Straight (30) or Large Straight (40).
- No Chance category and no extra-roll bonus.

## Play modes

- **Play vs AI** — free solo tables with 2–6 seats. AI players roll, hold and score automatically.
- **Create table / open tables** — real cross-device 2–6 player tables over the Node relay (SSE + HTTP POST). Hosting a table opens a **waiting room**: every seat is visible, you can **INVITE A FRIEND** with a direct seat link, and the game deals in only when all seats are filled and every player presses **READY UP**. No AI ever joins a human table.
- **Token matches** — signed-in accounts can stake 20 test pts (0.02 tLTC) against the funded AI bankroll in head-to-head play. Test coins have no cash value.

Human identity is stable per browser, and your table is remembered: closing the tab or refreshing mid-match flags your seat **AWAY** but keeps your dice, holds, scorecard and turn exactly as they were. Reopening the game reclaims the same seat automatically — nobody can steal it while you are away, and it looks like the same person when you return.

Static GitHub Pages hosts play solo; human tables need the relay because Pages has no `/api/*` backend. `config.js` decides this in one place.

## Install on Android

Sixzee is an installable PWA — no APK or app store is needed.

1. Open **https://goldennftplatform-svg.github.io/sixzee/** in Chrome on your Android device.
2. Tap Chrome's **⋮ menu → Install app** (or **Add to Home screen**). When the browser detects that the app is installable, the **📲 INSTALL** pill in the header also appears and does the same thing.
3. Launch **Sixzee** from the home screen. It opens in its own standalone window with its own icon, just like `abby123.aisp.live`.

The manifest, service worker, and 192/512/maskable icons live at the repo root and `assets/`. The service worker caches the game shell for offline launches; live multiplayer, wallet, and relay calls are never cached. After a future update, reopening the installed app fetches the new shell and swaps cached files automatically.

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

`tests/scoring.cjs` covers 6-dice scoring, upper/extra-Sixzee bonuses, joker rules, dice carry, and seat bounds; `tests/multiplayer-e2e.cjs` boots the real relay in-process and checks six-seat guards plus a full 13-round human match.

## Credits

Forked from the complete LITEcrib / "29" build. Safari knights artwork supplied by the project owner. Fonts: Press Start 2P, VT323.
