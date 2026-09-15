import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { 
  LogOut, 
  Scan, 
  Bell, 
  BellOff, 
  BookOpen, 
  Users, 
  CheckSquare, 
  CalendarCheck,
  Camera,
  Wifi,
  WifiOff
} from 'lucide-react';
import { ThemeLanguageToggle } from '../components/ThemeLanguageToggle';
import { translations } from '../lib/translations';
import { usePushReminder } from '../hooks/usePushReminder';

// Subcomponents
import TeacherAttendanceView from '../components/teacher/TeacherAttendanceView';
import TeacherSubjectsView from '../components/teacher/TeacherSubjectsView';
import TeacherStudentsView from '../components/teacher/TeacherStudentsView';
import TeacherStudentAttendanceView from '../components/teacher/TeacherStudentAttendanceView';
import ProfilePhotoModal from '../components/teacher/ProfilePhotoModal';

export default function TeacherDashboard() {
  const { userData, language } = useStore();
  const t = translations[language];
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'attendance' | 'studentAttendance' | 'subjects' | 'students'>('attendance');
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const { permission, requestPermission } = usePushReminder(false, false);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const currentPhoto = userData?.photoURL || auth.currentUser?.photoURL || '';
  const teacherInitial = (userData?.name || 'G')[0].toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50/60 dark:bg-gray-950 flex font-sans selection:bg-blue-100 dark:selection:bg-blue-900 transition-colors duration-300">
      
      {/* --- DESKTOP SIDEBAR (Web) --- */}
      <div className="hidden md:flex flex-col w-64 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 fixed top-0 bottom-0 z-50 shadow-md">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div 
              onClick={() => setIsPhotoModalOpen(true)}
              className="relative group cursor-pointer shrink-0"
              title="Klik untuk mengganti foto profil"
            >
              <div className="w-12 h-12 rounded-2xl overflow-hidden bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-base shadow-sm ring-2 ring-blue-500/20 group-hover:ring-blue-500/60 transition-all">
                {currentPhoto ? (
                  <img src={currentPhoto} alt="Profil" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                ) : (
                  <span>{teacherInitial}</span>
                )}
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center shadow-md border-2 border-white dark:border-gray-900 transition-transform group-hover:scale-110">
                <Camera className="w-2.5 h-2.5" />
              </div>
            </div>
            <div className="overflow-hidden">
              <h1 className="text-sm font-bold text-gray-900 dark:text-white truncate" title={userData?.name || t.appTitle}>
                {userData?.name || t.appTitle}
              </h1>
              {userData?.schoolCode && (
                <span className="inline-block px-2 py-0.5 mt-1 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                  {userData.schoolCode}
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <button
            onClick={() => setActiveTab('attendance')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'attendance'
                ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800/50'
            }`}
          >
            <CalendarCheck className="w-5 h-5" />
            {t.tabTeacherAttendance}
          </button>
          
          <button
            onClick={() => setActiveTab('studentAttendance')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'studentAttendance'
                ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800/50'
            }`}
          >
            <CheckSquare className="w-5 h-5" />
            {t.tabStudentAttendance}
          </button>

          <button
            onClick={() => setActiveTab('subjects')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'subjects'
                ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800/50'
            }`}
          >
            <BookOpen className="w-5 h-5" />
            {t.tabTeacherSubjects}
          </button>

          <button
            onClick={() => setActiveTab('students')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'students'
                ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800/50'
            }`}
          >
            <Users className="w-5 h-5" />
            {t.tabTeacherStudents}
          </button>
        </div>
        
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
          <div className="flex items-center justify-between px-2 mb-2">
            <ThemeLanguageToggle />
            {permission === 'granted' ? (
              <button 
                onClick={() => {
                  if (Notification.permission === 'granted') {
                    new Notification('Pengingat Absensi (Test)', { body: 'Ini adalah contoh pengingat absensi' });
                  }
                }} 
                className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-all" 
                title="Test Notifikasi"
              >
                <Bell className="w-4 h-4" />
              </button>
            ) : (
              <button 
                onClick={requestPermission} 
                className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all" 
              >
                <BellOff className="w-4 h-4" />
              </button>
            )}
          </div>
          <button 
            onClick={handleLogout} 
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 rounded-xl text-sm font-semibold transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {t.logout}
          </button>
        </div>
      </div>
      
      {/* --- MAIN WRAPPER (Shifted on Desktop, Full on Mobile) --- */}
      <div className="flex-1 md:ml-64 flex flex-col h-screen overflow-hidden">
        
        {/* MOBILE TOP HEADER (Hidden on Desktop) */}
        <header className="md:hidden bg-white/85 dark:bg-gray-900/85 backdrop-blur-md shadow-[0_2px_10px_rgb(0,0,0,0.02)] px-4 py-3.5 flex justify-between items-center z-40 border-b border-gray-100 dark:border-gray-800 shrink-0 sticky top-0">
          <div className="flex items-center gap-3">
            <div 
              onClick={() => setIsPhotoModalOpen(true)}
              className="relative group cursor-pointer shrink-0"
            >
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm ring-2 ring-blue-500/20">
                {currentPhoto ? (
                  <img src={currentPhoto} alt="Profil" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                ) : (
                  <span>{teacherInitial}</span>
                )}
              </div>
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
                {userData?.name || t.appTitle}
              </h1>
              {userData?.schoolCode && (
                <span className="inline-block px-1.5 py-0.5 mt-0.5 rounded text-[9px] font-bold bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                  {userData.schoolCode}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeLanguageToggle />
            <button 
              onClick={handleLogout} 
              className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg" 
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* OFFLINE MODE ALERT BANNER */}
        {!isOnline && (
          <div className="bg-amber-500 text-white px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 shadow-xs shrink-0 z-30">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span className="truncate">Mode Offline Aktif</span>
          </div>
        )}

        {/* SCROLLABLE MAIN CONTENT */}
        <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-8">
          <div className="max-w-4xl mx-auto w-full">
            {activeTab === 'attendance' && <TeacherAttendanceView />}
            {activeTab === 'studentAttendance' && <TeacherStudentAttendanceView />}
            {activeTab === 'subjects' && <TeacherSubjectsView />}
            {activeTab === 'students' && <TeacherStudentsView />}
          </div>
        </main>

        {/* --- MOBILE BOTTOM NAVIGATION (Android) --- */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 z-50 flex justify-around items-center pb-safe pt-1 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
          <button
            onClick={() => setActiveTab('attendance')}
            className={`flex flex-col items-center justify-center w-full py-2 ${
              activeTab === 'attendance' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <div className={`p-1 rounded-xl mb-1 ${activeTab === 'attendance' ? 'bg-blue-50 dark:bg-blue-900/40' : ''}`}>
              <CalendarCheck className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold">Presensi</span>
          </button>
          
          <button
            onClick={() => setActiveTab('studentAttendance')}
            className={`flex flex-col items-center justify-center w-full py-2 ${
              activeTab === 'studentAttendance' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <div className={`p-1 rounded-xl mb-1 ${activeTab === 'studentAttendance' ? 'bg-blue-50 dark:bg-blue-900/40' : ''}`}>
              <CheckSquare className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold">Siswa</span>
          </button>

          <button
            onClick={() => setActiveTab('subjects')}
            className={`flex flex-col items-center justify-center w-full py-2 ${
              activeTab === 'subjects' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <div className={`p-1 rounded-xl mb-1 ${activeTab === 'subjects' ? 'bg-blue-50 dark:bg-blue-900/40' : ''}`}>
              <BookOpen className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold">Mapel</span>
          </button>

          <button
            onClick={() => setActiveTab('students')}
            className={`flex flex-col items-center justify-center w-full py-2 ${
              activeTab === 'students' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <div className={`p-1 rounded-xl mb-1 ${activeTab === 'students' ? 'bg-blue-50 dark:bg-blue-900/40' : ''}`}>
              <Users className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold">Daftar</span>
          </button>
        </nav>
      </div>

      <ProfilePhotoModal 
        isOpen={isPhotoModalOpen} 
        onClose={() => setIsPhotoModalOpen(false)} 
      />
    </div>
  );
}
