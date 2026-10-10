import { ImageResponse } from "next/og";

export function appIcon(size: number) {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(180deg, #303030 0%, #1c1c1c 48%, #101010 100%)" }}>
    <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 100 100" fill="none">
      <path d="M15 47L50 17L85 47V82H62V59H38V82H15V47Z" stroke="white" strokeWidth="7" strokeLinejoin="round" />
      <circle cx="83" cy="80" r="16" fill="#c9ff80" stroke="#111111" strokeWidth="4" />
      <path d="M76 80L81 85L90 75" stroke="#111111" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>, { width: size, height: size });
}
