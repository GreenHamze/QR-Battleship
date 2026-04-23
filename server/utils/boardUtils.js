/**
 * boardUtils.js
 * Ship placement logic, hit/miss evaluation, board rendering helpers.
 * 6x6 board, 3 ships.
 */

const { COLS, ROWS, toLabel } = require('./coordinateUtils');

const FLEET = [
  { name: 'Cruiser',    size: 3 },
  { name: 'Destroyer',  size: 2 },
  { name: 'Patrol',     size: 2 },
];

function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS.length).fill(null));
}

function placeShip(grid, ship, startCol, startRow, horizontal) {
  const cells = [];
  for (let i = 0; i < ship.size; i++) {
    const c = horizontal ? startCol + i : startCol;
    const r = horizontal ? startRow : startRow + i;
    if (c >= COLS.length || r >= ROWS) return false;
    if (grid[r][c] !== null) return false;
    cells.push({ c, r });
  }
  for (const { c, r } of cells) {
    grid[r][c] = ship.name;
  }
  return true;
}

function randomPlacement() {
  const grid = emptyGrid();
  const ships = [];

  for (const ship of FLEET) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 200) {
      attempts++;
      const horizontal = Math.random() < 0.5;
      const maxCol = horizontal ? COLS.length - ship.size : COLS.length - 1;
      const maxRow = horizontal ? ROWS - 1 : ROWS - ship.size;
      const startCol = Math.floor(Math.random() * (maxCol + 1));
      const startRow = Math.floor(Math.random() * (maxRow + 1));
      placed = placeShip(grid, ship, startCol, startRow, horizontal);
    }
    if (!placed) {
      throw new Error('Failed to place ' + ship.name);
    }

    const shipCells = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS.length; c++) {
        if (grid[r][c] === ship.name) {
          shipCells.push(toLabel(c, r));
        }
      }
    }

    ships.push({
      name: ship.name,
      size: ship.size,
      cells: shipCells,
      hits: [],
      sunk: false,
    });
  }

  return { grid, ships };
}

function applyAttack(boardState, col, row) {
  const coord = toLabel(col, row);

  if (boardState.hits_received.includes(coord) || boardState.misses_received.includes(coord)) {
    return { result: 'already_targeted', shipName: null, sunk: false, allSunk: false };
  }

  const shipName = boardState.grid[row][col];

  if (shipName) {
    boardState.hits_received.push(coord);
    const ship = boardState.ships.find(s => s.name === shipName);
    ship.hits.push(coord);
    ship.sunk = ship.hits.length === ship.size;
    const allSunk = boardState.ships.every(s => s.sunk);
    return { result: 'hit', shipName, sunk: ship.sunk, allSunk };
  } else {
    boardState.misses_received.push(coord);
    return { result: 'miss', shipName: null, sunk: false, allSunk: false };
  }
}

function maskedGrid(boardState) {
  const grid = emptyGrid();
  for (const coord of boardState.misses_received) {
    const { col, row } = require('./coordinateUtils').parse(coord);
    grid[row][col] = 'miss';
  }
  for (const ship of boardState.ships) {
    for (const coord of ship.hits) {
      const { col, row } = require('./coordinateUtils').parse(coord);
      grid[row][col] = ship.sunk ? 'sunk' : 'hit';
    }
  }
  return grid;
}

function ownerGrid(boardState) {
  const grid = emptyGrid();

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS.length; c++) {
      if (boardState.grid[r][c]) {
        grid[r][c] = 'ship';
      }
    }
  }

  for (const ship of boardState.ships) {
    for (const coord of ship.hits) {
      const { col, row } = require('./coordinateUtils').parse(coord);
      grid[row][col] = ship.sunk ? 'sunk' : 'hit';
    }
  }

  for (const coord of boardState.misses_received) {
    const { col, row } = require('./coordinateUtils').parse(coord);
    grid[row][col] = 'miss';
  }

  return grid;
}

module.exports = { FLEET, emptyGrid, randomPlacement, applyAttack, maskedGrid, ownerGrid };
