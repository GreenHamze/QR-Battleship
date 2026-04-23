/**
 * persistenceService.js
 * Reads and writes game state as JSON files in ./games/
 */

const fs = require('fs');
const path = require('path');

const GAMES_DIR = path.join(__dirname, '..', 'games');

// Ensure directory exists on startup
if (!fs.existsSync(GAMES_DIR)) {
  fs.mkdirSync(GAMES_DIR, { recursive: true });
}

function gamePath(gameId) {
  // Sanitize: allow only alphanumeric and hyphens
  const safe = gameId.replace(/[^a-zA-Z0-9\-]/g, '');
  return path.join(GAMES_DIR, `${safe}.json`);
}

function saveGame(gameId, state) {
  fs.writeFileSync(gamePath(gameId), JSON.stringify(state, null, 2), 'utf8');
}

function loadGame(gameId) {
  const p = gamePath(gameId);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

function gameExists(gameId) {
  return fs.existsSync(gamePath(gameId));
}

function listGames() {
  return fs.readdirSync(GAMES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

module.exports = { saveGame, loadGame, gameExists, listGames };
