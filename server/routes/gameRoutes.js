/**
 * gameRoutes.js
 * REST endpoints: game lifecycle + player actions.
 */

const express = require('express');
const router = express.Router();
const gameService = require('../services/gameService');
const computerService = require('../services/computerService');

// POST /game — create a new game
router.post('/', (req, res) => {
  try {
    const state = gameService.createGame();
    res.status(201).json({
      game_id: state.game_id,
      status: state.status,
      turn: state.turn,
      message: 'Game created. Player goes first.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /game/last-unfinished — find most recent active game
router.get('/last-unfinished', (req, res) => {
  const persistence = require('../services/persistenceService');
  const games = persistence.listGames();
  let latest = null;
  let latestTime = 0;
  for (const id of games) {
    const state = persistence.loadGame(id);
    if (state && state.status === 'active') {
      const t = new Date(state.created_at).getTime() || 0;
      if (t > latestTime) {
        latestTime = t;
        latest = state.game_id;
      }
    }
  }
  if (latest) {
    res.json({ found: true, game_id: latest });
  } else {
    res.json({ found: false, game_id: null });
  }
});

// ── Query-param helper routes (must come BEFORE /:id routes) ──

router.get('/_view', (req, res) => {
  const id = req.query.game_id;
  if (!id) return res.status(400).json({ error: 'missing_game_id', game_over: false, winner: null });
  const view = gameService.getView(id);
  if (!view) return res.status(404).json({ error: 'game_not_found' });
  res.json(view);
});

router.get('/_status', (req, res) => {
  const id = req.query.game_id;
  if (!id) return res.status(400).json({ error: 'missing_game_id', game_over: false, winner: null });
  const status = gameService.getStatus(id);
  if (!status) return res.status(404).json({ error: 'game_not_found' });
  res.json(status);
});

router.get('/_player-move', (req, res) => {
  const id = req.query.game_id;
  const coordinate = req.query.coordinate;
  if (!id) return res.status(400).json({ error: 'missing_game_id', game_over: false, winner: null });
  if (!coordinate) return res.status(400).json({ error: 'missing_coordinate', game_over: false, winner: null });
  const result = gameService.playerMove(id, coordinate);
  if (result.error) {
    const code = result.error === 'game_not_found' ? 404 : 400;
    return res.status(code).json(result);
  }
  res.json(result);
});

router.post('/_ensure-player-turn', (req, res) => {
  const id = req.query.game_id;
  if (!id) return res.status(400).json({ error: 'missing_game_id', game_over: false, winner: null });
  const state = gameService.getGame(id);
  if (!state) return res.status(404).json({ error: 'game_not_found' });
  if (state.status !== 'active') {
    return res.json({
      game_id: state.game_id, action: 'none', reason: 'game_over',
      game_over: true, winner: state.winner, next_turn: state.turn,
    });
  }
  if (state.turn === 'player') {
    return res.json({
      game_id: state.game_id, action: 'none', reason: 'already_player_turn',
      game_over: false, winner: null, next_turn: 'player',
    });
  }
  const result = computerService.computerMove(id);
  if (result.error) return res.status(400).json(result);
  result.action = 'computer_moved';
  res.json(result);
});

// ── Original /:id routes ──

router.get('/:id', (req, res) => {
  const state = gameService.getGame(req.params.id);
  if (!state) return res.status(404).json({ error: 'game_not_found' });
  res.json(state);
});

router.get('/:id/status', (req, res) => {
  const status = gameService.getStatus(req.params.id);
  if (!status) return res.status(404).json({ error: 'game_not_found' });
  res.json(status);
});

router.get('/:id/view', (req, res) => {
  const view = gameService.getView(req.params.id);
  if (!view) return res.status(404).json({ error: 'game_not_found' });
  res.json(view);
});

router.post('/:id/player-move', (req, res) => {
  const { coordinate } = req.body;
  if (!coordinate) return res.status(400).json({ error: 'missing_coordinate', game_over: false, winner: null });
  const result = gameService.playerMove(req.params.id, coordinate);
  if (result.error) {
    const code = result.error === 'game_not_found' ? 404 : 400;
    return res.status(code).json(result);
  }
  res.json(result);
});

router.get('/:id/player-move-debug', (req, res) => {
  const coordinate = req.query.coordinate;
  if (!coordinate) return res.status(400).json({ error: 'missing_coordinate', game_over: false, winner: null });
  const result = gameService.playerMove(req.params.id, coordinate);
  if (result.error) {
    const code = result.error === 'game_not_found' ? 404 : 400;
    return res.status(code).json(result);
  }
  res.json(result);
});

router.post('/:id/ensure-player-turn', (req, res) => {
  const state = gameService.getGame(req.params.id);
  if (!state) return res.status(404).json({ error: 'game_not_found' });
  if (state.status !== 'active') {
    return res.json({
      game_id: state.game_id, action: 'none', reason: 'game_over',
      game_over: true, winner: state.winner, next_turn: state.turn,
    });
  }
  if (state.turn === 'player') {
    return res.json({
      game_id: state.game_id, action: 'none', reason: 'already_player_turn',
      game_over: false, winner: null, next_turn: 'player',
    });
  }
  const result = computerService.computerMove(req.params.id);
  if (result.error) return res.status(400).json(result);
  result.action = 'computer_moved';
  res.json(result);
});

router.get('/:id/history', (req, res) => {
  const state = gameService.getGame(req.params.id);
  if (!state) return res.status(404).json({ error: 'game_not_found' });
  res.json({ game_id: state.game_id, history: state.history });
});

router.get('/:id/last-player-move', (req, res) => {
  const state = gameService.getGame(req.params.id);
  if (!state) return res.status(404).json({ error: 'game_not_found' });
  res.json({ game_id: state.game_id, last_player_move: state.last_player_move });
});

module.exports = router;
