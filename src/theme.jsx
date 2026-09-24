import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({
  theme: 'dark',
  toggleTheme: () => {},
  activeHoldSeconds: 0,
  setActiveHoldSeconds: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      const stored = localStorage.getItem('leaselock_theme');
      if (stored) return stored;
    } catch {}
    return 'dark'; // Default to modern obsidian dark mode
  });

  const [activeHoldSeconds, setActiveHoldSeconds] = useState(0);

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme);
      document.body.setAttribute('data-theme', theme);
      document.documentElement.setAttribute('data-bs-theme', theme);
      document.body.setAttribute('data-bs-theme', theme);
      localStorage.setItem('leaselock_theme', theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme((curr) => (curr === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        activeHoldSeconds,
        setActiveHoldSeconds,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
