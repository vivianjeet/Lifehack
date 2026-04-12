import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { ref, onValue, set, update, get } from 'firebase/database';
import { database } from './firebase';
import './Game.css';

const SIZE = 4;

const initialBoard = () => {
  const board = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0));
  addRandomTile(board);
  addRandomTile(board);
  return board;
};

const addRandomTile = (board: number[][]) => {
  const emptyCells = [];
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE; j++) {
      if (board[i][j] === 0) emptyCells.push([i, j]);
    }
  }
  if (emptyCells.length > 0) {
    const [x, y] = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    board[x][y] = Math.random() < 0.9 ? 2 : 4;
  }
};

// Tile-based game model. Tiles carry stable ids across moves so the UI can
// animate each tile sliding from its old position to its new one. A pure
// board-number model can't do that: a "4" landing in a cell is indistinguishable
// from the "4" that used to be there.
type Tile = {
  id: number;
  value: number;
  row: number;
  col: number;
  // Set on a tile that merged into another this move. It keeps its id so it
  // can slide to the destination cell, then gets cleaned up shortly after.
  mergedInto?: number;
  // Spawned by addRandomTileToTiles — plays a one-shot pop-in animation.
  isNew?: boolean;
  // The result of a merge this move — plays a one-shot scale-up pop.
  justMerged?: boolean;
};

let tileIdCounter = 0;
const nextTileId = () => ++tileIdCounter;

const boardToTiles = (board: number[][]): Tile[] => {
  const tiles: Tile[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== 0) {
        tiles.push({ id: nextTileId(), value: board[r][c], row: r, col: c });
      }
    }
  }
  return tiles;
};

const tilesToBoard = (tiles: Tile[]): number[][] => {
  const board: number[][] = Array.from({ length: SIZE }, () =>
    Array(SIZE).fill(0)
  );
  for (const t of tiles) {
    if (t.mergedInto !== undefined) continue;
    board[t.row][t.col] = t.value;
  }
  return board;
};

// Slide + merge all tiles in the given direction. Returns the new tile list
// (including merged-away tiles for the slide animation), the points scored,
// and whether anything actually moved.
const moveTilesInDirection = (
  input: Tile[],
  direction: 'left' | 'right' | 'up' | 'down'
): { tiles: Tile[]; score: number; moved: boolean } => {
  const horizontal = direction === 'left' || direction === 'right';
  const reverse = direction === 'right' || direction === 'down';

  // Drop any lingering "already merged away" tiles from a previous move and
  // clear per-move flags on the rest.
  const live = input
    .filter(t => t.mergedInto === undefined)
    .map(t => ({
      id: t.id,
      value: t.value,
      row: t.row,
      col: t.col,
    }));

  const result: Tile[] = [];
  let score = 0;
  let moved = false;

  for (let line = 0; line < SIZE; line++) {
    const lineTiles = live
      .filter(t => (horizontal ? t.row === line : t.col === line))
      .sort((a, b) => {
        if (horizontal) return reverse ? b.col - a.col : a.col - b.col;
        return reverse ? b.row - a.row : a.row - b.row;
      });

    const placed: Tile[] = [];
    const mergedAway: Tile[] = [];
    // True iff the most-recently-placed tile is still eligible to absorb a merge.
    // Flips to false the moment it *has* merged, so we don't chain-merge
    // (original 2048 rule: each tile can only merge once per move).
    let canMergeWithLast = false;

    for (const tile of lineTiles) {
      const lastPlaced = placed[placed.length - 1];
      if (canMergeWithLast && lastPlaced && lastPlaced.value === tile.value) {
        const mergePos = reverse
          ? SIZE - 1 - (placed.length - 1)
          : placed.length - 1;
        // Animate the consumed tile to its destination cell, then vanish.
        if (horizontal) tile.col = mergePos;
        else tile.row = mergePos;
        (tile as Tile).mergedInto = lastPlaced.id;
        mergedAway.push(tile);

        lastPlaced.value *= 2;
        (lastPlaced as Tile).justMerged = true;
        score += lastPlaced.value;
        canMergeWithLast = false;
        moved = true;
      } else {
        const nextPos = placed.length;
        const targetPos = reverse ? SIZE - 1 - nextPos : nextPos;
        const origPos = horizontal ? tile.col : tile.row;
        if (origPos !== targetPos) moved = true;
        if (horizontal) tile.col = targetPos;
        else tile.row = targetPos;
        placed.push(tile);
        canMergeWithLast = true;
      }
    }

    result.push(...placed, ...mergedAway);
  }

  return { tiles: result, score, moved };
};

const addRandomTileToTiles = (tiles: Tile[]): Tile[] => {
  const occupied = new Set<string>();
  for (const t of tiles) {
    if (t.mergedInto === undefined) occupied.add(`${t.row},${t.col}`);
  }
  const empty: Array<[number, number]> = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!occupied.has(`${r},${c}`)) empty.push([r, c]);
    }
  }
  if (empty.length === 0) return tiles;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const value = Math.random() < 0.9 ? 2 : 4;
  return [
    ...tiles,
    { id: nextTileId(), value, row: r, col: c, isNew: true },
  ];
};

const isGameOver = (board: number[][]) => {
  // Check if there are any empty cells
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE; j++) {
      if (board[i][j] === 0) return false;
    }
  }
  
  // Check if any adjacent cells can be merged
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE; j++) {
      const current = board[i][j];
      // Check right neighbor
      if (j < SIZE - 1 && current === board[i][j + 1]) return false;
      // Check bottom neighbor
      if (i < SIZE - 1 && current === board[i + 1][j]) return false;
    }
  }
  
  return true;
};

const Board: React.FC<{ board: number[][], onMove?: (direction: string) => void }> = ({ board, onMove }) => {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!onMove) return;
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!onMove || !touchStart) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;
    const minSwipeDistance = 50;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (Math.abs(deltaX) > minSwipeDistance) {
        onMove(deltaX > 0 ? 'right' : 'left');
      }
    } else {
      if (Math.abs(deltaY) > minSwipeDistance) {
        onMove(deltaY > 0 ? 'down' : 'up');
      }
    }
    setTouchStart(null);
  };

  return (
    <div
      className="board"
      onTouchStart={onMove ? handleTouchStart : undefined}
      onTouchEnd={onMove ? handleTouchEnd : undefined}
    >
      {board.map((row, i) => (
        <div key={i} className="row">
          {row.map((cell, j) => (
            <div key={j} className={`cell cell-${cell}`}>
              {cell !== 0 ? cell : ''}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

// Tile-based board used for the active player. Each tile is keyed by its
// stable id so React preserves the same DOM node across moves; sliding is
// handled by a CSS transition on the wrapper's transform.
const AnimatedBoard: React.FC<{
  tiles: Tile[];
  onMove?: (direction: string) => void;
}> = ({ tiles, onMove }) => {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(
    null
  );

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!onMove) return;
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!onMove || !touchStart) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;
    const minSwipeDistance = 30;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (Math.abs(deltaX) > minSwipeDistance) {
        onMove(deltaX > 0 ? 'right' : 'left');
      }
    } else {
      if (Math.abs(deltaY) > minSwipeDistance) {
        onMove(deltaY > 0 ? 'down' : 'up');
      }
    }
    setTouchStart(null);
  };

  return (
    <div
      className="board animated-board"
      onTouchStart={onMove ? handleTouchStart : undefined}
      onTouchEnd={onMove ? handleTouchEnd : undefined}
    >
      <div className="board-grid">
        {Array.from({ length: SIZE * SIZE }).map((_, i) => (
          <div key={`bg-${i}`} className="cell-bg" />
        ))}
        {tiles.map(tile => {
          const classes = ['tile', `tile-${tile.value}`];
          if (tile.isNew) classes.push('tile-new');
          if (tile.justMerged) classes.push('tile-merged');
          if (tile.mergedInto !== undefined) classes.push('tile-vanishing');
          return (
            <div
              key={tile.id}
              className="tile-wrapper"
              style={{
                transform: `translate(calc(${tile.col} * (var(--tile-size) + var(--tile-gap))), calc(${tile.row} * (var(--tile-size) + var(--tile-gap))))`,
                zIndex: tile.mergedInto !== undefined ? 1 : 2,
              }}
            >
              <div className={classes.join(' ')}>{tile.value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Game: React.FC = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const player = searchParams.get('player') === '2' ? 2 : 1;

  const [board1, setBoard1] = useState<number[][]>([]);
  const [board2, setBoard2] = useState<number[][]>([]);
  const [score1, setScore1] = useState<number>(0);
  const [score2, setScore2] = useState<number>(0);
  const [gameOver1, setGameOver1] = useState<boolean>(false);
  const [gameOver2, setGameOver2] = useState<boolean>(false);
  const [resetRequest1, setResetRequest1] = useState<boolean>(false);
  const [resetRequest2, setResetRequest2] = useState<boolean>(false);

  // Undo state: 1 undo granted for every 2500 points earned, stored in Firebase.
  const [undos1, setUndos1] = useState<number>(0);
  const [undos2, setUndos2] = useState<number>(0);
  const [prevBoard1, setPrevBoard1] = useState<number[][] | null>(null);
  const [prevBoard2, setPrevBoard2] = useState<number[][] | null>(null);
  const [prevScore1, setPrevScore1] = useState<number | null>(null);
  const [prevScore2, setPrevScore2] = useState<number | null>(null);

  // Tracks whether each player has ever crossed 2048 (persisted in Firebase).
  const [reached2048_1, setReached2048_1] = useState<boolean>(false);
  const [reached2048_2, setReached2048_2] = useState<boolean>(false);

  // Transient local flags that drive the one-shot 2048 celebration animation.
  const [celebrate1, setCelebrate1] = useState<boolean>(false);
  const [celebrate2, setCelebrate2] = useState<boolean>(false);
  const prevReached1Ref = useRef<boolean>(false);
  const prevReached2Ref = useRef<boolean>(false);

  // Tile-with-stable-ids representation of THE CURRENT PLAYER's board only.
  // The opponent board is rendered from its 2D array (no animation needed).
  // Updated atomically with board1/board2 inside moveMyBoard so animation
  // identities are preserved through a slide.
  const [selfTiles, setSelfTiles] = useState<Tile[]>([]);
  const tileCleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [resetTrigger, setResetTrigger] = useState<number>(0);

  const gameId = 'game1'; // Fixed for demo

  // Initialize and sync game state - load from DB if exists, otherwise create new
  useEffect(() => {
    const initializeGame = async () => {
      try {
        // Check if we already have state in Firebase
        const boardRef = ref(database, `games/${gameId}/player${player}/board`);
        const scoreRef = ref(database, `games/${gameId}/player${player}/score`);
        const gameOverRef = ref(database, `games/${gameId}/player${player}/gameOver`);
        const resetRequestRef = ref(database, `games/${gameId}/player${player}/resetRequest`);
        const undosRef = ref(database, `games/${gameId}/player${player}/undos`);
        const prevBoardRef = ref(database, `games/${gameId}/player${player}/prevBoard`);
        const prevScoreRef = ref(database, `games/${gameId}/player${player}/prevScore`);
        const reached2048Ref = ref(database, `games/${gameId}/player${player}/reached2048`);

        const [
          boardSnapshot,
          scoreSnapshot,
          gameOverSnapshot,
          resetRequestSnapshot,
          undosSnapshot,
          prevBoardSnapshot,
          prevScoreSnapshot,
          reached2048Snapshot,
        ] = await Promise.all([
          get(boardRef),
          get(scoreRef),
          get(gameOverRef),
          get(resetRequestRef),
          get(undosRef),
          get(prevBoardRef),
          get(prevScoreRef),
          get(reached2048Ref),
        ]);

        let board: number[][];
        let score: number;
        let gameOver: boolean;
        let resetRequest: boolean;
        let undos: number;
        let prevBoard: number[][] | null;
        let prevScore: number | null;
        let reached2048: boolean;

        if (boardSnapshot.exists() && scoreSnapshot.exists()) {
          // Load existing state from Firebase
          board = boardSnapshot.val();
          score = scoreSnapshot.val();
          gameOver = gameOverSnapshot.exists() ? gameOverSnapshot.val() : false;
          resetRequest = resetRequestSnapshot.exists() ? resetRequestSnapshot.val() : false;
          undos = undosSnapshot.exists() ? undosSnapshot.val() : 0;
          prevBoard = prevBoardSnapshot.exists() ? prevBoardSnapshot.val() : null;
          prevScore = prevScoreSnapshot.exists() ? prevScoreSnapshot.val() : null;
          reached2048 = reached2048Snapshot.exists() ? reached2048Snapshot.val() : false;
          console.log(`Player ${player} loaded existing state from Firebase`);
        } else {
          // Create new initial state
          board = initialBoard();
          score = 0;
          gameOver = false;
          resetRequest = false;
          undos = 0;
          prevBoard = null;
          prevScore = null;
          reached2048 = false;

          // Push initial state to Firebase
          await set(boardRef, board);
          await set(scoreRef, score);
          await set(gameOverRef, gameOver);
          await set(resetRequestRef, resetRequest);
          await set(undosRef, undos);
          await set(reached2048Ref, reached2048);
          console.log(`Player ${player} created new initial state`);
        }

        // Seed the "previously seen" ref so we don't trigger a celebration
        // animation for a 2048 that was already on the board before refresh.
        if (player === 1) prevReached1Ref.current = reached2048;
        else prevReached2Ref.current = reached2048;

        // Build the animated tile list from whichever board belongs to us.
        setSelfTiles(boardToTiles(board));

        // Set local state
        if (player === 1) {
          setBoard1(board);
          setScore1(score);
          setGameOver1(gameOver);
          setResetRequest1(resetRequest);
          setUndos1(undos);
          setPrevBoard1(prevBoard);
          setPrevScore1(prevScore);
          setReached2048_1(reached2048);
        } else {
          setBoard2(board);
          setScore2(score);
          setGameOver2(gameOver);
          setResetRequest2(resetRequest);
          setUndos2(undos);
          setPrevBoard2(prevBoard);
          setPrevScore2(prevScore);
          setReached2048_2(reached2048);
        }
        
      } catch (error) {
        console.error('Error initializing game state:', error);
        // Fallback to new board if Firebase fails
        const fallbackBoard = initialBoard();
        setSelfTiles(boardToTiles(fallbackBoard));
        if (player === 1) {
          setBoard1(fallbackBoard);
          setScore1(0);
          setGameOver1(false);
          setResetRequest1(false);
          setUndos1(0);
          setPrevBoard1(null);
          setPrevScore1(null);
          setReached2048_1(false);
        } else {
          setBoard2(fallbackBoard);
          setScore2(0);
          setGameOver2(false);
          setResetRequest2(false);
          setUndos2(0);
          setPrevBoard2(null);
          setPrevScore2(null);
          setReached2048_2(false);
        }
      }
    };

    initializeGame();
  }, [player, gameId]); // Only run once on mount

  // Listen to reset trigger
  useEffect(() => {
    const resetRef = ref(database, `games/${gameId}/reset`);
    const unsubscribeReset = onValue(resetRef, (snapshot) => {
      const data = snapshot.val();
      console.log(`Player ${player} reset trigger:`, data, 'current:', resetTrigger);
      if (data && data !== resetTrigger) {
        console.log('Reset triggered from DB for player', player);
        const initial = initialBoard();
        setSelfTiles(boardToTiles(initial));
        setBoard1(initial);
        setBoard2(initial);
        setScore1(0);
        setScore2(0);
        setGameOver1(false);
        setGameOver2(false);
        setResetRequest1(false);
        setResetRequest2(false);
        setUndos1(0);
        setUndos2(0);
        setPrevBoard1(null);
        setPrevBoard2(null);
        setPrevScore1(null);
        setPrevScore2(null);
        setReached2048_1(false);
        setReached2048_2(false);
        prevReached1Ref.current = false;
        prevReached2Ref.current = false;
        setCelebrate1(false);
        setCelebrate2(false);
        setResetTrigger(data);
      }
    });
    return () => unsubscribeReset();
  }, [resetTrigger, player, gameId]);

  const handleReset = async () => {
    const opponentResetRequest = player === 1 ? resetRequest2 : resetRequest1;
    
    // Set reset request for current player
    if (player === 1) {
      setResetRequest1(true);
    } else {
      setResetRequest2(true);
    }
    
    // Update Firebase
    await set(ref(database, `games/${gameId}/player${player}/resetRequest`), true);
    
    // Check if both players have requested reset
    if (opponentResetRequest) {
      // Both players have requested reset, perform actual reset
      const newResetTrigger = Date.now();
      const initial = initialBoard();
      console.log(`Both players requested reset, performing reset with trigger:`, newResetTrigger);
      
      const updates = {
        [`games/${gameId}/player1/board`]: initial,
        [`games/${gameId}/player1/score`]: 0,
        [`games/${gameId}/player1/gameOver`]: false,
        [`games/${gameId}/player1/resetRequest`]: false,
        [`games/${gameId}/player1/undos`]: 0,
        [`games/${gameId}/player1/prevBoard`]: null,
        [`games/${gameId}/player1/prevScore`]: null,
        [`games/${gameId}/player1/reached2048`]: false,
        [`games/${gameId}/player2/board`]: initial,
        [`games/${gameId}/player2/score`]: 0,
        [`games/${gameId}/player2/gameOver`]: false,
        [`games/${gameId}/player2/resetRequest`]: false,
        [`games/${gameId}/player2/undos`]: 0,
        [`games/${gameId}/player2/prevBoard`]: null,
        [`games/${gameId}/player2/prevScore`]: null,
        [`games/${gameId}/player2/reached2048`]: false,
        [`games/${gameId}/reset`]: newResetTrigger
      };
      
      await update(ref(database), updates);
      console.log('Game reset successfully in DB');
    } else {
      console.log(`Player ${player} requested reset, waiting for opponent`);
    }
  };
  useEffect(() => {
    const opponent = player === 1 ? 2 : 1;
    const boardRef = ref(database, `games/${gameId}/player${opponent}/board`);
    const scoreRef = ref(database, `games/${gameId}/player${opponent}/score`);
    const gameOverRef = ref(database, `games/${gameId}/player${opponent}/gameOver`);
    const resetRequestRef = ref(database, `games/${gameId}/player${opponent}/resetRequest`);
    const undosRef = ref(database, `games/${gameId}/player${opponent}/undos`);
    const reached2048Ref = ref(database, `games/${gameId}/player${opponent}/reached2048`);

    console.log(`Player ${player} listening to opponent ${opponent}`);

    const unsubscribeBoard = onValue(boardRef, (snapshot) => {
      const data = snapshot.val();
      console.log(`Player ${player} received board update:`, data);
      if (data) {
        setBoard1(prev => opponent === 1 ? data : prev);
        setBoard2(prev => opponent === 2 ? data : prev);
      }
    });

    const unsubscribeScore = onValue(scoreRef, (snapshot) => {
      const data = snapshot.val();
      console.log(`Player ${player} received score update:`, data);
      if (data !== null) {
        setScore1(prev => opponent === 1 ? data : prev);
        setScore2(prev => opponent === 2 ? data : prev);
      }
    });

    const unsubscribeGameOver = onValue(gameOverRef, (snapshot) => {
      const data = snapshot.val();
      console.log(`Player ${player} received game over update:`, data);
      if (data !== null) {
        setGameOver1(prev => opponent === 1 ? data : prev);
        setGameOver2(prev => opponent === 2 ? data : prev);
      }
    });

    const unsubscribeResetRequest = onValue(resetRequestRef, (snapshot) => {
      const data = snapshot.val();
      console.log(`Player ${player} received reset request update:`, data);
      if (data !== null) {
        setResetRequest1(prev => opponent === 1 ? data : prev);
        setResetRequest2(prev => opponent === 2 ? data : prev);
      }
    });

    const unsubscribeUndos = onValue(undosRef, (snapshot) => {
      const data = snapshot.val();
      if (data !== null) {
        setUndos1(prev => opponent === 1 ? data : prev);
        setUndos2(prev => opponent === 2 ? data : prev);
      }
    });

    const unsubscribeReached2048 = onValue(reached2048Ref, (snapshot) => {
      const data = snapshot.val() === true;
      setReached2048_1(prev => opponent === 1 ? data : prev);
      setReached2048_2(prev => opponent === 2 ? data : prev);
    });

    return () => {
      unsubscribeBoard();
      unsubscribeScore();
      unsubscribeGameOver();
      unsubscribeResetRequest();
      unsubscribeUndos();
      unsubscribeReached2048();
    };
  }, [player, gameId]);

  const moveMyBoard = useCallback((direction: string) => {
    if (direction !== 'left' && direction !== 'right' && direction !== 'up' && direction !== 'down') return;
    const myBoard = player === 1 ? board1 : board2;
    const myScore = player === 1 ? score1 : score2;
    const myUndos = player === 1 ? undos1 : undos2;
    const myReached2048 = player === 1 ? reached2048_1 : reached2048_2;

    // Move on the tile representation so sliding identities are preserved.
    const moveResult = moveTilesInDirection(selfTiles, direction);
    if (!moveResult.moved) return;

    // Spawn new random tile, then derive the 2D board from the resulting
    // tile list — that's what Firebase + game-over checks consume.
    const tilesWithSpawn = addRandomTileToTiles(moveResult.tiles);
    const newBoard = tilesToBoard(tilesWithSpawn);

    const newScore = myScore + moveResult.score;
    // 1 undo granted per 2500 points crossed by this move (can be multiple).
    const earnedUndos =
      Math.floor(newScore / 2500) - Math.floor(myScore / 2500);
    const newUndos = myUndos + earnedUndos;
    const boardHas2048 = newBoard.some(row => row.some(cell => cell >= 2048));
    const firstReached2048 = boardHas2048 && !myReached2048;

    // Update Firebase
    console.log(`Player ${player} moving ${direction}, updating DB`);
    const playerPath = `games/${gameId}/player${player}`;
    set(ref(database, `${playerPath}/prevBoard`), myBoard)
      .catch((error) => console.error('Error saving prev board:', error));
    set(ref(database, `${playerPath}/prevScore`), myScore)
      .catch((error) => console.error('Error saving prev score:', error));
    set(ref(database, `${playerPath}/board`), newBoard)
      .then(() => console.log('Board updated successfully'))
      .catch((error) => console.error('Error updating board:', error));
    set(ref(database, `${playerPath}/score`), newScore)
      .then(() => console.log('Score updated successfully'))
      .catch((error) => console.error('Error updating score:', error));
    if (earnedUndos > 0) {
      set(ref(database, `${playerPath}/undos`), newUndos)
        .catch((error) => console.error('Error updating undos:', error));
    }
    if (firstReached2048) {
      set(ref(database, `${playerPath}/reached2048`), true)
        .catch((error) => console.error('Error updating reached2048:', error));
    }

    // Drive the slide animation: render the merged-away tiles in their
    // destination positions for the duration of the CSS transition, then
    // strip them and clear per-move flags.
    setSelfTiles(tilesWithSpawn);
    if (tileCleanupRef.current) clearTimeout(tileCleanupRef.current);
    tileCleanupRef.current = setTimeout(() => {
      setSelfTiles(current =>
        current
          .filter(t => t.mergedInto === undefined)
          .map(t =>
            t.isNew || t.justMerged
              ? { ...t, isNew: false, justMerged: false }
              : t
          )
      );
      tileCleanupRef.current = null;
    }, 260);

    // Update local
    if (player === 1) {
      setPrevBoard1(myBoard);
      setPrevScore1(myScore);
      setBoard1(newBoard);
      setScore1(newScore);
      if (earnedUndos > 0) setUndos1(newUndos);
      if (firstReached2048) setReached2048_1(true);
      if (isGameOver(newBoard)) {
        setGameOver1(true);
        set(ref(database, `${playerPath}/gameOver`), true)
          .catch((error) => console.error('Error updating game over:', error));
      }
    } else {
      setPrevBoard2(myBoard);
      setPrevScore2(myScore);
      setBoard2(newBoard);
      setScore2(newScore);
      if (earnedUndos > 0) setUndos2(newUndos);
      if (firstReached2048) setReached2048_2(true);
      if (isGameOver(newBoard)) {
        setGameOver2(true);
        set(ref(database, `${playerPath}/gameOver`), true)
          .catch((error) => console.error('Error updating game over:', error));
      }
    }
  }, [
    player,
    selfTiles,
    board1,
    board2,
    score1,
    score2,
    undos1,
    undos2,
    reached2048_1,
    reached2048_2,
    gameId,
  ]);

  const handleUndo = useCallback(() => {
    const myPrevBoard = player === 1 ? prevBoard1 : prevBoard2;
    const myPrevScore = player === 1 ? prevScore1 : prevScore2;
    const myUndos = player === 1 ? undos1 : undos2;
    if (!myPrevBoard || myPrevScore === null || myUndos <= 0) return;

    const newUndos = myUndos - 1;
    const playerPath = `games/${gameId}/player${player}`;

    // Restore prior board/score, spend one undo, clear prev snapshot so
    // undos can't be chained through a single saved state.
    set(ref(database, `${playerPath}/board`), myPrevBoard)
      .catch((error) => console.error('Error undoing board:', error));
    set(ref(database, `${playerPath}/score`), myPrevScore)
      .catch((error) => console.error('Error undoing score:', error));
    set(ref(database, `${playerPath}/undos`), newUndos)
      .catch((error) => console.error('Error updating undos:', error));
    set(ref(database, `${playerPath}/prevBoard`), null)
      .catch((error) => console.error('Error clearing prev board:', error));
    set(ref(database, `${playerPath}/prevScore`), null)
      .catch((error) => console.error('Error clearing prev score:', error));
    set(ref(database, `${playerPath}/gameOver`), false)
      .catch((error) => console.error('Error clearing game over:', error));

    // Cancel any pending tile cleanup so it doesn't stomp on the restored
    // tile list mid-animation, then rebuild tiles fresh from the prev board.
    if (tileCleanupRef.current) {
      clearTimeout(tileCleanupRef.current);
      tileCleanupRef.current = null;
    }
    setSelfTiles(boardToTiles(myPrevBoard));

    if (player === 1) {
      setBoard1(myPrevBoard);
      setScore1(myPrevScore);
      setUndos1(newUndos);
      setPrevBoard1(null);
      setPrevScore1(null);
      setGameOver1(false);
    } else {
      setBoard2(myPrevBoard);
      setScore2(myPrevScore);
      setUndos2(newUndos);
      setPrevBoard2(null);
      setPrevScore2(null);
      setGameOver2(false);
    }
  }, [
    player,
    prevBoard1,
    prevBoard2,
    prevScore1,
    prevScore2,
    undos1,
    undos2,
    gameId,
  ]);

  // One-shot celebration animation whenever a player first crosses 2048.
  // Tracked via refs so we only fire on the false→true transition, not on
  // every unrelated re-render.
  useEffect(() => {
    if (reached2048_1 && !prevReached1Ref.current) {
      setCelebrate1(true);
      const t = setTimeout(() => setCelebrate1(false), 2500);
      prevReached1Ref.current = true;
      return () => clearTimeout(t);
    }
    prevReached1Ref.current = reached2048_1;
  }, [reached2048_1]);

  useEffect(() => {
    if (reached2048_2 && !prevReached2Ref.current) {
      setCelebrate2(true);
      const t = setTimeout(() => setCelebrate2(false), 2500);
      prevReached2Ref.current = true;
      return () => clearTimeout(t);
    }
    prevReached2Ref.current = reached2048_2;
  }, [reached2048_2]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (player === 1) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          moveMyBoard('up');
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          moveMyBoard('down');
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          moveMyBoard('left');
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          moveMyBoard('right');
        }
      } else {
        if (e.key === 'w' || e.key === 'W') {
          e.preventDefault();
          moveMyBoard('up');
        } else if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          moveMyBoard('down');
        } else if (e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          moveMyBoard('left');
        } else if (e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          moveMyBoard('right');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [player, moveMyBoard]);

  return (
    <div className="game">
      <h1>Multiplayer 2048 - Player {player}</h1>
      <div className="scores">
        <div className="score">Player 1 Score: {score1}</div>
        <div className="score">Player 2 Score: {score2}</div>
      </div>
      
      {(() => {
        const myResetRequest = player === 1 ? resetRequest1 : resetRequest2;
        const opponentResetRequest = player === 1 ? resetRequest2 : resetRequest1;
        const opponent = player === 1 ? 2 : 1;
        
        if (myResetRequest && !opponentResetRequest) {
          return <div className="waiting-message">Waiting for Player {opponent} to reset...</div>;
        } else if (!myResetRequest && opponentResetRequest) {
          return <div className="opponent-reset-message">Player {opponent} has requested to reset the game. Click reset to confirm.</div>;
        }
        return null;
      })()}
      
      <button 
        onClick={handleReset} 
        className="reset-button"
        disabled={(player === 1 ? resetRequest1 : resetRequest2)}
      >
        {(player === 1 ? resetRequest1 : resetRequest2) ? 'Reset Requested' : 'Reset Game'}
      </button>
      
      <p>Controls: {player === 1 ? 'Arrow Keys' : 'WASD Keys'} or Touch on Your Board v1</p>
      {(() => {
        // Leader/trailer classes only carry meaning on the enlarged (active)
        // board, but we attach them to both wrappers so the CSS can decide.
        const leader = score1 > score2 ? 1 : score2 > score1 ? 2 : 0;
        const p1Standing = leader === 1 ? 'leading' : leader === 2 ? 'trailing' : '';
        const p2Standing = leader === 2 ? 'leading' : leader === 1 ? 'trailing' : '';
        // When I hit 2048 it's "celebrate-self"; when my rival hits it, it's
        // "celebrate-rival" on my view of their board.
        const p1Celebrate = celebrate1
          ? player === 1
            ? 'celebrate-self'
            : 'celebrate-rival'
          : '';
        const p2Celebrate = celebrate2
          ? player === 2
            ? 'celebrate-self'
            : 'celebrate-rival'
          : '';
        return (
          <div className="boards">
            <div
              className={`board-wrapper ${player === 1 ? 'active' : 'opponent'} ${p1Standing} ${p1Celebrate}`}
            >
              <h2>Player 1</h2>
              <div className="board-container">
                {player === 1 ? (
                  <AnimatedBoard
                    tiles={selfTiles}
                    onMove={!gameOver1 ? moveMyBoard : undefined}
                  />
                ) : (
                  <Board board={board1} />
                )}
                {gameOver1 && <div className="game-over">Game Over</div>}
              </div>
              <button
                className="undo-button"
                onClick={handleUndo}
                disabled={player !== 1 || undos1 <= 0 || !prevBoard1}
              >
                Undo<sub>{undos1}</sub>
              </button>
            </div>
            <div
              className={`board-wrapper ${player === 2 ? 'active' : 'opponent'} ${p2Standing} ${p2Celebrate}`}
            >
              <h2>Player 2</h2>
              <div className="board-container">
                {player === 2 ? (
                  <AnimatedBoard
                    tiles={selfTiles}
                    onMove={!gameOver2 ? moveMyBoard : undefined}
                  />
                ) : (
                  <Board board={board2} />
                )}
                {gameOver2 && <div className="game-over">Game Over</div>}
              </div>
              <button
                className="undo-button"
                onClick={handleUndo}
                disabled={player !== 2 || undos2 <= 0 || !prevBoard2}
              >
                Undo<sub>{undos2}</sub>
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default Game;