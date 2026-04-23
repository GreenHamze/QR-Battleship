/**
 * test.js
 * Self-contained test runner — starts server, runs all tests, exits.
 * Usage: node test.js
 */
const http = require('http');
const express = require('express');
const gameRoutes = require('./routes/gameRoutes');
const computerRoutes = require('./routes/computerRoutes');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/game', gameRoutes);
app.use('/computer', computerRoutes);

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: '127.0.0.1', port: 3001, path, method, headers: { 'Content-Type': 'application/json' } };
    const req = http.request(opts, (res) => { let data = ''; res.on('data', (d) => (data += d)); res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: data }); } }); });
    req.on('error', reject); if (body) req.write(JSON.stringify(body)); req.end();
  });
}
let passed = 0, failed = 0;
function assert(label, condition, detail) { if (condition) { console.log('  ✅ ' + label); passed++; } else { console.log('  ❌ ' + label + ' — ' + (detail || 'FAILED')); failed++; } }

async function runTests() {
  let gameId;
  console.log('\n── POST /game (create) ──');
  const create = await request('POST', '/game');
  assert('Status 201', create.status === 201); assert('Has game_id', !!create.body.game_id);
  assert('Status is active', create.body.status === 'active'); assert('Turn is player', create.body.turn === 'player');
  gameId = create.body.game_id; console.log('   Game ID: ' + gameId);

  console.log('\n── GET /game/:id (full state) ──');
  const full = await request('GET', '/game/' + gameId);
  assert('Status 200', full.status === 200); assert('Has player_board', !!full.body.player_board);
  assert('Has computer_board', !!full.body.computer_board);
  assert('Player has 3 ships', full.body.player_board.ships.length === 3);
  assert('Computer has 3 ships', full.body.computer_board.ships.length === 3);
  assert('History empty', full.body.history.length === 0);

  console.log('\n── GET /game/:id/status ──');
  const status = await request('GET', '/game/' + gameId + '/status');
  assert('Status 200', status.status === 200); assert('Moves played = 0', status.body.moves_played === 0); assert('No winner', status.body.winner === null);

  console.log('\n── GET /game/:id/view ──');
  const view = await request('GET', '/game/' + gameId + '/view');
  assert('Status 200', view.status === 200); assert('Has enemy_grid (6 rows)', view.body.enemy_grid.length === 6);
  assert('Has player_grid (6 rows)', view.body.player_grid.length === 6);
  assert('Has player_ships array', view.body.player_ships.length === 3);
  assert('Enemy grid all null initially', view.body.enemy_grid.flat().every(c => c === null));

  console.log('\n── POST /game/:id/player-move (valid) ──');
  const pm1 = await request('POST', '/game/' + gameId + '/player-move', { coordinate: 'A1' });
  assert('Status 200', pm1.status === 200); assert('Actor is player', pm1.body.actor === 'player');
  assert('Coordinate is A1', pm1.body.coordinate === 'A1');
  assert('Result is hit or miss', ['hit', 'miss'].includes(pm1.body.result));
  assert('Next turn is computer', pm1.body.next_turn === 'computer');
  console.log('   A1 → ' + pm1.body.result);

  console.log('\n── POST /game/:id/player-move (wrong turn) ──');
  const pm_bad = await request('POST', '/game/' + gameId + '/player-move', { coordinate: 'B2' });
  assert('Status 400', pm_bad.status === 400); assert('Error: not_your_turn', pm_bad.body.error === 'not_your_turn');

  console.log('\n── POST /computer/:id/move ──');
  const cm1 = await request('POST', '/computer/' + gameId + '/move');
  assert('Status 200', cm1.status === 200); assert('Actor is computer', cm1.body.actor === 'computer');
  assert('Has coordinate', !!cm1.body.coordinate);
  assert('Result is hit or miss', ['hit', 'miss'].includes(cm1.body.result));
  assert('Next turn is player', cm1.body.next_turn === 'player');
  console.log('   Computer → ' + cm1.body.coordinate + ' → ' + cm1.body.result);

  console.log('\n── Error cases ──');
  const pm_dup = await request('POST', '/game/' + gameId + '/player-move', { coordinate: 'A1' });
  assert('Already targeted', pm_dup.body.error === 'already_targeted');
  const pm_inv = await request('POST', '/game/' + gameId + '/player-move', { coordinate: 'Z99' });
  assert('Invalid coordinate', pm_inv.body.error === 'invalid_coordinate');
  const pm_miss = await request('POST', '/game/' + gameId + '/player-move', {});
  assert('Missing coordinate', pm_miss.body.error === 'missing_coordinate');

  console.log('\n── POST /game/:id/player-move (B2) ──');
  const pm2 = await request('POST', '/game/' + gameId + '/player-move', { coordinate: 'B2' });
  assert('Status 200', pm2.status === 200); console.log('   B2 → ' + pm2.body.result);
  await request('POST', '/computer/' + gameId + '/move');

  console.log('\n── GET /game/:id/history ──');
  const hist = await request('GET', '/game/' + gameId + '/history');
  assert('4 moves in history', hist.body.history.length === 4);
  assert('First move by player', hist.body.history[0].actor === 'player');

  console.log('\n── 404 ──');
  const nf = await request('GET', '/game/nonexistent');
  assert('Status 404', nf.status === 404);

  console.log('\n── Full game to completion ──');
  const fg = await request('POST', '/game'); const fgId = fg.body.game_id;
  let moves = 0, playerMoveIndex = 0, gameOver = false, winner = null;
  while (!gameOver && playerMoveIndex < 36) {
    const col = String.fromCharCode(65 + (playerMoveIndex % 6));
    const row = Math.floor(playerMoveIndex / 6) + 1;
    playerMoveIndex++;
    const pRes = await request('POST', '/game/' + fgId + '/player-move', { coordinate: col + row });
    if (pRes.body.error) break; moves++;
    if (pRes.body.game_over) { gameOver = true; winner = pRes.body.winner; break; }
    const cRes = await request('POST', '/computer/' + fgId + '/move');
    if (cRes.body.error) break; moves++;
    if (cRes.body.game_over) { gameOver = true; winner = cRes.body.winner; break; }
  }
  assert('Game completed', gameOver); assert('Has winner', winner === 'player' || winner === 'computer');
  console.log('   Winner: ' + winner + ' after ' + moves + ' moves');

  console.log('\n══════════════════════════════════');
  console.log('  PASSED: ' + passed + '  |  FAILED: ' + failed);
  console.log('══════════════════════════════════\n');
}

const server = app.listen(3001, async () => {
  console.log('Test server on :3001');
  try { await runTests(); } catch (err) { console.error('Test error:', err); }
  finally { server.close(); process.exit(failed > 0 ? 1 : 0); }
});
