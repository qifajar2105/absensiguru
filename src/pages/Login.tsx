import React, { useState, useEffect } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useStore } from '../store/useStore';

export default function Login() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsRole, setNeedsRole] = useState(false);
  const [tempUser, setTempUser] = useState<any>(null);
  const [selectedRole, setSelectedRole] = useState<'admin' | 'teacher'>('teacher');
  const navigate = useNavigate();
  const { userData, setUserData } = useStore();

  // Auto redirect if already logged in
  useEffect(() => {
    if (userData) {
      navigate(userData.role === 'admin' ? '/admin' : '/teacher');
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
        setUserData(data);
        navigate(data.role === 'admin' ? '/admin' : '/teacher');
      } else {
        setTempUser(user);
        setNeedsRole(true);
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat login.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempUser) return;
    
    setLoading(true);
    setError('');
    try {
      const newUserData = {
        uid: tempUser.uid,
        email: tempUser.email,
        name: tempUser.displayName || 'Pengguna Baru',
        role: selectedRole,
        createdAt: new Date().toISOString()
      };
      
      await setDoc(doc(db, 'users', tempUser.uid), newUserData);
      setUserData(newUserData as any);
      
      navigate(selectedRole === 'admin' ? '/admin' : '/teacher');
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan data akun.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <img src="/logo.jpg" alt="Logo Absensi Guru" className="w-24 h-24 rounded-2xl shadow-sm object-cover" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Sistem Absensi Guru
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          {needsRole ? 'Selesaikan pendaftaran akun Anda' : 'Masuk untuk melanjutkan'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          
          {error && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {!needsRole ? (
            <div>
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex justify-center items-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <img className="h-5 w-5 mr-2" src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google logo" />
                {loading ? 'Memproses...' : 'Lanjutkan dengan Google'}
              </button>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSaveRole}>
              <div>
                <p className="text-sm text-gray-600 mb-4 text-center">
                  Halo <strong>{tempUser?.displayName}</strong>, silakan pilih peran Anda untuk aplikasi ini.
                </p>
                <label className="block text-sm font-medium text-gray-700">Peran Anda</label>
                <div className="mt-1">
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as 'admin' | 'teacher')}
                    className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md border"
                  >
                    <option value="teacher">Guru</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loading ? 'Menyimpan...' : 'Simpan & Lanjutkan'}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
      
      {/* Footer / Credit */}
      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500 font-medium">
          Dibuat oleh <span className="text-blue-600">Muhammad Fajar, S.Pd</span>
        </p>
      </div>
    </div>
  );
}
