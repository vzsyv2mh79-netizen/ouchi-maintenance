import design from "@/assets/brand/icon-design.json";

export function AppMark() {
  return <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" focusable="false">
    <rect width="100" height="100" fill={design.background} />
    <path d={design.house} fill={design.foreground} />
    <path d={design.sparkle} fill={design.background} />
  </svg>;
}
