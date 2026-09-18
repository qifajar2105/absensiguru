import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { db, auth } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, setDoc, getDoc, deleteDoc, where, serverTimestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { 
  LogOut, 
  Download, 
  MapPin, 
  QrCode as QrCodeIcon, 
  Settings, 
  Calendar, 
  Users, 
  CheckSquare, 
  BookOpen, 
  Shield,
  Camera,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Eye,
  X
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { generateDailyQRData, STATIC_QR_PAYLOAD, normalizeSchoolCode } from '../lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { ThemeLanguageToggle } from '../components/ThemeLanguageToggle';
import { translations } from '../lib/translations';

// Subcomponents
import AdminStudentAttendanceRecap from '../components/admin/AdminStudentAttendanceRecap';
import AdminMasterDataView from '../components/admin/AdminMasterDataView';

export default function AdminDashboard() {
  const { userData, language } = useStore();
  const t = translations[language];
  const navigate = useNavigate();
  const [attendances, setAttendances] = useState<any[]>([]);
  const [qrValue, setQrValue] = useState<string>('');
  const [qrMode, setQrMode] = useState<'dynamic' | 'static'>('dynamic');
  const [activeTab, setActiveTab] = useState<'qr' | 'rekap' | 'studentRecap' | 'masterData' | 'users' | 'settings'>('qr');
  const [schoolLocation, setSchoolLocation] = useState({ lat: -6.200000, lng: 106.816666 });
  const [schoolRadius, setSchoolRadius] = useState(100);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedSelfieModal, setSelectedSelfieModal] = useState<any | null>(null);

  // Derived state for filtered attendances with specific grouping/sorting
  const filteredAttendances = attendances
    .filter(a => a.date && a.date.startsWith(selectedMonth))
    .sort((a, b) => {
      // 1. Primary Sort: Rank by Type/Status
      const getRank = (item: any) => {
        if (item.type === 'Datang') return 1;
        if (item.status === 'Sakit' || item.status === 'Izin' || item.status === 'Dinas Luar' || item.type === 'Absen Harian') return 2;
        if (item.type === 'Mengajar') return 3;
        if (item.type === 'Pulang') return 4;
        return 5;
      };
      
      const rankA = getRank(a);
      const rankB = getRank(b);
      
      if (rankA !== rankB) return rankA - rankB;

      // 2. Secondary Sort: Date (Newest first)
      const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : new Date(a.date).getTime();
      const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : new Date(b.date).getTime();
      if (timeA !== timeB) return timeB - timeA;

      // 3. Tertiary Sort: Name
      const nameA = a.teacherName || '';
      const nameB = b.teacherName || '';
      return nameA.localeCompare(nameB);
    });

  useEffect(() => {
    // Generate new QR every 10 seconds for dynamic protection
    if (activeTab === 'qr' && qrMode === 'dynamic') {
      const generateQr = () => setQrValue(generateDailyQRData());
      generateQr();
      const interval = setInterval(generateQr, 10000);
      return () => clearInterval(interval);
    } else if (activeTab === 'qr' && qrMode === 'static') {
      setQrValue(STATIC_QR_PAYLOAD);
    }
  }, [activeTab, qrMode]);

  useEffect(() => {
    const adminSchool = normalizeSchoolCode(userData?.schoolCode);

    // Fetch School Settings (per school, with fallback to main)
    const fetchSettings = async () => {
      try {
        const settingDocId = adminSchool ? `school_${adminSchool}` : 'main';
        const docRef = doc(db, 'school_settings', settingDocId);
        let docSnap = await getDoc(docRef);
        if (!docSnap.exists() && adminSchool) {
          docSnap = await getDoc(doc(db, 'school_settings', 'main'));
        }

        if (docSnap.exists()) {
          const data = docSnap.data() as any;
          setSchoolLocation(data.location || { lat: -6.200000, lng: 106.816666 });
          setSchoolRadius(data.radius || 100);
        }
      } catch (err) {
        console.error("Error fetching school settings:", err);
      }
    };
    fetchSettings();

    // If admin has no schoolCode, isolate and do NOT fetch other schools' data!
    if (!adminSchool) {
      setAttendances([]);
      setUsersList([]);
      return;
    }

    // Support both lowercase and uppercase variations for backwards compatibility
    const possibleSchoolCodes = Array.from(new Set([
      adminSchool,
      adminSchool.toLowerCase(),
      adminSchool.toUpperCase()
    ]));

    // Listen to Attendance strictly for this school
    const q = query(
      collection(db, 'attendance'),
      where('schoolCode', 'in', possibleSchoolCodes),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((item: any) => normalizeSchoolCode(item.schoolCode) === adminSchool);
      setAttendances(data);
    }, (err) => {
      console.warn("Attendance query error, falling back with client-side filter:", err);
      const fallbackQ = query(collection(db, 'attendance'));
      onSnapshot(fallbackQ, (snap) => {
        const data = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((item: any) => normalizeSchoolCode(item.schoolCode) === adminSchool);
        setAttendances(data);
      });
    });

    // Listen to Users strictly for this school
    const qUsers = query(
      collection(db, 'users'),
      where('schoolCode', 'in', possibleSchoolCodes)
    );

    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      const data = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((u: any) => normalizeSchoolCode(u.schoolCode) === adminSchool);
      setUsersList(data);
    }, (err) => {
      console.warn("Users query error, falling back with client-side filter:", err);
      const fallbackUsersQ = query(collection(db, 'users'));
      onSnapshot(fallbackUsersQ, (snap) => {
        const data = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((u: any) => normalizeSchoolCode(u.schoolCode) === adminSchool);
        setUsersList(data);
      });
    });

    return () => {
      unsubscribe();
      unsubscribeUsers();
    };
  }, [userData]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const handleSaveSettings = async () => {
    const adminSchool = normalizeSchoolCode(userData?.schoolCode);
    const settingDocId = adminSchool ? `school_${adminSchool}` : 'main';
    await setDoc(doc(db, 'school_settings', settingDocId), {
      location: schoolLocation,
      radius: schoolRadius,
      schoolCode: adminSchool || 'DEFAULT',
      updatedAt: serverTimestamp()
    }, { merge: true });

    // Also update main if setting default
    if (!adminSchool) {
      await setDoc(doc(db, 'school_settings', 'main'), {
        location: schoolLocation,
        radius: schoolRadius
      }, { merge: true });
    }

    alert(t.settingsSaved);
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (window.confirm(`${t.confirmDelete}\n\n${userName}`)) {
      try {
        await deleteDoc(doc(db, 'users', userId));
        alert(t.userDeleted);
      } catch (error) {
        console.error("Gagal menghapus pengguna:", error);
        alert(t.userDeleteFailed);
      }
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text(t.recapTitle, 14, 15);
    
    autoTable(doc, {
      head: [[t.teacherName, t.date, t.time, t.status, t.attType || 'Jenis', t.distance, 'Akurasi GPS', 'Verifikasi Selfie']],
      body: filteredAttendances.map(a => [
        a.teacherName,
        a.date,
        a.timestamp ? format(a.timestamp.toDate(), 'HH:mm:ss') : '-',
        a.status,
        a.type || '-',
        a.distanceFromSchool !== undefined ? `${Math.round(a.distanceFromSchool)}m` : '-',
        a.gpsAccuracy ? `±${a.gpsAccuracy}m` : (a.isAnomalyDetected ? 'Anomali' : '-'),
        a.photoSelfie ? 'Valid (Foto Wajah)' : '-'
      ]),
      startY: 20
    });

    doc.save(`Rekap_Absensi_Guru_${selectedMonth}.pdf`);
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredAttendances.map(a => ({
      [t.teacherName]: a.teacherName,
      [t.date]: a.date,
      [t.time]: a.timestamp ? format(a.timestamp.toDate(), 'HH:mm:ss') : '-',
      [t.status]: a.status,
      [t.attType || 'Jenis']: a.type || '-',
      [t.distance]: a.distanceFromSchool !== undefined ? Math.round(a.distanceFromSchool) : '-',
      'Akurasi GPS': a.gpsAccuracy ? `±${a.gpsAccuracy}m` : (a.isAnomalyDetected ? 'Anomali Fake GPS' : '-'),
      'Status Foto Selfie': a.photoSelfie ? 'Terverifikasi (Selfie)' : 'Tanpa Foto'
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Absensi Guru");
    XLSX.writeFile(wb, `Rekap_Absensi_Guru_${selectedMonth}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-gray-50/60 dark:bg-gray-950 flex transition-colors duration-300">
      {/* Sidebar Desktop */}
      <div className="w-64 bg-white dark:bg-gray-900 shadow-md flex flex-col justify-between hidden md:flex border-r border-gray-100 dark:border-gray-800">
        <div>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-6 h-6 text-blue-600" />
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t.adminTitle}</h1>
              </div>
              <ThemeLanguageToggle />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {userData?.name} • <span className="font-bold text-blue-600">{userData?.schoolCode || 'Sekolah'}</span>
            </p>
          </div>

          <nav className="mt-2 px-3 space-y-1">
            <button
              id="sidebar-tab-qr"
              onClick={() => setActiveTab('qr')}
              className={`w-full flex items-center px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'qr'
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <QrCodeIcon className="w-4 h-4 mr-3 text-blue-600" />
              {t.tabQR}
            </button>

            <button
              id="sidebar-tab-rekap"
              onClick={() => setActiveTab('rekap')}
              className={`w-full flex items-center px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'rekap'
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Calendar className="w-4 h-4 mr-3 text-blue-600" />
              <span>Rekap Absensi Guru</span>
            </button>

            <button
              id="sidebar-tab-student-rekap"
              onClick={() => setActiveTab('studentRecap')}
              className={`w-full flex items-center px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'studentRecap'
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <CheckSquare className="w-4 h-4 mr-3 text-emerald-600" />
              <span>Rekap Presensi Siswa</span>
            </button>

            <button
              id="sidebar-tab-master-data"
              onClick={() => setActiveTab('masterData')}
              className={`w-full flex items-center px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'masterData'
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <BookOpen className="w-4 h-4 mr-3 text-indigo-600" />
              <span>Master Siswa & Mapel</span>
            </button>

            <button
              id="sidebar-tab-users"
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'users'
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Users className="w-4 h-4 mr-3 text-purple-600" />
              {t.tabUsers}
            </button>

            <button
              id="sidebar-tab-settings"
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'settings'
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Settings className="w-4 h-4 mr-3 text-gray-500" />
              {t.tabSettings}
            </button>
          </nav>
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-3.5 py-2.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4 mr-3" />
            {t.logout}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <div className="md:hidden bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <h1 className="text-base font-bold text-gray-900 dark:text-white">{t.adminTitle}</h1>
          </div>
          <div className="flex items-center gap-1">
            <ThemeLanguageToggle />
            <button onClick={handleLogout} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* Mobile Navigation (Replaced by Bottom Nav) */}
        
        <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-8">
          <div className="max-w-5xl mx-auto">
            
            {/* 1. STUDENT RECAP TAB */}
            {activeTab === 'studentRecap' && (
              <AdminStudentAttendanceRecap />
            )}

            {/* 2. MASTER DATA (STUDENTS & SUBJECTS) TAB */}
            {activeTab === 'masterData' && (
              <AdminMasterDataView usersList={usersList} />
            )}

            {/* 3. USERS TAB */}
            {activeTab === 'users' && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6 border border-gray-100 dark:border-gray-700/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t.usersList}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Daftar akun admin dan guru terdaftar di sekolah Anda.</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-xs">
                    <thead>
                      <tr className="bg-gray-50/75 dark:bg-gray-900/50 text-gray-500 uppercase tracking-wider font-semibold">
                        <th className="px-4 py-3 text-left">{t.name}</th>
                        <th className="px-4 py-3 text-left">{t.email}</th>
                        <th className="px-4 py-3 text-left">{t.role}</th>
                        <th className="px-4 py-3 text-left">{t.registeredSince}</th>
                        <th className="px-4 py-3 text-right">{t.action}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                      {usersList.length === 0 ? (
                        <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">{t.noUsers}</td></tr>
                      ) : (
                        usersList.map((u) => {
                          let dateStr = '-';
                          try {
                            if (u.createdAt) {
                              const dateObj = typeof u.createdAt.toDate === 'function' 
                                ? u.createdAt.toDate() 
                                : new Date(u.createdAt);
                              dateStr = format(dateObj, 'dd MMM yyyy');
                            }
                          } catch (e) {
                            console.error('Format date error', e);
                          }

                          return (
                            <tr key={u.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                              <td className="px-4 py-3.5 whitespace-nowrap font-semibold text-gray-900 dark:text-white">{u.name || '-'}</td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-gray-500 dark:text-gray-400">{u.email || '-'}</td>
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <span className={`px-2 py-0.5 inline-flex text-[11px] font-bold rounded-md ${u.role === 'admin' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'}`}>
                                  {u.role === 'admin' ? 'Admin' : 'Guru'}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-gray-500 dark:text-gray-400 font-mono">
                                {dateStr}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-right">
                                <button
                                  onClick={() => handleDeleteUser(u.id, u.name)}
                                  className="text-red-600 hover:text-red-800 dark:text-red-400 text-xs font-semibold px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                >
                                  {t.delete}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4. QR GENERATOR TAB */}
            {activeTab === 'qr' && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-8 flex flex-col items-center justify-center text-center border border-gray-100 dark:border-gray-700/60">
                <div className="flex space-x-3 mb-6">
                  <button 
                    onClick={() => setQrMode('dynamic')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${qrMode === 'dynamic' ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}
                  >
                    {t.qrDynamic}
                  </button>
                  <button 
                    onClick={() => setQrMode('static')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${qrMode === 'static' ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}
                  >
                    {t.qrStatic}
                  </button>
                </div>

                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t.qrTitle}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 max-w-md">
                  {qrMode === 'dynamic' ? t.qrDynamicDesc : t.qrStaticDesc}
                </p>
                
                <div className="p-4 bg-white border-4 border-blue-100 rounded-2xl mb-6 shadow-sm" id="printable-qr">
                  {qrValue ? (
                    <QRCodeSVG value={qrValue} size={240} level="H" includeMargin={false} />
                  ) : (
                    <div className="w-[240px] h-[240px] bg-gray-100 animate-pulse rounded-lg flex items-center justify-center text-gray-400 text-xs">{t.loading}</div>
                  )}
                  {qrMode === 'static' && (
                    <div className="mt-4 text-xs font-bold text-gray-800 uppercase hidden print:block">
                      ABSENSI SEKOLAH
                    </div>
                  )}
                </div>
                
                {qrMode === 'dynamic' ? (
                  <p className="text-xs text-gray-400 font-mono">Kode dinamis ini berganti otomatis untuk mencegah screenshot.</p>
                ) : (
                  <button 
                    onClick={() => {
                      const printContent = document.getElementById('printable-qr')?.innerHTML;
                      const originalContent = document.body.innerHTML;
                      if (printContent) {
                        document.body.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;"><h1>Scan Untuk Absen</h1>${printContent}</div>`;
                        window.print();
                        document.body.innerHTML = originalContent;
                        window.location.reload();
                      }
                    }}
                    className="px-6 py-2.5 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
                  >
                    {t.printQR}
                  </button>
                )}
              </div>
            )}

            {/* 5. TEACHER RECAP TAB */}
            {activeTab === 'rekap' && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6 border border-gray-100 dark:border-gray-700/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Rekapitulasi Absensi Guru</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Catatan presensi masuk, pulang, dan jam mengajar guru sekolah.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center space-x-2 mr-2">
                      <label className="text-xs text-gray-600 dark:text-gray-300 font-semibold">{t.monthFilter}:</label>
                      <input 
                        type="month" 
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl px-3 py-1.5 text-xs text-gray-800 dark:text-gray-200"
                      />
                    </div>
                    <button onClick={exportExcel} className="flex items-center px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold rounded-xl hover:bg-emerald-100 transition-colors">
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      Excel
                    </button>
                    <button onClick={exportPDF} className="flex items-center px-3.5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow">
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      PDF
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-xs">
                    <thead>
                      <tr className="bg-gray-50/75 dark:bg-gray-900/50 text-gray-500 uppercase tracking-wider font-semibold">
                        <th className="px-4 py-3 text-left">{t.teacherName}</th>
                        <th className="px-4 py-3 text-left">Foto Wajah</th>
                        <th className="px-4 py-3 text-left">{t.date} & {t.time}</th>
                        <th className="px-4 py-3 text-left">Jarak & Akurasi GPS</th>
                        <th className="px-4 py-3 text-left">{t.attType || 'Jenis'}</th>
                        <th className="px-4 py-3 text-left">{t.status}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                      {filteredAttendances.length === 0 ? (
                        <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">{t.noAttendance}</td></tr>
                      ) : (
                        filteredAttendances.map((a) => {
                          let timeStr = '-';
                          try {
                            if (a.timestamp) {
                              const d = typeof a.timestamp.toDate === 'function' ? a.timestamp.toDate() : new Date(a.timestamp);
                              timeStr = format(d, 'HH:mm:ss');
                            }
                          } catch {}

                          return (
                            <tr key={a.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                              <td className="px-4 py-3 whitespace-nowrap font-semibold text-gray-900 dark:text-white">
                                {a.teacherName}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {a.photoSelfie ? (
                                  <button
                                    onClick={() => setSelectedSelfieModal(a)}
                                    className="relative group rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 hover:ring-2 hover:ring-blue-500 transition-all flex items-center gap-1.5 p-1 bg-gray-50 dark:bg-gray-800"
                                    title="Klik untuk melihat detail verifikasi foto"
                                  >
                                    <img 
                                      src={a.photoSelfie} 
                                      alt={a.teacherName} 
                                      className="w-8 h-8 rounded-lg object-cover" 
                                    />
                                    <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 pr-1 group-hover:underline flex items-center gap-0.5">
                                      <Eye className="w-3 h-3" />
                                      Lihat
                                    </span>
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-gray-400 italic">Tanpa Foto</span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap font-mono text-gray-600 dark:text-gray-300">
                                <div>{a.date}</div>
                                <div className="text-[10px] text-gray-400">{timeStr}</div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="font-mono text-gray-700 dark:text-gray-300 text-xs">
                                  {a.distanceFromSchool !== undefined && a.distanceFromSchool > 0 ? `${Math.round(a.distanceFromSchool)}m dari sekolah` : '-'}
                                </div>
                                <div className="flex items-center gap-1 mt-0.5">
                                  {a.isAnomalyDetected ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded">
                                      <ShieldAlert className="w-3 h-3" />
                                      Anomali Fake GPS
                                    </span>
                                  ) : a.gpsAccuracy ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
                                      <ShieldCheck className="w-3 h-3" />
                                      Akurasi ±{a.gpsAccuracy}m
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-gray-400">-</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                                  {a.type || 'Presensi'}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`px-2.5 py-0.5 inline-flex text-[11px] leading-5 font-bold rounded-full ${
                                  a.status === 'Hadir' 
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' 
                                    : a.status === 'Sakit'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                                }`}>
                                  {a.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* MODAL PREVIEW DETAIL SELFIE VERIFIKASI */}
            {selectedSelfieModal && (
              <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-gray-100 dark:border-gray-800 space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                        Verifikasi Keamanan Presensi
                      </span>
                      <h3 className="text-base font-bold text-gray-900 dark:text-white">
                        {selectedSelfieModal.teacherName}
                      </h3>
                    </div>
                    <button
                      onClick={() => setSelectedSelfieModal(null)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Selfie Photo */}
                  <div className="w-full aspect-square rounded-2xl overflow-hidden border-2 border-purple-200 dark:border-purple-800 shadow-inner bg-black">
                    <img
                      src={selectedSelfieModal.photoSelfie}
                      alt={selectedSelfieModal.teacherName}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Verification Info */}
                  <div className="space-y-2 text-xs bg-gray-50 dark:bg-gray-800/60 p-3 rounded-2xl border border-gray-100 dark:border-gray-700/60">
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Jenis Presensi:</span>
                      <span className="font-bold text-gray-900 dark:text-white">{selectedSelfieModal.type || 'Presensi'} ({selectedSelfieModal.status})</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Tanggal & Jam:</span>
                      <span className="font-mono text-gray-900 dark:text-white">
                        {selectedSelfieModal.date} {selectedSelfieModal.timestamp ? format(selectedSelfieModal.timestamp.toDate(), 'HH:mm:ss') : ''}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Jarak dari Sekolah:</span>
                      <span className="font-mono text-gray-900 dark:text-white">
                        {selectedSelfieModal.distanceFromSchool !== undefined ? `${Math.round(selectedSelfieModal.distanceFromSchool)} meter` : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 dark:text-gray-400">Akurasi GPS Satelit:</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        {selectedSelfieModal.gpsAccuracy ? `±${selectedSelfieModal.gpsAccuracy}m` : 'Terverifikasi'}
                      </span>
                    </div>

                    {selectedSelfieModal.isAnomalyDetected && (
                      <div className="mt-2 p-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-[11px] flex items-start gap-1.5">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                        <span><strong>Peringatan Keamanan:</strong> {selectedSelfieModal.anomalyReason || 'Terdeteksi anomali GPS.'}</span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setSelectedSelfieModal(null)}
                    className="w-full py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 text-xs font-semibold transition-colors"
                  >
                    Tutup Detail
                  </button>
                </div>
              </div>
            )}

            {/* 6. SETTINGS TAB */}
            {activeTab === 'settings' && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6 max-w-2xl border border-gray-100 dark:border-gray-700/60">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center">
                  <MapPin className="w-5 h-5 mr-2 text-blue-600" />
                  {t.settingsTitle}
                </h2>
                
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{t.lat}</label>
                      <input 
                        type="number" 
                        step="any"
                        value={schoolLocation.lat}
                        onChange={(e) => setSchoolLocation({ ...schoolLocation, lat: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{t.lng}</label>
                      <input 
                        type="number" 
                        step="any"
                        value={schoolLocation.lng}
                        onChange={(e) => setSchoolLocation({ ...schoolLocation, lng: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none" 
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button 
                      type="button"
                      onClick={() => {
                        if ('geolocation' in navigator) {
                          const toastId = toast.loading('Sedang melacak lokasi Anda...', { style: { fontSize: '12px' } });
                          navigator.geolocation.getCurrentPosition(
                            (position) => {
                              setSchoolLocation({
                                lat: position.coords.latitude,
                                lng: position.coords.longitude
                              });
                              toast.success('Titik kordinat berhasil diperbarui secara otomatis!', { id: toastId, style: { fontSize: '12px' } });
                            },
                            (err) => {
                              console.error(err);
                              toast.error(`Gagal mendapatkan lokasi. Pastikan GPS Anda aktif dan beri izin browser. (${err.message})`, { id: toastId, style: { fontSize: '12px' } });
                            },
                            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
                          );
                        } else {
                          toast.error('Browser Anda tidak mendukung Geolocation.', { style: { fontSize: '12px' } });
                        }
                      }}
                      className="w-full sm:w-auto flex justify-center items-center px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 rounded-xl text-xs font-semibold transition-colors"
                    >
                      <MapPin className="w-4 h-4 mr-2" />
                      Dapatkan Titik Kordinat Saat Ini Otomatis
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{t.radius}</label>
                    <input 
                      type="number" 
                      value={schoolRadius}
                      onChange={(e) => setSchoolRadius(parseFloat(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none" 
                    />
                    <p className="mt-1 text-[11px] text-gray-400">{t.radiusDesc}</p>
                  </div>

                  <div className="pt-4 flex justify-end border-t border-gray-100 dark:border-gray-700">
                    <button 
                      onClick={handleSaveSettings}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-colors shadow"
                    >
                      {t.saveSettings}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* --- MOBILE BOTTOM NAVIGATION (Android) --- */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 z-50 flex justify-between items-center px-1 pb-safe pt-1 shadow-[0_-2px_10px_rgba(0,0,0,0.02)] overflow-x-auto no-scrollbar">
          <button onClick={() => setActiveTab('qr')} className={`flex flex-col items-center justify-center min-w-[64px] py-2 flex-1 ${activeTab === 'qr' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
            <div className={`p-1 rounded-xl mb-1 ${activeTab === 'qr' ? 'bg-blue-50 dark:bg-blue-900/40' : ''}`}><QrCodeIcon className="w-5 h-5" /></div>
            <span className="text-[9px] font-bold">QR</span>
          </button>
          
          <button onClick={() => setActiveTab('rekap')} className={`flex flex-col items-center justify-center min-w-[64px] py-2 flex-1 ${activeTab === 'rekap' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
            <div className={`p-1 rounded-xl mb-1 ${activeTab === 'rekap' ? 'bg-blue-50 dark:bg-blue-900/40' : ''}`}><Calendar className="w-5 h-5" /></div>
            <span className="text-[9px] font-bold leading-tight text-center">Rekap Guru</span>
          </button>

          <button onClick={() => setActiveTab('studentRecap')} className={`flex flex-col items-center justify-center min-w-[64px] py-2 flex-1 ${activeTab === 'studentRecap' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`}>
            <div className={`p-1 rounded-xl mb-1 ${activeTab === 'studentRecap' ? 'bg-emerald-50 dark:bg-emerald-900/40' : ''}`}><CheckSquare className="w-5 h-5" /></div>
            <span className="text-[9px] font-bold leading-tight text-center">Rekap Siswa</span>
          </button>

          <button onClick={() => setActiveTab('masterData')} className={`flex flex-col items-center justify-center min-w-[64px] py-2 flex-1 ${activeTab === 'masterData' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}>
            <div className={`p-1 rounded-xl mb-1 ${activeTab === 'masterData' ? 'bg-indigo-50 dark:bg-indigo-900/40' : ''}`}><BookOpen className="w-5 h-5" /></div>
            <span className="text-[9px] font-bold leading-tight text-center">Data Siswa</span>
          </button>

          <button onClick={() => setActiveTab('users')} className={`flex flex-col items-center justify-center min-w-[64px] py-2 flex-1 ${activeTab === 'users' ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'}`}>
            <div className={`p-1 rounded-xl mb-1 ${activeTab === 'users' ? 'bg-purple-50 dark:bg-purple-900/40' : ''}`}><Users className="w-5 h-5" /></div>
            <span className="text-[9px] font-bold">Akun</span>
          </button>

          <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center justify-center min-w-[64px] py-2 flex-1 ${activeTab === 'settings' ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
            <div className={`p-1 rounded-xl mb-1 ${activeTab === 'settings' ? 'bg-gray-100 dark:bg-gray-800' : ''}`}><Settings className="w-5 h-5" /></div>
            <span className="text-[9px] font-bold">Pengaturan</span>
          </button>
        </nav>

      </div>
    </div>
  );
}
