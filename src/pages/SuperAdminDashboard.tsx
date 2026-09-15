import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, setDoc, where, getDocs, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { Shield, Plus, Trash2, Key, Users, CheckCircle, Crown } from 'lucide-react';
import { ThemeLanguageToggle } from '../components/ThemeLanguageToggle';
import { translations } from '../lib/translations';
import { addMonths, addYears, format } from 'date-fns';
import { isPrimarySuperAdmin, PRIMARY_SUPERADMIN_EMAILS } from '../lib/utils';

export default function SuperAdminDashboard() {
  const { userData, language } = useStore();
  const navigate = useNavigate();
  const t = translations[language];
  const [schools, setSchools] = useState<any[]>([]);
  const [superAdmins, setSuperAdmins] = useState<any[]>([]);
  const [newSchoolCode, setNewSchoolCode] = useState('');
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolDuration, setNewSchoolDuration] = useState('1_year');
  const [newSuperAdminEmail, setNewSuperAdminEmail] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const qSchools = query(collection(db, 'licenses'));
    const unsubscribeSchools = onSnapshot(qSchools, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSchools(data);
    });

    const qAdmins = query(collection(db, 'superadmins'));
    const unsubscribeAdmins = onSnapshot(qAdmins, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSuperAdmins(data);
    });

    return () => {
      unsubscribeSchools();
      unsubscribeAdmins();
    };
  }, [userData, navigate]);

  const handleAddSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchoolCode || !newSchoolName) return;

    setLoading(true);
    try {
      let expiresAt: string | null = null;
      const now = new Date();
      if (newSchoolDuration === '6_months') {
        expiresAt = format(addMonths(now, 6), 'yyyy-MM-dd');
      } else if (newSchoolDuration === '1_year') {
        expiresAt = format(addYears(now, 1), 'yyyy-MM-dd');
      } else if (newSchoolDuration === '5_years') {
        expiresAt = format(addYears(now, 5), 'yyyy-MM-dd');
      } // If 'unlimited', expiresAt remains null

      await addDoc(collection(db, 'licenses'), {
        code: newSchoolCode.toUpperCase().trim(),
        name: newSchoolName,
        active: true,
        expiresAt,
        createdAt: serverTimestamp(),
      });
      setNewSchoolCode('');
      setNewSchoolName('');
      setNewSchoolDuration('1_year');
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

  const isUserPrimarySuperAdmin = isPrimarySuperAdmin(userData?.email);

  const handleAddSuperAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = newSuperAdminEmail.trim().toLowerCase();
    if (!cleanEmail || !isUserPrimarySuperAdmin) return;

    if (PRIMARY_SUPERADMIN_EMAILS.includes(cleanEmail)) {
      alert('Email ini sudah menjadi Super Admin Utama.');
      return;
    }

    if (superAdmins.some((a) => a.email?.toLowerCase() === cleanEmail)) {
      alert('Email ini sudah terdaftar sebagai Super Admin.');
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, 'superadmins'), {
        email: cleanEmail,
        addedBy: userData?.email,
        createdAt: serverTimestamp(),
      });

      // Synchronize to users collection if user account already exists
      const userQ = query(collection(db, 'users'), where('email', '==', cleanEmail));
      const userSnap = await getDocs(userQ);
      for (const uDoc of userSnap.docs) {
        await updateDoc(doc(db, 'users', uDoc.id), {
          role: 'superadmin',
          schoolCode: 'SUPERADMIN',
        });
      }

      setNewSuperAdminEmail('');
      alert(`Super Admin baru (${cleanEmail}) berhasil ditambahkan!`);
    } catch (error: any) {
      console.error(error);
      alert('Gagal menambahkan Super Admin: ' + (error.message || 'Terjadi kesalahan'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSuperAdmin = async (id: string, email: string) => {
    if (!isUserPrimarySuperAdmin) return;
    if (isPrimarySuperAdmin(email)) {
      alert(t.mainSuperAdminCantBeDeleted || 'Super Admin Utama tidak dapat dihapus.');
      return;
    }

    if (window.confirm(`Hapus hak akses Super Admin untuk ${email}?`)) {
      try {
        await deleteDoc(doc(db, 'superadmins', id));

        // Demote in users collection if account exists
        const userQ = query(collection(db, 'users'), where('email', '==', email.toLowerCase()));
        const userSnap = await getDocs(userQ);
        for (const uDoc of userSnap.docs) {
          await updateDoc(doc(db, 'users', uDoc.id), {
            role: 'teacher',
            schoolCode: '',
          });
        }

        alert(`Super Admin (${email}) berhasil dihapus.`);
      } catch (error: any) {
        console.error(error);
        alert('Gagal menghapus Super Admin: ' + (error.message || 'Terjadi kesalahan'));
      }
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
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.duration || 'Durasi'}</label>
              <select
                value={newSchoolDuration}
                onChange={(e) => setNewSchoolDuration(e.target.value)}
                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white"
              >
                <option value="6_months">{t.months6 || '6 Bulan'}</option>
                <option value="1_year">{t.year1 || '1 Tahun'}</option>
                <option value="5_years">{t.years5 || '5 Tahun'}</option>
                <option value="unlimited">{t.unlimited || 'Selamanya (Unlimited)'}</option>
              </select>
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t.expiresAt || 'Berlaku Hingga'}</th>
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {s.expiresAt ? (
                      new Date(s.expiresAt) < new Date() ? (
                        <span className="text-red-600 font-medium">{t.expired || 'Kadaluarsa'} ({s.expiresAt})</span>
                      ) : (
                        <span>{s.expiresAt}</span>
                      )
                    ) : (
                      <span className="text-green-600 font-medium">{t.unlimited || 'Selamanya'}</span>
                    )}
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
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    {t.noSchools}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden mb-8">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
            <h2 className="text-lg font-bold dark:text-white flex items-center">
              <Users className="w-5 h-5 mr-2" />
              {t.manageSuperAdmins || 'Kelola Super Admin'}
            </h2>
          </div>
          {isUserPrimarySuperAdmin ? (
            <>
              <div className="p-6 bg-gray-50/50 dark:bg-gray-800/30 border-b border-gray-100 dark:border-gray-800">
                <form onSubmit={handleAddSuperAdmin} className="flex flex-col sm:flex-row gap-4 sm:items-end">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t.superAdminEmail || 'Email Super Admin Baru'}
                    </label>
                    <input
                      type="email"
                      required
                      value={newSuperAdminEmail}
                      onChange={(e) => setNewSuperAdminEmail(e.target.value)}
                      placeholder="contoh: namaadmin@gmail.com"
                      className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center shrink-0"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {t.addSuperAdmin || 'Tambah Super Admin'}
                  </button>
                </form>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status / Ditambahkan Oleh</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t.action}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {/* Primary Super Admins list */}
                    {PRIMARY_SUPERADMIN_EMAILS.map((primaryEmail) => (
                      <tr key={primaryEmail} className="bg-purple-50/40 dark:bg-purple-950/20">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            <span>{primaryEmail}</span>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 rounded-full font-bold">
                              <Crown className="w-3 h-3 text-amber-500 fill-amber-500" /> Super Admin Utama
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          Sistem Utama (Permanen)
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-xs text-gray-400 italic">
                          Terkunci
                        </td>
                      </tr>
                    ))}

                    {/* Additional Super Admins */}
                    {superAdmins
                      .filter((admin) => !PRIMARY_SUPERADMIN_EMAILS.includes(admin.email?.toLowerCase()))
                      .map((admin) => (
                        <tr key={admin.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                            <div className="flex items-center gap-2">
                              <span>{admin.email}</span>
                              <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 rounded-full">
                                Super Admin
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {admin.addedBy || 'Super Admin Utama'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <button
                              onClick={() => handleDeleteSuperAdmin(admin.id, admin.email)}
                              className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-semibold"
                              title="Hapus Super Admin"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span className="hidden sm:inline">Hapus</span>
                            </button>
                          </td>
                        </tr>
                      ))}

                    {superAdmins.filter((admin) => !PRIMARY_SUPERADMIN_EMAILS.includes(admin.email?.toLowerCase())).length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                          Belum ada Super Admin tambahan yang dibuat. Anda dapat menambahkan email baru melalui form di atas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
              Hanya Super Admin Utama ({PRIMARY_SUPERADMIN_EMAILS.join(', ')}) yang dapat mengelola daftar Super Admin.
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
