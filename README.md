# QR Battleship — CPEE-Orchestrated Naval Combat

A QR-code-driven Battleship game where a [CPEE](https://cpee.org) process orchestrates the turn flow, a Node.js REST backend manages game state and computer logic, and static HTML pages provide the visualization. Players interact entirely through QR codes scanned with their phone — the board displays on a TV or large monitor, and every move is a QR scan.

Built as a TUM CPEE Praktikum project.

---

## Screenshots

### 1. Start screen — scan to begin

![Scan to Start](screenshots/ScanToStart.png)

The player is greeted with a single QR code. Scanning it sends a `start` signal back to CPEE, which advances the process to the mode selection screen.

### 2. Mode selection — new game or continue

![Choose Game](screenshots/ChooseGame.png)

Two QR codes side by side. The left starts a fresh game; the right resumes the most recent unfinished game (if one exists). The backend tracks persisted games, so a match interrupted yesterday can be picked up today.

### 3. Game board at the start

![Start of Game](screenshots/StartOfGame.png)

The horizontal TV-optimized layout places the Enemy Fleet (scannable QR grid) on the left and the player's own fleet on the right. Every grid cell on the left is a distinct QR code encoding a coordinate (A1–F6). The status bar at the top tracks fleet health, sunk enemy ships, the legend, and the current turn.

### 4. Gameplay — early exchanges

![Game Progression 1](screenshots/GameProgression1.png)

After the player scans C2 and gets a hit, the computer fires back at D1 and also hits a ship. The scanned cells on the left turn grey (miss) or red (hit); the player's own board on the right shows incoming damage.

### 5. Gameplay — a ship goes down

![Game Progression 2](screenshots/GameProgression2.png)

The player has sunk the Destroyer (magenta cells on the enemy grid; strikethrough in the fleet list). The computer has started landing hits on the player's Cruiser.

### 6. Gameplay — mid-battle

![Game Progression 3](screenshots/GameProgression3.png)

Both sides have taken significant damage. The player has sunk an enemy ship; the computer has sunk the player's Cruiser.

### 7. Victory

![Game Progression 4](screenshots/GameProgression4.png)

All enemy ships have been sunk. The loop exits, the end screen renders with `winner=player`.

![Victory](screenshots/Victory.png)

### 8. Timeout — inactivity protection

![Timed Out](screenshots/TimedOut.png)

If the player stops interacting for 90 seconds, the game ends gracefully. This is implemented entirely in CPEE via a parallel heartbeat branch (see Architecture below).

---

## Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  HTML frontend  │◄────►│   CPEE engine   │◄────►│  Node.js API    │
│  (TV display)   │      │ (orchestration) │      │ (game state)    │
└────────┬────────┘      └─────────────────┘      └─────────────────┘
         │ QR scans
         ▼
    ┌─────────┐
    │  Phone  │
    └─────────┘
```

Three layers with clear responsibilities:

- **CPEE process** — controls the sequence of turns, decides when to show UI, when to call the backend, when to end the game. No game logic of its own.
- **Node.js backend** — the source of truth for all game state. Stores boards, applies moves, detects hits/sinks/wins, runs the computer's strategy. Games persist as JSON files so they survive server restarts.
- **HTML frontend** — thin presentation layer. Pulls current game state from the backend via a PHP proxy, renders it as a board, generates QR codes for every possible move. Never decides anything.

Player input flows: **phone scans QR → `send.php` posts to the CPEE callback → CPEE advances → backend applies move → frontend re-fetches and redraws.**

---

## The CPEE Process

The process handles five responsibilities:

1. **Session start** — show the init screen and wait for a scan
2. **Mode selection** — let the player pick new game or continue
3. **Game creation or retrieval** — call the backend accordingly
4. **Gameplay loop** — alternate computer and player turns until `game_over` is true
5. **Inactivity timeout** — end the session if the player goes idle for 90 seconds

### Process structure

```
Start
  ↓
Init Screen & Wait                  (resets all data, waits for start QR)
  ↓
Parallel (Wait=1)
│
├── Branch 1: GAMEPLAY
│     Choose Mode Screen & Wait
│     Alternative: data.mode == "continue"
│     ├── TRUE:  Get Last Unfinished Game
│     │         Alternative: data.found == true
│     │         ├── TRUE:  (continue the existing game_id)
│     │         └── FALSE: Create New Game
│     └── FALSE: Create New Game
│     Loop [data.game_over != true]
│       Ensure Player Turn          (executes computer move if it's their turn)
│       Start Board & Wait          (displays board, waits for coordinate scan)
│       Apply Player Move           (applies the scanned coordinate)
│
└── Branch 2: INACTIVITY HEARTBEAT
      Loop [Time.now.to_i - data.update < 90]
        inactivity_check             (1-second heartbeat via powernap service)
      Script: data.winner = "timeout"; data.game_over = true
  ↓
Show End Screen                     (winner=player/computer/timeout)
  ↓
End
```

### Why two branches

The Parallel gateway with `Wait=1` means whichever branch finishes first wins, and the other gets cancelled. Two things can "finish the game":

- **Natural completion** — Branch 1's loop exits because one side's ships are all sunk
- **Inactivity** — Branch 2 detects no user action for 90 seconds

Either outcome sets `data.winner`, and the shared End Screen renders the result. Clean, single-source-of-truth for how a game ends.

### The inactivity heartbeat pattern

Branch 2 doesn't use a single 90-second timer. Instead, it loops through 1-second heartbeat calls (to `cpee.org/services/powernap.php`), re-checking `Time.now.to_i - data.update < 90` each iteration. The `data.update` timestamp is refreshed to `Time.now.to_i` in the Finalize of every user-interaction block (Init Screen, Choose Mode, Start Board).

This polling-based design avoids two problems:

1. **PHP proxy timeouts** — a single HTTP call longer than ~30 seconds would get killed at the proxy layer
2. **In-flight request cancellation** — CPEE can cleanly cancel a branch between heartbeats, but can't abort a long HTTP call already in flight

### Key data objects

| Variable | Purpose |
|----------|---------|
| `game_id` | The current game on the backend. Every API call references this. |
| `mode` | `"new"` or `"continue"` — the player's choice on the mode screen. |
| `found` | Whether a prior unfinished game exists (returned by backend). |
| `game_over` | Loop exit condition. Set by backend response on every move. |
| `winner` | `"player"`, `"computer"`, or `"timeout"`. Passed to End Screen. |
| `update` | Unix timestamp of last user activity. Inactivity loop polls against this. |
| `player_move` | Last scanned coordinate. |

### Process graph from the CPEE cockpit

![CPEE Process Graph](screenshots/CPEEProcess.png)

This is the same process structure rendered in the CPEE cockpit. The left column is Branch 1 (gameplay — choose mode, create/load game, loop through turns); the middle column is the decision tree handling new game vs. continue vs. found-or-not-found; the right column (with the clock icon) is Branch 2, the inactivity heartbeat.

### CPEE process file

The full process definition (BPMN export) is in [`cpee/Hamze_Prak_Ship_Best_Process_SAFETY_WithTimeout.bpmn`](cpee/).

---

## Project Structure

```
qr-battleship/
├── README.md                       ← this file
├── cpee/
│   └── Hamze_Prak_Ship_Best_Process_SAFETY_WithTimeout.bpmn
├── server/                         ← Node.js backend
│   ├── app.js
│   ├── package.json
│   ├── test.js
│   ├── routes/
│   │   ├── gameRoutes.js           # /game/... endpoints
│   │   └── computerRoutes.js       # /computer/... endpoints
│   ├── services/
│   │   ├── gameService.js          # game lifecycle, player moves, view building
│   │   ├── computerService.js      # computer AI (random strategy)
│   │   └── persistenceService.js   # JSON file read/write
│   ├── utils/
│   │   ├── boardUtils.js           # ship placement, hit/miss, grid masking
│   │   └── coordinateUtils.js      # coordinate parsing (A1–F6)
│   └── games/                      # game state JSON files (auto-created)
├── frontend/                       ← static pages + PHP helpers
│   ├── init.html                   # start screen
│   ├── choose.html                 # new game / continue
│   ├── board.html                  # main game board (TV landscape)
│   ├── end.html                    # victory / defeat / timeout
│   ├── send.php                    # QR → CPEE callback bridge
│   ├── api.php                     # PHP proxy to Node.js backend
│   └── qrcode.min.js               # QR code generation library
└── screenshots/
    └── (screenshots shown above)
```

---

## Tech Stack

**Backend**
- Node.js + Express
- Game state persisted as JSON files in `server/games/` (one file per game)
- Two logical endpoint groups: `/game/...` and `/computer/...`
- Dependencies: `express`, `uuid`

**Frontend**
- Plain HTML, CSS, vanilla JavaScript — no frameworks
- QR code generation via [qrcode-generator](https://github.com/nicklockwood/QRCode) (MIT, ~57KB)
- PHP callback bridge (`send.php`) and API proxy (`api.php`)

**Orchestration**
- CPEE (Cloud Process Execution Engine), hosted at [cpee.org](https://cpee.org)
- Uses `cpee.org/out/frames/` frame-display endpoints for rendering static HTML
- Uses `cpee.org/services/powernap.php` for heartbeat polling

**Game parameters**
- 6×6 board, coordinates A1–F6
- 3 ships per side: Cruiser (3), Destroyer (2), Patrol (2)
- Random ship placement, random computer strategy (MVP)

---

## Local Setup & Run

```bash
cd server
npm install
node test.js          # run self-contained tests
node app.js           # start server on port 3000
```

Test with curl:

```bash
# Create a game
curl -X POST http://localhost:3000/game

# View game state (UI-safe, hides enemy ships)
curl http://localhost:3000/game/GAME_ID/view

# Player attacks A1
curl "http://localhost:3000/game/GAME_ID/player-move-debug?coordinate=A1"

# Trigger computer move
curl -X POST http://localhost:3000/computer/GAME_ID/move

# Check status
curl http://localhost:3000/game/GAME_ID/status
```

---

## REST API Reference

### Game lifecycle

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/game` | Create a new game. Returns `{game_id, status, turn}` |
| `GET` | `/game/:id` | Full game state (debug — exposes ship positions) |
| `GET` | `/game/:id/status` | Compact status: turn, game_over, winner, moves_played |
| `GET` | `/game/:id/view` | UI-safe view — hides enemy ships, shows masked grids |
| `GET` | `/game/last-unfinished` | Find most recent active game |

### Player actions

| Method | Endpoint | Params | Description |
|--------|----------|--------|-------------|
| `POST` | `/game/:id/player-move` | Body: `{"coordinate":"A1"}` | Player attacks a coordinate |
| `GET` | `/game/:id/player-move-debug` | Query: `?coordinate=A1` | Same as above, CPEE-friendly |
| `GET` | `/game/_player-move` | Query: `?game_id=X&coordinate=A1` | Query-param helper |

### Computer actions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/computer/:id/move` | Trigger computer's turn |
| `POST` | `/computer/_move` | Query: `?game_id=X` — query-param helper |
| `GET` | `/computer/:id/last-move` | Inspect last computer move |

### Orchestration helpers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/game/:id/ensure-player-turn` | If computer's turn, play it; if player's, no-op |
| `POST` | `/game/_ensure-player-turn` | Query: `?game_id=X` — helper form |
| `GET` | `/game/_view` | Query: `?game_id=X` — helper form |
| `GET` | `/game/_status` | Query: `?game_id=X` — helper form |
| `GET` | `/timeout/:seconds` | Sleep timer for CPEE parallel timeout racing |

### Inspection

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/game/:id/history` | Full ordered move history |
| `GET` | `/game/:id/last-player-move` | Last player move details |

### Move response shape

All move endpoints return this shape consistently — success, no-op, and error:

```json
{
  "game_id": "abc123",
  "actor": "player",
  "coordinate": "A1",
  "result": "hit",
  "ship": "Cruiser",
  "sunk": false,
  "game_over": false,
  "winner": null,
  "next_turn": "computer"
}
```

The `game_over` (boolean) and `winner` (string|null) fields are always present — including on errors — so the CPEE loop condition never sees a missing value.

### View response shape (used by board.html)

```json
{
  "game_id": "abc123",
  "status": "active",
  "turn": "player",
  "game_over": false,
  "winner": null,
  "enemy_grid": [["null|hit|miss|sunk", ...]],
  "player_grid": [["null|ship|hit|miss|sunk", ...]],
  "last_player_move": { ... },
  "last_computer_move": { ... },
  "player_ships": [{ "name": "Cruiser", "size": 3, "hits": 1, "sunk": false }],
  "computer_ships_sunk": [{ "name": "Patrol", "size": 2 }]
}
```

---

## Infrastructure Notes

### PHP proxy (`api.php`)

The deployment server blocks external access to Node.js ports. `api.php` runs under Apache and forwards requests to `localhost:3000`:

```
Browser → https://server/battleship/api.php/game/ID/view → localhost:3000/game/ID/view
```

### QR callback flow

1. CPEE displays `board.html` in a frame, injecting a callback URL via `window.name`
2. `board.html` renders a QR code for each unscanned coordinate, encoding: `send.php?info=COORDINATE&cb=CALLBACK_URL`
3. Player scans a QR code with their phone
4. Phone opens `send.php`, which PUTs the coordinate to the CPEE callback URL
5. CPEE receives the coordinate and continues the process

### Auto-restart

The backend runs under a restart loop to survive crashes:

```bash
nohup bash -c 'while true; do node app.js; echo "Restarting..."; sleep 3; done' > server.log 2>&1 &
```

### Game state persistence

Each game is stored as a JSON file in `server/games/<game_id>.json`. The file contains both boards (with ship positions), move history, current turn, and win/loss state. Games survive server restarts. No database required.

---

## Deployment

**Backend** — Deploy `server/` to the hosting server. Run `npm install`, then start with the auto-restart loop above.

**Frontend** — Copy `frontend/` contents to the web server's public directory (e.g., Apache's `public_html/battleship/`).

**CPEE** — Import the BPMN file from `cpee/` into the CPEE cockpit. Configure endpoints to route through `api.php` for backend calls and through `cpee.org/out/frames/` for UI frames.

---

## License

MIT
