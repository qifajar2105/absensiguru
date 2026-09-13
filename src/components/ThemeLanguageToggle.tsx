import React from 'react';
import { Moon, Sun, Globe } from 'lucide-react';
import { useStore, Language } from '../store/useStore';

export const ThemeLanguageToggle = () => {
  const { theme, setTheme, language, setLanguage } = useStore();

  const handleLanguageChange = (newLang: Language) => {
    setLanguage(newLang);
  };

  return (
    <div className="flex items-center space-x-2">
      {/* Segmented Language Switcher */}
      <div className="inline-flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
        <Globe className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 ml-1.5 mr-1" />
        <button
          type="button"
          onClick={() => handleLanguageChange('id')}
          className={`px-2 py-1 text-xs font-bold rounded-lg transition-all ${
            language === 'id'
              ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
          title="Bahasa Indonesia"
        >
          ID
        </button>
        <button
          type="button"
          onClick={() => handleLanguageChange('en')}
          className={`px-2 py-1 text-xs font-bold rounded-lg transition-all ${
            language === 'en'
              ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
          title="English"
        >
          EN
        </button>
      </div>

      {/* Dark Mode Toggle */}
      <button
        type="button"
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 shadow-xs transition-colors"
        title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
      >
        {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
      </button>
    </div>
  );
};
