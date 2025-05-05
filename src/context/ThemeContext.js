import React, { createContext, useState, useEffect } from 'react';

// Criando o contexto de tema
export const ThemeContext = createContext();

// Provedor do tema que envolverá nossa aplicação
export const ThemeProvider = ({ children }) => {
  // Verifica se há uma preferência salva, caso contrário usa a preferência do sistema
  const getSavedTheme = () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme;
    }
    
    // Detecta preferência do sistema
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  };

  // Estado do tema
  const [theme, setTheme] = useState(getSavedTheme());

  // Alterna entre temas escuro e claro
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  // Aplica o tema ao elemento HTML quando o tema muda
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}; 