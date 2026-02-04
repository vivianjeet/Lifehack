import React, { useContext, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MenAtWork from './MenAtWork';
import PrivacyPolicy from './PrivacyPolicy';
import MenuBar from './MenuBar';
import { ThemeContext } from './ThemeContext';
import './App.css';

function App() {
  const { theme, toggleTheme } = useContext(ThemeContext);

  useEffect(() => {
    document.body.className = theme;
  }, [theme]);

  return (
    <BrowserRouter>
      <div className="app-container">
        <MenuBar toggleTheme={toggleTheme} theme={theme} />
        <main className="content-area">
          <Routes>
            <Route path="/" element={<MenAtWork />} />
            <Route path="/naradmuni/alpha/privacy" element={<PrivacyPolicy />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
