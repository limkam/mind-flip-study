import React, { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import client from "@/api/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";

function applyColorMode(mode) {
  document.documentElement.classList.toggle("dark", mode === "dark");
}

export default function DarkModeToggle() {
  const { user, refreshUser } = useAuth();
  const preferredMode = user?.preferences?.color_scheme === "dark" ? "dark" : "light";
  const [mode, setMode] = useState(preferredMode);

  useEffect(() => {
    setMode(preferredMode);
    applyColorMode(preferredMode);
  }, [user?.id, preferredMode]);

  const toggleMode = async () => {
    const nextMode = mode === "dark" ? "light" : "dark";
    setMode(nextMode);
    applyColorMode(nextMode);
    try {
      await client.patch("/users/me", {
        preferences: { color_scheme: nextMode },
      });
      await refreshUser();
    } catch {
      setMode(mode);
      applyColorMode(mode);
    }
  };

  const dark = mode === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleMode}
      className="h-9 w-9 rounded-full"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}
