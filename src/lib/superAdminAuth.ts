import { doc, getDoc, setDoc, deleteDoc, collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';

export const MASTER_SUPERADMIN_EMAIL = 'muhammadfajar.qf210521@gmail.com';

export interface AuthorizedSuperAdmin {
  email: string;
  name?: string;
  notes?: string;
  addedBy: string;
  addedAt: string;
  status: 'active' | 'revoked';
  isMaster?: boolean;
}

/**
 * Checks synchronously whether the given email is the immutable Master Super Admin.
 */
export const isMasterSuperAdmin = (email?: string | null): boolean => {
  if (!email) return false;
  return email.trim().toLowerCase() === MASTER_SUPERADMIN_EMAIL.toLowerCase();
};

/**
 * Checks asynchronously against Firestore if an email is authorized to access Super Admin.
 * Master Super Admin is always authorized.
 */
export const checkIsSuperAdmin = async (email?: string | null): Promise<boolean> => {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();

  // Master email has unconditional access
  if (cleanEmail === MASTER_SUPERADMIN_EMAIL.toLowerCase()) {
    return true;
  }

  try {
    const docRef = doc(db, 'super_admins', cleanEmail);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      return data.status !== 'revoked';
    }
    return false;
  } catch (error) {
    console.error('Error checking super admin authorization:', error);
    return false;
  }
};

/**
 * Add a new email to the Super Admin whitelist.
 */
export const addSuperAdminWhitelist = async (
  email: string,
  name: string = '',
  notes: string = '',
  addedByEmail: string = MASTER_SUPERADMIN_EMAIL
): Promise<void> => {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Format email tidak valid.');
  }

  if (cleanEmail === MASTER_SUPERADMIN_EMAIL.toLowerCase()) {
    throw new Error('Email ini adalah Pemilik Utama (Master Super Admin).');
  }

  const docRef = doc(db, 'super_admins', cleanEmail);
  await setDoc(docRef, {
    email: cleanEmail,
    name: name.trim() || cleanEmail.split('@')[0],
    notes: notes.trim(),
    addedBy: addedByEmail.trim().toLowerCase(),
    addedAt: new Date().toISOString(),
    status: 'active'
  });
};

/**
 * Revoke/delete a user from the Super Admin whitelist.
 */
export const removeSuperAdminWhitelist = async (email: string): Promise<void> => {
  const cleanEmail = email.trim().toLowerCase();
  if (cleanEmail === MASTER_SUPERADMIN_EMAIL.toLowerCase()) {
    throw new Error('Tidak dapat menghapus izin Pemilik Utama (Master Super Admin).');
  }

  const docRef = doc(db, 'super_admins', cleanEmail);
  await deleteDoc(docRef);
};

/**
 * Real-time listener for the list of authorized Super Admins.
 */
export const subscribeToSuperAdmins = (
  callback: (admins: AuthorizedSuperAdmin[]) => void
) => {
  const q = query(collection(db, 'super_admins'), orderBy('addedAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: AuthorizedSuperAdmin[] = snapshot.docs.map((d) => ({
        ...(d.data() as AuthorizedSuperAdmin),
        email: d.id
      }));

      // Always prepend the Master Owner
      const masterRecord: AuthorizedSuperAdmin = {
        email: MASTER_SUPERADMIN_EMAIL,
        name: 'Muhammad Fajar, S.Pd',
        notes: 'Pemilik Sistem & Pengembang Utama (Root Authority)',
        addedBy: 'SYSTEM (ROOT)',
        addedAt: '2026-01-01T00:00:00.000Z',
        status: 'active',
        isMaster: true
      };

      callback([masterRecord, ...list]);
    },
    (error) => {
      console.error('Error fetching super admin whitelist:', error);
      // Even if firestore errors, Master is always returned
      callback([
        {
          email: MASTER_SUPERADMIN_EMAIL,
          name: 'Muhammad Fajar, S.Pd',
          notes: 'Pemilik Sistem (Root Authority)',
          addedBy: 'SYSTEM (ROOT)',
          addedAt: '2026-01-01T00:00:00.000Z',
          status: 'active',
          isMaster: true
        }
      ]);
    }
  );
};
