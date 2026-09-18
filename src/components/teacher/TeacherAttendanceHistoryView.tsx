import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { format } from 'date-fns';
import { Calendar, ShieldAlert, Camera } from 'lucide-react';
import { translations } from '../../lib/translations';

import { normalizeSchoolCode } from '../../lib/utils';

export default function TeacherAttendanceHistoryView() {
  const { userData, language } = useStore();
  const t = translations[language];
  
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [attendances, setAttendances] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSelfie, setSelectedSelfie] = useState<string | null>(null);

  useEffect(() => {
    if (!userData?.uid || !userData?.schoolCode) return;
    
    setIsLoading(true);
    const teacherSchool = normalizeSchoolCode(userData.schoolCode);
    const possibleSchoolCodes = Array.from(new Set([
      teacherSchool,
      teacherSchool.toLowerCase(),
      teacherSchool.toUpperCase()
    ]));

    const q = query(
      collection(db, 'attendance'),
      where('schoolCode', 'in', possibleSchoolCodes)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((item: any) => normalizeSchoolCode(item.schoolCode) === teacherSchool);
      setAttendances(data);
      setIsLoading(false);
    }, (error) => {
      console.warn("Error fetching history with 'in', falling back:", error);
      const fallbackQ = query(collection(db, 'attendance'));
      onSnapshot(fallbackQ, (snap) => {
        const data = snap.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter((item: any) => normalizeSchoolCode(item.schoolCode) === teacherSchool);
        setAttendances(data);
        setIsLoading(false);
      });
    });

    return () => unsubscribe();
  }, [userData?.uid, userData?.schoolCode]);

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

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6 border border-gray-100 dark:border-gray-700/60">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-blue-600">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Rekap Absensi Guru</h2>
            <p className="text-xs text-gray-500 mt-0.5">Pantau riwayat kehadiran seluruh guru pada bulan ini.</p>
          </div>
        </div>
        
        <input 
          type="month" 
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl text-xs font-semibold focus:outline-none"
        />
      </div>

      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center text-gray-500">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
          <p className="text-sm font-medium">Memuat riwayat...</p>
        </div>
      ) : filteredAttendances.length === 0 ? (
        <div className="py-12 text-center text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3">
            <Calendar className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium">Belum ada riwayat absensi di bulan ini.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700/60">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                <th className="py-3 px-4 font-bold">Nama Guru</th>
                <th className="py-3 px-4 font-bold">{t.date}</th>
                <th className="py-3 px-4 font-bold">Waktu</th>
                <th className="py-3 px-4 font-bold">Status</th>
                <th className="py-3 px-4 font-bold">Tipe</th>
                <th className="py-3 px-4 font-bold text-center">Selfie</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filteredAttendances.map(a => {
                const dateObj = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.date);
                const isWarning = a.isAnomalyDetected || (a.distanceFromSchool && a.distanceFromSchool > 100);
                
                return (
                  <tr key={a.id} className={`border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors ${isWarning ? 'bg-amber-50/30 dark:bg-amber-900/10' : ''}`}>
                    <td className="py-3 px-4 whitespace-nowrap font-medium text-gray-900 dark:text-white">
                      {a.teacherName}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-gray-600 dark:text-gray-300">
                      {format(dateObj, 'dd MMM yyyy')}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-gray-600 dark:text-gray-300 font-mono text-xs">
                      {format(dateObj, 'HH:mm')}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        a.status === 'Hadir' ? 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800' : 'bg-red-50 text-red-700'
                      }`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                        {a.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {a.photoSelfie ? (
                        <button
                          onClick={() => setSelectedSelfie(a.photoSelfie!)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg inline-flex justify-center transition-colors"
                          title="Lihat Foto Selfie"
                        >
                          <Camera className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedSelfie && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedSelfie(null)}>
          <div className="bg-white dark:bg-gray-900 p-2 rounded-2xl max-w-sm w-full relative" onClick={e => e.stopPropagation()}>
            <img src={selectedSelfie} alt="Selfie" className="w-full h-auto rounded-xl" />
            <button 
              onClick={() => setSelectedSelfie(null)}
              className="absolute top-4 right-4 bg-black/50 text-white w-8 h-8 rounded-full flex items-center justify-center"
            >
              &times;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
