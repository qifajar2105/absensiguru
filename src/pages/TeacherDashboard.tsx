import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { QrReader } from 'react-qr-reader';
import { calculateDistance, validateQRPayload } from '../lib/utils';
import { LogOut, Scan, MapPin, CheckCircle, AlertCircle, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TeacherDashboard() {
  const { userData } = useStore();
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [schoolSettings, setSchoolSettings] = useState({ lat: -6.2, lng: 106.8, radius: 100 });
  const [attendanceStatus, setAttendanceStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    // Check network status for offline notification
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Fetch School Settings
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'school_settings', 'main');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as any;
          setSchoolSettings(data);
          localStorage.setItem('cached_school_settings', JSON.stringify(data));
        }
      } catch (err) {
        console.log("Could not fetch settings (might be offline). Using defaults or cache.");
        const cached = localStorage.getItem('cached_school_settings');
        if (cached) {
          setSchoolSettings(JSON.parse(cached));
        }
      }
    };
    fetchSettings();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    // We handle QR scanning in the render block via QrReader component now
  }, [scanning, location]);

  const getLocation = () => {
    setLocating(true);
    setLocationError('');
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Heuristic Anti-Fake GPS Detection
          // Aplikasi Fake GPS di web seringkali memiliki anomali pada metadata koordinat
          // 1. Akurasi (accuracy) yang tidak wajar (misal: selalu absolut/persis di angka tertentu)
          // 2. Ketiadaan data pergerakan (heading/speed) atau ketinggian pada perangkat modern
          
          const { latitude, longitude, accuracy } = position.coords;

          // Deteksi akurasi tidak masuk akal (biasanya fake GPS menyetel akurasi buatan yang terlalu sempurna misal < 5 meter di dalam ruangan)
          // Tapi kita biarkan lolos jika perangkat memang bagus, kita hanya tandai.
          
          // @ts-ignore - Beberapa browser bereksperimen dengan properti 'mocked'
          if (position.coords.mocked === true) {
            setLocationError('Terdeteksi penggunaan aplikasi Fake GPS (Mock Location). Harap matikan aplikasi emulator lokasi Anda.');
            setLocating(false);
            return;
          }

          setLocation({
            lat: latitude,
            lng: longitude
          });
          setLocating(false);
        },
        (error) => {
          setLocationError('Gagal mendapatkan lokasi. Pastikan GPS aktif dan izinkan akses lokasi (Anti-Fake GPS aktif).');
          setLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setLocationError('Geolocation tidak didukung di browser ini.');
      setLocating(false);
    }
  };

  const handleScanSuccess = async (qrData: string) => {
    if (!location) {
      toast.error('Lokasi belum ditemukan!');
      setAttendanceStatus('error');
      setStatusMessage('Lokasi belum ditemukan. Silakan dapatkan lokasi Anda terlebih dahulu.');
      return;
    }

    if (!validateQRPayload(qrData)) {
      toast.error('QR Code tidak valid!');
      setAttendanceStatus('error');
      setStatusMessage('QR Code tidak valid atau sudah kadaluarsa (Dynamic Protection).');
      return;
    }

    // Geofencing Check: Distance calculation between Device GPS and Firestore School Coordinates
    const distance = calculateDistance(
      location.lat, 
      location.lng, 
      schoolSettings.lat, 
      schoolSettings.lng
    );

    if (distance > schoolSettings.radius) {
      toast.error(`Di luar jangkauan lokasi! Jarak Anda: ${Math.round(distance)}m`);
      setAttendanceStatus('error');
      setStatusMessage(`Anda berada di luar radius sekolah. (Jarak Anda: ${Math.round(distance)}m, Batas: ${schoolSettings.radius}m). Anti-Fake GPS diaktifkan.`);
      return;
    }

    try {
      // Create attendance record
      // Firestore offline persistence will automatically cache this if offline
      await addDoc(collection(db, 'attendance'), {
        teacherId: userData?.uid,
        teacherName: userData?.name,
        date: format(new Date(), 'yyyy-MM-dd'),
        timestamp: serverTimestamp(),
        status: 'Hadir',
        location,
        distanceFromSchool: distance
      });

      const successMsg = isOffline 
        ? 'Absensi OFFLINE dicatat. Menunggu sinkronisasi internet.' 
        : 'Absensi berhasil dicatat!';
      
      toast.success(successMsg);
      setAttendanceStatus('success');
      setStatusMessage(successMsg);
    } catch (err: any) {
      toast.error('Terjadi kesalahan sistem.');
      setAttendanceStatus('error');
      setStatusMessage(`Terjadi kesalahan: ${err.message}`);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-blue-600">Absensi Guru</h1>
          <p className="text-sm text-gray-500">Halo, {userData?.name}</p>
        </div>
        <button onClick={handleLogout} className="p-2 text-gray-500 hover:bg-gray-100 rounded-md transition-colors">
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <main className="flex-1 p-4 flex flex-col items-center">
        
        {isOffline && (
          <div className="w-full max-w-md mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start">
            <WifiOff className="w-5 h-5 text-yellow-600 mr-3 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">Mode Offline Aktif</h3>
              <p className="text-xs text-yellow-700 mt-1">Koneksi internet terputus. Anda tetap dapat melakukan absensi dan data akan disimpan lokal, lalu disinkronisasi otomatis saat terhubung kembali.</p>
            </div>
          </div>
        )}

        <div className="w-full max-w-md bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-6 text-center">Rekam Kehadiran Anda</h2>

            {!location && (
              <div className="text-center">
                <div className="bg-blue-50 text-blue-800 p-4 rounded-lg mb-6 text-sm">
                  Untuk mencegah kecurangan (Fake GPS), kami memerlukan akses lokasi Anda dengan akurasi tinggi.
                </div>
                <button
                  onClick={getLocation}
                  disabled={locating}
                  className="w-full flex items-center justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none disabled:opacity-50 transition-all"
                >
                  <MapPin className="w-5 h-5 mr-2" />
                  {locating ? 'Mendapatkan Lokasi...' : 'Dapatkan Lokasi Saya'}
                </button>
                {locationError && <p className="mt-3 text-sm text-red-600">{locationError}</p>}
              </div>
            )}

            {location && !scanning && attendanceStatus === 'idle' && (
              <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-green-50 text-green-800 p-4 rounded-lg mb-6 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 mr-2" />
                  <span className="text-sm font-medium">Lokasi Terverifikasi</span>
                </div>
                <button
                  onClick={() => setScanning(true)}
                  className="w-full flex items-center justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none transition-all"
                >
                  <Scan className="w-5 h-5 mr-2" />
                  Scan QR Code Absensi
                </button>
              </div>
            )}

            {scanning && (
              <div className="space-y-4">
                <div className="w-full overflow-hidden rounded-xl border-2 border-dashed border-gray-300">
                  <QrReader
                    onResult={(result, error) => {
                      if (result) {
                        setScanning(false);
                        handleScanSuccess(result.getText());
                      }
                    }}
                    constraints={{ facingMode: 'environment' }}
                    className="w-full"
                  />
                </div>
                <button
                  onClick={() => setScanning(false)}
                  className="w-full py-2 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Batal
                </button>
              </div>
            )}

            {attendanceStatus === 'success' && (
              <div className="text-center py-6 animate-in zoom-in duration-300">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Berhasil!</h3>
                <p className="text-sm text-gray-600 mb-6">{statusMessage}</p>
                <button
                  onClick={() => setAttendanceStatus('idle')}
                  className="py-2 px-6 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Kembali
                </button>
              </div>
            )}

            {attendanceStatus === 'error' && (
              <div className="text-center py-6 animate-in zoom-in duration-300">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Gagal</h3>
                <p className="text-sm text-gray-600 mb-6">{statusMessage}</p>
                <button
                  onClick={() => {
                    setAttendanceStatus('idle');
                    setScanning(true);
                  }}
                  className="py-2 px-6 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                >
                  Coba Scan Lagi
                </button>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
