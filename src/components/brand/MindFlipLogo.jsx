import React from "react";

const LOGO_SRC = "/mindflip-logo.png";
const WORDMARK_SRC = "/mindflip-logo-wordmark.png";
const ICON_SRC = "/mindflip-icon.png";

const MARK_SIZES = {
  sm: "h-10 w-10 rounded-xl",
  md: "h-11 w-11 rounded-2xl",
  lg: "h-12 w-12 rounded-2xl",
};

export default function MindFlipLogo({ className = "", alt = "MindFlip", compact = false }) {
  const src = compact ? ICON_SRC : WORDMARK_SRC;
  return (
    <img
      src={src}
      alt={alt}
      className={`object-contain object-left ${compact ? "h-8 w-8 rounded-lg" : "h-10 w-full max-w-full"} ${className}`}
    />
  );
}

/** Brain icon only — for collapsed sidebar. */
export function MindFlipLogoMark({ className = "", size = "md" }) {
  const sizeClass = MARK_SIZES[size] || MARK_SIZES.md;
  return (
    <img
      src={ICON_SRC}
      alt="MindFlip"
      className={`object-contain flex-shrink-0 ${sizeClass} ${className}`}
    />
  );
}

/** Full wordmark (brain + MindFlip) with tagline below. */
export function MindFlipBrand({
  collapsed = false,
  centered = false,
  showTagline = true,
  size = "md",
  className = "",
}) {
  if (collapsed) {
    return (
      <div className={`flex justify-center ${className}`}>
        <MindFlipLogoMark size="md" />
      </div>
    );
  }

  const logoHeights = {
    sm: "h-8",
    md: "h-11",
    lg: "h-14",
  };
  const logoClass = centered
    ? `${logoHeights.lg} w-full max-w-[300px] object-contain`
    : `${logoHeights[size] || logoHeights.md} w-full max-w-full object-contain object-left`;

  const taglineClass = centered
    ? "text-sm font-medium text-muted-foreground mt-2 text-center"
    : "text-xs font-medium text-sidebar-foreground/70 mt-1.5";

  return (
    <div
      className={`flex flex-col w-full min-w-0 ${centered ? "items-center text-center" : "items-start"} ${className}`}
    >
      <img src={WORDMARK_SRC} alt="MindFlip" className={logoClass} />
      {showTagline ? <p className={taglineClass}>AI-Powered Learning</p> : null}
    </div>
  );
}
