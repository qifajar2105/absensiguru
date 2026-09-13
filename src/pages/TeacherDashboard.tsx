import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Scanner } from '@yudiel/react-qr-scanner';
import { calculateDistance, validateQRPayload } from '../lib/utils';
import { LogOut, Scan, MapPin, CheckCircle, AlertCircle, WifiOff, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { ThemeLanguageToggle } from '../components/ThemeLanguageToggle';
import { translations } from '../lib/translations';
import { isMasterSuperAdmin } from '../lib/superAdminAuth';

export default function TeacherDashboard() {
  const { userData, language, setUserData } = useStore();
  const t = translations[language] || translations.id;
  const navigate = useNavigate();

  const [scanning, setScanning] = useState(false);
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [schoolSettings, setSchoolSettings] = useState({ lat: -6.2, lng: 106.8, radius: 100 });
  const [attendanceStatus, setAttendanceStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const isSuperAdmin = 
    userData?.role === 'superadmin' || 
    isMasterSuperAdmin(userData?.email);

  useEffect(() => {
    // Check network status for offline notification
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Fetch School Settings
    const fetchSettings = async () => {
      try {
        const schoolKey = userData?.schoolCode ? userData.schoolCode.toUpperCase() : 'main';
        let docRef = doc(db, 'school_settings', schoolKey);
        let docSnap = await getDoc(docRef);
        if (!docSnap.exists() && schoolKey !== 'main') {
          docRef = doc(db, 'school_settings', 'main');
          docSnap = await getDoc(docRef);
        }
        if (docSnap.exists()) {
          const data = docSnap.data() as any;
          setSchoolSettings(data);
          localStorage.setItem(`cached_school_settings_${schoolKey}`, JSON.stringify(data));
        }
      } catch (err) {
        console.log("Could not fetch settings. Using cache if available.", err);
        const schoolKey = userData?.schoolCode ? userData.schoolCode.toUpperCase() : 'main';
        const cached = localStorage.getItem(`cached_school_settings_${schoolKey}`) || localStorage.getItem('cached_school_settings');
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

  const getLocation = () => {
    setLocating(true);
    setLocationError('');
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          
          // @ts-ignore - Check for mock location flag if provided
          if (position.coords.mocked === true) {
            setLocationError(t.fakeGpsWarning);
            setLocating(false);
            return;
          }

          setLocation({
            lat: latitude,
            lng: longitude
          });
          setLocating(false);
        },
        () => {
          setLocationError(t.geoFailed);
          setLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setLocationError(t.geoNotSupported);
      setLocating(false);
    }
  };

  const handleScanSuccess = async (qrData: string) => {
    if (!location) {
      toast.error(t.locNotFound);
      setAttendanceStatus('error');
      setStatusMessage(t.locNotFound);
      return;
    }

    if (!validateQRPayload(qrData, userData?.schoolCode)) {
      toast.error(t.qrInvalid);
      setAttendanceStatus('error');
      setStatusMessage(t.qrInvalid);
      return;
    }

    // Geofencing Check: Distance calculation between Device GPS and Firestore School Coordinates
    const targetLat = (schoolSettings as any).location?.lat ?? schoolSettings.lat;
    const targetLng = (schoolSettings as any).location?.lng ?? schoolSettings.lng;

    const distance = calculateDistance(
      location.lat, 
      location.lng, 
      targetLat, 
      targetLng
    );

    if (distance > schoolSettings.radius) {
      const msg = `${t.outsideRadius} ${Math.round(distance)}m (${t.outsideRadiusDesc})`;
      toast.error(msg);
      setAttendanceStatus('error');
      setStatusMessage(msg);
      return;
    }

    try {
      await addDoc(collection(db, 'attendance'), {
        teacherId: userData?.uid,
        teacherName: userData?.name,
        schoolCode: userData?.schoolCode ? userData.schoolCode.toUpperCase() : 'DEFAULT',
        schoolName: userData?.schoolName || '',
        date: format(new Date(), 'yyyy-MM-dd'),
        timestamp: serverTimestamp(),
        status: 'Hadir',
        location,
        distanceFromSchool: distance
      });

      const successMsg = isOffline 
        ? t.attendanceOfflineSaved 
        : t.attendanceSaved;
      
      toast.success(successMsg);
      setAttendanceStatus('success');
      setStatusMessage(successMsg);
    } catch (err: any) {
      toast.error(`${t.failed}: ${err.message}`);
      setAttendanceStatus('error');
      setStatusMessage(`${t.failed}: ${err.message}`);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUserData(null);
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col transition-colors duration-300">
      <header className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-xs px-4 sm:px-6 py-3.5 flex justify-between items-center sticky top-0 z-50 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center border border-blue-100 dark:border-blue-800/50">
            <Scan className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
              {t.appTitle}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
              {t.hello}, <span className="font-semibold text-gray-700 dark:text-gray-300">{userData?.name}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {isSuperAdmin && (
            <button
              onClick={() => navigate('/superadmin')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-xs font-bold transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Super Admin</span>
            </button>
          )}
          <ThemeLanguageToggle />
          <button 
            onClick={handleLogout} 
            className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all" 
            title={t.logout}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-8 flex flex-col items-center justify-center max-w-lg mx-auto w-full">
        
        {isOffline && (
          <div className="w-full mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-2xl p-4 flex items-start shadow-xs animate-in fade-in slide-in-from-top-2">
            <WifiOff className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mr-3 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">{t.offlineMode}</h3>
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1 leading-relaxed">{t.offlineDesc}</p>
            </div>
          </div>
        )}

        <div className="w-full bg-white dark:bg-gray-900 rounded-3xl shadow-xs border border-gray-200/80 dark:border-gray-800 overflow-hidden animate-in fade-in duration-300">
          <div className="p-6 sm:p-8">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 text-center tracking-tight">
              {t.recordAttendance}
            </h2>

            {!location && (
              <div className="text-center animate-in fade-in">
                <div className="bg-blue-50/60 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800/50 text-blue-800 dark:text-blue-200 p-5 rounded-2xl mb-6 text-xs sm:text-sm leading-relaxed">
                  {t.locWarning}
                </div>
                <button
                  onClick={getLocation}
                  disabled={locating}
                  className="w-full flex items-center justify-center py-3.5 px-4 rounded-xl shadow-xs text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-hidden disabled:opacity-50 transition-all"
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  {locating ? t.processing : t.getLocation}
                </button>
                {locationError && (
                  <p className="mt-3 text-xs font-semibold text-red-600 dark:text-red-400">
                    {locationError}
                  </p>
                )}
              </div>
            )}

            {location && !scanning && attendanceStatus === 'idle' && (
              <div className="text-center animate-in fade-in duration-300">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300 p-4 rounded-2xl mb-6 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  <span className="text-sm font-semibold">{t.locVerified}</span>
                </div>
                <button
                  onClick={() => setScanning(true)}
                  className="w-full flex items-center justify-center py-3.5 px-4 rounded-xl shadow-xs text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all"
                >
                  <Scan className="w-4 h-4 mr-2" />
                  {t.scanQR}
                </button>
              </div>
            )}

            {scanning && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="w-full overflow-hidden rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-black aspect-square">
                  <Scanner
                    onScan={(result) => {
                      if (result && result.length > 0) {
                        setScanning(false);
                        handleScanSuccess(result[0].rawValue);
                      }
                    }}
                    onError={(error: any) => {
                      toast.error(t.cameraError + (error?.message || ''));
                    }}
                    components={{
                      audio: false,
                      finder: true
                    }}
                  />
                </div>
                <button
                  onClick={() => setScanning(false)}
                  className="w-full py-2.5 px-4 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  {t.cancelScan}
                </button>
              </div>
            )}

            {attendanceStatus === 'success' && (
              <div className="text-center py-6 animate-in zoom-in-95 duration-300">
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t.success}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 leading-relaxed max-w-[280px] mx-auto">
                  {statusMessage}
                </p>
                <button
                  onClick={() => setAttendanceStatus('idle')}
                  className="py-2.5 px-6 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl text-xs font-semibold hover:bg-gray-800 dark:hover:bg-white transition-all shadow-xs"
                >
                  {t.done}
                </button>
              </div>
            )}

            {attendanceStatus === 'error' && (
              <div className="text-center py-6 animate-in zoom-in-95 duration-300">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-200 dark:border-red-800">
                  <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t.failed}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 leading-relaxed max-w-[280px] mx-auto">
                  {statusMessage}
                </p>
                <button
                  onClick={() => {
                    setAttendanceStatus('idle');
                    setScanning(true);
                  }}
                  className="py-2.5 px-6 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-xs"
                >
                  {t.tryAgain}
                </button>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
