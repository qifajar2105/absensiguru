import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { db, auth } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, setDoc, getDoc, deleteDoc, where, getDocs } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { LogOut, Download, MapPin, QrCode as QrCodeIcon, Settings, Calendar, Users, ShieldCheck, Printer, Building2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { generateDailyQRData, getStaticQRPayload, STATIC_QR_PAYLOAD } from '../lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { ThemeLanguageToggle } from '../components/ThemeLanguageToggle';
import { translations } from '../lib/translations';
import { isMasterSuperAdmin } from '../lib/superAdminAuth';
import toast from 'react-hot-toast';

export default function AdminDashboard() {
  const { userData, language, setUserData } = useStore();
  const t = translations[language] || translations.id;
  const navigate = useNavigate();

  const [attendances, setAttendances] = useState<any[]>([]);
  const [qrValue, setQrValue] = useState<string>('');
  const [qrMode, setQrMode] = useState<'dynamic' | 'static'>('dynamic');
  const [activeTab, setActiveTab] = useState<'qr' | 'rekap' | 'users' | 'settings'>('qr');
  const [schoolLocation, setSchoolLocation] = useState({ lat: -6.200000, lng: 106.816666 });
  const [schoolRadius, setSchoolRadius] = useState(100);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [schoolLicense, setSchoolLicense] = useState<any>(null);

  const schoolCode = userData?.schoolCode ? userData.schoolCode.trim().toUpperCase() : '';

  const isSuperAdmin = 
    userData?.role === 'superadmin' || 
    isMasterSuperAdmin(userData?.email);

  useEffect(() => {
    // Generate new QR every 10 seconds for dynamic protection
    if (activeTab === 'qr' && qrMode === 'dynamic') {
      const generateQr = () => setQrValue(generateDailyQRData(schoolCode));
      generateQr();
      const interval = setInterval(generateQr, 10000);
      return () => clearInterval(interval);
    } else if (activeTab === 'qr' && qrMode === 'static') {
      setQrValue(getStaticQRPayload(schoolCode));
    }
  }, [activeTab, qrMode, schoolCode]);

  useEffect(() => {
    // Fetch School License Details
    if (schoolCode) {
      const fetchLicense = async () => {
        try {
          const q = query(collection(db, 'licenses'), where('code', '==', schoolCode));
          const snap = await getDocs(q);
          if (!snap.empty) {
            setSchoolLicense(snap.docs[0].data());
          }
        } catch (err) {
          console.error("Error fetching school license:", err);
        }
      };
      fetchLicense();
    }

    // Fetch School Settings
    const fetchSettings = async () => {
      try {
        const settingsDocId = schoolCode || 'main';
        let docRef = doc(db, 'school_settings', settingsDocId);
        let docSnap = await getDoc(docRef);
        if (!docSnap.exists() && settingsDocId !== 'main') {
          docRef = doc(db, 'school_settings', 'main');
          docSnap = await getDoc(docRef);
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

    // Listen to Attendance (Filter by schoolCode if present)
    const q = query(collection(db, 'attendance'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const filtered = schoolCode ? data.filter((a: any) => !a.schoolCode || a.schoolCode === schoolCode) : data;
      setAttendances(filtered);
    });

    // Listen to Users (Filter by schoolCode if present)
    const qUsers = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const filtered = schoolCode ? data.filter((u: any) => u.schoolCode === schoolCode) : data;
      setUsersList(filtered);
    });

    return () => {
      unsubscribe();
      unsubscribeUsers();
    };
  }, [schoolCode]);

  const handleLogout = async () => {
    await signOut(auth);
    setUserData(null);
    navigate('/login');
  };

  const handleSaveSettings = async () => {
    try {
      const settingsDocId = schoolCode || 'main';
      await setDoc(doc(db, 'school_settings', settingsDocId), {
        location: schoolLocation,
        radius: schoolRadius,
        schoolCode: settingsDocId,
        updatedAt: new Date().toISOString()
      });
      toast.success(t.settingsSaved);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDeleteUser = async (targetUser: any) => {
    if (targetUser.uid === userData?.uid) {
      toast.error(language === 'id' ? 'Anda tidak dapat menghapus akun Anda sendiri.' : 'You cannot delete your own account.');
      return;
    }
    if (targetUser.role === 'superadmin' || (!isSuperAdmin && targetUser.role === 'admin')) {
      toast.error(language === 'id' ? 'Tidak dapat menghapus akun admin sekolah atau Super Admin.' : 'Cannot delete school admin or Super Admin account.');
      return;
    }
    if (window.confirm(`${t.confirmDelete}\n\n${targetUser.name} (${targetUser.email})`)) {
      try {
        await deleteDoc(doc(db, 'users', targetUser.id));
        toast.success(t.userDeleted);
      } catch (error) {
        console.error("Gagal menghapus pengguna:", error);
        toast.error(t.userDeleteFailed);
      }
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const schoolDisplayName = schoolLicense?.name || userData?.schoolName || schoolCode || 'Sekolah';
    doc.setFontSize(14);
    doc.text(t.monthlyRecapTitle, 14, 15);
    doc.setFontSize(10);
    doc.text(`${schoolDisplayName} (Kode: ${schoolCode || '-'})`, 14, 22);
    
    autoTable(doc, {
      head: [[t.teacherName, t.date, t.time, t.status, t.distance]],
      body: attendances.map(a => [
        a.teacherName,
        a.date,
        a.timestamp ? format(a.timestamp.toDate(), 'HH:mm:ss') : '-',
        a.status === 'Hadir' ? t.statusPresent : a.status,
        a.distanceFromSchool !== undefined ? `${Math.round(a.distanceFromSchool)}m` : '-'
      ]),
      startY: 28
    });

    doc.save(`Rekap_Absensi_${schoolCode || 'Sekolah'}_${format(new Date(), 'MMM_yyyy')}.pdf`);
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(attendances.map(a => ({
      [t.teacherName]: a.teacherName,
      [t.date]: a.date,
      [t.time]: a.timestamp ? format(a.timestamp.toDate(), 'HH:mm:ss') : '-',
      [t.status]: a.status === 'Hadir' ? t.statusPresent : a.status,
      [t.distance]: a.distanceFromSchool !== undefined ? Math.round(a.distanceFromSchool) : '-'
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Absensi");
    XLSX.writeFile(wb, `Rekap_Absensi_${schoolCode || 'Sekolah'}_${format(new Date(), 'MMM_yyyy')}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex transition-colors duration-300">
      {/* Sidebar (Desktop) */}
      <aside className="w-64 bg-white dark:bg-gray-900 shadow-md flex flex-col justify-between hidden md:flex border-r border-gray-200 dark:border-gray-800">
        <div>
          <div className="p-6 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h1 className="text-lg font-bold text-blue-600 dark:text-blue-400 leading-tight">
                  {t.adminTitle}
                </h1>
                <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold rounded-md bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                  🛡️ Panel Admin Sekolah
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {t.hello}, <span className="font-semibold">{userData?.name}</span>
            </p>
            {userData?.schoolCode && (
              <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-mono font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md">
                Kode: {userData.schoolCode}
              </span>
            )}
          </div>

          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tampilan</span>
            <ThemeLanguageToggle />
          </div>

          <nav className="mt-4 px-4 space-y-1.5">
            <button
              onClick={() => setActiveTab('qr')}
              className={`w-full flex items-center px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                activeTab === 'qr'
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <QrCodeIcon className="w-4 h-4 mr-3" />
              {t.tabQR}
            </button>
            <button
              onClick={() => setActiveTab('rekap')}
              className={`w-full flex items-center px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                activeTab === 'rekap'
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Calendar className="w-4 h-4 mr-3" />
              {t.tabRekap}
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                activeTab === 'users'
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Users className="w-4 h-4 mr-3" />
              {t.tabUsers}
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                activeTab === 'settings'
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Settings className="w-4 h-4 mr-3" />
              {t.tabSettings}
            </button>

            {isSuperAdmin && (
              <div className="pt-3 mt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => navigate('/superadmin')}
                  className="w-full flex items-center px-4 py-2.5 rounded-xl text-sm font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
                >
                  <ShieldCheck className="w-4 h-4 mr-3 text-purple-600 dark:text-purple-400" />
                  {t.tabSuperAdmin}
                </button>
              </div>
            )}
          </nav>
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-4 py-2.5 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4 mr-3" />
            {t.logout}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header with Language & Theme Toggle */}
        <header className="md:hidden bg-white dark:bg-gray-900 shadow-xs px-4 py-3 flex justify-between items-center border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30">
          <div>
            <h1 className="text-base font-bold text-blue-600 dark:text-blue-400 truncate max-w-[180px]">
              {t.adminTitle}
            </h1>
            <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400">
              Panel Admin Sekolah
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <ThemeLanguageToggle />
            <button
              onClick={handleLogout}
              className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl"
              title={t.logout}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>
        
        {/* Mobile Navigation Bar */}
        <div className="md:hidden bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex overflow-x-auto px-2 py-1 gap-1">
          <button
            onClick={() => setActiveTab('qr')}
            className={`px-3 py-2 text-xs font-semibold whitespace-nowrap rounded-lg ${
              activeTab === 'qr' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            {t.tabQR}
          </button>
          <button
            onClick={() => setActiveTab('rekap')}
            className={`px-3 py-2 text-xs font-semibold whitespace-nowrap rounded-lg ${
              activeTab === 'rekap' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            {t.tabRekap}
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-3 py-2 text-xs font-semibold whitespace-nowrap rounded-lg ${
              activeTab === 'users' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            {t.tabUsers}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-2 text-xs font-semibold whitespace-nowrap rounded-lg ${
              activeTab === 'settings' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            {t.tabSettings}
          </button>
          {isSuperAdmin && (
            <button
              onClick={() => navigate('/superadmin')}
              className="px-3 py-2 text-xs font-bold whitespace-nowrap rounded-lg bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300"
            >
              {t.tabSuperAdmin}
            </button>
          )}
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-5xl mx-auto space-y-6">

            {/* School License & Identity Banner */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xs border border-gray-200/80 dark:border-gray-800 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xl shrink-0">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-gray-900 dark:text-white">
                      {schoolLicense?.name || userData?.schoolName || schoolCode || 'Sekolah'}
                    </h2>
                    {schoolCode && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                        {schoolCode}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                      {t.active}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {schoolLicense?.city ? `${schoolLicense.city} • ` : ''}
                    {language === 'id' ? 'Admin Pengelola Presensi Sekolah' : 'School Attendance Administrator'}
                    {schoolLicense?.validUntil && (
                      <span> • {t.validUntil}: {format(new Date(schoolLicense.validUntil), 'dd MMM yyyy')}</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <div className="bg-gray-50 dark:bg-gray-800/60 px-3.5 py-2 rounded-xl border border-gray-100 dark:border-gray-800">
                  <span className="text-gray-500 dark:text-gray-400 block text-[10px]">{t.quota}</span>
                  <span className="font-bold text-gray-900 dark:text-white">
                    {usersList.filter(u => u.role === 'teacher').length} / {schoolLicense?.maxTeachers ? `${schoolLicense.maxTeachers} Guru` : (t.maxTeachersUnlimited || 'Unlimited')}
                  </span>
                </div>
              </div>
            </div>
            
            {/* USERS TAB */}
            {activeTab === 'users' && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xs border border-gray-200/80 dark:border-gray-800 p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t.usersList}</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {language === 'id' ? 'Daftar staf dan guru terdaftar di sekolah ini' : 'Staff and teachers enrolled under this school'}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                    {usersList.length} {language === 'id' ? 'pengguna' : 'users'}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                    <thead className="bg-gray-50/70 dark:bg-gray-800/40 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                      <tr>
                        <th className="px-6 py-3 text-left">{t.name}</th>
                        <th className="px-6 py-3 text-left">{t.email}</th>
                        <th className="px-6 py-3 text-left">{t.role}</th>
                        <th className="px-6 py-3 text-left">{t.registeredSince}</th>
                        <th className="px-6 py-3 text-right">{t.action}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                      {usersList.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center text-gray-400 dark:text-gray-500">
                            {t.noUsers}
                          </td>
                        </tr>
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

                          const isProtected = u.role === 'superadmin' || (!isSuperAdmin && u.role === 'admin') || u.uid === userData?.uid;

                          return (
                            <tr key={u.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors">
                              <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white">
                                {u.name || '-'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400">
                                {u.email || '-'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                                  u.role === 'admin' 
                                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' 
                                    : u.role === 'superadmin'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                                }`}>
                                  {u.role === 'admin' ? (language === 'id' ? 'Admin Sekolah' : 'School Admin') : u.role === 'superadmin' ? 'Super Admin' : (language === 'id' ? 'Guru' : 'Teacher')}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-xs">
                                {dateStr}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                {isProtected ? (
                                  <span className="text-[11px] text-gray-400 dark:text-gray-500 italic">
                                    {u.role === 'superadmin' ? 'Super Admin' : u.uid === userData?.uid ? (language === 'id' ? 'Akun Anda' : 'Your Account') : 'Admin'}
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleDeleteUser(u)}
                                    className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
                                  >
                                    {t.delete}
                                  </button>
                                )}
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

            {/* QR TAB */}
            {activeTab === 'qr' && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xs border border-gray-200/80 dark:border-gray-800 p-8 flex flex-col items-center justify-center text-center">
                <div className="flex space-x-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-6">
                  <button 
                    onClick={() => setQrMode('dynamic')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                      qrMode === 'dynamic' 
                        ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-xs' 
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {t.qrDynamic}
                  </button>
                  <button 
                    onClick={() => setQrMode('static')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                      qrMode === 'static' 
                        ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-xs' 
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {t.qrStatic}
                  </button>
                </div>

                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t.qrTitle}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 max-w-md">
                  {qrMode === 'dynamic' ? t.qrDynamicDesc : t.qrStaticDesc}
                </p>
                
                <div className="p-5 bg-white border-4 border-blue-100 dark:border-blue-900/50 rounded-3xl mb-6 shadow-sm" id="printable-qr">
                  {qrValue ? (
                    <QRCodeSVG value={qrValue} size={240} level="H" includeMargin={false} />
                  ) : (
                    <div className="w-[240px] h-[240px] bg-gray-100 dark:bg-gray-800 animate-pulse rounded-2xl flex items-center justify-center text-gray-400">
                      {t.loading}
                    </div>
                  )}
                  {qrMode === 'static' && (
                    <div className="mt-4 text-xs font-bold text-gray-800 uppercase tracking-widest hidden print:block">
                      {t.qrPrintTitle}
                    </div>
                  )}
                </div>
                
                {qrMode === 'dynamic' ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                    {t.qrDynamicNotice}
                  </p>
                ) : (
                  <button 
                    onClick={() => {
                      const printContent = document.getElementById('printable-qr')?.innerHTML;
                      const originalContent = document.body.innerHTML;
                      if (printContent) {
                        const schoolDisplayName = schoolLicense?.name || userData?.schoolName || schoolCode || 'Sekolah';
                        document.body.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;text-align:center;"><h2>${t.qrPrintTitle}</h2><h3 style="margin-top:4px;color:#2563eb;">${schoolDisplayName}</h3><p style="color:#64748b;margin-bottom:20px;">${t.qrPrintSubtitle} (Kode: ${schoolCode || '-'})</p>${printContent}</div>`;
                        window.print();
                        document.body.innerHTML = originalContent;
                        window.location.reload();
                      }
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-white transition-colors shadow-xs"
                  >
                    <Printer className="w-4 h-4" />
                    {t.printQR}
                  </button>
                )}
              </div>
            )}

            {/* REKAP TAB */}
            {activeTab === 'rekap' && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xs border border-gray-200/80 dark:border-gray-800 p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t.monthlyRecapTitle}</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {attendances.length} {language === 'id' ? 'presensi tercatat' : 'records logged'}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <button 
                      onClick={exportExcel} 
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {t.exportExcel}
                    </button>
                    <button 
                      onClick={exportPDF} 
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-xs font-semibold rounded-xl hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {t.exportPDF}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                    <thead className="bg-gray-50/70 dark:bg-gray-800/40 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                      <tr>
                        <th className="px-6 py-3 text-left">{t.teacherName}</th>
                        <th className="px-6 py-3 text-left">{t.date}</th>
                        <th className="px-6 py-3 text-left">{t.time}</th>
                        <th className="px-6 py-3 text-left">{t.distance}</th>
                        <th className="px-6 py-3 text-left">{t.status}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                      {attendances.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center text-gray-400 dark:text-gray-500">
                            {t.noAttendance}
                          </td>
                        </tr>
                      ) : (
                        attendances.map((a) => (
                          <tr key={a.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white">
                              {a.teacherName}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-xs">
                              {a.date}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-xs">
                              {a.timestamp ? format(a.timestamp.toDate(), 'HH:mm:ss') : '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-xs">
                              {a.distanceFromSchool !== undefined ? `${Math.round(a.distanceFromSchool)}m` : '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                                a.status === 'Hadir' 
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' 
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                              }`}>
                                {a.status === 'Hadir' ? t.statusPresent : a.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SETTINGS TAB */}
            {activeTab === 'settings' && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xs border border-gray-200/80 dark:border-gray-800 p-6 max-w-2xl">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center">
                  <MapPin className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
                  {t.settingsTitle}
                </h2>
                
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        {t.lat}
                      </label>
                      <input 
                        type="number" 
                        step="any"
                        value={schoolLocation.lat}
                        onChange={(e) => setSchoolLocation({ ...schoolLocation, lat: parseFloat(e.target.value) })}
                        className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-mono dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        {t.lng}
                      </label>
                      <input 
                        type="number" 
                        step="any"
                        value={schoolLocation.lng}
                        onChange={(e) => setSchoolLocation({ ...schoolLocation, lng: parseFloat(e.target.value) })}
                        className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-mono dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500" 
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
                              toast.success(t.locVerified);
                            },
                            () => toast.error(t.geoFailed),
                            { enableHighAccuracy: true }
                          );
                        } else {
                          toast.error(t.geoNotSupported);
                        }
                      }}
                      className="inline-flex items-center text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700"
                    >
                      <MapPin className="w-3.5 h-3.5 mr-1" />
                      {t.getLocationAuto}
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      {t.radius}
                    </label>
                    <input 
                      type="number" 
                      value={schoolRadius}
                      onChange={(e) => setSchoolRadius(parseFloat(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-mono dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500" 
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                      {t.radiusDesc}
                    </p>
                  </div>

                  <div className="pt-4 flex justify-end border-t border-gray-100 dark:border-gray-800">
                    <button 
                      onClick={handleSaveSettings}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm shadow-xs transition-colors"
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
