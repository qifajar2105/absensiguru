import React from 'react';
import { Moon, Sun, Languages } from 'lucide-react';
import { useStore } from '../store/useStore';

export const ThemeLanguageToggle = () => {
  const { theme, setTheme, language, setLanguage } = useStore();

  return (
    <div className="flex items-center space-x-2">
      <button
        onClick={() => setLanguage(language === 'id' ? 'en' : 'id')}
        className="flex items-center p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
        title="Toggle Language"
      >
        <Languages className="w-5 h-5 mr-1" />
        <span className="text-xs font-bold uppercase">{language}</span>
      </button>
      
      <button
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
        title="Toggle Theme"
      >
        {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
      </button>
    </div>
  );
};
