import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Subject } from '../../types';
import { BookOpen, Plus, Edit2, Trash2, X, Users, Clock, WifiOff, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { translations } from '../../lib/translations';
import { normalizeSchoolCode } from '../../lib/utils';
import { offlineStorage } from '../../lib/offlineStorage';

export default function TeacherSubjectsView() {
  const { userData, language } = useStore();
  const t = translations[language];

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [formName, setFormName] = useState('');
  const [formClass, setFormClass] = useState('');
  const [formSchedule, setFormSchedule] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!userData?.uid) return;

    const teacherSchool = normalizeSchoolCode(userData?.schoolCode) || 'DEFAULT';

    // Support variations to match Admin behavior
    const possibleCodes = Array.from(new Set([
      teacherSchool,
      teacherSchool.toLowerCase(),
      teacherSchool.toUpperCase()
    ]));

    // 1. Instant cache load (Stale-While-Revalidate pattern)
    const cached = offlineStorage.getSubjects(teacherSchool);
    if (cached && cached.length > 0) {
      setSubjects(cached);
      setIsFromCache(true);
      setLoading(false);
    }

    const syncTime = offlineStorage.getLastSync('subjects', teacherSchool);
    if (syncTime) {
      setLastSyncTime(syncTime);
    }

    // 2. Listen to Firestore (updates cache in background or works when reconnected)
    const q = query(
      collection(db, 'subjects'),
      where('schoolCode', 'in', possibleCodes)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Subject))
        .filter(s => normalizeSchoolCode(s.schoolCode) === teacherSchool);
        
      setSubjects(list);
      setIsFromCache(false);
      setLoading(false);
      // Save fresh copy to local cache (without teacherId so it's shared across the school)
      offlineStorage.saveSubjects(teacherSchool, undefined, list);
      setLastSyncTime(new Date().toISOString());
    }, (err) => {
      console.warn("Subjects query error, falling back:", err);
      // Fallback if 'in' query fails
      const fallbackQ = query(collection(db, 'subjects'));
      onSnapshot(fallbackQ, (snap) => {
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Subject))
          .filter(s => normalizeSchoolCode(s.schoolCode) === teacherSchool);
        setSubjects(list);
        setIsFromCache(false);
        setLoading(false);
        offlineStorage.saveSubjects(teacherSchool, undefined, list);
      });
    });

    return () => unsubscribe();
  }, [userData]);

  const handleOpenAdd = () => {
    setEditingSubject(null);
    setFormName('');
    setFormClass('');
    setFormSchedule('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (sub: Subject) => {
    setEditingSubject(sub);
    setFormName(sub.name);
    setFormClass(sub.classGrade);
    setFormSchedule(sub.schedule || '');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formClass.trim()) {
      toast.error('Nama mata pelajaran dan kelas wajib diisi!');
      return;
    }

    setSubmitting(true);
    try {
      if (editingSubject) {
        // Update
        await updateDoc(doc(db, 'subjects', editingSubject.id), {
          name: formName.trim(),
          classGrade: formClass.trim(),
          schedule: formSchedule.trim(),
          updatedAt: serverTimestamp()
        });
        toast.success('Mata pelajaran berhasil diperbarui!');
      } else {
        // Add
        const teacherSchool = normalizeSchoolCode(userData?.schoolCode);
        await addDoc(collection(db, 'subjects'), {
          name: formName.trim(),
          classGrade: formClass.trim(),
          schedule: formSchedule.trim(),
          teacherId: userData?.uid,
          teacherName: userData?.name || 'Guru',
          schoolCode: teacherSchool || 'DEFAULT',
          createdAt: serverTimestamp()
        });
        toast.success('Mata pelajaran berhasil ditambahkan & tersinkron ke Admin!');
      }
      setIsModalOpen(false);
    } catch (err: any) {
      toast.error(`Gagal menyimpan: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Hapus mata pelajaran "${name}"?`)) {
      try {
        await deleteDoc(doc(db, 'subjects', id));
        toast.success('Mata pelajaran berhasil dihapus.');
      } catch (err: any) {
        toast.error(`Gagal menghapus: ${err.message}`);
      }
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            {t.tabTeacherSubjects}
          </h2>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Kelola mata pelajaran dan rombongan belajar (kelas) yang Anda ampu di sekolah ini.
            </p>
            {isFromCache && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-medium px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                <WifiOff className="w-3 h-3" />
                Mode Offline (Memori Lokal)
              </span>
            )}
            {!isFromCache && subjects.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-medium px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-3 h-3" />
                Tersimpan Offline
              </span>
            )}
          </div>
        </div>
        <button
          id="btn-add-subject"
          onClick={handleOpenAdd}
          className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>{t.addSubject}</span>
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-gray-400">{t.loading}</div>
      ) : subjects.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-10 text-center border border-gray-100 dark:border-gray-700/60 shadow-sm space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Belum Ada Mata Pelajaran</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
            {t.noSubjects}
          </p>
          <button
            onClick={handleOpenAdd}
            className="mt-2 px-4 py-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-xs font-semibold"
          >
            + Tambah Sekarang
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects.map((sub) => (
            <div
              key={sub.id}
              className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/60 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800/50">
                    <Users className="w-3 h-3 mr-1" />
                    Kelas {sub.classGrade}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(sub)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      title={t.editSubject}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(sub.id, sub.name)}
                      className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      title={t.deleteSubject}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
                  {sub.name}
                </h3>

                {sub.schedule && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    {sub.schedule}
                  </p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between text-[11px] text-gray-400">
                <span>Sekolah: {sub.schoolCode || userData?.schoolCode || '-'}</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">Tersinkronisasi</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL TAMBAH / EDIT MAPEL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                {editingSubject ? t.editSubject : t.addSubject}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t.subjectName} *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Contoh: Matematika Peminatan"
                  className="w-full text-xs p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t.subjectClass} *
                </label>
                <input
                  type="text"
                  required
                  value={formClass}
                  onChange={(e) => setFormClass(e.target.value)}
                  placeholder="Contoh: X IPA 1 atau 7A"
                  className="w-full text-xs p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Siswa yang berada di kelas ini akan otomatis muncul pada saat presensi mapel.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t.subjectSchedule} (Opsional)
                </label>
                <input
                  type="text"
                  value={formSchedule}
                  onChange={(e) => setFormSchedule(e.target.value)}
                  placeholder="Contoh: Senin, 07.30 - 09.00 WIB"
                  className="w-full text-xs p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
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
    </div>
  );
}
