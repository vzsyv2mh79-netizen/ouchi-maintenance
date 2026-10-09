"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "system" | "light" | "dark";
const key = "ouchi-theme";
const valid = (value: unknown): value is Theme => value === "system" || value === "light" || value === "dark";
const ThemeContext = createContext<{ theme: Theme; changeTheme: (theme: Theme) => void; saved: boolean } | null>(null);

function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.themePreference = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#14171c" : "#f5f6f8");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("system");
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    let current: Theme = "system";
    const read = () => {
      try { const value = localStorage.getItem(key); current = valid(value) ? value : "system"; }
      catch { current = "system"; }
      setTheme(current); applyTheme(current);
    };
    read();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystem = () => {
      const preference = document.documentElement.dataset.themePreference;
      if (preference === "system") applyTheme("system");
    };
    const updateStorage = (event: StorageEvent) => { if (event.key === key || event.key === null) read(); };
    media.addEventListener("change", updateSystem);
    window.addEventListener("storage", updateStorage);
    return () => { media.removeEventListener("change", updateSystem); window.removeEventListener("storage", updateStorage); };
  }, []);
  const changeTheme = (value: Theme) => {
    setTheme(value); applyTheme(value);
    try { localStorage.setItem(key, value); setSaved(true); }
    catch { setSaved(false); }
  };
  return <ThemeContext.Provider value={{ theme, changeTheme, saved }}>{children}</ThemeContext.Provider>;
}

export function ThemeControls() {
  const context = useContext(ThemeContext);
  if (!context) return null;
  const { theme, changeTheme, saved } = context;
  return <section className="settings-group theme-settings"><h2>表示モード</h2>
    <fieldset className="theme-options"><legend className="sr-only">表示モードを選ぶ</legend>
      {([ ["light", "ライト"], ["dark", "ダーク"], ["system", "端末に合わせる"] ] as const).map(([value, label]) =>
        <label key={value}><input type="radio" name="theme" value={value} checked={theme === value} onChange={() => changeTheme(value)} /><span>{label}</span></label>)}
    </fieldset><p className="field-hint">この端末に表示モードを保存します。</p>
    {!saved && <p role="status">表示は切り替わりましたが、保存できませんでした。次に開くと端末の設定に合わせます。</p>}
  </section>;
}
