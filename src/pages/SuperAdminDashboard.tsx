import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { Shield, Plus, Trash2, Key } from 'lucide-react';
import { ThemeLanguageToggle } from '../components/ThemeLanguageToggle';
import { translations } from '../lib/translations';

export default function SuperAdminDashboard() {
  const { userData, language } = useStore();
  const navigate = useNavigate();
  const t = translations[language];
  const [schools, setSchools] = useState<any[]>([]);
  const [newSchoolCode, setNewSchoolCode] = useState('');
  const [newSchoolName, setNewSchoolName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only allow specific superadmin email (for simplicity/demo)
    if (userData?.email !== 'shobirhana@gmail.com') {
      navigate('/login');
      return;
    }

    const q = query(collection(db, 'licenses'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSchools(data);
    });

    return () => unsubscribe();
  }, [userData, navigate]);

  const handleAddSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchoolCode || !newSchoolName) return;

    setLoading(true);
    try {
      await addDoc(collection(db, 'licenses'), {
        code: newSchoolCode.toUpperCase().trim(),
        name: newSchoolName,
        active: true,
        createdAt: serverTimestamp(),
      });
      setNewSchoolCode('');
      setNewSchoolName('');
    } catch (error) {
      console.error(error);
      alert('Gagal menambahkan sekolah');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm(t.deleteLicenseConfirm)) {
      await deleteDoc(doc(db, 'licenses', id));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
      <header className="bg-white dark:bg-gray-900 shadow-sm px-6 py-4 flex justify-between items-center border-b dark:border-gray-800">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-purple-600" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t.superAdminTitle}</h1>
        </div>
        <div className="flex items-center space-x-4">
          <ThemeLanguageToggle />
          <button onClick={() => {
            signOut(auth);
            navigate('/login');
          }} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md">
            {t.logout}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 mt-8">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 mb-8">
          <h2 className="text-lg font-bold mb-4 dark:text-white flex items-center">
            <Plus className="w-5 h-5 mr-2" />
            {t.addSchool}
          </h2>
          <form onSubmit={handleAddSchool} className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.schoolCodeLabel}</label>
              <input
                type="text"
                required
                value={newSchoolCode}
                onChange={(e) => setNewSchoolCode(e.target.value)}
                placeholder={t.schoolCodeEx}
                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white uppercase"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.schoolName}</label>
              <input
                type="text"
                required
                value={newSchoolName}
                onChange={(e) => setNewSchoolName(e.target.value)}
                placeholder={t.schoolNameEx}
                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              {t.save}
            </button>
          </form>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-lg font-bold dark:text-white flex items-center">
              <Key className="w-5 h-5 mr-2" />
              {t.licensedSchools}
            </h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t.schoolCodeLabel}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t.schoolName}</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t.action}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {schools.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-3 py-1 bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 rounded-lg font-mono font-bold text-sm">
                      {s.code}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {s.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {schools.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    {t.noSchools}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
