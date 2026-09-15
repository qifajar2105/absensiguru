import { getDistance } from 'geolib';

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

export const PRIMARY_SUPERADMIN_EMAILS = [
  'nurayeshaalfajar@gmail.com',
  'shobirhana@gmail.com'
];

export const isPrimarySuperAdmin = (email?: string | null): boolean => {
  if (!email) return false;
  return PRIMARY_SUPERADMIN_EMAILS.includes(email.trim().toLowerCase());
};

export const validateQRPayload = (encoded: string): boolean => {
  // Allow static printed QR
  if (encoded === STATIC_QR_PAYLOAD) {
    return true;
  }

  try {
    const payload = JSON.parse(atob(encoded));
    if (payload.type !== 'attendance') return false;
    
    // QR code is valid for 30 seconds
    const diff = Date.now() - payload.timestamp;
    if (diff > 30000) return false;
    
    return true;
  } catch (e) {
    return false;
  }
};
