import { cn } from "@core/utils/cn.ts";

interface RadarIconProps {
  /** When true, the sweep line rotates. */
  active?: boolean;
  size?: number;
  className?: string;
}

/**
 * Classic radar/sonar icon: dark scope with a few stationary green "blips" and a
 * sweep line that rotates when `active` is true.
 */
export const RadarIcon = ({ active = false, size = 20, className }: RadarIconProps) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="Sonar"
      className={cn("inline-block", className)}
    >
      {/* Scope background */}
      <circle cx="12" cy="12" r="11" fill="#0b1d11" stroke="#22c55e" strokeWidth="0.75" />
      {/* Range rings */}
      <circle
        cx="12"
        cy="12"
        r="7.5"
        fill="none"
        stroke="#16a34a"
        strokeWidth="0.4"
        opacity="0.5"
      />
      <circle cx="12" cy="12" r="4" fill="none" stroke="#16a34a" strokeWidth="0.4" opacity="0.5" />
      {/* Crosshairs */}
      <line x1="1" y1="12" x2="23" y2="12" stroke="#16a34a" strokeWidth="0.25" opacity="0.4" />
      <line x1="12" y1="1" x2="12" y2="23" stroke="#16a34a" strokeWidth="0.25" opacity="0.4" />

      {/* Static blips */}
      <circle cx="8" cy="9" r="0.9" fill="#22c55e" />
      <circle cx="16" cy="14" r="0.9" fill="#22c55e" />
      <circle cx="13" cy="17" r="0.7" fill="#22c55e" opacity="0.7" />

      {/* Sweep group — rotated continuously when `active` */}
      <g
        style={{
          transformOrigin: "12px 12px",
          animation: active ? "radar-sweep 2.4s linear infinite" : "none",
        }}
      >
        <defs>
          <linearGradient id="radar-sweep-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Sweep cone (wedge) — drawn as a triangle from center */}
        <path
          d="M12 12 L12 1 A11 11 0 0 1 22.4 8.5 Z"
          fill="url(#radar-sweep-grad)"
          opacity="0.7"
        />
        {/* Sweep line itself */}
        <line x1="12" y1="12" x2="12" y2="1" stroke="#22c55e" strokeWidth="0.8" />
      </g>

      <style>{`
        @keyframes radar-sweep {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
};
