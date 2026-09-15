import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Student } from '../../types';
import { Users, Plus, Edit2, Trash2, X, Search, Filter, Layers, UserPlus, WifiOff, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { translations } from '../../lib/translations';
import { normalizeSchoolCode } from '../../lib/utils';
import { offlineStorage } from '../../lib/offlineStorage';

export default function TeacherStudentsView() {
  const { userData, language } = useStore();
  const t = translations[language];

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isSingleModalOpen, setIsSingleModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Single form state
  const [formName, setFormName] = useState('');
  const [formNis, setFormNis] = useState('');
  const [formClass, setFormClass] = useState('');
  const [formGender, setFormGender] = useState<'L' | 'P'>('L');
  const [submitting, setSubmitting] = useState(false);

  // Batch form state
  const [batchClass, setBatchClass] = useState('');
  const [batchText, setBatchText] = useState('');
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  useEffect(() => {
    const teacherSchool = normalizeSchoolCode(userData?.schoolCode);
    if (!teacherSchool) {
      setStudents([]);
      setLoading(false);
      return;
    }

    // 1. Instant Cache Load (Stale-While-Revalidate)
    const cached = offlineStorage.getStudents(teacherSchool);
    if (cached && cached.length > 0) {
      setStudents(cached);
      setIsFromCache(true);
      setLoading(false);
    }

    const possibleCodes = Array.from(new Set([
      teacherSchool,
      teacherSchool.toLowerCase(),
      teacherSchool.toUpperCase()
    ]));

    // 2. Load students strictly for this school from Firestore
    const q = query(
      collection(db, 'students'),
      where('schoolCode', 'in', possibleCodes)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Student))
        .filter(s => normalizeSchoolCode(s.schoolCode) === teacherSchool);
      // Sort alphabetically by name
      list.sort((a, b) => a.name.localeCompare(b.name));
      setStudents(list);
      setIsFromCache(false);
      setLoading(false);
      // Persist to local offline cache
      offlineStorage.saveStudents(teacherSchool, list);
    }, (err) => {
      console.error("Error loading students (falling back to offline cache):", err);
      const fallbackQ = query(collection(db, 'students'));
      onSnapshot(fallbackQ, (snap) => {
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Student))
          .filter(s => normalizeSchoolCode(s.schoolCode) === teacherSchool);
        list.sort((a, b) => a.name.localeCompare(b.name));
        setStudents(list);
        setIsFromCache(false);
        setLoading(false);
        offlineStorage.saveStudents(teacherSchool, list);
      }, () => {
        // If network completely unavailable, ensure cached list remains visible
        if (!cached || cached.length === 0) {
          setLoading(false);
        }
      });
    });

    return () => unsubscribe();
  }, [userData]);

  // Extract unique classes
  const uniqueClasses = Array.from(new Set(students.map(s => s.classGrade).filter(Boolean))).sort();

  // Filter students
  const filteredStudents = students.filter(s => {
    const matchesClass = selectedClass === 'all' || s.classGrade === selectedClass;
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (s.nis && s.nis.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesClass && matchesSearch;
  });

  const handleOpenAddSingle = () => {
    setEditingStudent(null);
    setFormName('');
    setFormNis('');
    setFormClass(selectedClass !== 'all' ? selectedClass : (uniqueClasses[0] || ''));
    setFormGender('L');
    setIsSingleModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    setFormName(student.name);
    setFormNis(student.nis || '');
    setFormClass(student.classGrade);
    setFormGender(student.gender || 'L');
    setIsSingleModalOpen(true);
  };

  const handleSaveSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formClass.trim()) {
      toast.error('Nama siswa dan kelas wajib diisi!');
      return;
    }

    setSubmitting(true);
    try {
      if (editingStudent) {
        await updateDoc(doc(db, 'students', editingStudent.id), {
          name: formName.trim(),
          nis: formNis.trim(),
          classGrade: formClass.trim(),
          gender: formGender,
          updatedAt: serverTimestamp()
        });
        toast.success('Data siswa berhasil diperbarui!');
      } else {
        const teacherSchool = normalizeSchoolCode(userData?.schoolCode);
        await addDoc(collection(db, 'students'), {
          name: formName.trim(),
          nis: formNis.trim() || '-',
          classGrade: formClass.trim(),
          gender: formGender,
          schoolCode: teacherSchool || 'DEFAULT',
          teacherId: userData?.uid,
          createdAt: serverTimestamp()
        });
        toast.success('Siswa berhasil ditambahkan & tersinkron ke Admin!');
      }
      setIsSingleModalOpen(false);
    } catch (err: any) {
      toast.error(`Gagal menyimpan: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBatchAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchClass.trim()) {
      toast.error('Tentukan kelas terlebih dahulu!');
      return;
    }
    const lines = batchText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length === 0) {
      toast.error('Masukkan setidaknya satu nama siswa!');
      return;
    }

    setBatchSubmitting(true);
    const teacherSchool = normalizeSchoolCode(userData?.schoolCode);
    try {
      const batch = writeBatch(db);
      lines.forEach((line) => {
        // Line can be "12345, Ahmad Subarjo, L" or just "Ahmad Subarjo"
        let nis = '-';
        let name = line;
        let gender: 'L' | 'P' = 'L';

        if (line.includes(',')) {
          const parts = line.split(',').map(p => p.trim());
          if (parts.length >= 2) {
            // Check if first part looks like NIS
            if (/^\d+$/.test(parts[0])) {
               nis = parts[0];
               name = parts[1];
               if (parts[2] && (parts[2].toUpperCase() === 'P' || parts[2].toUpperCase() === 'L')) {
                 gender = parts[2].toUpperCase() as 'L' | 'P';
               }
            } else {
               name = parts[0];
               if (parts[1] && (parts[1].toUpperCase() === 'P' || parts[1].toUpperCase() === 'L')) {
                 gender = parts[1].toUpperCase() as 'L' | 'P';
               }
            }
          }
        }

        const newDocRef = doc(collection(db, 'students'));
        batch.set(newDocRef, {
          name,
          nis,
          classGrade: batchClass.trim(),
          gender,
          schoolCode: teacherSchool || 'DEFAULT',
          teacherId: userData?.uid,
          createdAt: serverTimestamp()
        });
      });

      await batch.commit();
      toast.success(`${lines.length} siswa berhasil ditambahkan & tersinkron ke Admin!`);
      setIsBatchModalOpen(false);
      setBatchText('');
      setSelectedClass(batchClass.trim());
    } catch (err: any) {
      toast.error(`Gagal menambahkan massal: ${err.message}`);
    } finally {
      setBatchSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Hapus siswa "${name}"?`)) {
      try {
        await deleteDoc(doc(db, 'students', id));
        toast.success('Data siswa berhasil dihapus.');
      } catch (err: any) {
        toast.error(`Gagal menghapus: ${err.message}`);
      }
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            {t.tabTeacherStudents}
          </h2>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Daftar siswa sekolah tersinkronisasi langsung dengan Admin Sekolah untuk keperluan presensi mapel harian.
            </p>
            {isFromCache && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-medium px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                <WifiOff className="w-3 h-3" />
                Mode Offline
              </span>
            )}
            {!isFromCache && students.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-medium px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-3 h-3" />
                Tersimpan Offline
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="btn-batch-add-student"
            onClick={() => {
              setBatchClass(selectedClass !== 'all' ? selectedClass : '');
              setIsBatchModalOpen(true);
            }}
            className="inline-flex items-center justify-center px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-all gap-1.5 shadow-sm"
          >
            <Layers className="w-4 h-4 text-blue-600" />
            <span>{t.batchAdd}</span>
          </button>
          <button
            id="btn-add-student"
            onClick={handleOpenAddSingle}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all gap-1.5"
          >
            <UserPlus className="w-4 h-4" />
            <span>{t.addStudent}</span>
          </button>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700/60 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Kelas:</span>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="text-xs py-2 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="all">Semua Kelas ({students.length} Siswa)</option>
            {uniqueClasses.map((c) => (
              <option key={c} value={c}>
                Kelas {c} ({students.filter(s => s.classGrade === c).length} Siswa)
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama atau NIS siswa..."
            className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      {/* STUDENTS TABLE */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/60 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
            Menampilkan {filteredStudents.length} siswa
          </span>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            {t.syncNotice}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50/75 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4 w-12 text-center">No</th>
                <th className="py-3 px-4">{t.studentName}</th>
                <th className="py-3 px-4">{t.studentNis}</th>
                <th className="py-3 px-4">{t.studentClass}</th>
                <th className="py-3 px-4">{t.studentGender}</th>
                <th className="py-3 px-4 text-right">{t.action}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">
                    {t.loading}
                  </td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">
                    <p className="font-semibold text-gray-600 dark:text-gray-300 mb-1">{t.noStudents}</p>
                    <p className="text-[11px]">Silakan tambahkan siswa secara individual atau massal di atas.</p>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="py-3 px-4 text-center font-mono text-gray-400">{idx + 1}</td>
                    <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">{s.name}</td>
                    <td className="py-3 px-4 font-mono text-gray-500 dark:text-gray-400">{s.nis || '-'}</td>
                    <td className="py-3 px-4">
                      <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                        {s.classGrade}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-300">
                      {s.gender === 'P' ? 'Perempuan (P)' : 'Laki-laki (L)'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(s)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title={t.editStudent}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(s.id, s.name)}
                          className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title={t.deleteStudent}
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

      {/* MODAL TAMBAH / EDIT SINGLE SISWA */}
      {isSingleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                {editingStudent ? t.editStudent : t.addStudent}
              </h3>
              <button
                onClick={() => setIsSingleModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSingle} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t.studentName} *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Contoh: Muhammad Rizky Pratama"
                  className="w-full text-xs p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t.studentNis} (Nomor Induk Siswa)
                </label>
                <input
                  type="text"
                  value={formNis}
                  onChange={(e) => setFormNis(e.target.value)}
                  placeholder="Contoh: 20241001"
                  className="w-full text-xs p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {t.studentClass} *
                  </label>
                  <input
                    type="text"
                    required
                    value={formClass}
                    onChange={(e) => setFormClass(e.target.value)}
                    placeholder="Contoh: X IPA 1"
                    className="w-full text-xs p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {t.studentGender}
                  </label>
                  <select
                    value={formGender}
                    onChange={(e) => setFormGender(e.target.value as 'L' | 'P')}
                    className="w-full text-xs p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="L">{t.genderMale}</option>
                    <option value="P">{t.genderFemale}</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsSingleModalOpen(false)}
                  className="flex-1 py-2.5 px-3 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {submitting ? t.processing : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL BATCH ADD SISWA */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  {t.batchAdd}
                </h3>
                <p className="text-xs text-gray-400">Tambahkan seluruh siswa dalam satu kelas sekaligus</p>
              </div>
              <button
                onClick={() => setIsBatchModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleBatchAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Pilih / Ketik Nama Kelas *
                </label>
                <input
                  type="text"
                  required
                  value={batchClass}
                  onChange={(e) => setBatchClass(e.target.value)}
                  placeholder="Contoh: X IPA 1 atau 7A"
                  className="w-full text-xs p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Daftar Nama Siswa (Satu nama per baris) *
                </label>
                <textarea
                  required
                  rows={8}
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  placeholder={`Contoh:\nAhmad Dhani\nBudi Santoso\nCitra Lestari\nDewi Sartika`}
                  className="w-full text-xs p-3 font-mono rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Anda juga bisa menyertakan NIS: <code>2024101, Ahmad Dhani, L</code>
                </p>
              </div>

              <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsBatchModalOpen(false)}
                  className="flex-1 py-2.5 px-3 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={batchSubmitting}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {batchSubmitting ? t.processing : 'Simpan Semua Siswa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
