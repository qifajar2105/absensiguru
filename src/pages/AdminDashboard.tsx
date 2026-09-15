import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { db, auth } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, setDoc, getDoc, deleteDoc, where } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
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
  Shield 
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { generateDailyQRData, STATIC_QR_PAYLOAD } from '../lib/utils';
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

  // Derived state for filtered attendances
  const filteredAttendances = attendances.filter(a => a.date && a.date.startsWith(selectedMonth));

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
    // Fetch School Settings
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'school_settings', 'main');
        const docSnap = await getDoc(docRef);
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

    // Listen to Attendance for this school
    let q;
    if (userData?.schoolCode) {
      q = query(
        collection(db, 'attendance'),
        where('schoolCode', '==', userData.schoolCode),
        orderBy('timestamp', 'desc')
      );
    } else {
      q = query(collection(db, 'attendance'), orderBy('timestamp', 'desc'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAttendances(data);
    }, (err) => {
      console.warn("Attendance query error, falling back without index:", err);
      const fallbackQ = query(collection(db, 'attendance'));
      onSnapshot(fallbackQ, (snap) => {
        let data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (userData?.schoolCode) {
          data = data.filter((d: any) => d.schoolCode === userData.schoolCode);
        }
        setAttendances(data);
      });
    });

    // Listen to Users for this school
    let qUsers;
    if (userData?.schoolCode) {
      qUsers = query(
        collection(db, 'users'),
        where('schoolCode', '==', userData.schoolCode)
      );
    } else {
      qUsers = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    }

    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsersList(data);
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
    await setDoc(doc(db, 'school_settings', 'main'), {
      location: schoolLocation,
      radius: schoolRadius
    });
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
      head: [[t.teacherName, t.date, t.time, t.status, t.attType || 'Jenis', t.distance]],
      body: filteredAttendances.map(a => [
        a.teacherName,
        a.date,
        a.timestamp ? format(a.timestamp.toDate(), 'HH:mm:ss') : '-',
        a.status,
        a.type || '-',
        a.distanceFromSchool !== undefined ? `${Math.round(a.distanceFromSchool)}m` : '-'
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
      [t.distance]: a.distanceFromSchool !== undefined ? Math.round(a.distanceFromSchool) : '-'
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
        
        {/* Mobile Navigation */}
        <div className="md:hidden bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex overflow-x-auto no-scrollbar px-2 py-1 space-x-1">
          <button onClick={() => setActiveTab('qr')} className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap ${activeTab === 'qr' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'text-gray-500'}`}>{t.tabQR}</button>
          <button onClick={() => setActiveTab('rekap')} className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap ${activeTab === 'rekap' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'text-gray-500'}`}>Rekap Guru</button>
          <button onClick={() => setActiveTab('studentRecap')} className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap ${activeTab === 'studentRecap' ? 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' : 'text-gray-500'}`}>Presensi Siswa</button>
          <button onClick={() => setActiveTab('masterData')} className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap ${activeTab === 'masterData' ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400' : 'text-gray-500'}`}>Siswa & Mapel</button>
          <button onClick={() => setActiveTab('users')} className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap ${activeTab === 'users' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'text-gray-500'}`}>{t.tabUsers}</button>
          <button onClick={() => setActiveTab('settings')} className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap ${activeTab === 'settings' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'text-gray-500'}`}>{t.tabSettings}</button>
        </div>

        <main className="flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="max-w-5xl mx-auto">
            
            {/* 1. STUDENT RECAP TAB */}
            {activeTab === 'studentRecap' && (
              <AdminStudentAttendanceRecap />
            )}

            {/* 2. MASTER DATA (STUDENTS & SUBJECTS) TAB */}
            {activeTab === 'masterData' && (
              <AdminMasterDataView />
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
                        <th className="px-4 py-3 text-left">{t.date}</th>
                        <th className="px-4 py-3 text-left">{t.time}</th>
                        <th className="px-4 py-3 text-left">{t.distance}</th>
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
                              <td className="px-4 py-3 whitespace-nowrap font-semibold text-gray-900 dark:text-white">{a.teacherName}</td>
                              <td className="px-4 py-3 whitespace-nowrap font-mono text-gray-600 dark:text-gray-300">{a.date}</td>
                              <td className="px-4 py-3 whitespace-nowrap font-mono text-gray-500 dark:text-gray-400">{timeStr}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400 font-mono">
                                {a.distanceFromSchool !== undefined && a.distanceFromSchool > 0 ? `${Math.round(a.distanceFromSchool)}m` : '-'}
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

                  <div>
                    <button 
                      type="button"
                      onClick={() => {
                        if ('geolocation' in navigator) {
                          navigator.geolocation.getCurrentPosition(
                            (position) => {
                              setSchoolLocation({
                                lat: position.coords.latitude,
                                lng: position.coords.longitude
                              });
                            },
                            () => alert('Gagal mendapatkan lokasi. Pastikan GPS aktif.'),
                            { enableHighAccuracy: true }
                          );
                        } else {
                          alert('Browser Anda tidak mendukung Geolocation.');
                        }
                      }}
                      className="flex items-center text-xs text-blue-600 hover:text-blue-800 transition-colors font-semibold"
                    >
                      <MapPin className="w-4 h-4 mr-1" />
                      {t.getLocationAuto}
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
      </div>
    </div>
  );
}
