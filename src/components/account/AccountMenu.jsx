import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  CircleHelp,
  LogOut,
  Medal,
  Monitor,
  Moon,
  Palette,
  Settings,
  ShieldCheck,
  Sun,
  UserRound,
  FileText,
  CreditCard,
} from "lucide-react";
import client from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import {
  applyColorScheme,
  normalizeColorScheme,
  persistColorScheme,
  readColorScheme,
} from "@/lib/colorScheme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import UserAvatar from "./UserAvatar";

const accountLinks = [
  ["Profile", "/profile", UserRound],
  ["Settings", "/settings", Settings],
  ["Achievements", "/achievements", Medal],
  ["Study Statistics", "/analytics", BarChart3],
  ["Billing & Credits", "/billing", CreditCard],
];

const appearanceOptions = [
  ["light", "Light", Sun],
  ["dark", "Dark", Moon],
  ["system", "System", Monitor],
];

export default function AccountMenu({ onSignOut }) {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [scheme, setScheme] = useState(() => readColorScheme(user));

  useEffect(() => {
    const next = readColorScheme(user);
    setScheme(next);
    applyColorScheme(next);
  }, [user?.id, user?.preferences?.color_scheme]);

  useEffect(() => {
    if (scheme !== "system") return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyColorScheme("system");
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [scheme]);

  const changeScheme = async (value) => {
    const next = normalizeColorScheme(value);
    const previous = scheme;
    setScheme(next);
    applyColorScheme(next);
    persistColorScheme(user?.id, next);
    try {
      await client.patch("/users/me", { preferences: { color_scheme: next } });
      await refreshUser();
    } catch {
      setScheme(previous);
      applyColorScheme(previous);
      persistColorScheme(user?.id, previous);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full outline-none ring-offset-background transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Open account menu"
          title="Account menu"
        >
          <UserAvatar user={user} className="h-9 w-9 shadow-sm" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="account-menu-content w-[min(20rem,calc(100vw-2rem))] rounded-lg border-border/80 p-2 shadow-xl"
      >
        <DropdownMenuLabel className="flex items-center gap-3 px-2 py-3 font-normal">
          <UserAvatar user={user} className="h-11 w-11" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">
              {user?.full_name || "Bilkeys user"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{user?.email}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {accountLinks.map(([label, path, Icon]) => (
            <DropdownMenuItem key={path} onSelect={() => navigate(path)} className="py-2">
              <Icon />
              {label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="py-2">
              <Palette />
              Appearance
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="account-menu-content min-w-40 rounded-lg p-1">
              <DropdownMenuRadioGroup value={scheme} onValueChange={changeScheme}>
                {appearanceOptions.map(([value, label, Icon]) => (
                  <DropdownMenuRadioItem key={value} value={value} className="py-2">
                    <Icon className="mr-2 h-4 w-4" />
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => navigate("/feedback")} className="py-2">
            <CircleHelp /> Help &amp; Support
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => window.open("https://bilkeys.io/privacy", "_blank", "noopener,noreferrer")} className="py-2">
            <ShieldCheck /> Privacy Policy
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => window.open("https://bilkeys.io/terms", "_blank", "noopener,noreferrer")} className="py-2">
            <FileText /> Terms of Service
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut} className="py-2 text-destructive focus:text-destructive">
          <LogOut /> Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
