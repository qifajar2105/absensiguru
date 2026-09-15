export type UserRole = 'admin' | 'teacher' | 'superadmin';
export type Theme = 'light' | 'dark';
export type Language = 'id' | 'en';

export interface UserData {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  schoolCode?: string;
  photoURL?: string;
  createdAt?: any;
}

export interface Subject {
  id: string;
  name: string;
  classGrade: string;
  schedule?: string;
  teacherId: string;
  teacherName: string;
  schoolCode: string;
  createdAt?: any;
}

export interface Student {
  id: string;
  name: string;
  nis: string;
  classGrade: string;
  gender?: 'L' | 'P';
  schoolCode: string;
  teacherId?: string;
  createdAt?: any;
}

export type StudentStatus = 'Hadir' | 'Sakit' | 'Izin' | 'Alpa';

export interface StudentAttendanceRecord {
  studentId: string;
  studentName: string;
  nis: string;
  status: StudentStatus;
  note?: string;
}

export interface StudentAttendanceSession {
  id: string;
  subjectId: string;
  subjectName: string;
  classGrade: string;
  date: string;
  teacherId: string;
  teacherName: string;
  schoolCode: string;
  topic?: string;
  records: StudentAttendanceRecord[];
  totalStudents: number;
  hadir: number;
  sakit: number;
  izin: number;
  alpa: number;
  timestamp?: any;
}

export interface TeacherAttendance {
  id: string;
  teacherId: string;
  teacherName: string;
  schoolCode?: string;
  date: string;
  timestamp?: any;
  status: string;
  type: 'Datang' | 'Pulang' | 'Mengajar' | 'Absen Harian';
  location?: { lat: number; lng: number };
  distanceFromSchool?: number;
}
