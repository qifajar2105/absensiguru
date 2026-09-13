import { getDistance } from 'geolib';

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  return getDistance(
    { latitude: lat1, longitude: lon1 },
    { latitude: lat2, longitude: lon2 }
  ); // returns distance in meters
};

export const generateDailyQRData = (schoolCode?: string) => {
  // Generate a dynamic QR code value with timestamp and schoolCode
  const timestamp = Date.now();
  const payload = JSON.stringify({ 
    type: 'attendance', 
    schoolCode: schoolCode ? schoolCode.trim().toUpperCase() : 'DEFAULT', 
    timestamp 
  });
  return btoa(payload);
};

export const getStaticQRPayload = (schoolCode?: string) => {
  const code = schoolCode ? schoolCode.trim().toUpperCase() : 'DEFAULT';
  return `ACADEMIC_HUB_STATIC_QR_${code}`;
};

export const STATIC_QR_PAYLOAD = 'ACADEMIC_HUB_STATIC_QR_SECURE_V1';

export const validateQRPayload = (encoded: string, expectedSchoolCode?: string): boolean => {
  const normExpected = expectedSchoolCode ? expectedSchoolCode.trim().toUpperCase() : '';
  
  // Allow static printed QR for this school or global legacy
  if (encoded === STATIC_QR_PAYLOAD) {
    return true;
  }
  if (normExpected && encoded === `ACADEMIC_HUB_STATIC_QR_${normExpected}`) {
    return true;
  }

  try {
    const payload = JSON.parse(atob(encoded));
    if (payload.type !== 'attendance') return false;
    
    // Check schoolCode matching if provided
    if (normExpected && payload.schoolCode && payload.schoolCode !== 'DEFAULT') {
      if (payload.schoolCode.toUpperCase() !== normExpected) {
        return false;
      }
    }

    // QR code is valid for 30 seconds
    const diff = Date.now() - payload.timestamp;
    if (diff > 30000) return false;
    
    return true;
  } catch (e) {
    return false;
  }
};
