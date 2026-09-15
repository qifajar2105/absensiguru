import React, { useState, useEffect } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { translations } from '../lib/translations';
import { ThemeLanguageToggle } from '../components/ThemeLanguageToggle';

import { collection, query, where, getDocs } from 'firebase/firestore';
import { isPrimarySuperAdmin } from '../lib/utils';

export default function Login() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsRole, setNeedsRole] = useState(false);
  const [tempUser, setTempUser] = useState<any>(null);
  const [selectedRole, setSelectedRole] = useState<'admin' | 'teacher' | 'superadmin'>('teacher');
  const [schoolCode, setSchoolCode] = useState('');
  const navigate = useNavigate();
  const { userData, setUserData, language, theme } = useStore();
  const t = translations[language];

  // Auto redirect if already logged in
  useEffect(() => {
    if (userData) {
      if (userData.role === 'superadmin') navigate('/superadmin');
      else if (userData.role === 'admin') navigate('/admin');
      else navigate('/teacher');
    }
  }, [userData, navigate]);

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    const provider = new GoogleAuthProvider();

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data() as any;
        
        // Ensure main super admin is always a super admin
        if (isPrimarySuperAdmin(user.email) && data.role !== 'superadmin') {
          data.role = 'superadmin';
          data.schoolCode = 'SUPERADMIN';
          await setDoc(doc(db, 'users', user.uid), { role: 'superadmin', schoolCode: 'SUPERADMIN' }, { merge: true });
        }
        
        // Ensure other valid superadmins are superadmins
        if (data.role !== 'superadmin' && !isPrimarySuperAdmin(user.email)) {
          const qSuper = query(collection(db, 'superadmins'), where('email', '==', user.email?.toLowerCase()));
          const superAdminsSnap = await getDocs(qSuper);
          if (!superAdminsSnap.empty) {
            data.role = 'superadmin';
            data.schoolCode = 'SUPERADMIN';
            await setDoc(doc(db, 'users', user.uid), { role: 'superadmin', schoolCode: 'SUPERADMIN' }, { merge: true });
          }
        }

        // Sync photoURL if user has one from Google auth and it's not set
        if (!data.photoURL && user.photoURL) {
          data.photoURL = user.photoURL;
          await setDoc(doc(db, 'users', user.uid), { photoURL: user.photoURL }, { merge: true });
        }
        
        // Check license expiration if not superadmin
        if (data.role !== 'superadmin') {
          const q = query(collection(db, 'licenses'), where('code', '==', data.schoolCode || ''));
          const querySnapshot = await getDocs(q);
          if (querySnapshot.empty) {
            setError(t.schoolCodeError || 'Lisensi sekolah tidak ditemukan.');
            setLoading(false);
            return;
          }
          const licenseData = querySnapshot.docs[0].data();
          if (licenseData.expiresAt && new Date(licenseData.expiresAt) < new Date()) {
            setError(t.qrInvalidDesc || 'Lisensi sekolah sudah kadaluarsa.');
            setLoading(false);
            return;
          }
        }

        setUserData(data);
        if (data.role === 'superadmin') navigate('/superadmin');
        else if (data.role === 'admin') navigate('/admin');
        else navigate('/teacher');
      } else {
        setTempUser(user);
        setNeedsRole(true);
      }
    } catch (err: any) {
      setError(err.message || t.failed);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempUser) return;
    
    // BASIC LICENSE/MULTI-TENANT CHECK
    if (selectedRole !== 'superadmin' && schoolCode.trim().length < 4) {
      setError(t.schoolCodeError);
      return;
    }
    
    setLoading(true);
    setError('');

    // Check school license
    if (selectedRole !== 'superadmin') {
      try {
        const q = query(collection(db, 'licenses'), where('code', '==', schoolCode.trim().toUpperCase()));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
          setError(t.schoolCodeError);
          setLoading(false);
          return;
        }
        
        // Validate expiration
        const licenseData = querySnapshot.docs[0].data();
        if (licenseData.expiresAt) {
          if (new Date(licenseData.expiresAt) < new Date()) {
            setError(t.qrInvalidDesc || 'Lisensi sekolah sudah kadaluarsa.');
            setLoading(false);
            return;
          }
        }
      } catch (err: any) {
        console.error(err);
        setError(t.schoolCodeError);
        setLoading(false);
        return;
      }
    }

    try {
      let finalRole = selectedRole;
      if (isPrimarySuperAdmin(tempUser.email)) {
        finalRole = 'superadmin';
      } else {
        const qSuper = query(collection(db, 'superadmins'), where('email', '==', tempUser.email?.toLowerCase()));
        const superAdminsSnap = await getDocs(qSuper);
        if (!superAdminsSnap.empty) {
          finalRole = 'superadmin';
        }
      }

      const newUserData = {
        uid: tempUser.uid,
        email: tempUser.email,
        name: tempUser.displayName || 'Pengguna Baru',
        role: finalRole,
        photoURL: tempUser.photoURL || '',
        schoolCode: finalRole === 'superadmin' ? 'SUPERADMIN' : schoolCode.trim().toUpperCase(),
        createdAt: new Date().toISOString()
      };
      
      await setDoc(doc(db, 'users', tempUser.uid), newUserData);
      setUserData(newUserData as any);
      
      if (selectedRole === 'superadmin') navigate('/superadmin');
      else if (selectedRole === 'admin') navigate('/admin');
      else navigate('/teacher');
    } catch (err: any) {
      setError(err.message || t.failed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-gray-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden transition-colors duration-300">
      
      {/* Absolute top right toggle */}
      <div className="absolute top-4 right-4 z-50">
        <ThemeLanguageToggle />
      </div>

      {/* Decorative background shapes */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-100/50 dark:bg-blue-900/20 blur-[100px]" />
        <div className="absolute top-[20%] -right-[10%] w-[40%] h-[60%] rounded-full bg-indigo-50/50 dark:bg-indigo-900/20 blur-[120px]" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
        <div className="flex justify-center">
          <img src="/logo.jpg" alt="Logo Absensi Guru" className="w-24 h-24 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 object-cover" />
        </div>
        <h2 className="mt-8 text-center text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
          {t.appTitle}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
          {needsRole ? t.completeRegistration : t.appDesc}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 ease-out z-10">
        <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl py-10 px-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/60 dark:border-gray-800/60 sm:rounded-3xl sm:px-10">
          
          {window.self !== window.top && (
            <div className="mb-6 bg-yellow-50/80 dark:bg-yellow-900/30 backdrop-blur-sm border-l-4 border-yellow-500 p-4 rounded-r-lg">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200">
                    ⚠️ {t.iframeWarning}
                  </p>
                  <div className="mt-2">
                    <a href={window.location.href} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-semibold">
                      {t.openNewTab}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className={`mb-6 p-4 rounded-xl border ${
              error.includes('auth/unauthorized-domain') || error.includes('unauthorized-domain')
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
                : 'bg-red-50/80 dark:bg-red-900/30 border-red-500/30 border-l-4'
            }`}>
              {error.includes('auth/unauthorized-domain') || error.includes('unauthorized-domain') ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5">
                    <span className="text-xl">⚠️</span>
                    <div>
                      <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wide">
                        Domain Belum Diizinkan di Firebase Auth
                      </h4>
                      <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                        Firebase menolak login Google karena domain web ini belum didaftarkan di daftar <strong>Authorized Domains</strong> proyek Firebase Anda.
                      </p>
                    </div>
                  </div>

                  <div className="bg-white/80 dark:bg-gray-900/80 p-2.5 rounded-lg border border-amber-200/80 dark:border-amber-800/80">
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">Domain aplikasi Anda saat ini:</div>
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-xs font-mono font-semibold text-gray-800 dark:text-gray-200 truncate select-all">
                        {window.location.hostname}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(window.location.hostname);
                          alert('Domain berhasil disalin: ' + window.location.hostname);
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold text-amber-800 dark:text-amber-200 bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 rounded transition-colors shrink-0"
                      >
                        Salin
                      </button>
                    </div>
                  </div>

                  <div className="text-[11px] text-amber-900/90 dark:text-amber-300/90 space-y-1">
                    <p className="font-semibold">Cara Mengatasi di Firebase Console:</p>
                    <ol className="list-decimal list-inside space-y-0.5 pl-1">
                      <li>Buka <a href="https://console.firebase.google.com/project/gen-lang-client-0419275534/authentication/settings" target="_blank" rel="noopener noreferrer" className="font-bold underline text-blue-600 dark:text-blue-400">Firebase Console Proyek Anda ↗</a></li>
                      <li>Masuk ke menu <strong>Authentication</strong> &rarr; tab <strong>Settings</strong>.</li>
                      <li>Pilih menu <strong>Authorized domains</strong> &rarr; klik <strong>Add domain</strong>.</li>
                      <li>Tempel domain <code>{window.location.hostname}</code> (atau tambahkan <code>run.app</code>).</li>
                      <li>Klik <strong>Save</strong> / Simpan, lalu refresh halaman ini untuk login kembali.</li>
                    </ol>
                  </div>
                </div>
              ) : (
                <div className="flex">
                  <div className="ml-1">
                    <p className="text-sm font-medium text-red-800 dark:text-red-200">{error}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {!needsRole ? (
            <div className="space-y-4">
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex justify-center items-center py-3.5 px-4 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm text-sm font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:hover:translate-y-0 transition-all duration-200"
              >
                <img className="h-5 w-5 mr-3" src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google logo" />
                {loading ? t.processing : t.loginGoogle}
              </button>
            </div>
          ) : (
            <form className="space-y-6 animate-in fade-in duration-500" onSubmit={handleSaveRole}>
              <div>
                <div className="bg-blue-50/50 dark:bg-blue-900/30 rounded-xl p-4 mb-6 border border-blue-100/50 dark:border-blue-800/50">
                  <p className="text-sm text-blue-800 dark:text-blue-200 text-center leading-relaxed">
                    {t.welcome} <span className="font-bold">{tempUser?.displayName}</span>!
                    <br />{t.roleSelect}.
                  </p>
                </div>
                
                <div className="space-y-4">
                  {selectedRole !== 'superadmin' && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t.schoolCode}</label>
                      <input
                        type="text"
                        required
                        value={schoolCode}
                        onChange={(e) => setSchoolCode(e.target.value)}
                        placeholder={t.schoolCodePlaceholder}
                        className="block w-full px-4 py-3 text-base bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-xl border transition-colors uppercase"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t.roleSelect}</label>
                    <div className="relative">
                      <select
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value as 'admin' | 'teacher' | 'superadmin')}
                        className="block w-full pl-4 pr-10 py-3 text-base bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-xl border appearance-none transition-colors"
                      >
                        <option value="teacher">{t.roleTeacher}</option>
                        <option value="admin">{t.roleAdmin}</option>
                        <option value="superadmin">👑 Super Admin</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500 dark:text-gray-400">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-[0_4px_14px_0_rgba(37,99,235,0.39)] text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 hover:shadow-[0_6px_20px_rgba(37,99,235,0.23)] hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all duration-200"
                >
                  {loading ? t.processing : t.saveContinue}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
      
      {/* Footer / Credit */}
      <div className="mt-12 text-center animate-in fade-in duration-1000 delay-300 ease-out z-10">
        <p className="text-xs text-gray-400 dark:text-gray-500 font-medium tracking-wide">
          {t.credit}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400 font-bold mt-1">
          Muhammad Fajar, S.Pd
        </p>
      </div>
    </div>
  );
}
