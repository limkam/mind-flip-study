import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Trophy, ArrowRight, CheckCircle2, XCircle, Zap } from "lucide-react";

const COLS = 8;
const ROWS = 4;
const BRICK_COLORS = [
  "from-red-500 to-rose-600",
  "from-orange-500 to-amber-500",
  "from-yellow-400 to-yellow-500",
  "from-green-500 to-emerald-500",
  "from-blue-500 to-cyan-500",
  "from-purple-500 to-violet-600",
];

function makeBricks(count) {
  const bricks = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      bricks.push({ id: idx, row: r, col: c, alive: idx < count, color: BRICK_COLORS[(r + c) % BRICK_COLORS.length] });
    }
  }
  return bricks;
}

// Breakout-style canvas game
function BreakoutCanvas({ bricksAlive, onBreakBrick, onGameEnd, launched, paddleX }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    ball: { x: 200, y: 280, vx: 3.5, vy: -4 },
    paddleX: paddleX,
    running: false,
    bricksAlive: [...bricksAlive],
  });

  // sync paddleX
  useEffect(() => { stateRef.current.paddleX = paddleX; }, [paddleX]);
  // sync bricks
  useEffect(() => { stateRef.current.bricksAlive = [...bricksAlive]; }, [bricksAlive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const BRICK_W = W / COLS, BRICK_H = 22;
    const PADDLE_W = 80, PADDLE_H = 10;
    const BALL_R = 8;
    let raf;
    let running = launched;

    const draw = () => {
      // Background
      ctx.clearRect(0, 0, W, H);
      // Starfield bg
      ctx.fillStyle = "rgba(15,10,30,1)";
      ctx.fillRect(0, 0, W, H);

      // Draw bricks
      stateRef.current.bricksAlive.forEach((alive, idx) => {
        if (!alive) return;
        const row = Math.floor(idx / COLS);
        const col = idx % COLS;
        const x = col * BRICK_W + 2;
        const y = row * BRICK_H + 30 + 2;
        const bw = BRICK_W - 4, bh = BRICK_H - 4;
        const grad = ctx.createLinearGradient(x, y, x, y + bh);
        const colors = [
          ["#ef4444","#e11d48"],["#f97316","#d97706"],["#eab308","#ca8a04"],
          ["#22c55e","#059669"],["#3b82f6","#06b6d4"],["#a855f7","#7c3aed"],
        ];
        const ci = (row + col) % colors.length;
        grad.addColorStop(0, colors[ci][0]);
        grad.addColorStop(1, colors[ci][1]);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, bw, bh, 4);
        ctx.fill();
        // shine
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillRect(x + 4, y + 3, bw - 8, 3);
      });

      // Draw paddle
      const px = stateRef.current.paddleX;
      const grad2 = ctx.createLinearGradient(px, H - 20, px, H - 10);
      grad2.addColorStop(0, "#8b5cf6");
      grad2.addColorStop(1, "#ec4899");
      ctx.fillStyle = grad2;
      ctx.beginPath();
      ctx.roundRect(px, H - 20, PADDLE_W, PADDLE_H, 5);
      ctx.fill();

      // Draw ball
      const { x: bx, y: by } = stateRef.current.ball;
      const gball = ctx.createRadialGradient(bx - 2, by - 2, 1, bx, by, BALL_R);
      gball.addColorStop(0, "#ffffff");
      gball.addColorStop(0.5, "#c4b5fd");
      gball.addColorStop(1, "#7c3aed");
      ctx.fillStyle = gball;
      ctx.beginPath();
      ctx.arc(bx, by, BALL_R, 0, Math.PI * 2);
      ctx.fill();

      if (!running) return;

      // Physics
      let { x, y, vx, vy } = stateRef.current.ball;
      x += vx; y += vy;

      // Wall bounce
      if (x - BALL_R <= 0 || x + BALL_R >= W) vx = -vx;
      if (y - BALL_R <= 0) vy = -vy;

      // Paddle bounce
      if (y + BALL_R >= H - 20 && y + BALL_R <= H - 10 && x >= px && x <= px + PADDLE_W) {
        vy = -Math.abs(vy);
        const hit = (x - px) / PADDLE_W; // 0..1
        vx = (hit - 0.5) * 8;
      }

      // Floor = game over
      if (y + BALL_R > H) { running = false; onGameEnd?.("lost"); return; }

      // Brick collision
      stateRef.current.bricksAlive.forEach((alive, idx) => {
        if (!alive) return;
        const row = Math.floor(idx / COLS);
        const col = idx % COLS;
        const bx2 = col * BRICK_W, by2 = row * BRICK_H + 30;
        if (x + BALL_R > bx2 && x - BALL_R < bx2 + BRICK_W && y + BALL_R > by2 && y - BALL_R < by2 + BRICK_H) {
          stateRef.current.bricksAlive[idx] = false;
          vy = -vy;
          onBreakBrick(idx);
        }
      });

      stateRef.current.ball = { x, y, vx, vy };
    };

    const loop = () => { draw(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [launched]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={320}
      className="rounded-xl border border-purple-500/30 shadow-lg shadow-purple-500/20 w-full"
      style={{ maxWidth: 400, imageRendering: "pixelated" }}
    />
  );
}

export default function BricksGame({ cards, onRoundComplete }) {
  const totalBricks = Math.min(cards.length * 4, ROWS * COLS);
  const [bricksAlive, setBricksAlive] = useState(() => Array(ROWS * COLS).fill(false).map((_, i) => i < totalBricks));
  const [questions] = useState(() => cards.slice(0, Math.min(cards.length, 10)).map(card => {
    const wrong = cards.filter(c => c.back !== card.back).sort(() => Math.random() - 0.5).slice(0, 3).map(c => c.back);
    while (wrong.length < 3) wrong.push("None of the above");
    return { question: card.front, correct: card.back, options: [...wrong, card.back].sort(() => Math.random() - 0.5) };
  }));
  const [qIdx, setQIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [paddleX, setPaddleX] = useState(160);
  const [score, setScore] = useState(0);
  const [bricksSmashed, setBricksSmashed] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [gameResult, setGameResult] = useState(null);
  const containerRef = useRef(null);

  const remainingBricks = bricksAlive.filter(Boolean).length;

  // Mouse / touch paddle control
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onMove = (clientX) => {
      const rect = el.getBoundingClientRect();
      const scaleX = 400 / rect.width;
      const rel = (clientX - rect.left) * scaleX - 40;
      setPaddleX(Math.max(0, Math.min(320, rel)));
    };
    const onMouse = (e) => onMove(e.clientX);
    const onTouch = (e) => onMove(e.touches[0].clientX);
    el.addEventListener("mousemove", onMouse);
    el.addEventListener("touchmove", onTouch);
    return () => { el.removeEventListener("mousemove", onMouse); el.removeEventListener("touchmove", onTouch); };
  }, []);

  // Check win
  useEffect(() => {
    if (remainingBricks === 0 && !gameOver) {
      setLaunched(false);
      setGameOver(true);
      setGameResult("won");
      onRoundComplete?.({ playerScore: score, computerScore: 0, totalRounds: questions.length });
    }
  }, [remainingBricks]);

  const handleBreakBrick = useCallback((idx) => {
    setBricksAlive(prev => { const n = [...prev]; n[idx] = false; return n; });
    setBricksSmashed(p => p + 1);
  }, []);

  const handleGameEnd = useCallback((result) => {
    setLaunched(false);
    setGameOver(true);
    setGameResult(result);
    onRoundComplete?.({ playerScore: score, computerScore: 0, totalRounds: questions.length });
  }, [score, questions.length]);

  const handleAnswer = (option) => {
    if (showResult) return;
    setSelected(option);
    setShowResult(true);
    const correct = option === questions[qIdx]?.correct;
    if (correct) {
      setScore(p => p + 1);
      setLaunched(true);
      // auto-advance question after ball launched
      setTimeout(() => {
        setLaunched(false);
        setQIdx(p => (p + 1) % questions.length);
        setSelected(null);
        setShowResult(false);
      }, 3000);
    } else {
      setTimeout(() => {
        setQIdx(p => (p + 1) % questions.length);
        setSelected(null);
        setShowResult(false);
      }, 1500);
    }
  };

  if (gameOver) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="max-w-md mx-auto text-center bg-card rounded-3xl border border-border p-10">
        <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-5 ${gameResult === "won" ? "bg-green-500/10" : "bg-red-500/10"}`}>
          <Trophy className={`w-10 h-10 ${gameResult === "won" ? "text-yellow-400" : "text-red-400"}`} />
        </div>
        <h2 className="font-heading text-3xl font-bold mb-2">{gameResult === "won" ? "You cleared the board! 🎉" : "Ball lost 😬"}</h2>
        <p className="text-muted-foreground mb-6">{bricksSmashed} bricks smashed • {score} correct answers</p>
        <Button onClick={() => onRoundComplete?.({ playerScore: score, computerScore: 0, totalRounds: questions.length })}>Continue</Button>
      </motion.div>
    );
  }

  const q = questions[qIdx];

  return (
    <div className="max-w-2xl mx-auto">
      {/* Score bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          <span className="font-heading font-bold text-sm">{score} correct</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{remainingBricks} bricks left</span>
          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
            <motion.div className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
              animate={{ width: `${(1 - remainingBricks / totalBricks) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Game canvas */}
      <div ref={containerRef} className="relative cursor-none mb-5 select-none">
        <BreakoutCanvas
          bricksAlive={bricksAlive}
          onBreakBrick={handleBreakBrick}
          onGameEnd={handleGameEnd}
          launched={launched}
          paddleX={paddleX}
        />
        {!launched && !showResult && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="bg-black/60 text-white text-xs font-semibold px-3 py-1.5 rounded-full backdrop-blur-sm">
              Answer correctly to launch ball 🚀
            </span>
          </motion.div>
        )}
        {launched && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute top-2 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full">
            ✅ Correct! Ball launched!
          </motion.div>
        )}
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div key={qIdx}
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
          className="bg-card rounded-2xl border border-border p-5 mb-4 shadow-sm">
          <p className="text-xs text-muted-foreground mb-1">Answer to launch the ball:</p>
          <p className="font-heading font-semibold text-base leading-snug">{q?.question}</p>
        </motion.div>
      </AnimatePresence>

      {/* Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {q?.options.map((opt, i) => {
          const isSelected = selected === opt;
          const isCorrect = opt === q.correct;
          let cls = "border-border hover:border-primary/40 hover:bg-primary/5";
          if (showResult && isCorrect) cls = "border-green-500 bg-green-500/10";
          if (showResult && isSelected && !isCorrect) cls = "border-red-500 bg-red-500/10";
          return (
            <motion.button key={i}
              whileHover={!showResult ? { scale: 1.02 } : {}}
              whileTap={!showResult ? { scale: 0.97 } : {}}
              onClick={() => handleAnswer(opt)}
              disabled={showResult}
              className={`w-full text-left p-3 rounded-xl border-2 transition-all text-sm font-medium flex items-center gap-2 ${cls}`}
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0
                ${showResult && isCorrect ? "bg-green-500 text-white" : ""}
                ${showResult && isSelected && !isCorrect ? "bg-red-500 text-white" : ""}
                ${!showResult || (!isCorrect && !isSelected) ? "bg-muted text-muted-foreground" : ""}
              `}>
                {showResult && isCorrect ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                 showResult && isSelected && !isCorrect ? <XCircle className="w-3.5 h-3.5" /> :
                 String.fromCharCode(65 + i)}
              </div>
              <span className="line-clamp-2">{opt}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}