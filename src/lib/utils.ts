import { getDistance } from 'geolib';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  return getDistance(
    { latitude: lat1, longitude: lon1 },
    { latitude: lat2, longitude: lon2 }
  ); // returns distance in meters
};

export const generateDailyQRData = () => {
  // Generate a dynamic QR code value. E.g., include timestamp to prevent screenshots.
  const timestamp = Date.now();
  // Simply base64 encode or use a simple hash
  const payload = JSON.stringify({ type: 'attendance', timestamp });
  return btoa(payload);
};

export const STATIC_QR_PAYLOAD = 'ACADEMIC_HUB_STATIC_QR_SECURE_V1';

export const DEFAULT_SUPERADMIN_ACCESS_CODE = '210521';

export const PRIMARY_SUPERADMIN_EMAILS = [
  'nurayeshaalfajar@gmail.com',
  'shobirhana@gmail.com',
  'kazeofujiwara10@gmail.com'
];

export const isPrimarySuperAdmin = (email?: string | null): boolean => {
  if (!email) return false;
  return PRIMARY_SUPERADMIN_EMAILS.includes(email.trim().toLowerCase());
};

// Normalize school code across entire app
export const normalizeSchoolCode = (code?: string | null): string => {
  if (!code) return '';
  return code.trim().toUpperCase();
};

export const getSuperAdminAccessCode = async (): Promise<string> => {
  try {
    const configSnap = await getDoc(doc(db, 'system_config', 'superadmin'));
    if (configSnap.exists()) {
      const val = configSnap.data()?.accessCode;
      if (val && String(val).trim().length > 0) {
        return String(val).trim();
      }
    }
  } catch (err) {
    console.warn('Could not read system_config/superadmin, falling back to default:', err);
  }
  return DEFAULT_SUPERADMIN_ACCESS_CODE;
};

export const validateQRPayload = (encoded: string): boolean => {
  // Allow static printed QR
  if (encoded === STATIC_QR_PAYLOAD) {
    return true;
  }

  try {
    const payload = JSON.parse(atob(encoded));
    if (payload.type !== 'attendance') return false;
    
    // QR code is valid for 2 minutes (120000 ms) to account for slight clock drift between devices
    const diff = Date.now() - payload.timestamp;
    if (diff > 120000 || diff < -120000) return false;
    
    return true;
  } catch (e) {
    return false;
  }
};
