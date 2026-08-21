import React from "react";

const ICON_SRC = "/bilkeys-icon.png";

const MARK_SIZES = {
  sm: "h-8 w-8 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-10 w-10 text-base",
};

const WORDMARK_SIZES = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-xl",
};

function BrandMark({ size = "md", surface = "on-dark", showText = true }) {
  const iconClass = MARK_SIZES[size] || MARK_SIZES.md;
  const textClass = WORDMARK_SIZES[size] || WORDMARK_SIZES.md;
  const textColor =
    surface === "on-dark"
      ? "text-white"
      : "text-foreground";

  return (
    <div className="flex items-center gap-3.5 min-w-0 group">
      <span
        aria-hidden
        className={`grid ${iconClass} place-items-center rounded-xl bg-indigo-600 shadow-md shadow-indigo-500/30 transition-transform duration-300 group-hover:scale-110 flex-shrink-0 select-none rotate-[30deg] my-1 ml-1`}
      >
        <span className="-rotate-[30deg] font-heading font-black text-white">
          B
        </span>
      </span>
      {showText && (
        <span className={`font-heading font-bold tracking-tight ${textClass} ${textColor}`}>
          Bilkeys
        </span>
      )}
    </div>
  );
}

export default function BilkeysLogo({ className = "", alt = "Bilkeys", compact = false, surface = "on-dark" }) {
  return (
    <div className={className} aria-label={alt}>
      <BrandMark size={compact ? "sm" : "md"} surface={surface} />
    </div>
  );
}

export function BilkeysLogoMark({ className = "", size = "md", surface: _surface = "on-dark" }) {
  const iconClass = MARK_SIZES[size] || MARK_SIZES.md;
  return (
    <span
      aria-label="Bilkeys"
      className={`grid ${iconClass} place-items-center rounded-xl bg-indigo-600 shadow-md shadow-indigo-500/30 flex-shrink-0 select-none rotate-[30deg] my-1 ${className}`}
    >
      <span className="-rotate-[30deg] font-heading font-black text-white">
        B
      </span>
    </span>
  );
}

export function BilkeysBrand({
  collapsed = false,
  centered = false,
  showTagline = true,
  size = "md",
  className = "",
  surface = "on-dark",
}) {
  if (collapsed) {
    return (
      <div className={`flex justify-center ${className}`}>
        <BilkeysLogoMark size="md" surface={surface} />
      </div>
    );
  }

  const taglineClass = centered
    ? "text-sm font-medium text-muted-foreground mt-2 text-center"
    : "text-xs font-medium text-sidebar-foreground/70 mt-1.5";

  return (
    <div
      className={`flex flex-col w-full min-w-0 ${centered ? "items-center text-center" : "items-start"} ${className}`}
    >
      <BrandMark size={size} surface={surface} />
      {showTagline ? <p className={taglineClass}>AI-Powered Learning</p> : null}
    </div>
  );
}
