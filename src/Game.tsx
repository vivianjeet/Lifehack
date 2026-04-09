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

const moveLeft = (row: number[]) => {
  const newRow = row.filter(val => val !== 0);
  let score = 0;
  for (let i = 0; i < newRow.length - 1; i++) {
    if (newRow[i] === newRow[i + 1]) {
      newRow[i] *= 2;
      score += newRow[i];
      newRow[i + 1] = 0;
    }
  }
  const merged = newRow.filter(val => val !== 0);
  while (merged.length < SIZE) merged.push(0);
  return { row: merged, score };
};

const moveRight = (row: number[]) => {
  const result = moveLeft(row.slice().reverse());
  return { row: result.row.reverse(), score: result.score };
};

const moveUp = (board: number[][]) => {
  const transposed = board[0].map((_, col) => board.map(row => row[col]));
  let totalScore = 0;
  const newTransposed = transposed.map(row => {
    const result = moveLeft(row);
    totalScore += result.score;
    return result.row;
  });
  return { board: newTransposed[0].map((_, col) => newTransposed.map(row => row[col])), score: totalScore };
};

const moveDown = (board: number[][]) => {
  const transposed = board[0].map((_, col) => board.map(row => row[col]));
  let totalScore = 0;
  const newTransposed = transposed.map(row => {
    const result = moveRight(row);
    totalScore += result.score;
    return result.row;
  });
  return { board: newTransposed[0].map((_, col) => newTransposed.map(row => row[col])), score: totalScore };
};

const moveBoard = (board: number[][], direction: string) => {
  let result;
  if (direction === 'left') {
    let totalScore = 0;
    const newBoard = board.map(row => {
      const res = moveLeft(row);
      totalScore += res.score;
      return res.row;
    });
    result = { board: newBoard, score: totalScore };
  } else if (direction === 'right') {
    let totalScore = 0;
    const newBoard = board.map(row => {
      const res = moveRight(row);
      totalScore += res.score;
      return res.row;
    });
    result = { board: newBoard, score: totalScore };
  } else if (direction === 'up') {
    result = moveUp(board);
  } else if (direction === 'down') {
    result = moveDown(board);
  } else {
    return { board, score: 0 };
  }
  // Check if board changed
  const changed = JSON.stringify(result.board) !== JSON.stringify(board);
  if (changed) {
    addRandomTile(result.board);
  } else {
    result.score = 0; // No score if no move
  }
  return result;
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
    const myBoard = player === 1 ? board1 : board2;
    const myScore = player === 1 ? score1 : score2;
    const myUndos = player === 1 ? undos1 : undos2;
    const myReached2048 = player === 1 ? reached2048_1 : reached2048_2;
    const result = moveBoard(myBoard, direction);
    const boardChanged = JSON.stringify(result.board) !== JSON.stringify(myBoard);
    if (result.score > 0 || boardChanged) {
      const newScore = myScore + result.score;
      // 1 undo granted per 2500 points crossed by this move (can be multiple).
      const earnedUndos =
        Math.floor(newScore / 2500) - Math.floor(myScore / 2500);
      const newUndos = myUndos + earnedUndos;
      const boardHas2048 = result.board.some(row => row.some(cell => cell >= 2048));
      const firstReached2048 = boardHas2048 && !myReached2048;

      // Update Firebase
      console.log(`Player ${player} moving ${direction}, updating DB`);
      const playerPath = `games/${gameId}/player${player}`;
      // Save pre-move snapshot so the player can undo this move.
      set(ref(database, `${playerPath}/prevBoard`), myBoard)
        .catch((error) => console.error('Error saving prev board:', error));
      set(ref(database, `${playerPath}/prevScore`), myScore)
        .catch((error) => console.error('Error saving prev score:', error));
      set(ref(database, `${playerPath}/board`), result.board)
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

      // Update local
      if (player === 1) {
        setPrevBoard1(myBoard);
        setPrevScore1(myScore);
        setBoard1(result.board);
        setScore1(newScore);
        if (earnedUndos > 0) setUndos1(newUndos);
        if (firstReached2048) setReached2048_1(true);
        // Check for game over
        if (isGameOver(result.board)) {
          setGameOver1(true);
          set(ref(database, `${playerPath}/gameOver`), true)
            .then(() => console.log('Game over updated successfully'))
            .catch((error) => console.error('Error updating game over:', error));
        }
      } else {
        setPrevBoard2(myBoard);
        setPrevScore2(myScore);
        setBoard2(result.board);
        setScore2(newScore);
        if (earnedUndos > 0) setUndos2(newUndos);
        if (firstReached2048) setReached2048_2(true);
        // Check for game over
        if (isGameOver(result.board)) {
          setGameOver2(true);
          set(ref(database, `${playerPath}/gameOver`), true)
            .then(() => console.log('Game over updated successfully'))
            .catch((error) => console.error('Error updating game over:', error));
        }
      }
    }
  }, [
    player,
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
                <Board board={board1} onMove={player === 1 && !gameOver1 ? moveMyBoard : undefined} />
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
                <Board board={board2} onMove={player === 2 && !gameOver2 ? moveMyBoard : undefined} />
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