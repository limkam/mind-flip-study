import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function getInitials(name) {
  return (name || "User")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function UserAvatar({ user, className, fallbackClassName }) {
  return (
    <Avatar className={cn("h-9 w-9 border border-border bg-background", className)}>
      {user?.avatar_url ? (
        <AvatarImage
          src={user.avatar_url}
          alt={`${user.full_name || "User"} profile`}
          referrerPolicy="no-referrer"
          className="object-cover"
        />
      ) : null}
      <AvatarFallback
        className={cn("bg-primary/10 text-sm font-semibold text-primary", fallbackClassName)}
      >
        {getInitials(user?.full_name)}
      </AvatarFallback>
    </Avatar>
  );
}
