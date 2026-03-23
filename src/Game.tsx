import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { ref, onValue, set } from 'firebase/database';
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

  const [board1, setBoard1] = useState<number[][]>(initialBoard);
  const [board2, setBoard2] = useState<number[][]>(initialBoard);
  const [score1, setScore1] = useState<number>(0);
  const [score2, setScore2] = useState<number>(0);

  const gameId = 'game1'; // Fixed for demo

  // Listen to opponent's board and score
  useEffect(() => {
    const opponent = player === 1 ? 2 : 1;
    const boardRef = ref(database, `games/${gameId}/player${opponent}/board`);
    const scoreRef = ref(database, `games/${gameId}/player${opponent}/score`);

    const unsubscribeBoard = onValue(boardRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setBoard1(prev => opponent === 1 ? data : prev);
        setBoard2(prev => opponent === 2 ? data : prev);
      }
    });

    const unsubscribeScore = onValue(scoreRef, (snapshot) => {
      const data = snapshot.val();
      if (data !== null) {
        setScore1(prev => opponent === 1 ? data : prev);
        setScore2(prev => opponent === 2 ? data : prev);
      }
    });

    return () => {
      unsubscribeBoard();
      unsubscribeScore();
    };
  }, [player, gameId]);

  const moveMyBoard = useCallback((direction: string) => {
    const myBoard = player === 1 ? board1 : board2;
    const result = moveBoard(myBoard, direction);
    if (result.score > 0 || JSON.stringify(result.board) !== JSON.stringify(myBoard)) {
      // Update Firebase
      set(ref(database, `games/${gameId}/player${player}/board`), result.board);
      set(ref(database, `games/${gameId}/player${player}/score`), (player === 1 ? score1 : score2) + result.score);
      // Update local
      if (player === 1) {
        setBoard1(result.board);
        setScore1(s => s + result.score);
      } else {
        setBoard2(result.board);
        setScore2(s => s + result.score);
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
      <p>Controls: {player === 1 ? 'Arrow Keys' : 'WASD Keys'} or Touch on Your Board v1</p>
      <div className="boards">
        <div className="board-wrapper">
          <h2>Player 1</h2>
          <Board board={board1} onMove={player === 1 ? moveMyBoard : undefined} />
        </div>
        <div className="board-wrapper">
          <h2>Player 2</h2>
          <Board board={board2} onMove={player === 2 ? moveMyBoard : undefined} />
        </div>
      </div>
    </div>
  );
};

export default Game;