export type Board = number[][]
export type Direction = "up" | "down" | "left" | "right"

interface GameTransaction {
  id: string
  board: Board
  score: number
  direction: Direction
  timestamp: number
  scoreIncrease: number
  txHash?: string
  batchId?: string
  isSubmittedToBlockchain?: boolean
}

// Game state for undo functionality
let gameHistory: { board: Board; score: number }[] = []
let currentBoard: Board = []
let currentScore = 0

export function initializeBoard(): Board {
  const board: Board = Array(4)
    .fill(null)
    .map(() => Array(4).fill(0))
  addRandomTile(board)
  addRandomTile(board)
  gameHistory = [{ board: JSON.parse(JSON.stringify(board)), score: 0 }]
  currentBoard = JSON.parse(JSON.stringify(board))
  currentScore = 0
  return board
}

export function addRandomTile(board: Board): void {
  const emptyCells: [number, number][] = []

  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (board[i][j] === 0) {
        emptyCells.push([i, j])
      }
    }
  }

  if (emptyCells.length > 0) {
    const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)]
    board[randomCell[0]][randomCell[1]] = Math.random() < 0.9 ? 2 : 4
  }
}

function slideArray(arr: number[]): { newArr: number[]; score: number } {
  const filtered = arr.filter((val) => val !== 0)
  const newArr = [...filtered]
  let score = 0

  for (let i = 0; i < filtered.length - 1; i++) {
    if (filtered[i] === filtered[i + 1]) {
      newArr[i] = filtered[i] * 2
      score += newArr[i]
      newArr[i + 1] = 0
      i++
    }
  }

  const result = newArr.filter((val) => val !== 0)
  while (result.length < 4) {
    result.push(0)
  }

  return { newArr: result, score }
}

function rotateBoard(board: Board): Board {
  const newBoard: Board = Array(4)
    .fill(null)
    .map(() => Array(4).fill(0))
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      newBoard[j][3 - i] = board[i][j]
    }
  }
  return newBoard
}

export function move(direction: Direction): {
  newBoard: Board
  scoreIncrease: number
  moved: boolean
  transaction: GameTransaction | null
} {
  let workingBoard = JSON.parse(JSON.stringify(currentBoard))
  let totalScore = 0
  let moved = false

  // Save current state for undo
  gameHistory.push({
    board: JSON.parse(JSON.stringify(currentBoard)),
    score: currentScore,
  })

  // Keep only last 10 moves for undo
  if (gameHistory.length > 10) {
    gameHistory = gameHistory.slice(-10)
  }

  // Rotate board based on direction
  let rotations = 0
  switch (direction) {
    case "up":
      rotations = 3
      break
    case "down":
      rotations = 1
      break
    case "left":
      rotations = 0
      break
    case "right":
      rotations = 2
      break
  }

  for (let i = 0; i < rotations; i++) {
    workingBoard = rotateBoard(workingBoard)
  }

  // Slide each row
  for (let i = 0; i < 4; i++) {
    const { newArr, score } = slideArray(workingBoard[i])
    if (JSON.stringify(newArr) !== JSON.stringify(workingBoard[i])) {
      moved = true
    }
    workingBoard[i] = newArr
    totalScore += score
  }

  // Rotate back
  for (let i = 0; i < (4 - rotations) % 4; i++) {
    workingBoard = rotateBoard(workingBoard)
  }

  currentBoard = workingBoard
  currentScore += totalScore

  const transaction: GameTransaction | null = moved
    ? {
        id: `move-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        board: JSON.parse(JSON.stringify(workingBoard)),
        score: currentScore,
        direction,
        timestamp: Date.now(),
        scoreIncrease: totalScore,
      }
    : null

  return {
    newBoard: workingBoard,
    scoreIncrease: totalScore,
    moved,
    transaction,
  }
}

export function undoLastMove(): { board: Board; score: number } | null {
  if (gameHistory.length > 1) {
    gameHistory.pop() // Remove current state
    const previousState = gameHistory[gameHistory.length - 1]
    currentBoard = JSON.parse(JSON.stringify(previousState.board))
    currentScore = previousState.score
    return { board: currentBoard, score: currentScore }
  }
  return null
}

export function hasWon(board: Board): boolean {
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (board[i][j] === 2048) {
        return true
      }
    }
  }
  return false
}

export function isGameOver(board: Board): boolean {
  // Check for empty cells
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (board[i][j] === 0) {
        return false
      }
    }
  }

  // Check for possible merges
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const current = board[i][j]
      if ((i < 3 && board[i + 1][j] === current) || (j < 3 && board[i][j + 1] === current)) {
        return false
      }
    }
  }

  return true
}
