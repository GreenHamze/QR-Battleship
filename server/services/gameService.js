/**
 * gameService.js
 * Core game state management. Source of truth for game logic.
 */

const { v4: uuidv4 } = require('uuid');
const persistence = require('./persistenceService');
const { randomPlacement, applyAttack, maskedGrid, ownerGrid } = require('../utils/boardUtils');
const { parse, toLabel } = require('../utils/coordinateUtils');

/**
 * Create a new game with random ship placement for both sides.
 */
function createGame() {
  const gameId = uuidv4().slice(0, 8); // short id for convenience

  const playerPlacement = randomPlacement();
  const computerPlacement = randomPlacement();

  const state = {
    game_id: gameId,
    status: 'active',     // active | finished
    turn: 'player',       // player | computer
    winner: null,         // null | 'player' | 'computer'
    created_at: new Date().toISOString(),

    player_board: {
      grid: playerPlacement.grid,
      ships: playerPlacement.ships,
      hits_received: [],
      misses_received: [],
    },

    computer_board: {
      grid: computerPlacement.grid,
      ships: computerPlacement.ships,
      hits_received: [],
      misses_received: [],
    },

    history: [],
    last_player_move: null,
    last_computer_move: null,
  };

  persistence.saveGame(gameId, state);
  return state;
}

/**
 * Load a game by ID. Returns null if not found.
 */
function getGame(gameId) {
  return persistence.loadGame(gameId);
}

/**
 * Apply a player move (attack on the computer's board).
 */
function playerMove(gameId, coordinate) {
  const state = persistence.loadGame(gameId);
  if (!state) return { error: 'game_not_found', game_over: false, winner: null };
  if (state.status !== 'active') return { error: 'game_over', game_over: true, winner: state.winner };
  if (state.turn !== 'player') return { error: 'not_your_turn', game_over: false, winner: null };

  const parsed = parse(coordinate);
  if (!parsed) return { error: 'invalid_coordinate', game_over: false, winner: null };

  const { col, row } = parsed;
  const attack = applyAttack(state.computer_board, col, row);

  if (attack.result === 'already_targeted') {
    return { error: 'already_targeted', game_over: false, winner: null };
  }

  const moveRecord = {
    actor: 'player',
    coordinate: toLabel(col, row),
    result: attack.result,
    ship: attack.shipName,
    sunk: attack.sunk,
  };

  state.history.push(moveRecord);
  state.last_player_move = moveRecord;

  if (attack.allSunk) {
    state.status = 'finished';
    state.winner = 'player';
  } else {
    state.turn = 'computer';
  }

  persistence.saveGame(gameId, state);

  return {
    game_id: gameId,
    actor: 'player',
    coordinate: moveRecord.coordinate,
    result: attack.result,
    ship: attack.shipName,
    sunk: attack.sunk,
    game_over: state.status === 'finished',
    winner: state.winner,
    next_turn: state.turn,
  };
}

/**
 * Build the view payload for the HTML UI.
 * Hides computer ship positions; shows player's own ships.
 */
function getView(gameId) {
  const state = persistence.loadGame(gameId);
  if (!state) return null;

  return {
    game_id: state.game_id,
    status: state.status,
    turn: state.turn,
    game_over: state.status === 'finished',
    winner: state.winner,
    enemy_grid: maskedGrid(state.computer_board),
    player_grid: ownerGrid(state.player_board),
    last_player_move: state.last_player_move,
    last_computer_move: state.last_computer_move,
    player_ships: state.player_board.ships.map(s => ({
      name: s.name,
      size: s.size,
      hits: s.hits.length,
      sunk: s.sunk,
    })),
    computer_ships_sunk: state.computer_board.ships
      .filter(s => s.sunk)
      .map(s => ({ name: s.name, size: s.size })),
  };
}

/**
 * Get compact status.
 */
function getStatus(gameId) {
  const state = persistence.loadGame(gameId);
  if (!state) return null;

  return {
    game_id: state.game_id,
    status: state.status,
    turn: state.turn,
    game_over: state.status === 'finished',
    winner: state.winner,
    moves_played: state.history.length,
    last_player_move: state.last_player_move,
    last_computer_move: state.last_computer_move,
  };
}

module.exports = { createGame, getGame, playerMove, getView, getStatus };
