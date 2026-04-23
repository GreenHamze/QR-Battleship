/**
 * app.js
 * Battleship backend — main entry point.
 *
 * Route groups:
 *   /game/...     → game lifecycle, player actions, state inspection
 *   /computer/... → computer opponent actions
 */

const express = require('express');
const path = require('path');

const gameRoutes = require('./routes/gameRoutes');
const computerRoutes = require('./routes/computerRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS — allow board.html and CPEE frames to call the API from any origin
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Static files (future HTML pages)
app.use('/public', express.static(path.join(__dirname, 'public')));

// Route groups
app.use('/game', gameRoutes);
app.use('/computer', computerRoutes);

// GET /timeout/:seconds — simple sleep timer for CPEE parallel racing
app.get('/timeout/:seconds', (req, res) => {
  let seconds = parseInt(req.params.seconds, 10);
  if (isNaN(seconds) || seconds < 1) seconds = 1;
  if (seconds > 300) seconds = 300;
  setTimeout(() => {
    res.json({ timeout: true, seconds: seconds });
  }, seconds * 1000);
});

// Health check
app.get('/', (req, res) => {
  res.json({
    service: 'Battleship Backend',
    version: '1.0.0',
    endpoints: {
      'POST /game': 'Create new game',
      'GET /game/:id': 'Full game state (debug)',
      'GET /game/:id/status': 'Compact status',
      'GET /game/:id/view': 'UI-safe view',
      'POST /game/:id/player-move': 'Player attacks coordinate',
      'GET /game/:id/player-move-debug': 'Player move via query param',
      'GET /game/:id/history': 'Move history',
      'GET /game/last-unfinished': 'Find most recent active game',
      'POST /game/:id/ensure-player-turn': 'Ensure it is player turn',
      'POST /computer/:id/move': 'Trigger computer move',
      'GET /computer/:id/last-move': 'Last computer move',
      'GET /timeout/:seconds': 'Sleep timer for CPEE parallel racing',
    },
  });
});

app.listen(PORT, () => {
  console.log(`Battleship server running on http://localhost:${PORT}`);
});
