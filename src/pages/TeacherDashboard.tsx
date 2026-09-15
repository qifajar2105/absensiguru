import React, { useState } from 'react';
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
  Camera
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

  const { permission, requestPermission } = usePushReminder(false, false);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const currentPhoto = userData?.photoURL || auth.currentUser?.photoURL || '';
  const teacherInitial = (userData?.name || 'G')[0].toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50/60 dark:bg-gray-950 flex flex-col font-sans selection:bg-blue-100 dark:selection:bg-blue-900 transition-colors duration-300">
      {/* TOP HEADER */}
      <header className="bg-white/85 dark:bg-gray-900/85 backdrop-blur-md shadow-[0_2px_10px_rgb(0,0,0,0.02)] px-4 sm:px-8 py-3.5 flex justify-between items-center sticky top-0 z-40 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3.5">
          {/* FOTO PROFIL GURU DI KIRI ATAS */}
          <div 
            onClick={() => setIsPhotoModalOpen(true)}
            className="relative group cursor-pointer shrink-0"
            title="Klik untuk mengganti foto profil"
          >
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl overflow-hidden bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-base shadow-sm ring-2 ring-blue-500/20 group-hover:ring-blue-500/60 transition-all">
              {currentPhoto ? (
                <img 
                  src={currentPhoto} 
                  alt={userData?.name || 'Foto Profil'} 
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{teacherInitial}</span>
              )}
            </div>
            {/* Camera badge */}
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center shadow-md border-2 border-white dark:border-gray-900 transition-transform group-hover:scale-110">
              <Camera className="w-2.5 h-2.5" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white leading-tight">
                {userData?.name || t.appTitle}
              </h1>
              {userData?.schoolCode && (
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                  {userData.schoolCode}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">
              <span>{userData?.email}</span>
              <span>•</span>
              <button
                type="button"
                onClick={() => setIsPhotoModalOpen(true)}
                className="text-blue-600 dark:text-blue-400 hover:underline font-semibold text-[11px] inline-flex items-center gap-1"
              >
                <Camera className="w-3 h-3" />
                Ganti Foto
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 sm:space-x-2">
          {permission === 'granted' ? (
            <button 
              onClick={() => {
                if (navigator.serviceWorker) {
                  navigator.serviceWorker.ready.then(reg => {
                    reg.showNotification('Uji Coba Pengingat', { body: 'Ini adalah tes notifikasi absensi.', icon: '/pwa-192x192.png' });
                  }).catch(() => new Notification('Uji Coba Pengingat', { body: 'Ini adalah tes notifikasi absensi.' }));
                } else {
                  new Notification('Uji Coba Pengingat', { body: 'Ini adalah tes notifikasi absensi.' });
                }
              }} 
              className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-all" 
              title="Test Notifikasi Pengingat"
            >
              <Bell className="w-4 h-4" />
            </button>
          ) : (
            <button 
              onClick={requestPermission} 
              className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all" 
              title={language === 'id' ? 'Aktifkan Pengingat' : 'Enable Reminders'}
            >
              <BellOff className="w-4 h-4" />
            </button>
          )}

          <ThemeLanguageToggle />

          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1"></div>

          <button 
            id="btn-logout"
            onClick={handleLogout} 
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all" 
            title={t.logout}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* SECONDARY NAVIGATION BAR (4 TABS) */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-[61px] z-30 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 flex space-x-1 sm:space-x-4 overflow-x-auto no-scrollbar">
          <button
            id="tab-presensi-guru"
            onClick={() => setActiveTab('attendance')}
            className={`py-3 px-3 sm:px-4 text-xs font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-2 ${
              activeTab === 'attendance'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            <CalendarCheck className="w-4 h-4" />
            <span>{t.tabTeacherAttendance}</span>
          </button>

          <button
            id="tab-presensi-siswa"
            onClick={() => setActiveTab('studentAttendance')}
            className={`py-3 px-3 sm:px-4 text-xs font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-2 ${
              activeTab === 'studentAttendance'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>{t.tabStudentAttendance}</span>
          </button>

          <button
            id="tab-mapel-guru"
            onClick={() => setActiveTab('subjects')}
            className={`py-3 px-3 sm:px-4 text-xs font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-2 ${
              activeTab === 'subjects'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>{t.tabTeacherSubjects}</span>
          </button>

          <button
            id="tab-daftar-siswa"
            onClick={() => setActiveTab('students')}
            className={`py-3 px-3 sm:px-4 text-xs font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-2 ${
              activeTab === 'students'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>{t.tabTeacherStudents}</span>
          </button>
        </div>
      </div>

      {/* MAIN BODY CONTENT */}
      <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto">
        {activeTab === 'attendance' && <TeacherAttendanceView />}
        {activeTab === 'studentAttendance' && <TeacherStudentAttendanceView />}
        {activeTab === 'subjects' && <TeacherSubjectsView />}
        {activeTab === 'students' && <TeacherStudentsView />}
      </main>

      {/* MODAL GANTI FOTO PROFIL */}
      <ProfilePhotoModal 
        isOpen={isPhotoModalOpen} 
        onClose={() => setIsPhotoModalOpen(false)} 
      />
    </div>
  );
}
