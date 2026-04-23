/**
 * computerRoutes.js
 * REST endpoints: computer opponent actions.
 * Logically separate from game routes per architecture requirement.
 */

const express = require('express');
const router = express.Router();
const computerService = require('../services/computerService');
const gameService = require('../services/gameService');

// Query-param helper (must come BEFORE /:id route)
router.post('/_move', (req, res) => {
  const id = req.query.game_id;
  if (!id) return res.status(400).json({ error: 'missing_game_id' });
  const result = computerService.computerMove(id);
  if (result.error) {
    const code = result.error === 'game_not_found' ? 404 : 400;
    return res.status(code).json(result);
  }
  res.json(result);
});

// POST /computer/:id/move — trigger computer's turn
router.post('/:id/move', (req, res) => {
  const result = computerService.computerMove(req.params.id);
  if (result.error) {
    const code = result.error === 'game_not_found' ? 404 : 400;
    return res.status(code).json(result);
  }
  res.json(result);
});

// GET /computer/:id/last-move — inspect last computer move
router.get('/:id/last-move', (req, res) => {
  const state = gameService.getGame(req.params.id);
  if (!state) return res.status(404).json({ error: 'game_not_found' });
  res.json({ game_id: state.game_id, last_computer_move: state.last_computer_move });
});

module.exports = router;
