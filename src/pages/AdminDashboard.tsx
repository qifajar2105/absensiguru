import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { db, auth } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { LogOut, Download, MapPin, QrCode as QrCodeIcon, Settings, Calendar, Users } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { generateDailyQRData, STATIC_QR_PAYLOAD } from '../lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { ThemeLanguageToggle } from '../components/ThemeLanguageToggle';
import { translations } from '../lib/translations';

export default function AdminDashboard() {
  const { userData, language } = useStore();
  const t = translations[language];
  const navigate = useNavigate();
  const [attendances, setAttendances] = useState<any[]>([]);
  const [qrValue, setQrValue] = useState<string>('');
  const [qrMode, setQrMode] = useState<'dynamic' | 'static'>('dynamic');
  const [activeTab, setActiveTab] = useState<'qr' | 'rekap' | 'users' | 'settings'>('qr');
  const [schoolLocation, setSchoolLocation] = useState({ lat: -6.200000, lng: 106.816666 });
  const [schoolRadius, setSchoolRadius] = useState(100);
  const [usersList, setUsersList] = useState<any[]>([]);

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

    // Listen to Attendance
    const q = query(collection(db, 'attendance'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAttendances(data);
    });

    // Listen to Users
    const qUsers = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsersList(data);
    });

    return () => {
      unsubscribe();
      unsubscribeUsers();
    };
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const handleSaveSettings = async () => {
    await setDoc(doc(db, 'school_settings', 'main'), {
      location: schoolLocation,
      radius: schoolRadius
    });
    alert('Pengaturan sekolah berhasil disimpan.');
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (window.confirm(`${t.confirmDelete}\n\n${userName}`)) {
      try {
        await deleteDoc(doc(db, 'users', userId));
        alert('Pengguna berhasil dihapus.');
      } catch (error) {
        console.error("Gagal menghapus pengguna:", error);
        alert('Gagal menghapus pengguna. Pastikan Anda memiliki izin.');
      }
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text('Rekapitulasi Absensi Bulanan', 14, 15);
    
    autoTable(doc, {
      head: [['Nama Guru', 'Tanggal', 'Waktu', 'Status', 'Jarak (m)']],
      body: attendances.map(a => [
        a.teacherName,
        a.date,
        a.timestamp ? format(a.timestamp.toDate(), 'HH:mm:ss') : '-',
        a.status,
        a.distanceFromSchool !== undefined ? `${Math.round(a.distanceFromSchool)}m` : '-'
      ]),
      startY: 20
    });

    doc.save(`Rekap_Absensi_${format(new Date(), 'MMM_yyyy')}.pdf`);
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(attendances.map(a => ({
      'Nama Guru': a.teacherName,
      'Tanggal': a.date,
      'Waktu': a.timestamp ? format(a.timestamp.toDate(), 'HH:mm:ss') : '-',
      'Status': a.status,
      'Jarak dari Sekolah (m)': a.distanceFromSchool !== undefined ? Math.round(a.distanceFromSchool) : '-'
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Absensi");
    XLSX.writeFile(wb, `Rekap_Absensi_${format(new Date(), 'MMM_yyyy')}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex transition-colors duration-300">
      {/* Sidebar */}
      <div className="w-64 bg-white dark:bg-gray-800 shadow-md flex flex-col justify-between hidden md:flex border-r border-gray-100 dark:border-gray-700">
        <div>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400">{t.adminTitle}</h1>
              <ThemeLanguageToggle />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t.hello}, {userData?.name}</p>
          </div>
          <nav className="mt-4 px-4 space-y-2">
            <button
              onClick={() => setActiveTab('qr')}
              className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors ${activeTab === 'qr' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              <QrCodeIcon className="w-5 h-5 mr-3" />
              {t.tabQR}
            </button>
            <button
              onClick={() => setActiveTab('rekap')}
              className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors ${activeTab === 'rekap' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              <Calendar className="w-5 h-5 mr-3" />
              {t.tabRekap}
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors ${activeTab === 'users' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              <Users className="w-5 h-5 mr-3" />
              {t.tabUsers}
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              <Settings className="w-5 h-5 mr-3" />
              {t.tabSettings}
            </button>
          </nav>
        </div>
        <div className="p-4">
          <button onClick={handleLogout} className="w-full flex items-center px-4 py-3 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
            <LogOut className="w-5 h-5 mr-3" />
            {t.logout}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <div className="md:hidden bg-white shadow-sm px-4 py-3 flex justify-between items-center">
          <h1 className="text-xl font-bold text-blue-600">{t.adminTitle}</h1>
          <button onClick={handleLogout} className="p-2 text-gray-500 hover:bg-gray-100 rounded-md">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        
        {/* Mobile Navigation */}
        <div className="md:hidden bg-white border-b border-gray-200 flex overflow-x-auto">
          <button onClick={() => setActiveTab('qr')} className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${activeTab === 'qr' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>{t.tabQR}</button>
          <button onClick={() => setActiveTab('rekap')} className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${activeTab === 'rekap' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>{t.tabRekap}</button>
          <button onClick={() => setActiveTab('users')} className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${activeTab === 'users' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>{t.tabUsers}</button>
          <button onClick={() => setActiveTab('settings')} className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${activeTab === 'settings' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>{t.tabSettings}</button>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-4xl mx-auto">
            
            {activeTab === 'users' && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-800 mb-4 sm:mb-0">{t.usersList}</h2>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t.name}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t.email}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t.role}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t.registeredSince}</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t.action}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {usersList.length === 0 ? (
                        <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">{t.noUsers}</td></tr>
                      ) : (
                        usersList.map((u) => {
                          let dateStr = '-';
                          try {
                            if (u.createdAt) {
                              // Handle both Firestore Timestamp and string formats securely
                              const dateObj = typeof u.createdAt.toDate === 'function' 
                                ? u.createdAt.toDate() 
                                : new Date(u.createdAt);
                              dateStr = format(dateObj, 'dd MMM yyyy');
                            }
                          } catch (e) {
                            console.error('Format date error', e);
                          }

                          return (
                            <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{u.name || '-'}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{u.email || '-'}</td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${u.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                                  {u.role === 'admin' ? (language === 'id' ? 'Admin' : 'Admin') : (language === 'id' ? 'Guru' : 'Teacher')}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {dateStr}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <button
                                  onClick={() => handleDeleteUser(u.id, u.name)}
                                  className="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-md transition-colors"
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

            {activeTab === 'qr' && (
              <div className="bg-white rounded-xl shadow-sm p-8 flex flex-col items-center justify-center text-center">
                <div className="flex space-x-4 mb-6">
                  <button 
                    onClick={() => setQrMode('dynamic')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${qrMode === 'dynamic' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {t.qrDynamic}
                  </button>
                  <button 
                    onClick={() => setQrMode('static')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${qrMode === 'static' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {t.qrStatic}
                  </button>
                </div>

                <h2 className="text-2xl font-bold text-gray-800 mb-2">{t.qrTitle}</h2>
                <p className="text-gray-500 mb-8 max-w-md">
                  {qrMode === 'dynamic' ? t.qrDynamicDesc : t.qrStaticDesc}
                </p>
                
                <div className="p-4 bg-white border-4 border-blue-100 rounded-2xl mb-6" id="printable-qr">
                  {qrValue ? (
                    <QRCodeSVG value={qrValue} size={250} level="H" includeMargin={false} />
                  ) : (
                    <div className="w-[250px] h-[250px] bg-gray-100 animate-pulse rounded-lg flex items-center justify-center text-gray-400">{t.loading}</div>
                  )}
                  {qrMode === 'static' && (
                    <div className="mt-4 text-sm font-bold text-gray-800 uppercase hidden print:block">
                      ABSENSI SEKOLAH
                    </div>
                  )}
                </div>
                
                {qrMode === 'dynamic' ? (
                  <p className="text-sm text-gray-400 font-mono">Kode dinamis ini aman dari screenshot atau pemalsuan foto.</p>
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
                    className="px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors shadow-sm"
                  >
                    {t.printQR}
                  </button>
                )}
              </div>
            )}

            {activeTab === 'rekap' && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-800 mb-4 sm:mb-0">{t.tabRekap}</h2>
                  <div className="flex space-x-3">
                    <button onClick={exportExcel} className="flex items-center px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors">
                      <Download className="w-4 h-4 mr-2" />
                      Excel
                    </button>
                    <button onClick={exportPDF} className="flex items-center px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors">
                      <Download className="w-4 h-4 mr-2" />
                      PDF
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t.teacherName}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t.date}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t.time}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t.distance}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t.status}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {attendances.length === 0 ? (
                        <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">{t.noAttendance}</td></tr>
                      ) : (
                        attendances.map((a) => (
                          <tr key={a.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{a.teacherName}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{a.date}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{a.timestamp ? format(a.timestamp.toDate(), 'HH:mm:ss') : '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{a.distanceFromSchool !== undefined ? Math.round(a.distanceFromSchool) : '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${a.status === 'Hadir' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                {a.status}
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

            {activeTab === 'settings' && (
              <div className="bg-white rounded-xl shadow-sm p-6 max-w-2xl">
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
                  <MapPin className="w-5 h-5 mr-2 text-blue-600" />
                  {t.settingsTitle}
                </h2>
                
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">{t.lat}</label>
                      <input 
                        type="number" 
                        step="any"
                        value={schoolLocation.lat}
                        onChange={(e) => setSchoolLocation({ ...schoolLocation, lat: parseFloat(e.target.value) })}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">{t.lng}</label>
                      <input 
                        type="number" 
                        step="any"
                        value={schoolLocation.lng}
                        onChange={(e) => setSchoolLocation({ ...schoolLocation, lng: parseFloat(e.target.value) })}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
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
                            (error) => alert('Gagal mendapatkan lokasi. Pastikan GPS aktif.'),
                            { enableHighAccuracy: true }
                          );
                        } else {
                          alert('Browser Anda tidak mendukung Geolocation.');
                        }
                      }}
                      className="flex items-center text-sm text-blue-600 hover:text-blue-800 transition-colors font-medium"
                    >
                      <MapPin className="w-4 h-4 mr-1" />
                      {t.getLocationAuto}
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">{t.radius}</label>
                    <input 
                      type="number" 
                      value={schoolRadius}
                      onChange={(e) => setSchoolRadius(parseFloat(e.target.value))}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
                    />
                    <p className="mt-2 text-xs text-gray-500">{t.radiusDesc}</p>
                  </div>

                  <div className="pt-4 flex justify-end border-t border-gray-100">
                    <button 
                      onClick={handleSaveSettings}
                      className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
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
