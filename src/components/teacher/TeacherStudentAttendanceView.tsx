import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { db } from '../../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  getDocs,
  orderBy 
} from 'firebase/firestore';
import { Subject, Student, StudentStatus, StudentAttendanceRecord, StudentAttendanceSession } from '../../types';
import { format } from 'date-fns';
import { normalizeSchoolCode } from '../../lib/utils';
import { offlineStorage } from '../../lib/offlineStorage';
import { 
  CheckSquare, 
  Users, 
  BookOpen, 
  Calendar, 
  CheckCircle, 
  Save, 
  History, 
  Clock, 
  FileText,
  AlertTriangle,
  ChevronRight,
  Eye,
  Check
} from 'lucide-react';
import toast from 'react-hot-toast';
import { translations } from '../../lib/translations';

export default function TeacherStudentAttendanceView() {
  const { userData, language } = useStore();
  const t = translations[language];

  // Subjects of this teacher
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [loadingSubjects, setLoadingSubjects] = useState(true);

  // Class students
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Attendance state
  const [attendanceDate, setAttendanceDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [topic, setTopic] = useState<string>('');
  const [records, setRecords] = useState<Record<string, { status: StudentStatus; note: string }>>({});
  const [existingSessionId, setExistingSessionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // History state
  const [historySessions, setHistorySessions] = useState<StudentAttendanceSession[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<StudentAttendanceSession | null>(null);

  // Load teacher's subjects
  useEffect(() => {
    if (!userData?.uid) return;

    const q = query(
      collection(db, 'subjects'),
      where('teacherId', '==', userData.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Subject));
      setSubjects(list);
      if (list.length > 0 && !selectedSubjectId) {
        setSelectedSubjectId(list[0].id);
      }
      setLoadingSubjects(false);
    });

    return () => unsubscribe();
  }, [userData]);

  // Load history sessions
  useEffect(() => {
    if (!userData?.uid) return;

    const q = query(
      collection(db, 'student_attendance'),
      where('teacherId', '==', userData.uid),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as StudentAttendanceSession));
      setHistorySessions(list);
    }, (err) => {
      console.warn("History student attendance indexing or offline:", err);
    });

    return () => unsubscribe();
  }, [userData]);

  // When subject changes, load students of that subject's class
  const selectedSubject = subjects.find(s => s.id === selectedSubjectId);

  useEffect(() => {
    if (!selectedSubject) {
      setStudents([]);
      return;
    }

    setLoadingStudents(true);
    const fetchStudentsAndExisting = async () => {
      try {
        // Query students in this school with matching classGrade
        const teacherSchool = normalizeSchoolCode(userData?.schoolCode);
        let qStudents;
        if (teacherSchool) {
          const possibleCodes = Array.from(new Set([
            teacherSchool,
            teacherSchool.toLowerCase(),
            teacherSchool.toUpperCase()
          ]));
          qStudents = query(
            collection(db, 'students'),
            where('schoolCode', 'in', possibleCodes),
            where('classGrade', '==', selectedSubject.classGrade)
          );
        } else {
          qStudents = query(
            collection(db, 'students'),
            where('classGrade', '==', selectedSubject.classGrade)
          );
        }

        const snap = await getDocs(qStudents);
        let list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Student));
        if (teacherSchool) {
          list = list.filter(s => normalizeSchoolCode(s.schoolCode) === teacherSchool);
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        setStudents(list);

        // Check if there is already an attendance session for this subject & date
        const qSession = query(
          collection(db, 'student_attendance'),
          where('subjectId', '==', selectedSubject.id),
          where('date', '==', attendanceDate)
        );
        const sessionSnap = await getDocs(qSession);

        if (!sessionSnap.empty) {
          const docData = sessionSnap.docs[0].data() as StudentAttendanceSession;
          setExistingSessionId(sessionSnap.docs[0].id);
          setTopic(docData.topic || '');
          // Map existing records
          const recMap: Record<string, { status: StudentStatus; note: string }> = {};
          if (docData.records) {
            docData.records.forEach(r => {
              recMap[r.studentId] = { status: r.status, note: r.note || '' };
            });
          }
          // Ensure any newly added students default to Hadir
          list.forEach(st => {
            if (!recMap[st.id]) {
              recMap[st.id] = { status: 'Hadir', note: '' };
            }
          });
          setRecords(recMap);
        } else {
          setExistingSessionId(null);
          setTopic('');
          // Default all to Hadir
          const defaultRec: Record<string, { status: StudentStatus; note: string }> = {};
          list.forEach(st => {
            defaultRec[st.id] = { status: 'Hadir', note: '' };
          });
          setRecords(defaultRec);
        }
      } catch (err) {
        console.error("Error loading students for attendance:", err);
        // Offline fallback from local cache
        const teacherSchool = normalizeSchoolCode(userData?.schoolCode);
        if (teacherSchool && selectedSubject) {
          const cachedStudents = offlineStorage.getStudents(teacherSchool);
          if (cachedStudents && cachedStudents.length > 0) {
            const classStudents = cachedStudents.filter(s => s.classGrade === selectedSubject.classGrade);
            classStudents.sort((a, b) => a.name.localeCompare(b.name));
            setStudents(classStudents);
            const defaultRec: Record<string, { status: StudentStatus; note: string }> = {};
            classStudents.forEach(st => {
              defaultRec[st.id] = { status: 'Hadir', note: '' };
            });
            setRecords(defaultRec);
          }
        }
      } finally {
        setLoadingStudents(false);
      }
    };

    fetchStudentsAndExisting();
  }, [selectedSubjectId, attendanceDate, selectedSubject, userData]);

  const handleSetStatus = (studentId: string, status: StudentStatus) => {
    setRecords(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status
      }
    }));
  };

  const handleSetNote = (studentId: string, note: string) => {
    setRecords(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        note
      }
    }));
  };

  const handleMarkAll = (status: StudentStatus) => {
    const updated: Record<string, { status: StudentStatus; note: string }> = {};
    students.forEach(st => {
      updated[st.id] = {
        status,
        note: records[st.id]?.note || ''
      };
    });
    setRecords(updated);
    toast.success(`Semua siswa ditandai "${status}"`);
  };

  // Calculate live statistics
  const total = students.length;
  let hadirCount = 0;
  let sakitCount = 0;
  let izinCount = 0;
  let alpaCount = 0;

  students.forEach(s => {
    const st = records[s.id]?.status || 'Hadir';
    if (st === 'Hadir') hadirCount++;
    else if (st === 'Sakit') sakitCount++;
    else if (st === 'Izin') izinCount++;
    else if (st === 'Alpa') alpaCount++;
  });

  const attendancePercent = total > 0 ? Math.round((hadirCount / total) * 100) : 0;

  const handleSaveAttendance = async () => {
    if (!selectedSubject) {
      toast.error('Pilih mata pelajaran terlebih dahulu!');
      return;
    }

    if (students.length === 0) {
      toast.error('Tidak ada siswa di kelas ini untuk dipresensi!');
      return;
    }

    setSaving(true);
    try {
      // Build records payload
      const recordsPayload: StudentAttendanceRecord[] = students.map(s => ({
        studentId: s.id,
        studentName: s.name,
        nis: s.nis || '-',
        status: records[s.id]?.status || 'Hadir',
        note: records[s.id]?.note || ''
      }));

      const teacherSchool = normalizeSchoolCode(userData?.schoolCode);
      const sessionData = {
        subjectId: selectedSubject.id,
        subjectName: selectedSubject.name,
        classGrade: selectedSubject.classGrade,
        date: attendanceDate,
        teacherId: userData?.uid,
        teacherName: userData?.name || 'Guru',
        schoolCode: teacherSchool || 'DEFAULT',
        topic: topic.trim(),
        records: recordsPayload,
        totalStudents: total,
        hadir: hadirCount,
        sakit: sakitCount,
        izin: izinCount,
        alpa: alpaCount,
        timestamp: serverTimestamp()
      };

      if (existingSessionId) {
        await updateDoc(doc(db, 'student_attendance', existingSessionId), sessionData);
        toast.success(t.studentAttendanceSaved);
      } else {
        const newDoc = await addDoc(collection(db, 'student_attendance'), sessionData);
        setExistingSessionId(newDoc.id);
        toast.success(t.studentAttendanceSaved);
      }
    } catch (err: any) {
      toast.error(`Gagal menyimpan: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-blue-600" />
            {t.tabStudentAttendance}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Lakukan absensi siswa saat mengampu kelas. Data otomatis masuk ke Admin Sekolah untuk direkapitulasi.
          </p>
        </div>
      </div>

      {/* TOP CONTROLS: Subject, Date, Topic */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/60 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-blue-600" />
              {t.selectSubjectFirst} *
            </label>
            {loadingSubjects ? (
              <div className="text-xs text-gray-400 p-2">{t.loading}</div>
            ) : subjects.length === 0 ? (
              <div className="text-xs text-amber-600 dark:text-amber-400 p-2 bg-amber-50 dark:bg-amber-950/20 rounded-xl">
                Belum ada mapel. Tambahkan di tab "Mata Pelajaran".
              </div>
            ) : (
              <select
                id="select-subject"
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name} (Kelas {sub.classGrade})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              {t.attendanceDate} *
            </label>
            <input
              type="date"
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
              className="w-full text-xs p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              {t.topicOrMeeting} (Opsional)
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Contoh: Pertemuan 3 - Bab Trigonometri"
              className="w-full text-xs p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* Existing Session Alert */}
        {existingSessionId && (
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 p-3 rounded-xl text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>
                Presensi untuk kelas ini pada tanggal <strong>{attendanceDate}</strong> sudah pernah disimpan. Mengubah data ini akan memperbarui rekaman sebelumnya.
              </span>
            </div>
            <span className="font-semibold text-[11px] uppercase tracking-wider bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded-md">
              Mode Edit
            </span>
          </div>
        )}

        {/* LIVE STATS BAR */}
        <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Rekap Langsung:</span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              Hadir: {hadirCount}
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
              Sakit: {sakitCount}
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
              Izin: {izinCount}
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
              Alpa: {alpaCount}
            </span>
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300 ml-2">
              Kehadiran: {attendancePercent}%
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-mark-all-present"
              type="button"
              onClick={() => handleMarkAll('Hadir')}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-semibold transition-colors flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              {t.markAllPresent}
            </button>
          </div>
        </div>
      </div>

      {/* STUDENT ATTENDANCE LIST TABLE */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/60 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/40">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
              Daftar Siswa Kelas {selectedSubject?.classGrade || '-'} ({students.length} Siswa)
            </span>
          </div>
          <span className="text-[11px] text-gray-400">
            Klik status (H / S / I / A) untuk masing-masing siswa
          </span>
        </div>

        {loadingStudents ? (
          <div className="p-12 text-center text-xs text-gray-400">{t.loading}</div>
        ) : students.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto" />
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Belum ada siswa yang terdaftar di kelas "{selectedSubject?.classGrade}".
            </p>
            <p className="text-[11px] text-gray-400">
              Silakan buka tab <strong>"Daftar Siswa"</strong> untuk menambahkan siswa kelas ini.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {students.map((student, idx) => {
              const currentStatus = records[student.id]?.status || 'Hadir';
              const currentNote = records[student.id]?.note || '';

              return (
                <div 
                  key={student.id} 
                  className="p-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center font-mono text-xs text-gray-400">{idx + 1}</span>
                    <div>
                      <h4 className="text-xs font-bold text-gray-900 dark:text-white leading-tight">
                        {student.name}
                      </h4>
                      <p className="text-[11px] text-gray-400 font-mono">
                        NIS: {student.nis || '-'} • {student.gender === 'P' ? 'P' : 'L'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    {/* Notes input */}
                    <input
                      type="text"
                      placeholder="Catatan..."
                      value={currentNote}
                      onChange={(e) => handleSetNote(student.id, e.target.value)}
                      className="hidden md:block w-36 text-[11px] px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none"
                    />

                    {/* Quick 4-Way Radio Pills */}
                    <div className="flex items-center bg-gray-100 dark:bg-gray-900 p-1 rounded-xl border border-gray-200 dark:border-gray-700/60">
                      <button
                        type="button"
                        onClick={() => handleSetStatus(student.id, 'Hadir')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                          currentStatus === 'Hadir'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                        }`}
                        title="Hadir"
                      >
                        H
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetStatus(student.id, 'Sakit')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                          currentStatus === 'Sakit'
                            ? 'bg-amber-500 text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                        }`}
                        title="Sakit"
                      >
                        S
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetStatus(student.id, 'Izin')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                          currentStatus === 'Izin'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                        }`}
                        title="Izin"
                      >
                        I
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetStatus(student.id, 'Alpa')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                          currentStatus === 'Alpa'
                            ? 'bg-rose-600 text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                        }`}
                        title="Alpa"
                      >
                        A
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* BOTTOM SAVE BAR */}
        {students.length > 0 && (
          <div className="p-4 bg-gray-50 dark:bg-gray-900/70 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t.syncNotice}
            </span>
            <button
              id="btn-save-student-attendance"
              type="button"
              onClick={handleSaveAttendance}
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow hover:shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? t.processing : t.saveStudentAttendance}</span>
            </button>
          </div>
        )}
      </div>

      {/* RECENT ATTENDANCE HISTORY FOR THIS TEACHER */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/60 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <History className="w-4 h-4 text-blue-600" />
            Riwayat Presensi Siswa yang Pernah Anda Simpan
          </h3>
          <span className="text-[11px] text-gray-400">{historySessions.length} sesi</span>
        </div>

        {historySessions.length === 0 ? (
          <p className="text-xs text-gray-400 py-3 text-center">Belum ada riwayat sesi presensi siswa tersimpan.</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {historySessions.slice(0, 5).map((session) => (
              <div 
                key={session.id} 
                className="py-3 flex items-center justify-between text-xs hover:bg-gray-50/50 dark:hover:bg-gray-700/20 px-2 rounded-xl transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900 dark:text-white">{session.subjectName}</span>
                    <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                      Kelas {session.classGrade}
                    </span>
                    <span className="font-mono text-gray-400 text-[11px]">{session.date}</span>
                  </div>
                  {session.topic && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Topik: {session.topic}</p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right text-[11px]">
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{session.hadir} Hadir</span>
                    {session.sakit > 0 && <span className="text-amber-600 ml-1.5">{session.sakit} Sakit</span>}
                    {session.izin > 0 && <span className="text-blue-600 ml-1.5">{session.izin} Izin</span>}
                    {session.alpa > 0 && <span className="text-rose-600 ml-1.5">{session.alpa} Alpa</span>}
                  </div>
                  <button
                    onClick={() => setSelectedHistory(session)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                    title={t.viewDetails}
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* DETAIL MODAL FOR HISTORY SESSION */}
      {selectedHistory && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-800 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Rincian Presensi: {selectedHistory.subjectName}
                </h3>
                <p className="text-xs text-gray-400">
                  Kelas {selectedHistory.classGrade} • Tanggal {selectedHistory.date}
                </p>
              </div>
              <button
                onClick={() => setSelectedHistory(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-full"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 font-bold">
                Hadir: {selectedHistory.hadir}
              </span>
              <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 font-bold">
                Sakit: {selectedHistory.sakit}
              </span>
              <span className="px-2 py-1 rounded-md bg-blue-50 text-blue-700 font-bold">
                Izin: {selectedHistory.izin}
              </span>
              <span className="px-2 py-1 rounded-md bg-rose-50 text-rose-700 font-bold">
                Alpa: {selectedHistory.alpa}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 text-xs pr-1">
              {selectedHistory.records?.map((rec, i) => (
                <div key={i} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-white">{rec.studentName}</span>
                    <span className="text-[11px] text-gray-400 font-mono ml-2">NIS: {rec.nis}</span>
                    {rec.note && <p className="text-[11px] text-gray-500 italic mt-0.5">{rec.note}</p>}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                    rec.status === 'Hadir' ? 'bg-emerald-100 text-emerald-800' :
                    rec.status === 'Sakit' ? 'bg-amber-100 text-amber-800' :
                    rec.status === 'Izin' ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {rec.status}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-end">
              <button
                onClick={() => setSelectedHistory(null)}
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
