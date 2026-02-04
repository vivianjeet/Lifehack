import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import SunIcon from './SunIcon';
import MoonIcon from './MoonIcon';
import './MenuBar.css';

interface MenuBarProps {
  toggleTheme: () => void;
  theme: string;
}

const MenuBar: React.FC<MenuBarProps> = ({ toggleTheme, theme }) => {
  const location = useLocation();

  return (
    <nav className="menu-bar">
      <div className="menu-left">
        {location.pathname === '/' ? (
          <Link to="/naradmuni/alpha/privacy">Privacy Policy</Link>
        ) : (
          <Link to="/">Home</Link>
        )}
      </div>
      <div className="menu-right">
        <button onClick={toggleTheme} className="theme-toggle-button">
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </button>
      </div>
    </nav>
  );
};

export default MenuBar;
