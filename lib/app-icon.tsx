import { ImageResponse } from "next/og";

export function appIcon(size: number) {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#246bfe" }}>
    <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 100 100" fill="none">
      <path d="M15 47L50 17L85 47V82H62V59H38V82H15V47Z" stroke="white" strokeWidth="7" strokeLinejoin="round" />
      <circle cx="76" cy="30" r="22" fill="#143b91" />
      <path d="M65 30L73 38L87 22" stroke="#c9ff80" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>, { width: size, height: size });
}
