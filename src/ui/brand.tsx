import { useId } from "react";

/**
 * The Atrazo mark: a capital A drawn as a sharpened pencil (graphite lead, bare wood, yellow paint).
 * `tone="mono"` is the graphite A used inside the yellow app-bar tile; `full` is the app icon.
 */
const A_PATH = "M32 6 L60 58 L4 58 Z M32 26.4 L38.2 38 L25.8 38 Z M22 45 L42 45 L49 58 L15 58 Z";
const SCALLOP =
  "M0 0H64V31 Q60 27.5 56 31 Q52 27.5 48 31 Q44 27.5 40 31 Q36 27.5 32 31 Q28 27.5 24 31 Q20 27.5 16 31 Q12 27.5 8 31 Q4 27.5 0 31Z";

export function AtrazoMark({
  size = 28,
  tone = "mono",
  title,
}: {
  size?: number;
  tone?: "mono" | "full";
  title?: string;
}) {
  const clip = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="2 3 60 58"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <clipPath id={clip}>
          <path clipRule="evenodd" d={A_PATH} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="64" height="64" fill={tone === "full" ? "#FFC72C" : "#1C2024"} />
        <path d={SCALLOP} fill="#F3D9B1" />
        <path d="M0 0H64V17H0Z" fill={tone === "full" ? "#59626D" : "#1C2024"} />
        {tone === "full" && <path d="M44 31H64V64H44Z" fill="#F2B705" opacity=".9" />}
      </g>
    </svg>
  );
}

/** The yellow logo tile used in app bars and the sidebar. */
export function LogoTile({ size = 36 }: { size?: number }) {
  return (
    <span className="logo" style={{ width: size, height: size }} aria-hidden="true">
      <AtrazoMark size={Math.round(size * 0.78)} />
    </span>
  );
}

export type LapisPose = "hero" | "wave" | "cheer" | "fly" | "sleep" | "worried";

const HANG =
  "M72 54 C58 86 50 132 48 172 Q66 165 82 174 Q100 167 118 174 Q134 165 152 172 C150 132 142 86 128 54 Z";
const HANG_LINING =
  "M72 56 C62 88 55 132 53 169 Q59 167 64 168 C65 132 69 96 76 62 Z M128 56 C138 88 145 132 147 169 Q141 167 136 168 C135 132 131 96 124 62 Z";
const FLARE =
  "M72 54 C44 80 26 128 16 176 Q40 166 62 180 Q100 168 138 180 Q160 166 184 176 C174 128 156 80 128 54 Z";
const FLARE_LINING =
  "M72 56 C50 84 34 128 24 172 Q34 169 42 171 C50 128 62 90 78 62 Z M128 56 C150 84 166 128 176 172 Q166 169 158 171 C150 128 138 90 122 62 Z";
const TRAIL =
  "M72 56 C58 104 66 150 50 208 Q76 198 92 210 Q112 192 134 202 C126 150 138 104 128 56 Z";

const POSES: Record<
  LapisPose,
  {
    cape: string;
    lining?: string;
    arms: string;
    gloves: [number, number][];
    mouth: string;
    mouthFill?: string;
    eyes: "open" | "happy" | "closed";
    tilt?: string;
    label: string;
  }
> = {
  hero: {
    cape: HANG,
    lining: HANG_LINING,
    arms: "M70 108 Q48 116 57 136 M130 108 Q152 116 143 136",
    gloves: [
      [59, 138],
      [141, 138],
    ],
    mouth: "M89 113 Q100 121 111 113",
    eyes: "open",
    label: "Lapis the pencil superhero, hands on hips",
  },
  wave: {
    cape: HANG,
    lining: HANG_LINING,
    arms: "M70 108 Q48 116 57 136 M130 104 Q148 92 151 70",
    gloves: [
      [59, 138],
      [152, 65],
    ],
    mouth: "M89 113 Q100 121 111 113",
    eyes: "open",
    label: "Lapis the pencil superhero, waving",
  },
  cheer: {
    cape: FLARE,
    lining: FLARE_LINING,
    arms: "M70 104 Q52 88 50 64 M130 104 Q148 88 150 64",
    gloves: [
      [50, 59],
      [150, 59],
    ],
    mouth: "M88 110 Q100 114 112 110 Q108 121 100 121 Q92 121 88 110 Z",
    mouthFill: "#1C2024",
    eyes: "happy",
    label: "Lapis the pencil superhero, cheering",
  },
  fly: {
    cape: TRAIL,
    arms: "M130 104 Q150 82 148 54 M70 112 Q60 130 63 146",
    gloves: [
      [148, 49],
      [63, 149],
    ],
    mouth: "M89 113 Q100 121 111 113",
    eyes: "open",
    tilt: "rotate(32 100 110)",
    label: "Lapis the pencil superhero, flying",
  },
  sleep: {
    cape: HANG,
    lining: HANG_LINING,
    arms: "M70 112 Q60 126 63 142 M130 112 Q140 126 137 142",
    gloves: [
      [63, 145],
      [137, 145],
    ],
    mouth: "M95 115 Q100 118 105 115",
    eyes: "closed",
    label: "Lapis the pencil superhero, asleep",
  },
  worried: {
    cape: HANG,
    lining: HANG_LINING,
    arms: "M70 108 Q56 112 60 124 M130 108 Q144 112 140 124",
    gloves: [
      [62, 126],
      [138, 126],
    ],
    mouth: "M96 116 a4 5 0 1 0 8 0 a4 5 0 1 0 -8 0",
    eyes: "open",
    label: "Lapis the pencil superhero, looking concerned",
  },
};

/** Lapis, Atrazo's hero: cerulean cape, mask, white gloves, the A on the chest. */
export function Lapis({
  pose = "hero",
  size = 160,
  onDark = false,
}: {
  pose?: LapisPose;
  size?: number;
  onDark?: boolean;
}) {
  const p = POSES[pose];
  const ink = onDark ? "#E6E9ED" : "#1C2024";
  const chest = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 210"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={p.label}
      style={{ display: "block", overflow: "visible" }}
    >
      {pose !== "fly" && (
        <ellipse
          cx="100"
          cy="200"
          rx="34"
          ry="4.5"
          fill={onDark ? "rgba(0,0,0,.35)" : "rgba(28,32,36,.12)"}
        />
      )}
      {pose === "fly" && (
        <path
          d="M18 150 L52 128 M12 176 L46 154 M32 198 L60 180"
          stroke={onDark ? "#59626D" : "#C4CAD1"}
          strokeWidth="4"
        />
      )}
      <g transform={p.tilt}>
        <path d={p.cape} fill="#0B6E99" stroke="#1C2024" strokeWidth="3" />
        {p.lining && <path d={p.lining} fill="#085679" />}
        <rect
          x="70"
          y="22"
          width="60"
          height="26"
          rx="9"
          fill="#E88A80"
          stroke="#1C2024"
          strokeWidth="3"
        />
        <rect
          x="70"
          y="46"
          width="60"
          height="18"
          fill="#AEB6BF"
          stroke="#1C2024"
          strokeWidth="3"
        />
        <path d="M71.5 55h57" stroke="#8A939D" strokeWidth="2" />
        <rect
          x="70"
          y="64"
          width="60"
          height="84"
          fill="#FFC72C"
          stroke="#1C2024"
          strokeWidth="3"
        />
        <rect x="91" y="65.5" width="18" height="81" fill="#FFD45C" />
        <rect x="111" y="65.5" width="17.5" height="81" fill="#F2B705" />
        <path d="M70 148 L100 188 L130 148 Z" fill="#F3D9B1" stroke="#1C2024" strokeWidth="3" />
        {/* Graphite point: grey like the brand mark's tip, so it shows on the dark hero too. */}
        <path d="M91 176 L100 188 L109 176 Z" fill="#59626D" stroke="#59626D" strokeWidth="1.5" />
        <path
          d="M131 94 Q146 88 153 97 M131 99 Q145 104 148 114"
          stroke="#1C2024"
          strokeWidth="4"
        />
        <path
          d="M67 90 Q84 85 100 93 Q116 85 133 90 L133 104 Q116 100 100 105 Q84 100 67 104 Z"
          fill="#1C2024"
        />
        {p.eyes === "open" && (
          <>
            <ellipse cx="87" cy="97" rx="7.5" ry="5.2" fill="#FFFFFF" />
            <ellipse cx="113" cy="97" rx="7.5" ry="5.2" fill="#FFFFFF" />
            <circle cx={pose === "worried" ? 86 : 88.5} cy="97.5" r="3.1" fill="#1C2024" />
            <circle cx={pose === "worried" ? 112 : 114.5} cy="97.5" r="3.1" fill="#1C2024" />
          </>
        )}
        {p.eyes === "happy" && (
          <path d="M81 99 Q87 92 93 99 M107 99 Q113 92 119 99" stroke="#FFFFFF" strokeWidth="3" />
        )}
        {p.eyes === "closed" && (
          <path d="M81 96 Q87 101 93 96 M107 96 Q113 101 119 96" stroke="#FFFFFF" strokeWidth="3" />
        )}
        {pose === "worried" && (
          <path d="M80 82 L93 78 M120 82 L107 78" stroke="#1C2024" strokeWidth="3" />
        )}
        <path d={p.mouth} stroke="#1C2024" strokeWidth="3" fill={p.mouthFill ?? "none"} />
        {/* Chest emblem: the app icon itself, the pencil A on its yellow tile, below the mouth. */}
        <rect
          x="89"
          y="125"
          width="22"
          height="22"
          rx="5.5"
          fill="#FFC72C"
          stroke="#1C2024"
          strokeWidth="2.5"
        />
        <defs>
          <clipPath id={chest}>
            <path clipRule="evenodd" d={A_PATH} />
          </clipPath>
        </defs>
        <g transform="translate(91.36 127.36) scale(0.27)" clipPath={`url(#${chest})`}>
          <rect width="64" height="64" fill="#1C2024" />
          <path d={SCALLOP} fill="#F3D9B1" />
          <path d="M0 0H64V17H0Z" fill="#1C2024" />
        </g>
        <path d={p.arms} stroke={ink} strokeWidth="4" />
        {p.gloves.map(([x, y]) => (
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r="6.5"
            fill="#FFFFFF"
            stroke="#1C2024"
            strokeWidth="2.5"
          />
        ))}
      </g>
      {pose === "cheer" && (
        <path
          d="M30 34 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4z M168 22 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z"
          fill="#FFC72C"
          stroke="#1C2024"
          strokeWidth="2"
        />
      )}
      {pose === "sleep" && (
        <>
          <text
            x="142"
            y="44"
            fontFamily="var(--font-archivo)"
            fontWeight="800"
            fontSize="22"
            fill={ink}
          >
            z
          </text>
          <text
            x="160"
            y="24"
            fontFamily="var(--font-archivo)"
            fontWeight="800"
            fontSize="15"
            fill={ink}
          >
            z
          </text>
        </>
      )}
      {pose === "worried" && (
        <text
          x="150"
          y="52"
          fontFamily="var(--font-archivo)"
          fontWeight="800"
          fontSize="34"
          fill="#B93815"
        >
          !
        </text>
      )}
    </svg>
  );
}
