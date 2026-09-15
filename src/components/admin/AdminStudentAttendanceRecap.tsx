import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { StudentAttendanceSession } from '../../types';
import { 
  Users, 
  BookOpen, 
  Calendar, 
  Download, 
  Filter, 
  Search, 
  Eye, 
  X, 
  FileSpreadsheet, 
  FileText,
  TrendingUp,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import toast from 'react-hot-toast';
import { translations } from '../../lib/translations';
import { normalizeSchoolCode } from '../../lib/utils';

export default function AdminStudentAttendanceRecap() {
  const { userData, language } = useStore();
  const t = translations[language];

  const [sessions, setSessions] = useState<StudentAttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterMonth, setFilterMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal
  const [selectedSession, setSelectedSession] = useState<StudentAttendanceSession | null>(null);

  useEffect(() => {
    const adminSchool = normalizeSchoolCode(userData?.schoolCode);
    if (!adminSchool) {
      setSessions([]);
      setLoading(false);
      return;
    }

    const possibleCodes = Array.from(new Set([
      adminSchool,
      adminSchool.toLowerCase(),
      adminSchool.toUpperCase()
    ]));

    // Query sessions strictly for this school
    const q = query(
      collection(db, 'student_attendance'),
      where('schoolCode', 'in', possibleCodes),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as StudentAttendanceSession))
        .filter(s => normalizeSchoolCode(s.schoolCode) === adminSchool);
      setSessions(list);
      setLoading(false);
    }, (err) => {
      console.warn("Error loading student attendance for admin (indexing/offline):", err);
      // Fallback query
      const fallbackQ = query(collection(db, 'student_attendance'));
      onSnapshot(fallbackQ, (fallbackSnap) => {
        const list = fallbackSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as StudentAttendanceSession))
          .filter(s => normalizeSchoolCode(s.schoolCode) === adminSchool);
        list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        setSessions(list);
        setLoading(false);
      });
    });

    return () => unsubscribe();
  }, [userData]);

  // Extract classes and subjects for filter dropdowns
  const uniqueClasses = Array.from(new Set(sessions.map(s => s.classGrade).filter(Boolean))).sort();
  const uniqueSubjects = Array.from(new Set(sessions.map(s => s.subjectName).filter(Boolean))).sort();

  // Apply filters
  const filteredSessions = sessions.filter(s => {
    const matchesMonth = filterMonth === 'all' || (s.date && s.date.startsWith(filterMonth));
    const matchesClass = filterClass === 'all' || s.classGrade === filterClass;
    const matchesSubject = filterSubject === 'all' || s.subjectName === filterSubject;
    const matchesSearch = !searchQuery || 
      s.subjectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.teacherName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.classGrade.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.topic && s.topic.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesMonth && matchesClass && matchesSubject && matchesSearch;
  });

  // Calculate KPIs
  const totalSessions = filteredSessions.length;
  let totalStudentsCounted = 0;
  let totalHadir = 0;
  let totalSakit = 0;
  let totalIzin = 0;
  let totalAlpa = 0;

  filteredSessions.forEach(s => {
    totalStudentsCounted += s.totalStudents || 0;
    totalHadir += s.hadir || 0;
    totalSakit += s.sakit || 0;
    totalIzin += s.izin || 0;
    totalAlpa += s.alpa || 0;
  });

  const avgAttendance = totalStudentsCounted > 0 
    ? Math.round((totalHadir / totalStudentsCounted) * 100) 
    : 0;

  // EXPORT TO PDF
  const exportPDF = () => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.text(`REKAPITULASI PRESENSI SISWA PER MATA PELAJARAN`, 14, 15);
      doc.setFontSize(10);
      doc.text(`Sekolah: ${userData?.schoolCode || 'Semua'} | Periode: ${filterMonth} | Total Sesi: ${totalSessions}`, 14, 22);

      const tableData = filteredSessions.map((s, idx) => [
        idx + 1,
        s.date,
        s.classGrade,
        s.subjectName,
        s.teacherName,
        s.hadir || 0,
        s.sakit || 0,
        s.izin || 0,
        s.alpa || 0,
        `${s.totalStudents > 0 ? Math.round((s.hadir / s.totalStudents) * 100) : 0}%`
      ]);

      autoTable(doc, {
        head: [['No', 'Tanggal', 'Kelas', 'Mata Pelajaran', 'Guru Pengampu', 'H', 'S', 'I', 'A', '% Hadir']],
        body: tableData,
        startY: 28,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 8 }
      });

      doc.save(`Rekap_Presensi_Siswa_${filterMonth}.pdf`);
      toast.success('PDF berhasil diunduh!');
    } catch (err: any) {
      toast.error(`Gagal ekspor PDF: ${err.message}`);
    }
  };

  // EXPORT TO CSV / EXCEL
  const exportCSV = () => {
    try {
      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "No,Tanggal,Kelas,Mata Pelajaran,Guru Pengampu,Topik/Materi,Hadir,Sakit,Izin,Alpa,Total Siswa,Persentase Hadir\n";

      filteredSessions.forEach((s, idx) => {
        const percent = s.totalStudents > 0 ? Math.round((s.hadir / s.totalStudents) * 100) : 0;
        csvContent += `${idx + 1},"${s.date}","${s.classGrade}","${s.subjectName}","${s.teacherName}","${s.topic || '-'} ",${s.hadir},${s.sakit},${s.izin},${s.alpa},${s.totalStudents},"${percent}%"\n`;
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Rekap_Presensi_Siswa_${filterMonth}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('File CSV/Excel berhasil diunduh!');
    } catch (err: any) {
      toast.error(`Gagal ekspor CSV: ${err.message}`);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* HEADER & EXPORT BUTTONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Rekap Presensi Siswa per Mata Pelajaran
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Laporan kehadiran siswa yang diinput secara langsung oleh guru mata pelajaran di kelas masing-masing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            disabled={filteredSessions.length === 0}
            className="inline-flex items-center px-3.5 py-2 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100 transition-colors gap-1.5 disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Ekspor Excel/CSV</span>
          </button>
          <button
            onClick={exportPDF}
            disabled={filteredSessions.length === 0}
            className="inline-flex items-center px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow transition-colors gap-1.5 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Unduh PDF</span>
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/60 shadow-sm">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Total Sesi Kelas</span>
          <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">{totalSessions}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Pertemuan pembelajaran</p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/60 shadow-sm">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Rata-rata Hadir</span>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{avgAttendance}%</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{totalHadir} hadir total</p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/60 shadow-sm">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Sakit & Izin</span>
          <p className="text-2xl font-black text-amber-500 mt-1">{totalSakit + totalIzin}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{totalSakit} Sakit, {totalIzin} Izin</p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/60 shadow-sm">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Tanpa Keterangan (Alpa)</span>
          <p className="text-2xl font-black text-rose-600 mt-1">{totalAlpa}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Ketidakhadiran alpa</p>
        </div>
      </div>

      {/* FILTER CONTROLS */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/60 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Month */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Bulan:</span>
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="text-xs py-1.5 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none"
            />
          </div>

          {/* Class */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Kelas:</span>
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="text-xs py-1.5 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none"
            >
              <option value="all">Semua Kelas</option>
              {uniqueClasses.map(c => (
                <option key={c} value={c}>Kelas {c}</option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Mapel:</span>
            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="text-xs py-1.5 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none"
            >
              <option value="all">Semua Mapel</option>
              {uniqueSubjects.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari guru, materi, mapel..."
            className="w-full text-xs pl-8 pr-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none"
          />
        </div>
      </div>

      {/* SESSIONS RECAP TABLE */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50/75 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4 w-12 text-center">No</th>
                <th className="py-3 px-4">Tanggal</th>
                <th className="py-3 px-4">Kelas</th>
                <th className="py-3 px-4">Mata Pelajaran</th>
                <th className="py-3 px-4">Guru Pengampu</th>
                <th className="py-3 px-4 text-center">Kehadiran (H / S / I / A)</th>
                <th className="py-3 px-4 text-center">% Kehadiran</th>
                <th className="py-3 px-4 text-right">Rincian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-400">{t.loading}</td>
                </tr>
              ) : filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    <p className="font-semibold text-gray-700 dark:text-gray-300">Belum ada data presensi siswa yang terekam.</p>
                    <p className="text-[11px] mt-0.5">Ketika guru mapel melakukan presensi di kelas, data akan langsung masuk ke sini.</p>
                  </td>
                </tr>
              ) : (
                filteredSessions.map((s, idx) => {
                  const pct = s.totalStudents > 0 ? Math.round((s.hadir / s.totalStudents) * 100) : 0;
                  return (
                    <tr key={s.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="py-3 px-4 text-center font-mono text-gray-400">{idx + 1}</td>
                      <td className="py-3 px-4 font-mono font-medium text-gray-900 dark:text-white">
                        {s.date}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                          {s.classGrade}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">
                        {s.subjectName}
                        {s.topic && <p className="text-[10px] text-gray-400 font-normal italic">{s.topic}</p>}
                      </td>
                      <td className="py-3 px-4 text-gray-700 dark:text-gray-300">
                        {s.teacherName}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1 font-mono text-[11px]">
                          <span className="text-emerald-600 font-bold">{s.hadir}H</span>
                          <span className="text-gray-300 dark:text-gray-600">/</span>
                          <span className="text-amber-600 font-bold">{s.sakit}S</span>
                          <span className="text-gray-300 dark:text-gray-600">/</span>
                          <span className="text-blue-600 font-bold">{s.izin}I</span>
                          <span className="text-gray-300 dark:text-gray-600">/</span>
                          <span className="text-rose-600 font-bold">{s.alpa}A</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block font-bold text-xs ${pct >= 85 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                          {pct}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedSession(s)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title="Lihat Daftar Siswa"
                        >
                          <Eye className="w-4 h-4" />
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

      {/* SESSION DETAIL MODAL */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-800 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Rincian Presensi Kelas {selectedSession.classGrade}
                </h3>
                <p className="text-xs text-gray-400">
                  {selectedSession.subjectName} • Guru: {selectedSession.teacherName} • Tanggal: {selectedSession.date}
                </p>
              </div>
              <button
                onClick={() => setSelectedSession(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">
                <span className="block text-[10px] text-gray-500">Hadir</span>
                <span className="text-base font-black">{selectedSession.hadir}</span>
              </div>
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400">
                <span className="block text-[10px] text-gray-500">Sakit</span>
                <span className="text-base font-black">{selectedSession.sakit}</span>
              </div>
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400">
                <span className="block text-[10px] text-gray-500">Izin</span>
                <span className="text-base font-black">{selectedSession.izin}</span>
              </div>
              <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400">
                <span className="block text-[10px] text-gray-500">Alpa</span>
                <span className="text-base font-black">{selectedSession.alpa}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 text-xs pr-1">
              {selectedSession.records?.map((rec, i) => (
                <div key={i} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-white">{rec.studentName}</span>
                    <span className="text-[11px] text-gray-400 font-mono ml-2">NIS: {rec.nis}</span>
                    {rec.note && <p className="text-[11px] text-gray-500 italic mt-0.5">Catatan: {rec.note}</p>}
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                    rec.status === 'Hadir' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' :
                    rec.status === 'Sakit' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' :
                    rec.status === 'Izin' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' :
                    'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300'
                  }`}>
                    {rec.status}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-end">
              <button
                onClick={() => setSelectedSession(null)}
                className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-semibold hover:bg-gray-200"
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
