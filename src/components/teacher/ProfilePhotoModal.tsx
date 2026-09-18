import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Camera, Trash2, Check, AlertCircle, Loader2, User } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { useStore } from '../../store/useStore';

interface ProfilePhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfilePhotoModal({ isOpen, onClose }: ProfilePhotoModalProps) {
  const { userData, setUserData } = useStore();
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editName, setEditName] = useState('');
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    if (userData) {
      setEditName(userData.name || '');
      setEditTitle(userData.academicTitle || '');
    }
  }, [userData, isOpen]);

  if (!isOpen) return null;

  const currentPhoto = userData?.photoURL || auth.currentUser?.photoURL || '';

  // Process & center-crop image to 320x320 square via canvas
  const processImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject(new Error('File yang dipilih harus berupa gambar (JPG, PNG, atau WebP).'));
        return;
      }

      if (file.size > 8 * 1024 * 1024) {
        reject(new Error('Ukuran file maksimal 8MB.'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const targetSize = 320;
          const canvas = document.createElement('canvas');
          canvas.width = targetSize;
          canvas.height = targetSize;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Gagal memproses gambar pada browser.'));
            return;
          }

          // Center crop to square
          const minSide = Math.min(img.width, img.height);
          const sx = (img.width - minSide) / 2;
          const sy = (img.height - minSide) / 2;

          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error('Gagal memuat gambar.'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSuccess(null);

    try {
      const processed = await processImage(file);
      setPreview(processed);
    } catch (err: any) {
      setError(err.message || 'Gagal memproses gambar');
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);
    setSuccess(null);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    try {
      const processed = await processImage(file);
      setPreview(processed);
    } catch (err: any) {
      setError(err.message || 'Gagal memproses gambar');
    }
  };

  const handleSave = async () => {
    if (!userData?.uid) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. Update Firestore user document
      const userDocRef = doc(db, 'users', userData.uid);
      const updates: any = {
        name: editName.trim(),
        academicTitle: editTitle.trim(),
      };
      if (preview) {
        updates.photoURL = preview;
      }
      
      await updateDoc(userDocRef, updates);

      // 2. Update Firebase Auth user profile if available
      if (auth.currentUser) {
        try {
          const authUpdates: any = { displayName: editName.trim() };
          if (preview) authUpdates.photoURL = preview;
          await updateProfile(auth.currentUser, authUpdates);
        } catch (authErr) {
          console.warn('Auth updateProfile notice:', authErr);
        }
      }

      // 3. Update Zustand local store
      setUserData({
        ...userData,
        name: editName.trim(),
        academicTitle: editTitle.trim(),
        ...(preview ? { photoURL: preview } : {})
      });

      setSuccess('Profil berhasil diperbarui!');
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Error saving profile:', err);
      setError(err.message || 'Gagal menyimpan profil.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus foto profil ini?')) return;
    if (!userData?.uid) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. Clear in Firestore
      const userDocRef = doc(db, 'users', userData.uid);
      await updateDoc(userDocRef, {
        photoURL: '',
      });

      // 2. Clear in Firebase Auth
      if (auth.currentUser) {
        try {
          await updateProfile(auth.currentUser, {
            photoURL: '',
          });
        } catch (authErr) {
          console.warn('Auth clear photo notice:', authErr);
        }
      }

      // 3. Clear in Zustand store
      setUserData({
        ...userData,
        photoURL: '',
      });

      setPreview(null);
      setSuccess('Foto profil berhasil dihapus.');
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Error removing profile photo:', err);
      setError(err.message || 'Gagal menghapus foto profil.');
    } finally {
      setLoading(false);
    }
  };

  const initial = (userData?.name || 'G')[0].toUpperCase();
  const displayImage = preview || currentPhoto;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Edit Profil</h3>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
              <Check className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Current / Preview Image Display */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative group">
              <div className="w-24 h-24 rounded-2xl overflow-hidden border-4 border-white dark:border-gray-800 shadow-md bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-3xl font-bold">
                {displayImage ? (
                  <img
                    src={displayImage}
                    alt={userData?.name || 'Foto Profil'}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{initial}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/40 text-white rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-xs font-semibold"
              >
                <Camera className="w-5 h-5" />
                <span>Ubah</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Nama Lengkap</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all dark:text-white"
                placeholder="Misal: Budi Santoso"
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Gelar Akademik <span className="text-gray-400 font-normal">(Opsional)</span></label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all dark:text-white"
                placeholder="Misal: S.Pd., M.Si."
              />
            </div>
          </div>

          {/* Drag & Drop Area */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                : 'border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 bg-gray-50/50 dark:bg-gray-800/30'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/png,image/jpeg,image/webp,image/jpg"
              className="hidden"
            />
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Upload className="w-4 h-4" />
              </div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                Klik atau seret foto ke sini
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                Format JPG, PNG, atau WebP (Otomatis disesuaikan ke rasio kotak)
              </p>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-850 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
          {currentPhoto ? (
            <button
              type="button"
              onClick={handleRemovePhoto}
              disabled={loading}
              className="px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Hapus Foto
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading || !editName.trim()}
              className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Simpan Profil
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
