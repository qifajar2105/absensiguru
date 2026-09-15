/**
 * Offline Cache Helper for School Subjects (Jadwal Mengajar) and Students (Daftar Siswa)
 * Provides instant fallback and IndexedDB/localStorage backup for unstable internet connections.
 */

const CACHE_KEYS = {
  SUBJECTS: (schoolCode: string, teacherId?: string) => `offline_subjects_${schoolCode}_${teacherId || 'all'}`,
  STUDENTS: (schoolCode: string) => `offline_students_${schoolCode}`,
  LAST_SYNC: (type: string, schoolCode: string) => `offline_last_sync_${type}_${schoolCode}`
};

export const offlineStorage = {
  // --- SUBJECTS / JADWAL MENGAJAR ---
  saveSubjects: (schoolCode: string, teacherId: string | undefined, subjects: any[]) => {
    try {
      if (!schoolCode) return;
      const key = CACHE_KEYS.SUBJECTS(schoolCode, teacherId);
      localStorage.setItem(key, JSON.stringify(subjects));
      localStorage.setItem(CACHE_KEYS.LAST_SYNC('subjects', schoolCode), new Date().toISOString());
    } catch (e) {
      console.warn('Gagal menyimpan cache jadwal mengajar:', e);
    }
  },

  getSubjects: (schoolCode: string, teacherId?: string): any[] | null => {
    try {
      if (!schoolCode) return null;
      const key = CACHE_KEYS.SUBJECTS(schoolCode, teacherId);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Gagal membaca cache jadwal mengajar:', e);
      return null;
    }
  },

  // --- STUDENTS / DAFTAR SISWA ---
  saveStudents: (schoolCode: string, students: any[]) => {
    try {
      if (!schoolCode) return;
      const key = CACHE_KEYS.STUDENTS(schoolCode);
      localStorage.setItem(key, JSON.stringify(students));
      localStorage.setItem(CACHE_KEYS.LAST_SYNC('students', schoolCode), new Date().toISOString());
    } catch (e) {
      console.warn('Gagal menyimpan cache daftar siswa:', e);
    }
  },

  getStudents: (schoolCode: string): any[] | null => {
    try {
      if (!schoolCode) return null;
      const key = CACHE_KEYS.STUDENTS(schoolCode);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Gagal membaca cache daftar siswa:', e);
      return null;
    }
  },

  getLastSync: (type: 'subjects' | 'students', schoolCode: string): string | null => {
    try {
      return localStorage.getItem(CACHE_KEYS.LAST_SYNC(type, schoolCode));
    } catch {
      return null;
    }
  }
};
