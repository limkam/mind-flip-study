import { useEffect } from "react";
import confetti from "canvas-confetti";

export function useConfetti() {
  const fire = (type = "default") => {
    if (type === "perfect") {
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, colors: ["#8b5cf6", "#ec4899", "#f59e0b", "#10b981"] });
      setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0 }, colors: ["#8b5cf6", "#ec4899"] }), 250);
      setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1 }, colors: ["#f59e0b", "#10b981"] }), 400);
    } else if (type === "streak") {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.7 }, colors: ["#f97316", "#ef4444", "#fbbf24"] });
    } else {
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.7 } });
    }
  };
  return { fire };
}

export default function ConfettiOnMount({ type = "default" }) {
  const { fire } = useConfetti();
  useEffect(() => { fire(type); }, []);
  return null;
}