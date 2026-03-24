import React, { useState, useEffect, useCallback } from 'react';
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
        
        const [boardSnapshot, scoreSnapshot, gameOverSnapshot, resetRequestSnapshot] = await Promise.all([
          get(boardRef),
          get(scoreRef),
          get(gameOverRef),
          get(resetRequestRef)
        ]);
        
        let board: number[][];
        let score: number;
        let gameOver: boolean;
        let resetRequest: boolean;
        
        if (boardSnapshot.exists() && scoreSnapshot.exists()) {
          // Load existing state from Firebase
          board = boardSnapshot.val();
          score = scoreSnapshot.val();
          gameOver = gameOverSnapshot.exists() ? gameOverSnapshot.val() : false;
          resetRequest = resetRequestSnapshot.exists() ? resetRequestSnapshot.val() : false;
          console.log(`Player ${player} loaded existing state from Firebase`);
        } else {
          // Create new initial state
          board = initialBoard();
          score = 0;
          gameOver = false;
          resetRequest = false;
          
          // Push initial state to Firebase
          await set(boardRef, board);
          await set(scoreRef, score);
          await set(gameOverRef, gameOver);
          await set(resetRequestRef, resetRequest);
          console.log(`Player ${player} created new initial state`);
        }
        
        // Set local state
        if (player === 1) {
          setBoard1(board);
          setScore1(score);
          setGameOver1(gameOver);
          setResetRequest1(resetRequest);
        } else {
          setBoard2(board);
          setScore2(score);
          setGameOver2(gameOver);
          setResetRequest2(resetRequest);
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
        } else {
          setBoard2(fallbackBoard);
          setScore2(0);
          setGameOver2(false);
          setResetRequest2(false);
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
        [`games/${gameId}/player2/board`]: initial,
        [`games/${gameId}/player2/score`]: 0,
        [`games/${gameId}/player2/gameOver`]: false,
        [`games/${gameId}/player2/resetRequest`]: false,
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

    return () => {
      unsubscribeBoard();
      unsubscribeScore();
      unsubscribeGameOver();
      unsubscribeResetRequest();
    };
  }, [player, gameId]);

  const moveMyBoard = useCallback((direction: string) => {
    const myBoard = player === 1 ? board1 : board2;
    const result = moveBoard(myBoard, direction);
    if (result.score > 0 || JSON.stringify(result.board) !== JSON.stringify(myBoard)) {
      // Update Firebase
      console.log(`Player ${player} moving ${direction}, updating DB`);
      set(ref(database, `games/${gameId}/player${player}/board`), result.board)
        .then(() => console.log('Board updated successfully'))
        .catch((error) => console.error('Error updating board:', error));
      set(ref(database, `games/${gameId}/player${player}/score`), (player === 1 ? score1 : score2) + result.score)
        .then(() => console.log('Score updated successfully'))
        .catch((error) => console.error('Error updating score:', error));
      // Update local
      if (player === 1) {
        setBoard1(result.board);
        setScore1(s => s + result.score);
        // Check for game over
        if (isGameOver(result.board)) {
          setGameOver1(true);
          set(ref(database, `games/${gameId}/player${player}/gameOver`), true)
            .then(() => console.log('Game over updated successfully'))
            .catch((error) => console.error('Error updating game over:', error));
        }
      } else {
        setBoard2(result.board);
        setScore2(s => s + result.score);
        // Check for game over
        if (isGameOver(result.board)) {
          setGameOver2(true);
          set(ref(database, `games/${gameId}/player${player}/gameOver`), true)
            .then(() => console.log('Game over updated successfully'))
            .catch((error) => console.error('Error updating game over:', error));
        }
      }
    }
  }, [player, board1, board2, score1, score2, gameId]);

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
      <div className="boards">
        <div className="board-wrapper">
          <h2>Player 1</h2>
          <div className="board-container">
            <Board board={board1} onMove={player === 1 && !gameOver1 ? moveMyBoard : undefined} />
            {gameOver1 && <div className="game-over">Game Over</div>}
          </div>
        </div>
        <div className="board-wrapper">
          <h2>Player 2</h2>
          <div className="board-container">
            <Board board={board2} onMove={player === 2 && !gameOver2 ? moveMyBoard : undefined} />
            {gameOver2 && <div className="game-over">Game Over</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Game;