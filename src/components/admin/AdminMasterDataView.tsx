import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, deleteDoc, doc, addDoc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Student, Subject } from '../../types';
import { 
  Users, 
  BookOpen, 
  Plus, 
  Edit2, 
  Trash2, 
  Search, 
  Layers, 
  UserPlus, 
  X,
  GraduationCap
} from 'lucide-react';
import toast from 'react-hot-toast';
import { translations } from '../../lib/translations';

export default function AdminMasterDataView() {
  const { userData, language } = useStore();
  const t = translations[language];

  const [activeSubTab, setActiveSubTab] = useState<'students' | 'subjects'>('students');

  // Students state
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [studentClassFilter, setStudentClassFilter] = useState('all');
  const [studentSearch, setStudentSearch] = useState('');

  // Subjects state
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [subjectSearch, setSubjectSearch] = useState('');

  // Student Modals
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [sName, setSName] = useState('');
  const [sNis, setSNis] = useState('');
  const [sClass, setSClass] = useState('');
  const [sGender, setSGender] = useState<'L' | 'P'>('L');

  // Batch Student Modal
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [batchClass, setBatchClass] = useState('');
  const [batchContent, setBatchContent] = useState('');

  // Subject Modal
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subName, setSubName] = useState('');
  const [subClass, setSubClass] = useState('');
  const [subSchedule, setSubSchedule] = useState('');
  const [subTeacherName, setSubTeacherName] = useState('');

  useEffect(() => {
    if (!userData?.schoolCode) return;

    // Load Students for this school
    const qStudents = query(
      collection(db, 'students'),
      where('schoolCode', '==', userData.schoolCode)
    );
    const unsubStudents = onSnapshot(qStudents, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
      list.sort((a, b) => a.name.localeCompare(b.name));
      setStudents(list);
      setLoadingStudents(false);
    });

    // Load Subjects for this school
    const qSubjects = query(
      collection(db, 'subjects'),
      where('schoolCode', '==', userData.schoolCode)
    );
    const unsubSubjects = onSnapshot(qSubjects, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Subject));
      setSubjects(list);
      setLoadingSubjects(false);
    });

    return () => {
      unsubStudents();
      unsubSubjects();
    };
  }, [userData]);

  const uniqueClasses = Array.from(new Set(students.map(s => s.classGrade).filter(Boolean))).sort();

  // Save single student
  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sName.trim() || !sClass.trim()) {
      toast.error('Nama dan Kelas wajib diisi!');
      return;
    }
    try {
      if (editingStudent) {
        await updateDoc(doc(db, 'students', editingStudent.id), {
          name: sName.trim(),
          nis: sNis.trim(),
          classGrade: sClass.trim(),
          gender: sGender,
          updatedAt: serverTimestamp()
        });
        toast.success('Data siswa diperbarui!');
      } else {
        await addDoc(collection(db, 'students'), {
          name: sName.trim(),
          nis: sNis.trim() || '-',
          classGrade: sClass.trim(),
          gender: sGender,
          schoolCode: userData?.schoolCode || 'DEFAULT',
          createdAt: serverTimestamp()
        });
        toast.success('Siswa baru berhasil ditambahkan!');
      }
      setIsStudentModalOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Batch add students
  const handleBatchAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchClass.trim()) {
      toast.error('Kelas wajib diisi!');
      return;
    }
    const lines = batchContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) {
      toast.error('Isi daftar nama siswa!');
      return;
    }

    try {
      const batch = writeBatch(db);
      lines.forEach(line => {
        let nis = '-';
        let name = line;
        let gender: 'L' | 'P' = 'L';

        if (line.includes(',')) {
          const parts = line.split(',').map(p => p.trim());
          if (parts.length >= 2) {
            if (/^\d+$/.test(parts[0])) {
              nis = parts[0];
              name = parts[1];
              if (parts[2]?.toUpperCase() === 'P' || parts[2]?.toUpperCase() === 'L') {
                gender = parts[2].toUpperCase() as 'L' | 'P';
              }
            } else {
              name = parts[0];
              if (parts[1]?.toUpperCase() === 'P' || parts[1]?.toUpperCase() === 'L') {
                gender = parts[1].toUpperCase() as 'L' | 'P';
              }
            }
          }
        }

        const newDoc = doc(collection(db, 'students'));
        batch.set(newDoc, {
          name,
          nis,
          classGrade: batchClass.trim(),
          gender,
          schoolCode: userData?.schoolCode || 'DEFAULT',
          createdAt: serverTimestamp()
        });
      });

      await batch.commit();
      toast.success(`${lines.length} siswa berhasil ditambahkan!`);
      setIsBatchOpen(false);
      setBatchContent('');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Save subject
  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subName.trim() || !subClass.trim()) {
      toast.error('Nama Mapel dan Kelas wajib diisi!');
      return;
    }
    try {
      if (editingSubject) {
        await updateDoc(doc(db, 'subjects', editingSubject.id), {
          name: subName.trim(),
          classGrade: subClass.trim(),
          schedule: subSchedule.trim(),
          teacherName: subTeacherName.trim() || editingSubject.teacherName,
          updatedAt: serverTimestamp()
        });
        toast.success('Mata pelajaran diperbarui!');
      } else {
        await addDoc(collection(db, 'subjects'), {
          name: subName.trim(),
          classGrade: subClass.trim(),
          schedule: subSchedule.trim(),
          teacherName: subTeacherName.trim() || 'Admin Sekolah',
          teacherId: userData?.uid,
          schoolCode: userData?.schoolCode || 'DEFAULT',
          createdAt: serverTimestamp()
        });
        toast.success('Mata pelajaran ditambahkan!');
      }
      setIsSubjectModalOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteStudent = async (id: string, name: string) => {
    if (window.confirm(`Hapus data siswa "${name}"?`)) {
      try {
        await deleteDoc(doc(db, 'students', id));
        toast.success('Siswa berhasil dihapus.');
      } catch (err: any) {
        toast.error(err.message);
      }
    }
  };

  const handleDeleteSubject = async (id: string, name: string) => {
    if (window.confirm(`Hapus mata pelajaran "${name}"?`)) {
      try {
        await deleteDoc(doc(db, 'subjects', id));
        toast.success('Mata pelajaran berhasil dihapus.');
      } catch (err: any) {
        toast.error(err.message);
      }
    }
  };

  const filteredStudents = students.filter(s => {
    const matchesClass = studentClassFilter === 'all' || s.classGrade === studentClassFilter;
    const matchesSearch = !studentSearch || 
      s.name.toLowerCase().includes(studentSearch.toLowerCase()) || 
      (s.nis && s.nis.toLowerCase().includes(studentSearch.toLowerCase()));
    return matchesClass && matchesSearch;
  });

  const filteredSubjects = subjects.filter(sub => {
    return !subjectSearch || 
      sub.name.toLowerCase().includes(subjectSearch.toLowerCase()) || 
      sub.classGrade.toLowerCase().includes(subjectSearch.toLowerCase()) ||
      sub.teacherName.toLowerCase().includes(subjectSearch.toLowerCase());
  });

  return (
    <div className="w-full space-y-6">
      {/* HEADER WITH SUB TABS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-blue-600" />
            Master Data Sekolah (Siswa & Mapel)
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Kelola dan pantau seluruh data siswa dan mata pelajaran yang tersinkronisasi dengan guru pengampu.
          </p>
        </div>

        {/* Sub-tab pills */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700/60 self-start sm:self-auto">
          <button
            onClick={() => setActiveSubTab('students')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeSubTab === 'students'
                ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Daftar Siswa ({students.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab('subjects')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeSubTab === 'subjects'
                ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Mata Pelajaran ({subjects.length})</span>
          </button>
        </div>
      </div>

      {/* 1. STUDENTS SUB-VIEW */}
      {activeSubTab === 'students' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/60 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Kelas:</span>
                <select
                  value={studentClassFilter}
                  onChange={(e) => setStudentClassFilter(e.target.value)}
                  className="text-xs py-1.5 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none"
                >
                  <option value="all">Semua Kelas ({students.length})</option>
                  {uniqueClasses.map(c => (
                    <option key={c} value={c}>Kelas {c} ({students.filter(s => s.classGrade === c).length})</option>
                  ))}
                </select>
              </div>

              <div className="relative flex-1 sm:w-60">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Cari siswa..."
                  className="w-full text-xs pl-8 pr-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                onClick={() => setIsBatchOpen(true)}
                className="inline-flex items-center px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors gap-1.5"
              >
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                <span>Tambah Massal</span>
              </button>
              <button
                onClick={() => {
                  setEditingStudent(null);
                  setSName('');
                  setSNis('');
                  setSClass(studentClassFilter !== 'all' ? studentClassFilter : '');
                  setSGender('L');
                  setIsStudentModalOpen(true);
                }}
                className="inline-flex items-center px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow transition-colors gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Tambah Siswa</span>
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50/75 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4 w-12 text-center">No</th>
                    <th className="py-3 px-4">Nama Siswa</th>
                    <th className="py-3 px-4">NIS</th>
                    <th className="py-3 px-4">Kelas</th>
                    <th className="py-3 px-4">Jenis Kelamin</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {loadingStudents ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400">{t.loading}</td>
                    </tr>
                  ) : filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-gray-400">
                        Tidak ada data siswa ditemukan.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((s, idx) => (
                      <tr key={s.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="py-3 px-4 text-center font-mono text-gray-400">{idx + 1}</td>
                        <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">{s.name}</td>
                        <td className="py-3 px-4 font-mono text-gray-500 dark:text-gray-400">{s.nis || '-'}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                            {s.classGrade}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-600 dark:text-gray-300">
                          {s.gender === 'P' ? 'Perempuan (P)' : 'Laki-laki (L)'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                setEditingStudent(s);
                                setSName(s.name);
                                setSNis(s.nis || '');
                                setSClass(s.classGrade);
                                setSGender(s.gender || 'L');
                                setIsStudentModalOpen(true);
                              }}
                              className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteStudent(s.id, s.name)}
                              className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. SUBJECTS SUB-VIEW */}
      {activeSubTab === 'subjects' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/60 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={subjectSearch}
                onChange={(e) => setSubjectSearch(e.target.value)}
                placeholder="Cari mata pelajaran atau guru..."
                className="w-full text-xs pl-8 pr-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none"
              />
            </div>

            <button
              onClick={() => {
                setEditingSubject(null);
                setSubName('');
                setSubClass('');
                setSubSchedule('');
                setSubTeacherName('');
                setIsSubjectModalOpen(true);
              }}
              className="inline-flex items-center px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow transition-colors gap-1.5 self-end sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Mapel</span>
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50/75 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4 w-12 text-center">No</th>
                    <th className="py-3 px-4">Nama Mata Pelajaran</th>
                    <th className="py-3 px-4">Kelas</th>
                    <th className="py-3 px-4">Guru Pengampu</th>
                    <th className="py-3 px-4">Jadwal Mengajar</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {loadingSubjects ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400">{t.loading}</td>
                    </tr>
                  ) : filteredSubjects.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-gray-400">
                        Tidak ada mata pelajaran terdaftar.
                      </td>
                    </tr>
                  ) : (
                    filteredSubjects.map((sub, idx) => (
                      <tr key={sub.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="py-3 px-4 text-center font-mono text-gray-400">{idx + 1}</td>
                        <td className="py-3 px-4 font-bold text-gray-900 dark:text-white">{sub.name}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                            Kelas {sub.classGrade}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{sub.teacherName}</td>
                        <td className="py-3 px-4 text-gray-500 dark:text-gray-400">{sub.schedule || '-'}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                setEditingSubject(sub);
                                setSubName(sub.name);
                                setSubClass(sub.classGrade);
                                setSubSchedule(sub.schedule || '');
                                setSubTeacherName(sub.teacherName);
                                setIsSubjectModalOpen(true);
                              }}
                              className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteSubject(sub.id, sub.name)}
                              className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STUDENT MODAL */}
      {isStudentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                {editingStudent ? 'Edit Siswa' : 'Tambah Siswa Baru'}
              </h3>
              <button onClick={() => setIsStudentModalOpen(false)} className="p-1 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveStudent} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">Nama Siswa *</label>
                <input
                  type="text"
                  required
                  value={sName}
                  onChange={(e) => setSName(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">NIS / NISN</label>
                <input
                  type="text"
                  value={sNis}
                  onChange={(e) => setSNis(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">Kelas *</label>
                  <input
                    type="text"
                    required
                    value={sClass}
                    onChange={(e) => setSClass(e.target.value)}
                    placeholder="Contoh: X IPA 1"
                    className="w-full text-xs p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">Jenis Kelamin</label>
                  <select
                    value={sGender}
                    onChange={(e) => setSGender(e.target.value as 'L' | 'P')}
                    className="w-full text-xs p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="L">Laki-laki (L)</option>
                    <option value="P">Perempuan (P)</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsStudentModalOpen(false)}
                  className="flex-1 py-2 px-3 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 dark:text-gray-300"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BATCH STUDENT MODAL */}
      {isBatchOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Tambah Siswa Massal</h3>
              <button onClick={() => setIsBatchOpen(false)} className="p-1 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleBatchAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">Kelas *</label>
                <input
                  type="text"
                  required
                  value={batchClass}
                  onChange={(e) => setBatchClass(e.target.value)}
                  placeholder="Contoh: X IPA 1"
                  className="w-full text-xs p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">Daftar Nama (Satu per baris)</label>
                <textarea
                  required
                  rows={6}
                  value={batchContent}
                  onChange={(e) => setBatchContent(e.target.value)}
                  placeholder={`Ahmad Dhani\nBudi Santoso\nCitra Kirana`}
                  className="w-full text-xs p-2.5 rounded-xl font-mono border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsBatchOpen(false)}
                  className="flex-1 py-2 px-3 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 dark:text-gray-300"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                >
                  Simpan Semua
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUBJECT MODAL */}
      {isSubjectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                {editingSubject ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran'}
              </h3>
              <button onClick={() => setIsSubjectModalOpen(false)} className="p-1 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveSubject} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">Nama Mapel *</label>
                <input
                  type="text"
                  required
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  placeholder="Contoh: Bahasa Inggris"
                  className="w-full text-xs p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">Kelas *</label>
                <input
                  type="text"
                  required
                  value={subClass}
                  onChange={(e) => setSubClass(e.target.value)}
                  placeholder="Contoh: VII-B"
                  className="w-full text-xs p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">Guru Pengampu</label>
                <input
                  type="text"
                  value={subTeacherName}
                  onChange={(e) => setSubTeacherName(e.target.value)}
                  placeholder="Nama guru yang mengajar"
                  className="w-full text-xs p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">Jadwal Mengajar</label>
                <input
                  type="text"
                  value={subSchedule}
                  onChange={(e) => setSubSchedule(e.target.value)}
                  placeholder="Contoh: Rabu, 09.30 - 11.00"
                  className="w-full text-xs p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsSubjectModalOpen(false)}
                  className="flex-1 py-2 px-3 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 dark:text-gray-300"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
