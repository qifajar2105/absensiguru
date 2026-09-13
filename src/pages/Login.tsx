import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useStore } from '../store/useStore';
import { ThemeLanguageToggle } from '../components/ThemeLanguageToggle';
import { translations } from '../lib/translations';
import { checkIsSuperAdmin, isMasterSuperAdmin } from '../lib/superAdminAuth';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsRole, setNeedsRole] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'admin' | 'teacher'>('teacher');
  const [schoolCode, setSchoolCode] = useState('');
  const [tempUser, setTempUser] = useState<any>(null);
  
  const navigate = useNavigate();
  const { userData, setUserData, language } = useStore();
  const t = translations[language] || translations.id;

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

      const isAuthorizedSuperAdmin = await checkIsSuperAdmin(user.email);

      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data() as any;
        if (isAuthorizedSuperAdmin && data.role !== 'superadmin') {
          data.role = 'superadmin';
          await setDoc(doc(db, 'users', user.uid), { ...data, role: 'superadmin' }, { merge: true });
        } else if (!isAuthorizedSuperAdmin && data.role === 'superadmin') {
          // Demote if not in super admin whitelist
          data.role = 'teacher';
          await setDoc(doc(db, 'users', user.uid), { ...data, role: 'teacher' }, { merge: true });
        }
        setUserData(data);
        if (data.role === 'superadmin') navigate('/superadmin');
        else if (data.role === 'admin') navigate('/admin');
        else navigate('/teacher');
      } else {
        // First-time user
        if (isAuthorizedSuperAdmin) {
          // Auto-provision Super Admin
          const superData = {
            uid: user.uid,
            email: user.email,
            name: user.displayName || (isMasterSuperAdmin(user.email) ? 'Muhammad Fajar, S.Pd' : 'Super Admin'),
            role: 'superadmin' as const,
            schoolCode: 'SUPERADMIN',
            createdAt: new Date().toISOString()
          };
          await setDoc(doc(db, 'users', user.uid), superData);
          setUserData(superData);
          navigate('/superadmin');
        } else {
          setTempUser(user);
          setNeedsRole(true);
        }
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
    
    // License code is required for both teacher and school admin
    const cleanSchoolCode = schoolCode.trim().toUpperCase();
    if (cleanSchoolCode.length < 3) {
      setError(t.schoolCodeError);
      return;
    }
    
    setLoading(true);
    setError('');

    // Check school license in firestore
    let matchedSchoolName = cleanSchoolCode;
    try {
      const q = query(
        collection(db, 'licenses'), 
        where('code', '==', cleanSchoolCode)
      );
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        setError(t.schoolCodeError);
        setLoading(false);
        return;
      }

      // Check if license is active
      const licenseDoc = querySnapshot.docs[0].data();
      if (licenseDoc.active === false) {
        setError(
          language === 'id' 
            ? 'Lisensi sekolah sedang nonaktif. Hubungi Super Admin.' 
            : 'School license is inactive. Please contact Super Admin.'
        );
        setLoading(false);
        return;
      }

      if (licenseDoc.name) {
        matchedSchoolName = licenseDoc.name;
      }

      // Check teacher quota if role is teacher
      if (selectedRole === 'teacher' && licenseDoc.maxTeachers) {
        const usersQ = query(
          collection(db, 'users'),
          where('schoolCode', '==', cleanSchoolCode)
        );
        const usersSnap = await getDocs(usersQ);
        const teacherCount = usersSnap.docs.filter(d => d.data().role === 'teacher').length;
        if (teacherCount >= licenseDoc.maxTeachers) {
          setError(
            language === 'id'
              ? `Kuota guru untuk sekolah ini sudah penuh (${licenseDoc.maxTeachers} guru). Hubungi Admin/Super Admin.`
              : `Teacher quota for this school is full (${licenseDoc.maxTeachers} teachers). Contact Admin/Super Admin.`
          );
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

    try {
      const newUserData = {
        uid: tempUser.uid,
        email: tempUser.email,
        name: tempUser.displayName || 'Pengguna Baru',
        role: selectedRole,
        schoolCode: cleanSchoolCode,
        schoolName: matchedSchoolName,
        createdAt: new Date().toISOString()
      };
      
      await setDoc(doc(db, 'users', tempUser.uid), newUserData);
      setUserData(newUserData as any);
      
      if (selectedRole === 'admin') navigate('/admin');
      else navigate('/teacher');
    } catch (err: any) {
      setError(err.message || t.failed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-gray-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden transition-colors duration-300">
      
      {/* Top right language & theme toggle */}
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
            <div className="mb-6 bg-red-50/80 dark:bg-red-900/30 backdrop-blur-sm border-l-4 border-red-500 p-4 rounded-r-lg">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">{error}</p>
                </div>
              </div>
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

              <div className="pt-2">
                <div className="p-3.5 rounded-2xl bg-gray-50/80 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 text-xs space-y-2 text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-300">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>{language === 'id' ? 'Tingkat Akses Terpisah:' : 'Separated Access Levels:'}</span>
                  </div>
                  <p className="leading-relaxed">
                    {language === 'id' 
                      ? '• Guru & Admin Sekolah: Masuk via Google menggunakan Kode Lisensi Sekolah resmi.'
                      : '• Teachers & School Admins: Sign in via Google with official School License Code.'}
                  </p>
                  <p className="leading-relaxed">
                    {language === 'id' 
                      ? '• Super Admin (Pengelola Pusat): Masuk via Google resmi langsung ke Portal Lisensi.'
                      : '• Super Admin (Platform Owner): Official Google login routes directly to Master License Portal.'}
                  </p>
                </div>
              </div>
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
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      {t.schoolCode}
                    </label>
                    <input
                      type="text"
                      required
                      value={schoolCode}
                      onChange={(e) => setSchoolCode(e.target.value)}
                      placeholder={t.schoolCodePlaceholder}
                      className="block w-full px-4 py-3 text-base bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-xl border transition-colors uppercase font-mono font-semibold"
                    />
                    <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                      {language === 'id' 
                        ? 'Dapatkan kode lisensi dari Kepala Sekolah atau Super Admin.' 
                        : 'Obtain your school access code from your Principal or Super Admin.'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      {t.roleSelect}
                    </label>
                    <div className="relative">
                      <select
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value as 'admin' | 'teacher')}
                        className="block w-full pl-4 pr-10 py-3 text-base bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-xl border appearance-none transition-colors"
                      >
                        <option value="teacher">{t.roleTeacher}</option>
                        <option value="admin">{t.roleAdmin}</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500 dark:text-gray-400">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 space-y-0.5 bg-gray-50/70 dark:bg-gray-800/40 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                      <p>• <span className="font-semibold text-gray-700 dark:text-gray-300">{language === 'id' ? 'Guru' : 'Teacher'}</span>: {language === 'id' ? 'Akses scan QR & presensi kehadiran.' : 'Scan QR & log attendance.'}</p>
                      <p>• <span className="font-semibold text-gray-700 dark:text-gray-300">{language === 'id' ? 'Admin Sekolah' : 'School Admin'}</span>: {language === 'id' ? 'Kelola QR harian, lokasi GPS, dan rekap guru di sekolah ini.' : 'Manage daily QR, GPS location, and teacher recaps for this school.'}</p>
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
