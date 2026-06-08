import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Timer, Zap, Trophy, ArrowRight, RotateCcw } from "lucide-react";
import { useConfetti } from "@/components/common/ConfettiEffect";

export default function QuizGame({ cards, setTitle, onComplete }) {
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [gameOver, setGameOver] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const timerRef = useRef(null);
  const { fire: fireConfetti } = useConfetti();

  useEffect(() => {
    if (!cards || cards.length === 0) return;
    
    const quizQuestions = cards.slice(0, 20).map(card => {
      const wrongAnswers = cards
        .filter(c => c.back !== card.back)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map(c => c.back);
      
      while (wrongAnswers.length < 3) {
        wrongAnswers.push("Not applicable");
      }
      
      const options = [...wrongAnswers, card.back].sort(() => Math.random() - 0.5);
      
      return {
        question: card.front,
        correctAnswer: card.back,
        options,
        chapter: card.chapter,
      };
    });
    
    setQuestions(quizQuestions);
    timerRef.current = setInterval(() => setTimeElapsed(prev => prev + 1), 1000);
    
    return () => clearInterval(timerRef.current);
  }, [cards]);

  const handleAnswer = (answer) => {
    if (showResult) return;
    setSelectedAnswer(answer);
    setShowResult(true);

    const isCorrect = answer === questions[currentIndex].correctAnswer;
    if (isCorrect) {
      setScore(prev => prev + 1);
      setStreak(prev => {
        const newStreak = prev + 1;
        setMaxStreak(ms => Math.max(ms, newStreak));
        return newStreak;
      });
    } else {
      setStreak(0);
    }

    setAnswers(prev => [...prev, {
      question: questions[currentIndex].question,
      user_answer: answer,
      correct_answer: questions[currentIndex].correctAnswer,
      is_correct: isCorrect,
    }]);
  };

  const nextQuestion = () => {
    if (currentIndex + 1 >= questions.length) {
      clearInterval(timerRef.current);
      setGameOver(true);
      const finalPct = Math.round((score / questions.length) * 100);
      if (finalPct === 100) fireConfetti("perfect");
      else if (finalPct >= 80) fireConfetti("default");
      onComplete?.({
        score: score,
        total_questions: questions.length,
        percentage: finalPct,
        time_taken_seconds: timeElapsed,
        answers,
      });
    } else {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (questions.length === 0) return null;

  if (gameOver) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-lg mx-auto text-center"
      >
        <div className="bg-card rounded-3xl border border-border p-8 shadow-lg">
          <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <Trophy className="w-10 h-10 text-primary" />
          </div>
          <h2 className="font-heading text-3xl font-bold mb-2">Quiz Complete!</h2>
          <p className="text-muted-foreground mb-6">{setTitle}</p>
          
          <div className="text-6xl font-heading font-bold text-primary mb-2">{pct}%</div>
          <p className="text-muted-foreground mb-8">
            {score} out of {questions.length} correct
          </p>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-muted rounded-xl p-3">
              <Timer className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-sm font-semibold">{formatTime(timeElapsed)}</p>
              <p className="text-xs text-muted-foreground">Time</p>
            </div>
            <div className="bg-muted rounded-xl p-3">
              <Zap className="w-5 h-5 mx-auto text-yellow-500 mb-1" />
              <p className="text-sm font-semibold">{maxStreak}</p>
              <p className="text-xs text-muted-foreground">Best Streak</p>
            </div>
            <div className="bg-muted rounded-xl p-3">
              <CheckCircle2 className="w-5 h-5 mx-auto text-green-500 mb-1" />
              <p className="text-sm font-semibold">{score}</p>
              <p className="text-xs text-muted-foreground">Correct</p>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  const currentQ = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-muted-foreground">
            {currentIndex + 1} / {questions.length}
          </span>
          {streak > 1 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-1 bg-yellow-500/10 text-yellow-500 px-2 py-1 rounded-full text-xs font-semibold"
            >
              <Zap className="w-3 h-3" /> {streak} streak!
            </motion.div>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Timer className="w-4 h-4" />
          {formatTime(timeElapsed)}
        </div>
      </div>

      <Progress value={progress} className="h-2 mb-8" />

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          className="bg-card rounded-2xl border border-border p-8 shadow-sm mb-6"
        >
          {currentQ.chapter && (
            <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md mb-4 inline-block">
              {currentQ.chapter}
            </span>
          )}
          <h3 className="text-xl font-heading font-semibold leading-relaxed">{currentQ.question}</h3>
        </motion.div>
      </AnimatePresence>

      {/* Options */}
      <div className="grid gap-3">
        {currentQ.options.map((option, i) => {
          const isCorrect = option === currentQ.correctAnswer;
          const isSelected = option === selectedAnswer;
          let borderClass = "border-border hover:border-primary/40";
          if (showResult && isCorrect) borderClass = "border-green-500 bg-green-500/5";
          if (showResult && isSelected && !isCorrect) borderClass = "border-red-500 bg-red-500/5";

          return (
            <motion.button
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => handleAnswer(option)}
              disabled={showResult}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${borderClass} ${!showResult ? "cursor-pointer" : ""}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold flex-shrink-0
                  ${showResult && isCorrect ? "bg-green-500 text-white" : ""}
                  ${showResult && isSelected && !isCorrect ? "bg-red-500 text-white" : ""}
                  ${!showResult ? "bg-muted text-muted-foreground" : ""}
                `}>
                  {showResult && isCorrect ? <CheckCircle2 className="w-4 h-4" /> : 
                   showResult && isSelected && !isCorrect ? <XCircle className="w-4 h-4" /> :
                   String.fromCharCode(65 + i)}
                </div>
                <span className="text-sm font-medium line-clamp-3">{option}</span>
              </div>
            </motion.button>
          );
        })}
      </div>

      {showResult && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 flex justify-end"
        >
          <Button onClick={nextQuestion} size="lg" className="gap-2">
            {currentIndex + 1 >= questions.length ? "See Results" : "Next Question"}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </motion.div>
      )}
    </div>
  );
}