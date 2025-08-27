"use client"

import type React from "react"

import {
  type Board,
  type Direction,
  initializeBoard,
  undoLastMove,
  move,
  addRandomTile,
  hasWon,
  isGameOver,
} from "@/utils/gameUtils"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useCallback, useState, useEffect } from "react"
import { Buffer } from "buffer"

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

interface WalletState {
  isConnected: boolean
  address: string | null
  balance: string
  network: string
}

export default function Game2048() {
  const [board, setBoard] = useState<Board>(() => initializeBoard())
  const [score, setScore] = useState(0)
  const [bestScore, setBestScore] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  const [transactions, setTransactions] = useState<GameTransaction[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [pendingBatch, setPendingBatch] = useState<GameTransaction[]>([])
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false)

  const [wallet, setWallet] = useState<WalletState>({
    isConnected: false,
    address: null,
    balance: "0.0000",
    network: "Intuition Testnet",
  })

  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null)
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null)

  const handleMove = useCallback(
    async (direction: Direction) => {
      if (gameOver) return

      if (!wallet.isConnected) {
        alert("Please connect your wallet to make moves!")
        return
      }

      const { newBoard, scoreIncrease, moved, transaction } = move(direction)

      if (moved && transaction) {
        try {
          const moveHash = await signGameMove(direction, scoreIncrease)
          transaction.txHash = moveHash
          transaction.isSubmittedToBlockchain = false

          const newTransactions = [...transactions, transaction]
          setTransactions(newTransactions)

          const newPendingBatch = [...pendingBatch, transaction]
          setPendingBatch(newPendingBatch)

          addRandomTile(newBoard)
          setBoard(newBoard)
          setScore((prev) => prev + scoreIncrease)

          if (newPendingBatch.length >= 15) {
            await submitBatchToBlockchain(newPendingBatch)
          }

          if (hasWon(newBoard) && !won) {
            setWon(true)
          }

          if (isGameOver(newBoard)) {
            setGameOver(true)
          }
        } catch (error) {
          console.error("[v0] Move recording failed:", error)
          alert("Move recording failed! Please try again.")
        }
      }
    },
    [board, gameOver, won, score, transactions, pendingBatch, wallet.isConnected, wallet.address],
  )

  const handleKeyPress = useCallback(
    async (event: KeyboardEvent) => {
      let direction: Direction | null = null

      switch (event.key) {
        case "ArrowUp":
          direction = "up"
          break
        case "ArrowDown":
          direction = "down"
          break
        case "ArrowLeft":
          direction = "left"
          break
        case "ArrowRight":
          direction = "right"
          break
        case "u":
        case "U":
          event.preventDefault()
          const result = undoLastMove()
          if (result) {
            setBoard(result.board)
            setScore(result.score)
          }
          return
        default:
          return
      }

      event.preventDefault()
      await handleMove(direction)
    },
    [handleMove],
  )

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault()
    setTouchEnd(null)
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    })
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault()
    setTouchEnd({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    })
  }

  const handleTouchEnd = async (e: React.TouchEvent) => {
    e.preventDefault()
    if (!touchStart || !touchEnd) return

    const distanceX = touchStart.x - touchEnd.x
    const distanceY = touchStart.y - touchEnd.y
    const isLeftSwipe = distanceX > 50
    const isRightSwipe = distanceX < -50
    const isUpSwipe = distanceY > 50
    const isDownSwipe = distanceY < -50

    let direction: Direction | null = null

    // Determine swipe direction based on the largest distance
    if (Math.abs(distanceX) > Math.abs(distanceY)) {
      // Horizontal swipe
      if (isLeftSwipe) direction = "left"
      if (isRightSwipe) direction = "right"
    } else {
      // Vertical swipe
      if (isUpSwipe) direction = "up"
      if (isDownSwipe) direction = "down"
    }

    if (direction) {
      await handleMove(direction)
    }
  }

  useEffect(() => {
    document.addEventListener("keydown", handleKeyPress)
    return () => document.removeEventListener("keydown", handleKeyPress)
  }, [handleKeyPress])

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert("Please install MetaMask to play!")
        return
      }

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      })

      if (accounts.length > 0) {
        const balance = await fetchCurrentBalance(accounts[0])

        setWallet({
          isConnected: true,
          address: accounts[0],
          balance: balance,
          network: "Intuition Testnet",
        })

        console.log("[v0] Wallet connected:", accounts[0])
      }
    } catch (error) {
      console.error("[v0] Wallet connection failed:", error)
      alert("Failed to connect wallet")
    }
  }

  const fetchCurrentBalance = async (address: string) => {
    try {
      const balance = await window.ethereum.request({
        method: "eth_getBalance",
        params: [address, "latest"],
      })
      return (Number.parseInt(balance, 16) / Math.pow(10, 18)).toFixed(4)
    } catch (error) {
      console.error("[v0] Balance fetch failed:", error)
      return "0.0000"
    }
  }

  const refreshBalance = async () => {
    if (wallet.address) {
      console.log("[v0] Fetching current balance for:", wallet.address)
      const newBalance = await fetchCurrentBalance(wallet.address)
      console.log("[v0] New balance fetched:", newBalance)
      setWallet((prev) => ({ ...prev, balance: newBalance }))
    }
  }

  useEffect(() => {
    if (wallet.isConnected && wallet.address) {
      const interval = setInterval(refreshBalance, 30000) // Refresh every 30 seconds
      return () => clearInterval(interval)
    }
  }, [wallet.isConnected, wallet.address])

  const submitBatchToBlockchain = async (batchMoves: GameTransaction[]) => {
    try {
      if (!window.ethereum || !wallet.address) {
        throw new Error("Wallet not connected")
      }

      setIsSubmittingBatch(true)

      const batchData = {
        moves: batchMoves.map((move) => ({
          direction: move.direction,
          scoreIncrease: move.scoreIncrease,
          timestamp: move.timestamp,
        })),
        totalScore: batchMoves.reduce((sum, move) => sum + move.scoreIncrease, 0),
        batchId: `batch-${Date.now()}`,
        player: wallet.address,
        gameId: "2048-game",
      }

      console.log("[v0] Submitting batch transaction...")
      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: wallet.address,
            to: wallet.address,
            value: "0x0",
            data: "0x" + Buffer.from(JSON.stringify(batchData)).toString("hex"),
          },
        ],
      })

      console.log("[v0] Batch transaction submitted:", txHash)

      const updatedTransactions = transactions.map((tx) => {
        const batchMove = batchMoves.find((bm) => bm.id === tx.id)
        if (batchMove) {
          return {
            ...tx,
            batchId: batchData.batchId,
            isSubmittedToBlockchain: true,
            txHash: txHash,
          }
        }
        return tx
      })

      setTransactions(updatedTransactions)
      setPendingBatch([])

      console.log("[v0] Refreshing balance after batch submission...")

      // Immediate refresh
      await refreshBalance()

      // Refresh after 3 seconds (increased from 2)
      setTimeout(async () => {
        console.log("[v0] First balance refresh attempt...")
        await refreshBalance()
      }, 3000)

      // Additional refresh after 8 seconds to ensure transaction is mined
      setTimeout(async () => {
        console.log("[v0] Second balance refresh attempt...")
        await refreshBalance()
      }, 8000)
    } catch (error) {
      console.error("[v0] Batch submission failed:", error)
      alert("Failed to submit moves to blockchain. Please try again.")
    } finally {
      setIsSubmittingBatch(false)
    }
  }

  const signGameMove = async (direction: Direction, scoreIncrease: number) => {
    try {
      if (!window.ethereum || !wallet.address) {
        throw new Error("Wallet not connected")
      }

      const moveHash = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      return moveHash
    } catch (error) {
      console.error("[v0] Move recording failed:", error)
      throw error
    }
  }

  const disconnectWallet = () => {
    setWallet({
      isConnected: false,
      address: null,
      balance: "0.0000",
      network: "Intuition Testnet",
    })
    // Reset game state when disconnecting
    resetGame()
    console.log("[v0] Wallet disconnected")
  }

  function resetGame() {
    setBoard(initializeBoard())
    setScore(0)
    setGameOver(false)
    setWon(false)
    setTransactions([])
    setPendingBatch([])
  }

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-white mb-2">2048</h1>
          <p className="text-gray-400 text-sm">Join tiles to reach 2048!</p>
        </div>

        {!wallet.isConnected ? (
          <Card className="p-6 mb-4 bg-gray-800 border-gray-700 text-center">
            <h2 className="text-xl font-semibold text-white mb-4">Connect Wallet to Play</h2>
            <p className="text-gray-400 mb-4 text-sm">Connect your wallet to record moves on the blockchain</p>
            <Button onClick={connectWallet} className="w-full">
              Connect Wallet
            </Button>
          </Card>
        ) : (
          <>
            <Card className="p-4 mb-4 bg-gray-800 border-gray-700">
              <div className="text-center">
                <div className="text-sm text-gray-400 mb-1">Connected to {wallet.network}</div>
                <div className="text-xs text-blue-400 font-mono mb-2">
                  {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
                </div>
                <div className="flex items-center justify-center gap-2">
                  <div className="text-lg font-bold text-white">{wallet.balance} TRUST</div>
                </div>
                <div className="mt-3">
                  <Button
                    onClick={disconnectWallet}
                    variant="outline"
                    size="sm"
                    className="text-xs bg-transparent border-gray-600 text-gray-400 hover:text-white"
                  >
                    Disconnect Wallet
                  </Button>
                </div>
              </div>
            </Card>

            <div className="flex justify-between mb-4">
              <Card className="px-4 py-2 bg-gray-800 border-gray-700">
                <div className="text-sm text-gray-400">Score</div>
                <div className="text-xl font-bold text-white">{score}</div>
              </Card>
              <Card className="px-4 py-2 bg-gray-800 border-gray-700">
                <div className="text-sm text-gray-400">Best</div>
                <div className="text-xl font-bold text-white">{bestScore}</div>
              </Card>
              <Card className="px-4 py-2 bg-gray-800 border-gray-700">
                <div className="text-sm text-gray-400">Moves</div>
                <div className="text-xl font-bold text-white">{transactions.length}</div>
              </Card>
            </div>

            {pendingBatch.length > 0 && (
              <Card className="p-3 mb-4 bg-yellow-900/20 border-yellow-600">
                <div className="text-center">
                  <p className="text-sm text-yellow-300">
                    {isSubmittingBatch
                      ? "Submitting moves to blockchain..."
                      : `${pendingBatch.length}/15 moves pending blockchain submission`}
                  </p>
                  {isSubmittingBatch && (
                    <div className="mt-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-400 mx-auto"></div>
                    </div>
                  )}
                </div>
              </Card>
            )}

            <Card className="p-4 mb-4 bg-gray-800 border-gray-700">
              <div
                className="grid grid-cols-4 gap-2"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {board.flat().map((cell, index) => (
                  <div
                    key={index}
                    className={`
                      h-16 w-16 rounded-lg flex items-center justify-center text-lg font-bold shadow-lg
                      ${
                        cell === 0
                          ? "bg-gray-700"
                          : cell === 2
                            ? "bg-red-500 text-white"
                            : cell === 4
                              ? "bg-orange-500 text-white"
                              : cell === 8
                                ? "bg-yellow-500 text-white"
                                : cell === 16
                                  ? "bg-green-500 text-white"
                                  : cell === 32
                                    ? "bg-blue-500 text-white"
                                    : cell === 64
                                      ? "bg-purple-500 text-white"
                                      : cell === 128
                                        ? "bg-pink-500 text-white"
                                        : cell === 256
                                          ? "bg-indigo-500 text-white"
                                          : cell === 512
                                            ? "bg-cyan-500 text-white"
                                            : cell === 1024
                                              ? "bg-emerald-500 text-white"
                                              : cell === 2048
                                                ? "bg-gold-500 text-white"
                                                : "bg-gray-600 text-white"
                      }
                    `}
                  >
                    {cell !== 0 && cell}
                  </div>
                ))}
              </div>
            </Card>

            {transactions.length > 0 && (
              <Card className="p-4 mb-4 bg-gray-800 border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-semibold text-white">Recent Moves</h3>
                  <div className="text-xs text-gray-400">
                    {pendingBatch.length > 0 && (
                      <span className="text-yellow-400">
                        {pendingBatch.length}/15 pending
                        {isSubmittingBatch && " (submitting...)"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {transactions
                    .slice(-3)
                    .reverse()
                    .map((tx) => (
                      <div key={tx.id} className="text-xs text-gray-300 flex justify-between">
                        <span>
                          {tx.direction.toUpperCase()} (+{tx.scoreIncrease})
                          {tx.isSubmittedToBlockchain ? (
                            <span className="text-green-400 ml-1">✓</span>
                          ) : (
                            <span className="text-yellow-400 ml-1">⏳</span>
                          )}
                        </span>
                        <span className="font-mono text-blue-400">
                          {tx.isSubmittedToBlockchain ? tx.txHash?.slice(0, 12) + "..." : "pending..."}
                        </span>
                      </div>
                    ))}
                </div>
                {pendingBatch.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-700">
                    <Button
                      onClick={() => submitBatchToBlockchain(pendingBatch)}
                      disabled={isSubmittingBatch}
                      size="sm"
                      className="w-full text-xs"
                    >
                      {isSubmittingBatch
                        ? "Submitting to Blockchain..."
                        : `Submit ${pendingBatch.length} Moves to Blockchain`}
                    </Button>
                  </div>
                )}
              </Card>
            )}

            <div className="flex gap-2 mb-4">
              <Button onClick={resetGame} variant="outline" className="flex-1 bg-transparent">
                New Game
              </Button>
              <Button
                onClick={() => {
                  const result = undoLastMove()
                  if (result) {
                    setBoard(result.board)
                    setScore(result.score)
                  }
                }}
                variant="outline"
                disabled={!canUndo}
              >
                Undo
              </Button>
            </div>

            <div className="text-center text-xs text-gray-500">Use arrow keys or swipe to play • U to undo</div>

            {(won || gameOver) && (
              <Card className="p-4 mt-4 bg-gray-800 border-gray-700 text-center">
                <h2 className="text-xl font-bold text-white mb-2">{won ? "You Win!" : "Game Over!"}</h2>
                <p className="text-gray-400 mb-4">Final Score: {score}</p>
                <Button onClick={resetGame}>Play Again</Button>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
