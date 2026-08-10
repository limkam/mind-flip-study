import React from "react";
import { motion } from "framer-motion";

export default function StatCard({ title, value, icon: Icon, color, subtitle }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl p-4 sm:p-6 border border-border shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs sm:text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl sm:text-3xl font-heading font-bold mt-1.5 sm:mt-2 text-foreground">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-4.5 h-4.5 sm:w-6 sm:h-6" />
        </div>
      </div>
    </motion.div>
  );
}
