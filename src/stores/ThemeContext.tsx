import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AccessibilityConfig } from '@/types/settings';
import { db } from '@/services/db/database';

interface ThemeContextType {
  theme: 'system' | 'dark' | 'light';
  highContrast: boolean;
  reducedMotion: boolean;
  fontSize: 'normal' | 'large' | 'x-large';
  setTheme: (theme: 'system' | 'dark' | 'light') => void;
  setHighContrast: (enabled: boolean) => void;
  setReducedMotion: (enabled: boolean) => void;
  setFontSize: (size: 'normal' | 'large' | 'x-large') => void;
  announce: (message: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<'system' | 'dark' | 'light'>('dark');
  const [highContrast, setHighContrast] = useState<boolean>(false);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState<'normal' | 'large' | 'x-large'>('normal');
  const [liveMessage, setLiveMessage] = useState<string>('');

  useEffect(() => {
    // Load initial settings
    db.getSettings().then((s) => {
      if (s.accessibility) {
        setTheme(s.accessibility.theme);
        setHighContrast(s.accessibility.highContrast);
        setReducedMotion(s.accessibility.reducedMotion);
        setFontSize(s.accessibility.fontSize);
      }
    });
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    // Apply theme
    let effectiveTheme = theme;
    if (theme === 'system') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    root.setAttribute('data-theme', effectiveTheme);

    // High contrast
    if (highContrast) {
      root.setAttribute('data-contrast', 'high');
    } else {
      root.removeAttribute('data-contrast');
    }

    // Font size scaling
    if (fontSize === 'large') {
      root.style.fontSize = '18px';
    } else if (fontSize === 'x-large') {
      root.style.fontSize = '20px';
    } else {
      root.style.fontSize = '16px';
    }
  }, [theme, highContrast, fontSize]);

  const announce = (message: string) => {
    setLiveMessage(message);
    setTimeout(() => setLiveMessage(''), 3000);
  };

  const handleSetTheme = (newTheme: 'system' | 'dark' | 'light') => {
    setTheme(newTheme);
    persist({ theme: newTheme, highContrast, reducedMotion, fontSize });
  };

  const handleSetHighContrast = (enabled: boolean) => {
    setHighContrast(enabled);
    persist({ theme, highContrast: enabled, reducedMotion, fontSize });
  };

  const handleSetReducedMotion = (enabled: boolean) => {
    setReducedMotion(enabled);
    persist({ theme, highContrast, reducedMotion: enabled, fontSize });
  };

  const handleSetFontSize = (size: 'normal' | 'large' | 'x-large') => {
    setFontSize(size);
    persist({ theme, highContrast, reducedMotion, fontSize: size });
  };

  const persist = async (acc: AccessibilityConfig) => {
    const s = await db.getSettings();
    await db.saveSettings({ ...s, accessibility: acc });
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        highContrast,
        reducedMotion,
        fontSize,
        setTheme: handleSetTheme,
        setHighContrast: handleSetHighContrast,
        setReducedMotion: handleSetReducedMotion,
        setFontSize: handleSetFontSize,
        announce,
      }}
    >
      {/* WCAG 2.2 Live Region for screen readers */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)' }}
      >
        {liveMessage}
      </div>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
