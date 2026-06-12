import React from "react";

const ICON_SRC = "/mindflip-icon.png";

const MARK_SIZES = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-10 w-10",
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
    <div className="flex items-center gap-2 min-w-0">
      <img
        src={ICON_SRC}
        alt=""
        aria-hidden
        className={`${iconClass} object-contain flex-shrink-0 ${
          surface === "on-dark" ? "mix-blend-screen brightness-110" : ""
        }`}
      />
      {showText && (
        <span className={`font-heading font-bold tracking-tight ${textClass} ${textColor}`}>
          MindFlip
        </span>
      )}
    </div>
  );
}

export default function MindFlipLogo({ className = "", alt = "MindFlip", compact = false, surface = "on-dark" }) {
  return (
    <div className={className} aria-label={alt}>
      <BrandMark size={compact ? "sm" : "md"} surface={surface} />
    </div>
  );
}

export function MindFlipLogoMark({ className = "", size = "md", surface = "on-dark" }) {
  const iconClass = MARK_SIZES[size] || MARK_SIZES.md;
  return (
    <img
      src={ICON_SRC}
      alt="MindFlip"
      className={`object-contain flex-shrink-0 ${iconClass} ${className} ${
        surface === "on-dark" ? "mix-blend-screen brightness-110" : ""
      }`}
    />
  );
}

export function MindFlipBrand({
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
        <MindFlipLogoMark size="md" surface={surface} />
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
