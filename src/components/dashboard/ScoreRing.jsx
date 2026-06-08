import React from "react";

export default function ScoreRing({ percentage, size = 56, stroke = 5 }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percentage / 100) * circ;

  const color =
    percentage >= 80 ? "#22c55e" : percentage >= 50 ? "#eab308" : "#ef4444";

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.8s ease" }}
      />
      <text
        x="50%" y="50%"
        dominantBaseline="middle" textAnchor="middle"
        className="rotate-90"
        style={{ transform: "rotate(90deg)", transformOrigin: "50% 50%", fill: color, fontSize: size * 0.22, fontWeight: 700, fontFamily: "var(--font-heading)" }}
      >
        {percentage}%
      </text>
    </svg>
  );
}