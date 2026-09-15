import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { db } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc, query, where, getDocs, orderBy } from 'firebase/firestore';
import { format } from 'date-fns';
import { Scanner } from '@yudiel/react-qr-scanner';
import { calculateDistance, validateQRPayload } from '../../lib/utils';
import { 
  Scan, 
  MapPin, 
  CheckCircle, 
  AlertCircle, 
  WifiOff, 
  Clock, 
  BookOpen, 
  LogOut as LogOutIcon, 
  LogIn, 
  HeartHandshake, 
  FileText, 
  ShieldCheck, 
  RefreshCw,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { translations } from '../../lib/translations';

interface TeacherAttendanceViewProps {
  onScanCountChange?: () => void;
}

export default function TeacherAttendanceView({ onScanCountChange }: TeacherAttendanceViewProps) {
  const { userData, language } = useStore();
  const t = translations[language];

  const [activeScanType, setActiveScanType] = useState<'Datang' | 'Pulang' | 'Mengajar' | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [schoolSettings, setSchoolSettings] = useState({ lat: -6.2, lng: 106.8, radius: 100 });
  const [attendanceStatus, setAttendanceStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Today's attendance states
  const [todayAttendances, setTodayAttendances] = useState<any[]>([]);
  const [loadingToday, setLoadingToday] = useState(true);

  // Manual report state (Sakit / Izin only)
  const [manualModal, setManualModal] = useState<{ open: boolean; type: 'Sakit' | 'Izin' }>({ open: false, type: 'Sakit' });
  const [manualKeterangan, setManualKeterangan] = useState('');
  const [submittingManual, setSubmittingManual] = useState(false);

  useEffect(() => {
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
      } catch {
        const cached = localStorage.getItem('cached_school_settings');
        if (cached) {
          setSchoolSettings(JSON.parse(cached));
        }
      }
    };
    fetchSettings();

    fetchTodayAttendances();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [userData]);

  const fetchTodayAttendances = async () => {
    if (!userData?.uid) {
      setLoadingToday(false);
      return;
    }
    try {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const q = query(
        collection(db, 'attendance'),
        where('teacherId', '==', userData.uid),
        where('date', '==', todayStr),
        orderBy('timestamp', 'desc')
      );
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setTodayAttendances(list);
      if (onScanCountChange) onScanCountChange();
    } catch (err) {
      console.warn("Could not fetch today's attendances (offline or indexing):", err);
    } finally {
      setLoadingToday(false);
    }
  };

  const getLocation = () => {
    setLocating(true);
    setLocationError('');
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          // @ts-ignore
          if (position.coords.mocked === true) {
            setLocationError('Terdeteksi aplikasi Fake GPS. Harap nonaktifkan emulator lokasi.');
            setLocating(false);
            return;
          }

          setLocation({ lat: latitude, lng: longitude });
          setLocating(false);
          toast.success(t.locVerified);
        },
        () => {
          setLocationError('Gagal memperoleh titik lokasi GPS. Pastikan GPS aktif dan izin diberikan.');
          setLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setLocationError(t.locNotSupported);
      setLocating(false);
    }
  };

  const startScan = (type: 'Datang' | 'Pulang' | 'Mengajar') => {
    if (!location) {
      toast.error(t.locNotFoundDesc);
      getLocation();
      return;
    }
    setAttendanceStatus('idle');
    setStatusMessage('');
    setActiveScanType(type);
  };

  const handleScanSuccess = async (qrData: string) => {
    if (!location) {
      toast.error(t.locNotFound);
      setAttendanceStatus('error');
      setStatusMessage(t.locNotFoundDesc);
      return;
    }

    if (!validateQRPayload(qrData)) {
      toast.error(t.qrInvalid);
      setAttendanceStatus('error');
      setStatusMessage(t.qrInvalidDesc);
      return;
    }

    const targetLat = schoolSettings.lat;
    const targetLng = schoolSettings.lng;

    const distance = calculateDistance(
      location.lat, 
      location.lng, 
      targetLat, 
      targetLng
    );

    if (distance > schoolSettings.radius) {
      toast.error(`${t.outOfRange} ${Math.round(distance)}m`);
      setAttendanceStatus('error');
      setStatusMessage(`${t.outOfRangeDesc} (${Math.round(distance)}m > ${schoolSettings.radius}m). ${t.fakeGPS}`);
      return;
    }

    try {
      const scanType = activeScanType || 'Datang';
      await addDoc(collection(db, 'attendance'), {
        teacherId: userData?.uid,
        teacherName: userData?.name,
        schoolCode: userData?.schoolCode || 'DEFAULT',
        date: format(new Date(), 'yyyy-MM-dd'),
        timestamp: serverTimestamp(),
        status: 'Hadir',
        type: scanType,
        location,
        distanceFromSchool: distance
      });

      const successMsg = isOffline 
        ? t.offlineRecorded 
        : `${t.attendanceSuccess} (${scanType === 'Datang' ? t.typeDatang : scanType === 'Pulang' ? t.typePulang : t.typeMengajar})`;
      
      toast.success(successMsg);
      setAttendanceStatus('success');
      setStatusMessage(successMsg);
      fetchTodayAttendances();
    } catch (err: any) {
      toast.error(t.sysError);
      setAttendanceStatus('error');
      setStatusMessage(`${t.errorOccured} ${err.message}`);
    }
  };

  const handleConfirmManualAttendance = async () => {
    setSubmittingManual(true);
    try {
      await addDoc(collection(db, 'attendance'), {
        teacherId: userData?.uid,
        teacherName: userData?.name,
        schoolCode: userData?.schoolCode || 'DEFAULT',
        date: format(new Date(), 'yyyy-MM-dd'),
        timestamp: serverTimestamp(),
        status: manualModal.type,
        type: 'Absen Harian',
        notes: manualKeterangan.trim(),
        location: location || { lat: 0, lng: 0 },
        distanceFromSchool: 0
      });

      toast.success(`${t.manualSuccess} (${manualModal.type})`);
      setManualModal({ open: false, type: 'Sakit' });
      setManualKeterangan('');
      setAttendanceStatus('success');
      setStatusMessage(`${t.manualSuccess} - Status: ${manualModal.type}`);
      fetchTodayAttendances();
    } catch (err: any) {
      toast.error(t.sysError);
      setStatusMessage(`${t.errorOccured} ${err.message}`);
    } finally {
      setSubmittingManual(false);
    }
  };

  // Determine current day summary
  const hasMasuk = todayAttendances.some(a => a.type === 'Datang' && a.status === 'Hadir');
  const hasPulang = todayAttendances.some(a => a.type === 'Pulang' && a.status === 'Hadir');
  const mengajarCount = todayAttendances.filter(a => a.type === 'Mengajar' && a.status === 'Hadir').length;
  const leaveReport = todayAttendances.find(a => a.status === 'Sakit' || a.status === 'Izin');

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {isOffline && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-2xl p-4 flex items-start shadow-sm">
          <WifiOff className="w-5 h-5 text-amber-600 dark:text-amber-400 mr-3 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">{t.offlineMode}</h3>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">{t.offlineDesc}</p>
          </div>
        </div>
      )}

      {/* GPS Location Status Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${location ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'}`}>
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">GPS Presensi Terverifikasi</h3>
              {location && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300">
                  <ShieldCheck className="w-3 h-3 mr-1" /> Aktif
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {location 
                ? `Koordinat: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)} (Radius ${schoolSettings.radius}m)`
                : 'Lokasi belum terdeteksi. Dapatkan lokasi untuk membuka scan presensi.'}
            </p>
          </div>
        </div>
        <button
          id="btn-get-location"
          onClick={getLocation}
          disabled={locating}
          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center justify-center transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-2 ${locating ? 'animate-spin' : ''}`} />
          {locating ? t.processing : (location ? 'Perbarui GPS' : t.getLocation)}
        </button>
      </div>

      {locationError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-3.5 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{locationError}</span>
        </div>
      )}

      {/* Leave alert if already reported sakit/izin today */}
      {leaveReport && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HeartHandshake className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                Hari ini Anda tercatat: <span className="font-bold uppercase tracking-wider">{leaveReport.status}</span>
              </p>
              {leaveReport.notes && <p className="text-xs text-blue-700 dark:text-blue-300">Catatan: {leaveReport.notes}</p>}
            </div>
          </div>
          <span className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 font-medium px-2.5 py-1 rounded-full">
            Tercatat
          </span>
        </div>
      )}

      {/* THREE SEPARATE SCAN ACTIONS */}
      <div>
        <div className="mb-3">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Pilih Jenis Scan Presensi</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. SCAN MASUK */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/60 shadow-sm flex flex-col justify-between hover:border-blue-300 dark:hover:border-blue-700 transition-all">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <LogIn className="w-5 h-5" />
                </div>
                {hasMasuk ? (
                  <span className="inline-flex items-center text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle className="w-3 h-3 mr-1" /> Sudah Masuk
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
                    Belum Absen
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-snug">{t.scanMasuk}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{t.scanMasukSubtitle}</p>
            </div>

            <button
              id="btn-scan-masuk"
              onClick={() => startScan('Datang')}
              className="mt-5 w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm hover:shadow flex items-center justify-center gap-2 transition-all"
            >
              <Scan className="w-4 h-4" />
              <span>Scan Presensi Masuk</span>
            </button>
          </div>

          {/* 2. SCAN PULANG */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/60 shadow-sm flex flex-col justify-between hover:border-purple-300 dark:hover:border-purple-700 transition-all">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <LogOutIcon className="w-5 h-5" />
                </div>
                {hasPulang ? (
                  <span className="inline-flex items-center text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle className="w-3 h-3 mr-1" /> Sudah Pulang
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
                    Belum Absen
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-snug">{t.scanPulang}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{t.scanPulangSubtitle}</p>
            </div>

            <button
              id="btn-scan-pulang"
              onClick={() => startScan('Pulang')}
              className="mt-5 w-full py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-sm hover:shadow flex items-center justify-center gap-2 transition-all"
            >
              <Scan className="w-4 h-4" />
              <span>Scan Presensi Pulang</span>
            </button>
          </div>

          {/* 3. SCAN JAM MENGAJAR */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/60 shadow-sm flex flex-col justify-between hover:border-emerald-300 dark:hover:border-emerald-700 transition-all">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  {mengajarCount} Sesi Hari Ini
                </span>
              </div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-snug">{t.scanMengajar}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{t.scanMengajarSubtitle}</p>
            </div>

            <button
              id="btn-scan-mengajar"
              onClick={() => startScan('Mengajar')}
              className="mt-5 w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm hover:shadow flex items-center justify-center gap-2 transition-all"
            >
              <Scan className="w-4 h-4" />
              <span>Scan Jam Mengajar</span>
            </button>
          </div>
        </div>
      </div>

      {/* SCANNER MODAL OVERLAY */}
      {activeScanType && attendanceStatus === 'idle' && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Kamera Aktif
                </span>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Scan: {activeScanType === 'Datang' ? 'Presensi Masuk (Datang)' : activeScanType === 'Pulang' ? 'Presensi Pulang' : 'Presensi Jam Mengajar'}
                </h3>
              </div>
              <button
                onClick={() => setActiveScanType(null)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="w-full overflow-hidden rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-black aspect-square">
              <Scanner
                onScan={(result) => {
                  if (result && result.length > 0) {
                    handleScanSuccess(result[0].rawValue);
                  }
                }}
                onError={(error: any) => {
                  toast.error(`${t.cameraError} ${error.message}`);
                }}
                components={{
                  audio: false,
                  finder: true
                }}
              />
            </div>

            <p className="text-center text-xs text-gray-500 dark:text-gray-400">
              Arahkan kamera ke QR Code presensi sekolah yang valid.
            </p>

            <button
              onClick={() => setActiveScanType(null)}
              className="w-full py-3 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium text-xs hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {t.cancelScan}
            </button>
          </div>
        </div>
      )}

      {/* SUCCESS / ERROR MODAL */}
      {attendanceStatus !== 'idle' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 text-center animate-in zoom-in-95">
          {attendanceStatus === 'success' ? (
            <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-3 text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="w-8 h-8" />
            </div>
          ) : (
            <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-3 text-red-600 dark:text-red-400">
              <AlertCircle className="w-8 h-8" />
            </div>
          )}
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            {attendanceStatus === 'success' ? t.success : t.failed}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
            {statusMessage}
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <button
              onClick={() => {
                setAttendanceStatus('idle');
                setActiveScanType(null);
              }}
              className="px-5 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 text-xs font-semibold transition-colors"
            >
              {t.done}
            </button>
            {attendanceStatus === 'error' && activeScanType && (
              <button
                onClick={() => {
                  setAttendanceStatus('idle');
                }}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
              >
                {t.tryAgain}
              </button>
            )}
          </div>
        </div>
      )}

      {/* MENU LAPOR KEHADIRAN (HANYA SAKIT & IZIN) */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/60 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Lapor Kehadiran (Sakit / Izin)</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Gunakan tombol di bawah jika berhalangan hadir di sekolah. Data otomatis terkirim ke Admin Sekolah.
            </p>
          </div>
          <FileText className="w-5 h-5 text-gray-400" />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            id="btn-lapor-sakit"
            onClick={() => setManualModal({ open: true, type: 'Sakit' })}
            className="py-3 px-4 rounded-xl border-2 border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-xs font-bold transition-all flex items-center justify-center gap-2"
          >
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            {t.manualSakit}
          </button>
          <button
            id="btn-lapor-izin"
            onClick={() => setManualModal({ open: true, type: 'Izin' })}
            className="py-3 px-4 rounded-xl border-2 border-blue-200 dark:border-blue-800/60 bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-800 dark:text-blue-300 text-xs font-bold transition-all flex items-center justify-center gap-2"
          >
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            {t.manualIzin}
          </button>
        </div>
      </div>

      {/* MODAL LAPOR SAKIT / IZIN */}
      {manualModal.open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Konfirmasi Lapor {manualModal.type}
              </h3>
              <button
                onClick={() => setManualModal({ open: false, type: 'Sakit' })}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-gray-300">
              Apakah Anda yakin ingin melaporkan ketidakhadiran hari ini dengan status <strong>{manualModal.type}</strong>?
            </p>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Keterangan / Catatan (Opsional)
              </label>
              <textarea
                value={manualKeterangan}
                onChange={(e) => setManualKeterangan(e.target.value)}
                placeholder={manualModal.type === 'Sakit' ? 'Contoh: Demam, istirahat dokter' : 'Contoh: Ada keperluan keluarga mendesak'}
                rows={3}
                className="w-full text-xs p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setManualModal({ open: false, type: 'Sakit' })}
                className="flex-1 py-2.5 px-3 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleConfirmManualAttendance}
                disabled={submittingManual}
                className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
              >
                {submittingManual ? t.processing : 'Kirim Laporan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TODAY'S ACTIVITY LOG */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/60 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" />
            Riwayat Presensi Hari Ini ({format(new Date(), 'dd MMMM yyyy')})
          </h3>
          <span className="text-[11px] text-gray-400">{todayAttendances.length} aktivitas</span>
        </div>

        {loadingToday ? (
          <p className="text-xs text-gray-400 py-3 text-center">{t.loading}</p>
        ) : todayAttendances.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">Belum ada rekaman presensi untuk hari ini.</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {todayAttendances.map((item) => {
              let timeStr = '-';
              try {
                if (item.timestamp) {
                  const d = typeof item.timestamp.toDate === 'function' ? item.timestamp.toDate() : new Date(item.timestamp);
                  timeStr = format(d, 'HH:mm:ss');
                }
              } catch {}

              const isHadir = item.status === 'Hadir';

              return (
                <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full ${isHadir ? 'bg-emerald-500' : item.status === 'Sakit' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                    <div>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {item.type || 'Presensi'} - {item.status}
                      </span>
                      {item.notes && <p className="text-[11px] text-gray-500 dark:text-gray-400">{item.notes}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-gray-600 dark:text-gray-300 font-medium">{timeStr}</span>
                    {item.distanceFromSchool !== undefined && item.distanceFromSchool > 0 && (
                      <p className="text-[10px] text-gray-400">{Math.round(item.distanceFromSchool)}m dari sekolah</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
