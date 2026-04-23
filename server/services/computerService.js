/**
 * computerService.js
 * Computer opponent logic. Separated from game state management.
 * MVP 1: random valid move.
 */

const persistence = require('./persistenceService');
const { applyAttack } = require('../utils/boardUtils');
const { allCoordinates, parse, toLabel } = require('../utils/coordinateUtils');

/**
 * Pick a random untargeted coordinate on the player's board.
 */
function pickRandomTarget(playerBoard) {
  const targeted = new Set([
    ...playerBoard.hits_received,
    ...playerBoard.misses_received,
  ]);
  const available = allCoordinates().filter(c => !targeted.has(c));

  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Execute a computer move for the given game.
 * Loads state, picks target, applies attack, saves state.
 */
function computerMove(gameId) {
  const state = persistence.loadGame(gameId);
  if (!state) return { error: 'game_not_found', game_over: false, winner: null };
  if (state.status !== 'active') return { error: 'game_over', game_over: true, winner: state.winner };
  if (state.turn !== 'computer') return { error: 'not_computers_turn', game_over: false, winner: null };

  const coordinate = pickRandomTarget(state.player_board);
  if (!coordinate) return { error: 'no_targets_left', game_over: false, winner: null };

  const { col, row } = parse(coordinate);
  const attack = applyAttack(state.player_board, col, row);

  const moveRecord = {
    actor: 'computer',
    coordinate: toLabel(col, row),
    result: attack.result,
    ship: attack.shipName,
    sunk: attack.sunk,
  };

  state.history.push(moveRecord);
  state.last_computer_move = moveRecord;

  if (attack.allSunk) {
    state.status = 'finished';
    state.winner = 'computer';
  } else {
    state.turn = 'player';
  }

  persistence.saveGame(gameId, state);

  return {
    game_id: gameId,
    actor: 'computer',
    coordinate: moveRecord.coordinate,
    result: attack.result,
    ship: attack.shipName,
    sunk: attack.sunk,
    game_over: state.status === 'finished',
    winner: state.winner,
    next_turn: state.turn,
  };
}

module.exports = { computerMove };
