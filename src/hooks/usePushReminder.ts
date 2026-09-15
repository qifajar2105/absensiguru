import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

export function usePushReminder(hasCheckedInToday: boolean, isLoading: boolean) {
  const [permission, setPermission] = useState<NotificationPermission>(
    'Notification' in window ? Notification.permission : 'denied'
  );

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      toast.error('Browser ini tidak mendukung notifikasi.');
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        toast.success('Pengingat berhasil diaktifkan!');
      } else {
        toast.error('Izin notifikasi ditolak.');
      }
    } catch (err) {
      console.error('Error requesting notification permission:', err);
    }
  };

  useEffect(() => {
    if (permission !== 'granted' || isLoading) return;

    // Cek setiap menit
    const interval = setInterval(() => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      // Misalnya shift dimulai jam 07:00, kita ingatkan antara jam 06:30 - 08:00
      const isMorning = hours === 6 && minutes >= 30 || hours === 7 || (hours === 8 && minutes === 0);
      
      const todayStr = now.toISOString().split('T')[0];
      const lastNotified = localStorage.getItem('last_notified_date');

      if (isMorning && !hasCheckedInToday && lastNotified !== todayStr) {
        // Tampilkan notifikasi
        sendLocalNotification('Waktunya Absen!', 'Jangan lupa untuk melakukan absensi kehadiran Anda pagi ini.');
        localStorage.setItem('last_notified_date', todayStr);
      }
    }, 60000); // 1 menit

    // Cek langsung saat load
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const isMorning = hours === 6 && minutes >= 30 || hours === 7 || (hours === 8 && minutes === 0);
    const todayStr = now.toISOString().split('T')[0];
    const lastNotified = localStorage.getItem('last_notified_date');

    if (isMorning && !hasCheckedInToday && lastNotified !== todayStr) {
      sendLocalNotification('Waktunya Absen!', 'Jangan lupa untuk melakukan absensi kehadiran Anda pagi ini.');
      localStorage.setItem('last_notified_date', todayStr);
    }

    return () => clearInterval(interval);
  }, [permission, hasCheckedInToday, isLoading]);

  const sendLocalNotification = (title: string, body: string) => {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          vibrate: [200, 100, 200]
        } as any).catch(err => {
          // Fallback if Service Worker doesn't handle it
          new Notification(title, { body, icon: '/pwa-192x192.png' });
        });
      }).catch(() => {
        new Notification(title, { body, icon: '/pwa-192x192.png' });
      });
    } else {
      new Notification(title, { body, icon: '/pwa-192x192.png' });
    }
  };

  return { permission, requestPermission, sendLocalNotification };
}
