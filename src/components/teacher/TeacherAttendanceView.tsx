import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { db } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc, query, where, getDocs, orderBy } from 'firebase/firestore';
import { format } from 'date-fns';
import { Scanner } from '@yudiel/react-qr-scanner';
import { calculateDistance, validateQRPayload, normalizeSchoolCode } from '../../lib/utils';
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
  X,
  Camera,
  UserCheck,
  ShieldAlert,
  AlertTriangle,
  RotateCcw
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

  // GPS Accuracy & Anomaly Detection states
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [isAnomalyDetected, setIsAnomalyDetected] = useState(false);
  const [anomalyReason, setAnomalyReason] = useState('');

  // 2-Step Attendance & Selfie Camera states
  const [scanStep, setScanStep] = useState<'qr' | 'selfie'>('qr');
  const [pendingScanData, setPendingScanData] = useState<{
    qrData: string;
    distance: number;
    scanType: 'Datang' | 'Pulang' | 'Mengajar';
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [submittingAttendance, setSubmittingAttendance] = useState(false);
  const [lastSelfieSuccess, setLastSelfieSuccess] = useState<string | null>(null);

  // Today's attendance states
  const [todayAttendances, setTodayAttendances] = useState<any[]>([]);
  const [loadingToday, setLoadingToday] = useState(true);

  // Manual report state (Sakit / Izin only)
  const [manualModal, setManualModal] = useState<{ open: boolean; type: 'Sakit' | 'Izin' }>({ open: false, type: 'Sakit' });
  const [manualKeterangan, setManualKeterangan] = useState('');
  const [submittingManual, setSubmittingManual] = useState(false);

  useEffect(() => {
    if (videoStream && videoRef.current) {
      videoRef.current.srcObject = videoStream;
    }
  }, [videoStream, scanStep]);

  useEffect(() => {
    return () => {
      stopSelfieCamera();
    };
  }, []);

  const startSelfieCamera = async () => {
    setCameraLoading(true);
    setCameraError('');
    setCapturedPhoto(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser atau perangkat ini tidak mendukung kamera selfie.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 640 }
        },
        audio: false
      });
      setVideoStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error('Error starting front camera:', err);
      const msg = err.name === 'NotAllowedError'
        ? 'Izin kamera selfie ditolak. Harap izinkan akses kamera di pengaturan browser.'
        : err.message || 'Gagal mengakses kamera depan.';
      setCameraError(msg);
      toast.error(msg);
    } finally {
      setCameraLoading(false);
    }
  };

  const stopSelfieCamera = () => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {}
      });
      setVideoStream(null);
    }
  };

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Fetch School Settings (specific for teacher's schoolCode)
    const fetchSettings = async () => {
      try {
        const teacherSchool = normalizeSchoolCode(userData?.schoolCode);
        const settingDocId = teacherSchool ? `school_${teacherSchool}` : 'main';
        const docRef = doc(db, 'school_settings', settingDocId);
        let docSnap = await getDoc(docRef);
        if (!docSnap.exists() && teacherSchool) {
          docSnap = await getDoc(doc(db, 'school_settings', 'main'));
        }

        if (docSnap.exists()) {
          const data = docSnap.data() as any;
          setSchoolSettings(data);
          localStorage.setItem(`cached_school_settings_${teacherSchool || 'main'}`, JSON.stringify(data));
        }
      } catch {
        const teacherSchool = normalizeSchoolCode(userData?.schoolCode);
        const cached = localStorage.getItem(`cached_school_settings_${teacherSchool || 'main'}`) || localStorage.getItem('cached_school_settings');
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

  const verifyGPSAnomaly = (coords: GeolocationCoordinates): { isAnomaly: boolean; reason: string } => {
    // 1. Android mock location provider flag
    // @ts-ignore
    if (coords.mocked === true) {
      return {
        isAnomaly: true,
        reason: 'Aplikasi Fake GPS / Mock Location terdeteksi aktif di sistem Android.'
      };
    }
    // 2. Suspiciously zero or near-zero accuracy (typical signature of Fake GPS mock injection)
    if (coords.accuracy === 0 || coords.accuracy < 1.5) {
      return {
        isAnomaly: true,
        reason: 'Akurasi GPS bernilai 0 meter (indikator utama injeksi Fake GPS emulator).'
      };
    }
    // 3. Excessively poor accuracy (> 150m indicates cell-tower triangulated, not real GPS satellite fix)
    if (coords.accuracy > 150) {
      return {
        isAnomaly: true,
        reason: `Sinyal GPS lemah / estimasi seluler (akurasi ±${Math.round(coords.accuracy)}m > 150m).`
      };
    }
    return { isAnomaly: false, reason: '' };
  };

  const getLocation = () => {
    setLocating(true);
    setLocationError('');
    setIsAnomalyDetected(false);
    setAnomalyReason('');
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          const anomaly = verifyGPSAnomaly(position.coords);

          if (anomaly.isAnomaly) {
            setIsAnomalyDetected(true);
            setAnomalyReason(anomaly.reason);

            // Critical anomaly: block immediately if mock or accuracy 0
            // @ts-ignore
            if (position.coords.mocked === true || accuracy === 0 || accuracy < 1.5) {
              setLocationError(`⚠️ Keamanan Presensi: ${anomaly.reason} Harap nonaktifkan aplikasi pemalsu lokasi dan gunakan GPS asli.`);
              setLocating(false);
              return;
            }
          }

          setLocation({ lat: latitude, lng: longitude });
          setGpsAccuracy(Math.round(accuracy));
          setLocating(false);
          toast.success(`${t.locVerified} (Akurasi: ±${Math.round(accuracy)}m)`);
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

  const [isProcessingScan, setIsProcessingScan] = useState(false);

  const startScan = (type: 'Datang' | 'Pulang' | 'Mengajar') => {
    if (!location) {
      toast.error(t.locNotFoundDesc);
      getLocation();
      return;
    }
    setAttendanceStatus('idle');
    setStatusMessage('');
    setScanStep('qr');
    setCapturedPhoto(null);
    setPendingScanData(null);
    setIsProcessingScan(false);
    setActiveScanType(type);
  };

  const handleScanSuccess = async (qrData: string | undefined | null) => {
    if (isProcessingScan || !qrData) return;
    setIsProcessingScan(true);

    if (!location) {
      toast.error(t.locNotFound);
      setAttendanceStatus('error');
      setStatusMessage(t.locNotFoundDesc);
      setIsProcessingScan(false);
      return;
    }

    // Critical GPS anomaly check: if mock location or 0m accuracy
    if (isAnomalyDetected && (gpsAccuracy === 0 || gpsAccuracy === null || gpsAccuracy < 1.5)) {
      toast.error('Presensi Ditolak: Terdeteksi manipulasi GPS / Fake GPS.');
      setAttendanceStatus('error');
      setStatusMessage('Presensi ditolak demi integritas data: Terdeteksi anomali sinyal lokasi (Fake GPS).');
      setIsProcessingScan(false);
      return;
    }

    if (!validateQRPayload(qrData)) {
      toast.error(t.qrInvalid || 'QR Code tidak valid atau sudah kadaluarsa.');
      setAttendanceStatus('error');
      setStatusMessage(t.qrInvalidDesc || 'Silakan minta QR Code terbaru dari Admin.');
      setIsProcessingScan(false);
      return;
    }

    const targetLat = schoolSettings.location?.lat ?? schoolSettings.lat;
    const targetLng = schoolSettings.location?.lng ?? schoolSettings.lng;
    const targetRadius = schoolSettings.radius || 100;

    if (targetLat === undefined || targetLng === undefined) {
      toast.error('Pengaturan lokasi sekolah belum valid. Hubungi admin.');
      setAttendanceStatus('error');
      setStatusMessage('Gagal mencatat absensi: Pengaturan lokasi sekolah tidak ditemukan.');
      setIsProcessingScan(false);
      return;
    }

    const distance = calculateDistance(
      location.lat, 
      location.lng, 
      targetLat, 
      targetLng
    );

    if (distance > targetRadius) {
      toast.error(`${t.outOfRange} ${Math.round(distance)}m`);
      setAttendanceStatus('error');
      setStatusMessage(`${t.outOfRangeDesc} (${Math.round(distance)}m > ${targetRadius}m). ${t.fakeGPS}`);
      setIsProcessingScan(false);
      return;
    }

    const teacherSchool = normalizeSchoolCode(userData?.schoolCode);
    if (!teacherSchool) {
      toast.error('Kode sekolah Anda belum terdaftar. Silakan hubungi admin sekolah Anda.');
      setAttendanceStatus('error');
      setStatusMessage('Gagal mencatat absensi: Kode sekolah akun Anda belum valid.');
      setIsProcessingScan(false);
      return;
    }

    // Step 1 QR validated successfully! Now proceed to Step 2: Front Camera Selfie Verification!
    const scanType = activeScanType || 'Datang';
    setPendingScanData({
      qrData,
      distance,
      scanType
    });
    setScanStep('selfie');
    // REMOVED success popup as requested by user ("untuk scan tidak perlu pop up")
    startSelfieCamera();
    setIsProcessingScan(false);
  };

  const handleTakeSelfie = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      toast.error('Kamera sedang memuat, mohon tunggu sebentar.');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      const size = 400;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const minDim = Math.min(video.videoWidth, video.videoHeight);
      const startX = (video.videoWidth - minDim) / 2;
      const startY = (video.videoHeight - minDim) / 2;

      // Mirror horizontally so it feels natural like a phone front-camera
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, startX, startY, minDim, minDim, 0, 0, size, size);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
      setCapturedPhoto(dataUrl);
      toast.success('Foto selfie berhasil diambil! Silakan tekan Kirim Presensi.');
    } catch (err: any) {
      toast.error(`Gagal mengambil foto: ${err.message}`);
    }
  };

  const handleRetakeSelfie = () => {
    setCapturedPhoto(null);
  };

  const handleSubmitAttendanceWithSelfie = async () => {
    if (!location || !pendingScanData) {
      toast.error('Data presensi belum lengkap.');
      return;
    }

    if (!capturedPhoto) {
      toast.error('Silakan ambil foto selfie wajah Anda terlebih dahulu.');
      return;
    }

    const teacherSchool = normalizeSchoolCode(userData?.schoolCode);
    if (!teacherSchool) {
      toast.error('Kode sekolah Anda belum terdaftar.');
      return;
    }

    setSubmittingAttendance(true);
    try {
      const scanType = pendingScanData.scanType;
      await addDoc(collection(db, 'attendance'), {
        teacherId: userData?.uid,
        teacherName: userData?.name,
        schoolCode: teacherSchool,
        date: format(new Date(), 'yyyy-MM-dd'),
        timestamp: serverTimestamp(),
        status: 'Hadir',
        type: scanType,
        location,
        distanceFromSchool: pendingScanData.distance,
        photoSelfie: capturedPhoto,
        gpsAccuracy: gpsAccuracy || null,
        isAnomalyDetected: isAnomalyDetected || false,
        anomalyReason: anomalyReason || ''
      });

      setLastSelfieSuccess(capturedPhoto);
      stopSelfieCamera();
      setActiveScanType(null);
      setScanStep('qr');
      setPendingScanData(null);
      setCapturedPhoto(null);

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
    } finally {
      setSubmittingAttendance(false);
    }
  };

  const handleCancelScan = () => {
    stopSelfieCamera();
    setActiveScanType(null);
    setScanStep('qr');
    setPendingScanData(null);
    setCapturedPhoto(null);
  };

  const handleConfirmManualAttendance = async () => {
    const teacherSchool = normalizeSchoolCode(userData?.schoolCode);
    if (!teacherSchool) {
      toast.error('Kode sekolah Anda belum terdaftar. Silakan hubungi admin sekolah Anda.');
      return;
    }

    setSubmittingManual(true);
    try {
      await addDoc(collection(db, 'attendance'), {
        teacherId: userData?.uid,
        teacherName: userData?.name,
        schoolCode: teacherSchool,
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
                ? `Koordinat: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)} (Radius ${schoolSettings.radius || 100}m)`
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

      {/* SCANNER & SELFIE MODAL OVERLAY */}
      {activeScanType && attendanceStatus === 'idle' && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4">
            {/* Modal Header & Step Indicator */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    scanStep === 'qr' 
                      ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' 
                      : 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                  }`}>
                    {scanStep === 'qr' ? 'Langkah 1: Scan Barcode' : 'Langkah 2: Foto Selfie Wajah'}
                  </span>
                  {gpsAccuracy !== null && (
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                      GPS ±{gpsAccuracy}m
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white mt-1">
                  {scanStep === 'qr' 
                    ? `Scan: Presensi ${activeScanType}` 
                    : 'Verifikasi Wajah (Kamera Depan)'}
                </h3>
              </div>
              <button
                onClick={handleCancelScan}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* STEP 1: SCAN QR CODE */}
            {scanStep === 'qr' && (
              <div className="space-y-3">
                <div className="w-full overflow-hidden rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-black aspect-square relative">
                  <Scanner
                    onScan={(result: any) => {
                      if (!result) return;
                      let extracted: string | null = null;
                      
                      if (Array.isArray(result) && result.length > 0) {
                        extracted = result[0].rawValue || result[0].text || result[0].value;
                      } else if (result && typeof result === 'object') {
                        extracted = result.rawValue || result.text || result.value;
                      } else if (typeof result === 'string') {
                        extracted = result;
                      }

                      if (!extracted) {
                        toast.error(`Format QR tidak dikenali: ${JSON.stringify(result)}`);
                        return;
                      }
                      
                      handleScanSuccess(extracted);
                    }}
                    onError={(error: any) => {
                      toast.error(`${t.cameraError} ${error?.message || 'Unknown error'}`);
                    }}
                    components={{
                      audio: false,
                      finder: true
                    }}
                  />
                </div>

                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-2.5 text-center text-xs text-blue-800 dark:text-blue-300 flex items-center justify-center gap-2">
                  <Scan className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Arahkan kamera ke Barcode/QR Code presensi sekolah Anda.</span>
                </div>

                <button
                  onClick={handleCancelScan}
                  className="w-full py-2.5 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-xs hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  {t.cancelScan}
                </button>
              </div>
            )}

            {/* STEP 2: FRONT-FACING CAMERA SELFIE */}
            {scanStep === 'selfie' && (
              <div className="space-y-3 animate-in fade-in">
                {/* Information Chips */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] bg-gray-50 dark:bg-gray-800/60 p-2.5 rounded-xl border border-gray-100 dark:border-gray-700/60">
                  <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Barcode Terverifikasi</span>
                  </div>
                  {pendingScanData && (
                    <div className="font-mono text-gray-500 dark:text-gray-400">
                      Jarak: {Math.round(pendingScanData.distance)}m
                    </div>
                  )}
                  {gpsAccuracy !== null && (
                    <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Akurasi ±{gpsAccuracy}m</span>
                    </div>
                  )}
                </div>

                {/* Live Camera / Captured Preview */}
                <div className="w-full aspect-square rounded-2xl overflow-hidden bg-black relative border-2 border-blue-500/40 shadow-inner flex items-center justify-center">
                  {capturedPhoto ? (
                    <div className="relative w-full h-full">
                      <img 
                        src={capturedPhoto} 
                        alt="Foto Selfie Presensi" 
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-3 left-3 bg-emerald-600/90 text-white text-[11px] font-bold px-2.5 py-1 rounded-full backdrop-blur-sm flex items-center gap-1.5 shadow">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Foto Siap Disimpan</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover transform -scale-x-100"
                      />
                      {/* Face positioning oval overlay */}
                      <div className="absolute inset-6 border-2 border-dashed border-white/70 rounded-full pointer-events-none flex items-center justify-center shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]">
                        <div className="text-center px-4 py-1.5 bg-black/50 backdrop-blur-md rounded-full text-white text-[11px] font-medium flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5" />
                          <span>Posisikan Wajah di Sini</span>
                        </div>
                      </div>

                      {cameraLoading && (
                        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white text-xs gap-2">
                          <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
                          <span>Membuka kamera depan...</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {cameraError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{cameraError}</span>
                  </div>
                )}

                {/* Action Buttons */}
                {!capturedPhoto ? (
                  <div className="space-y-2 pt-1">
                    <button
                      id="btn-take-selfie"
                      onClick={handleTakeSelfie}
                      disabled={cameraLoading || !!cameraError}
                      className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Ambil Foto Presensi Sekarang</span>
                    </button>
                    <button
                      onClick={handleCancelScan}
                      className="w-full py-2.5 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-medium text-xs hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      {t.cancelScan}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 pt-1">
                    <button
                      id="btn-submit-attendance-selfie"
                      onClick={handleSubmitAttendanceWithSelfie}
                      disabled={submittingAttendance}
                      className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
                    >
                      {submittingAttendance ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Menyimpan Presensi...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          <span>Kirim & Simpan Presensi</span>
                        </>
                      )}
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={handleRetakeSelfie}
                        disabled={submittingAttendance}
                        className="flex-1 py-2.5 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold text-xs hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Foto Ulang</span>
                      </button>
                      <button
                        onClick={handleCancelScan}
                        disabled={submittingAttendance}
                        className="flex-1 py-2.5 px-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 font-medium text-xs hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        {t.cancelScan}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUCCESS / ERROR MODAL */}
      {attendanceStatus !== 'idle' && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 text-center animate-in zoom-in-95">
          {attendanceStatus === 'success' ? (
            <div className="space-y-3">
              <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="w-8 h-8" />
              </div>
              {lastSelfieSuccess && (
                <div className="inline-block relative rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-md">
                  <img 
                    src={lastSelfieSuccess} 
                    alt="Foto Selfie Terverifikasi" 
                    className="w-24 h-24 object-cover" 
                  />
                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] font-semibold py-0.5">
                    Wajah Terverifikasi
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-3 text-red-600 dark:text-red-400">
              <AlertCircle className="w-8 h-8" />
            </div>
          )}
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mt-2">
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
              className="px-6 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 text-xs font-semibold transition-colors shadow"
            >
              {t.done}
            </button>
            {attendanceStatus === 'error' && activeScanType && (
              <button
                onClick={() => {
                  setAttendanceStatus('idle');
                }}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
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
                    {item.photoSelfie ? (
                      <div className="w-9 h-9 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shrink-0 bg-gray-100">
                        <img 
                          src={item.photoSelfie} 
                          alt="Selfie" 
                          className="w-full h-full object-cover" 
                        />
                      </div>
                    ) : (
                      <span className={`w-2 h-2 rounded-full ${isHadir ? 'bg-emerald-500' : item.status === 'Sakit' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                    )}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {item.type || 'Presensi'} - {item.status}
                        </span>
                        {item.photoSelfie && (
                          <span className="text-[10px] bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-semibold px-1.5 py-0.2 rounded">
                            Selfie
                          </span>
                        )}
                      </div>
                      {item.notes && <p className="text-[11px] text-gray-500 dark:text-gray-400">{item.notes}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-gray-600 dark:text-gray-300 font-medium">{timeStr}</span>
                    <div className="flex items-center justify-end gap-1.5 mt-0.5">
                      {item.distanceFromSchool !== undefined && item.distanceFromSchool > 0 && (
                        <span className="text-[10px] text-gray-400 font-mono">{Math.round(item.distanceFromSchool)}m</span>
                      )}
                      {item.gpsAccuracy && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-medium">
                          (±{item.gpsAccuracy}m)
                        </span>
                      )}
                    </div>
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
