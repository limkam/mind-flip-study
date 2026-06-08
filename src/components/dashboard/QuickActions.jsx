import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { BookOpen, Brain, Swords, CalendarCheck } from "lucide-react";

export default function QuickActions({ recentSet, pendingChallenges }) {
  const actions = [
    recentSet
      ? { label: "Continue Studying", sub: recentSet.title, icon: Brain, color: "from-primary/20 to-primary/5 border-primary/30 text-primary", to: `/study/${recentSet.id}` }
      : { label: "Browse Library", sub: "Find a book to study", icon: BookOpen, color: "from-primary/20 to-primary/5 border-primary/30 text-primary", to: "/library" },
    { label: "Daily Review", sub: "Spaced repetition cards", icon: CalendarCheck, color: "from-green-500/20 to-green-500/5 border-green-500/30 text-green-600", to: "/daily-review" },
    {
      label: "Challenges",
      sub: pendingChallenges > 0 ? `${pendingChallenges} waiting for you!` : "Challenge a friend",
      icon: Swords,
      color: pendingChallenges > 0
        ? "from-accent/20 to-accent/5 border-accent/40 text-accent"
        : "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30 text-yellow-600",
      to: "/challenges",
      badge: pendingChallenges > 0 ? pendingChallenges : null,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
      {actions.map((a, i) => (
        <motion.div
          key={a.label}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.07, type: "spring", stiffness: 260, damping: 22 }}
        >
          <Link
            to={a.to}
            className={`flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br ${a.color} border hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group`}
          >
            <div className="w-10 h-10 rounded-xl bg-white/40 dark:bg-black/20 flex items-center justify-center flex-shrink-0">
              <a.icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm">{a.label}</p>
                {a.badge && (
                  <span className="bg-accent text-accent-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {a.badge}
                  </span>
                )}
              </div>
              <p className="text-xs opacity-70 truncate">{a.sub}</p>
            </div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}