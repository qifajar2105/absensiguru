import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp 
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { 
  ShieldCheck, 
  Plus, 
  Trash2, 
  Key, 
  School, 
  Users, 
  CheckCircle2, 
  XCircle, 
  Search, 
  Copy, 
  Sparkles, 
  Edit3, 
  LogOut, 
  Eye, 
  Building2, 
  Mail, 
  Calendar, 
  UserCheck, 
  ArrowUpRight, 
  X,
  AlertTriangle,
  Crown,
  ShieldAlert,
  UserPlus,
  Lock,
  Check
} from 'lucide-react';
import { ThemeLanguageToggle } from '../components/ThemeLanguageToggle';
import { translations } from '../lib/translations';
import toast from 'react-hot-toast';
import { 
  isMasterSuperAdmin, 
  MASTER_SUPERADMIN_EMAIL, 
  AuthorizedSuperAdmin, 
  subscribeToSuperAdmins, 
  addSuperAdminWhitelist, 
  removeSuperAdminWhitelist,
  checkIsSuperAdmin
} from '../lib/superAdminAuth';

interface SchoolLicense {
  id: string;
  code: string;
  name: string;
  city?: string;
  contactEmail?: string;
  active: boolean;
  maxTeachers?: number;
  validUntil?: string;
  notes?: string;
  createdAt?: any;
}

export default function SuperAdminDashboard() {
  const { userData, language, setUserData } = useStore();
  const navigate = useNavigate();
  const t = translations[language];

  const [schools, setSchools] = useState<SchoolLicense[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Super Admin Whitelist & Tab states
  const [activeTab, setActiveTab] = useState<'licenses' | 'superadmins' | 'allusers'>('licenses');
  const [authorizedAdmins, setAuthorizedAdmins] = useState<AuthorizedSuperAdmin[]>([]);
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminNotes, setNewAdminNotes] = useState('');
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [allUsersSearch, setAllUsersSearch] = useState('');
  const [allUsersRoleFilter, setAllUsersRoleFilter] = useState<'all' | 'admin' | 'teacher'>('all');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLicense, setEditingLicense] = useState<SchoolLicense | null>(null);
  const [viewingUsersSchool, setViewingUsersSchool] = useState<SchoolLicense | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    city: '',
    contactEmail: '',
    maxTeachers: 50,
    validityMonths: 12,
    active: true,
    notes: ''
  });

  // Verify super admin access and subscribe to resources
  useEffect(() => {
    let unsubscribeSuperAdmins = () => {};

    const verifyAndSubscribe = async () => {
      const userEmail = userData?.email?.trim().toLowerCase();
      const isMaster = isMasterSuperAdmin(userEmail);
      const isInitialAuthorized = isMaster || (await checkIsSuperAdmin(userEmail));

      if (!isInitialAuthorized) {
        toast.error(
          language === 'id' 
            ? 'Akses ditolak. Halaman khusus Super Admin yang berwenang.' 
            : 'Access denied. Authorized Super Admin only.'
        );
        navigate('/login');
        return;
      }

      // Subscribe to authorized superadmins in real-time
      unsubscribeSuperAdmins = subscribeToSuperAdmins((admins) => {
        setAuthorizedAdmins(admins);
        
        // Dynamic access verification
        const currentEmail = userData?.email?.trim().toLowerCase();
        if (currentEmail && !isMasterSuperAdmin(currentEmail)) {
          const isStillAuthorized = admins.some(
            a => a.email.toLowerCase() === currentEmail && a.status !== 'revoked'
          );
          if (!isStillAuthorized) {
            toast.error(
              language === 'id'
                ? 'Izin Super Admin Anda telah dicabut oleh pemilik sistem.'
                : 'Your Super Admin authorization has been revoked by the system owner.'
            );
            navigate('/login');
          }
        }
      });
    };

    verifyAndSubscribe();

    // Subscribe to licenses
    const qLicenses = query(collection(db, 'licenses'));
    const unsubscribeLicenses = onSnapshot(qLicenses, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SchoolLicense));
      setSchools(data);
    }, (error) => {
      console.error("Firestore licenses listener error:", error);
    });

    // Subscribe to users for multi-tenant analytics
    const qUsers = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllUsers(data);
    }, (error) => {
      console.error("Firestore users listener error:", error);
    });

    return () => {
      unsubscribeSuperAdmins();
      unsubscribeLicenses();
      unsubscribeUsers();
    };
  }, [userData, navigate, language]);

  // Generate random unique code helper
  const handleGenerateCode = () => {
    const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
    const prefix = formData.name 
      ? formData.name.replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase() 
      : 'SCH';
    const generated = `${prefix || 'SCH'}-${randomChars}`;
    setFormData(prev => ({ ...prev, code: generated }));
    toast.success(`${language === 'id' ? 'Kode lisensi dibuat' : 'License code generated'}: ${generated}`);
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      city: '',
      contactEmail: '',
      maxTeachers: 50,
      validityMonths: 12,
      active: true,
      notes: ''
    });
  };

  // Add new school license
  const handleAddSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code.trim() || !formData.name.trim()) return;

    // Check duplicate code
    const normalizedCode = formData.code.trim().toUpperCase();
    const existing = schools.find(s => s.code === normalizedCode);
    if (existing) {
      toast.error(language === 'id' ? 'Kode lisensi sudah digunakan!' : 'License code already exists!');
      return;
    }

    setLoading(true);
    try {
      let validUntilDate = '';
      if (formData.validityMonths > 0) {
        const d = new Date();
        d.setMonth(d.getMonth() + Number(formData.validityMonths));
        validUntilDate = d.toISOString().split('T')[0];
      } else {
        validUntilDate = 'LIFETIME';
      }

      await addDoc(collection(db, 'licenses'), {
        code: normalizedCode,
        name: formData.name.trim(),
        city: formData.city.trim() || '-',
        contactEmail: formData.contactEmail.trim() || '-',
        active: formData.active,
        maxTeachers: Number(formData.maxTeachers) || 0,
        validUntil: validUntilDate,
        notes: formData.notes.trim() || '',
        createdAt: serverTimestamp(),
      });

      toast.success(t.licenseSaved);
      resetForm();
      setShowAddModal(false);
    } catch (error: any) {
      console.error(error);
      toast.error(`${t.failed}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Update existing school license
  const handleUpdateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLicense) return;

    setLoading(true);
    try {
      await updateDoc(doc(db, 'licenses', editingLicense.id), {
        name: editingLicense.name.trim(),
        city: editingLicense.city || '-',
        contactEmail: editingLicense.contactEmail || '-',
        active: editingLicense.active,
        maxTeachers: Number(editingLicense.maxTeachers) || 0,
        validUntil: editingLicense.validUntil || 'LIFETIME',
        notes: editingLicense.notes || '',
      });

      toast.success(t.licenseUpdated);
      setEditingLicense(null);
    } catch (error: any) {
      console.error(error);
      toast.error(`${t.failed}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Toggle active / inactive status
  const handleToggleStatus = async (license: SchoolLicense) => {
    try {
      await updateDoc(doc(db, 'licenses', license.id), {
        active: !license.active
      });
      toast.success(t.statusToggled);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // Delete license
  const handleDelete = async (id: string, code: string) => {
    if (window.confirm(`${t.deleteLicenseConfirm} (${code})`)) {
      try {
        await deleteDoc(doc(db, 'licenses', id));
        toast.success(t.licenseDeleted);
      } catch (error: any) {
        toast.error(error.message);
      }
    }
  };

  // Copy code helper
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`${t.copied} (${code})`);
  };

  // Add Authorized Super Admin Handler
  const handleAddSuperAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = newAdminEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      toast.error(language === 'id' ? 'Masukkan format email Google yang valid!' : 'Enter a valid Google email address!');
      return;
    }

    if (cleanEmail === MASTER_SUPERADMIN_EMAIL.toLowerCase()) {
      toast.error(language === 'id' ? 'Email ini adalah Pemilik Utama (Root Admin).' : 'This email is already the Root Master Admin.');
      return;
    }

    setSavingAdmin(true);
    try {
      await addSuperAdminWhitelist(
        cleanEmail, 
        newAdminName.trim() || undefined, 
        newAdminNotes.trim() || undefined, 
        userData?.email || MASTER_SUPERADMIN_EMAIL
      );
      toast.success(t.superAdminAdded);
      setNewAdminEmail('');
      setNewAdminName('');
      setNewAdminNotes('');
      setShowAddAdminModal(false);
    } catch (err: any) {
      toast.error(`${t.failed}: ${err.message}`);
    } finally {
      setSavingAdmin(false);
    }
  };

  // Revoke Authorized Super Admin Handler
  const handleRevokeSuperAdmin = async (admin: AuthorizedSuperAdmin) => {
    if (admin.isMaster || admin.email.toLowerCase() === MASTER_SUPERADMIN_EMAIL.toLowerCase()) {
      toast.error(t.cannotRevokeMaster);
      return;
    }

    const confirmMsg = language === 'id'
      ? `Cabut izin akses Super Admin untuk ${admin.name || admin.email} (${admin.email})? Akun ini tidak akan bisa mengakses portal Super Admin lagi.`
      : `Revoke Super Admin access for ${admin.name || admin.email} (${admin.email})? They will immediately lose access to the Super Admin portal.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await removeSuperAdminWhitelist(admin.email);
      toast.success(t.superAdminRevoked);
    } catch (err: any) {
      toast.error(`${t.failed}: ${err.message}`);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUserData(null);
    navigate('/login');
  };

  // Filtered schools
  const filteredSchools = useMemo(() => {
    return schools.filter(s => {
      const matchSearch = 
        s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.city && s.city.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (s.contactEmail && s.contactEmail.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchStatus = 
        statusFilter === 'all' ? true :
        statusFilter === 'active' ? s.active : !s.active;

      return matchSearch && matchStatus;
    });
  }, [schools, searchQuery, statusFilter]);

  // Filtered authorized superadmins
  const filteredAdmins = useMemo(() => {
    return authorizedAdmins.filter(a => {
      const q = adminSearchQuery.toLowerCase();
      return (
        a.email.toLowerCase().includes(q) ||
        (a.name && a.name.toLowerCase().includes(q)) ||
        (a.notes && a.notes.toLowerCase().includes(q))
      );
    });
  }, [authorizedAdmins, adminSearchQuery]);

  // Filtered all system users
  const filteredAllUsers = useMemo(() => {
    return allUsers.filter(u => {
      const q = allUsersSearch.toLowerCase();
      const matchSearch = 
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.schoolCode && u.schoolCode.toLowerCase().includes(q));
      const matchRole = allUsersRoleFilter === 'all' ? true : u.role === allUsersRoleFilter;
      return matchSearch && matchRole;
    });
  }, [allUsers, allUsersSearch, allUsersRoleFilter]);

  // Statistics
  const activeCount = useMemo(() => schools.filter(s => s.active).length, [schools]);
  const inactiveCount = useMemo(() => schools.filter(s => !s.active).length, [schools]);
  
  // Calculate users per school map
  const schoolUsersMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    allUsers.forEach(u => {
      const code = u.schoolCode?.toUpperCase() || 'UNKNOWN';
      if (!map[code]) map[code] = [];
      map[code].push(u);
    });
    return map;
  }, [allUsers]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
      {/* Top Navigation Bar */}
      <header className="bg-white dark:bg-gray-900 shadow-xs border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                  {t.superAdminTitle}
                </h1>
                <span className="px-2 py-0.5 text-xs font-semibold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-full">
                  SUPER ADMIN
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {userData?.email}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Quick preview switcher */}
            <div className="hidden sm:flex items-center space-x-1.5 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
              <button
                onClick={() => navigate('/admin')}
                className="px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-colors"
                title={t.previewAdmin}
              >
                {t.previewAdmin}
              </button>
              <button
                onClick={() => navigate('/teacher')}
                className="px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-colors"
                title={t.previewTeacher}
              >
                {t.previewTeacher}
              </button>
            </div>

            <ThemeLanguageToggle />

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
              title={t.logout}
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">{t.logout}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <School className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t.statTotalSchools}</p>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white mt-0.5">{schools.length}</h3>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t.statActiveLicenses}</p>
              <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{activeCount}</h3>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t.tabSuperAdmins}</p>
              <h3 className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-0.5">{authorizedAdmins.length}</h3>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t.statTotalUsers}</p>
              <h3 className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-0.5">{allUsers.length}</h3>
            </div>
          </div>
        </div>

        {/* Main Navigation Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 space-x-1 sm:space-x-4">
          <button
            onClick={() => setActiveTab('licenses')}
            className={`pb-3.5 px-3 sm:px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'licenses'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>{t.tabLicenses}</span>
            <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
              {schools.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('superadmins')}
            className={`pb-3.5 px-3 sm:px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'superadmins'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Crown className="w-4 h-4 text-amber-500" />
            <span>{t.tabSuperAdmins}</span>
            <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              {authorizedAdmins.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('allusers')}
            className={`pb-3.5 px-3 sm:px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'allusers'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>{t.tabAllUsers}</span>
            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {allUsers.length}
            </span>
          </button>
        </div>

        {/* TAB 1: SCHOOL LICENSES */}
        {activeTab === 'licenses' && (
          <div className="space-y-6">

        {/* Action Bar & Controls */}
        <div className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-xs flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
          <div className="flex flex-1 flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchSchoolsPlaceholder}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white placeholder:text-gray-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Status Filter */}
            <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 border border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  statusFilter === 'all'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                {t.all} ({schools.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  statusFilter === 'active'
                    ? 'bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                {t.active} ({activeCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('inactive')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  statusFilter === 'inactive'
                    ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-xs'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                {t.inactive} ({inactiveCount})
              </button>
            </div>
          </div>

          {/* Add School Button */}
          <button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{t.addSchool}</span>
          </button>
        </div>

        {/* Schools License Table / Cards */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                {t.licensedSchools}
              </h2>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {filteredSchools.length} {language === 'id' ? 'sekolah terdaftar' : 'schools listed'}
            </span>
          </div>

          {filteredSchools.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                {t.noSchools}
              </p>
              <button
                onClick={() => {
                  resetForm();
                  setShowAddModal(true);
                }}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded-xl hover:bg-purple-100 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {t.addSchool}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left divide-y divide-gray-100 dark:divide-gray-800">
                <thead className="bg-gray-50/80 dark:bg-gray-800/50 text-xs uppercase font-semibold text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-6 py-3.5">{t.schoolCodeLabel}</th>
                    <th className="px-6 py-3.5">{t.schoolName}</th>
                    <th className="px-6 py-3.5">{t.cityLabel}</th>
                    <th className="px-6 py-3.5">{t.quota}</th>
                    <th className="px-6 py-3.5">{t.validUntil}</th>
                    <th className="px-6 py-3.5">{t.status}</th>
                    <th className="px-6 py-3.5 text-right">{t.action}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                  {filteredSchools.map((school) => {
                    const enrolledUsers = schoolUsersMap[school.code] || [];
                    const teacherCount = enrolledUsers.filter(u => u.role === 'teacher').length;
                    const adminCount = enrolledUsers.filter(u => u.role === 'admin').length;

                    return (
                      <tr key={school.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors">
                        {/* School Code & Copy */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm px-2.5 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-lg">
                              {school.code}
                            </span>
                            <button
                              onClick={() => handleCopyCode(school.code)}
                              className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-gray-800 rounded-md transition-colors"
                              title={t.copy}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                        {/* School Name & Email */}
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900 dark:text-white">
                            {school.name}
                          </div>
                          {school.contactEmail && school.contactEmail !== '-' && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3" />
                              {school.contactEmail}
                            </div>
                          )}
                        </td>

                        {/* City / Location */}
                        <td className="px-6 py-4 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {school.city || '-'}
                        </td>

                        {/* Quota and Enrolled */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => setViewingUsersSchool(school)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold transition-colors"
                            title={t.viewRegisteredUsers}
                          >
                            <Users className="w-3.5 h-3.5 text-blue-500" />
                            <span>{teacherCount} Guru / {adminCount} Admin</span>
                          </button>
                        </td>

                        {/* Valid Until */}
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                          {school.validUntil === 'LIFETIME' || !school.validUntil ? (
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {t.validityLifetime}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {school.validUntil}
                            </span>
                          )}
                        </td>

                        {/* Status Toggle */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleToggleStatus(school)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                              school.active
                                ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                                : 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100'
                            }`}
                            title={school.active ? 'Klik untuk nonaktifkan' : 'Klik untuk aktifkan'}
                          >
                            {school.active ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {t.active}
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3.5 h-3.5" />
                                {t.inactive}
                              </>
                            )}
                          </button>
                        </td>

                        {/* Action Buttons */}
                        <td className="px-6 py-4 whitespace-nowrap text-right space-x-1">
                          <button
                            onClick={() => setViewingUsersSchool(school)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                            title={t.viewRegisteredUsers}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingLicense(school)}
                            className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
                            title={t.edit}
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(school.id, school.code)}
                            className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title={t.delete}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )}

    {/* TAB 2: SUPER ADMIN ACCESS MANAGEMENT (WHITELIST) */}
    {activeTab === 'superadmins' && (
      <div className="space-y-6">
        {/* Security Notice Box */}
        <div className="bg-gradient-to-r from-purple-900/10 via-amber-900/10 to-purple-900/10 dark:from-purple-950/40 dark:via-amber-950/30 dark:to-purple-950/40 border border-purple-200 dark:border-purple-800/60 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-purple-600 text-white rounded-xl shadow-xs mt-0.5">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {t.securityNoticeTitle}
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                  {t.activeAccess}
                </span>
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mt-1 max-w-3xl leading-relaxed">
                {t.securityNoticeDesc}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAddAdminModal(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl shadow-xs transition-colors shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>{t.addSuperAdmin}</span>
          </button>
        </div>

        {/* Whitelist Search & Table */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-500" />
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                {t.authorizedAdminsTitle}
              </h2>
            </div>
            <div className="relative sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={adminSearchQuery}
                onChange={(e) => setAdminSearchQuery(e.target.value)}
                placeholder={language === 'id' ? 'Cari email atau nama...' : 'Search email or name...'}
                className="w-full pl-9 pr-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs dark:text-white placeholder:text-gray-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left divide-y divide-gray-100 dark:divide-gray-800">
              <thead className="bg-gray-50/80 dark:bg-gray-800/50 text-xs uppercase font-semibold text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-6 py-3.5">Administrator</th>
                  <th className="px-6 py-3.5">{t.superAdminNotesLabel}</th>
                  <th className="px-6 py-3.5">{t.status}</th>
                  <th className="px-6 py-3.5">{t.addedBy}</th>
                  <th className="px-6 py-3.5">{t.addedAt}</th>
                  <th className="px-6 py-3.5 text-right">{t.action}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                {filteredAdmins.map((admin) => {
                  const isMaster = admin.isMaster || isMasterSuperAdmin(admin.email);
                  return (
                    <tr 
                      key={admin.email} 
                      className={isMaster ? 'bg-amber-50/30 dark:bg-amber-950/10' : 'hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors'}
                    >
                      {/* Name & Email */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                            isMaster 
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 ring-2 ring-amber-400/50' 
                              : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                          }`}>
                            {isMaster ? <Crown className="w-4 h-4 text-amber-600" /> : (admin.name ? admin.name.charAt(0).toUpperCase() : 'A')}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-white">
                              <span>{admin.name || (isMaster ? 'Muhammad Fajar, S.Pd' : 'Super Admin')}</span>
                              {isMaster && (
                                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-md bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                                  {t.rootAccess}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3 text-gray-400" />
                              <span className="font-mono">{admin.email}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Notes / Designation */}
                      <td className="px-6 py-4 text-xs text-gray-600 dark:text-gray-300">
                        {admin.notes || (isMaster ? 'Pemilik Utama Sistem (Full Authority)' : '-')}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{t.activeAccess}</span>
                        </span>
                      </td>

                      {/* Added By */}
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                        {isMaster ? 'System Root' : (admin.addedBy || 'Master Admin')}
                      </td>

                      {/* Added At */}
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                        {isMaster ? 'Permanen' : (admin.createdAt ? admin.createdAt.substring(0, 10) : '-')}
                      </td>

                      {/* Action */}
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {isMaster ? (
                          <span className="text-xs font-bold text-gray-400 dark:text-gray-500 italic px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                            {t.cannotRevokeMaster}
                          </span>
                        ) : (
                          <button
                            onClick={() => handleRevokeSuperAdmin(admin)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors border border-red-200 dark:border-red-800"
                            title={t.revokeAccess}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{t.revokeAccess}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )}

    {/* TAB 3: ALL SYSTEM USERS */}
    {activeTab === 'allusers' && (
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-xs flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={allUsersSearch}
              onChange={(e) => setAllUsersSearch(e.target.value)}
              placeholder={language === 'id' ? 'Cari nama, email, atau kode sekolah...' : 'Search name, email, or school code...'}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white placeholder:text-gray-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Role filter */}
          <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 border border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setAllUsersRoleFilter('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                allUsersRoleFilter === 'all'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Semua ({allUsers.length})
            </button>
            <button
              type="button"
              onClick={() => setAllUsersRoleFilter('admin')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                allUsersRoleFilter === 'admin'
                  ? 'bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-xs'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Admin Sekolah ({allUsers.filter(u => u.role === 'admin').length})
            </button>
            <button
              type="button"
              onClick={() => setAllUsersRoleFilter('teacher')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                allUsersRoleFilter === 'teacher'
                  ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Guru ({allUsers.filter(u => u.role === 'teacher').length})
            </button>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <span>{t.tabAllUsers} ({filteredAllUsers.length})</span>
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left divide-y divide-gray-100 dark:divide-gray-800">
              <thead className="bg-gray-50/80 dark:bg-gray-800/50 text-xs uppercase font-semibold text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-6 py-3.5">Nama & Identitas</th>
                  <th className="px-6 py-3.5">Peran / Role</th>
                  <th className="px-6 py-3.5">Kode Lisensi Sekolah</th>
                  <th className="px-6 py-3.5">Terdaftar Sejak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                {filteredAllUsers.map((u) => (
                  <tr key={u.id || u.uid} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-semibold text-gray-900 dark:text-white">{u.name || 'Pengguna'}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{u.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                        u.role === 'superadmin' 
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                          : u.role === 'admin'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                      }`}>
                        {u.role === 'superadmin' ? 'Super Admin' : u.role === 'admin' ? 'Admin Sekolah' : 'Guru'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-mono font-bold text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg">
                        {u.schoolCode || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                      {u.createdAt ? u.createdAt.substring(0, 10) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )}
  </main>

      {/* MODAL: Add New School License */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 w-full max-w-xl rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  {t.addSchool}
                </h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSchool} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* School Code */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                      {t.schoolCodeLabel} *
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateCode}
                      className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      {t.generateCode}
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder={t.schoolCodeEx}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-mono font-bold dark:text-white uppercase focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* School Name */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {t.schoolName} *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t.schoolNameEx}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* City */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {t.cityLabel}
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder={t.cityEx}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Contact Email */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {t.contactEmail}
                  </label>
                  <input
                    type="email"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    placeholder={t.contactEmailEx}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Validity Period */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {t.validityLabel}
                  </label>
                  <select
                    value={formData.validityMonths}
                    onChange={(e) => setFormData({ ...formData, validityMonths: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  >
                    <option value={1}>{t.validity1Month}</option>
                    <option value={6}>{t.validity6Months}</option>
                    <option value={12}>{t.validity1Year}</option>
                    <option value={0}>{t.validityLifetime}</option>
                  </select>
                </div>

                {/* Quota Limit */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {t.maxTeachersLabel}
                  </label>
                  <select
                    value={formData.maxTeachers}
                    onChange={(e) => setFormData({ ...formData, maxTeachers: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  >
                    <option value={20}>20 Guru</option>
                    <option value={50}>50 Guru</option>
                    <option value={100}>100 Guru</option>
                    <option value={250}>250 Guru</option>
                    <option value={0}>{t.maxTeachersUnlimited}</option>
                  </select>
                </div>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="activeToggle"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="w-4 h-4 text-purple-600 rounded-sm focus:ring-purple-500"
                />
                <label htmlFor="activeToggle" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                  {formData.active ? t.active : t.inactive} (Status Lisensi)
                </label>
              </div>

              {/* Submit / Actions */}
              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs disabled:opacity-50 transition-colors"
                >
                  {loading ? t.processing : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit School License */}
      {editingLicense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 w-full max-w-xl rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center">
                  <Edit3 className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  {t.editSchool} - <span className="font-mono text-purple-600">{editingLicense.code}</span>
                </h3>
              </div>
              <button
                onClick={() => setEditingLicense(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateSchool} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t.schoolName} *
                </label>
                <input
                  type="text"
                  required
                  value={editingLicense.name}
                  onChange={(e) => setEditingLicense({ ...editingLicense, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {t.cityLabel}
                  </label>
                  <input
                    type="text"
                    value={editingLicense.city || ''}
                    onChange={(e) => setEditingLicense({ ...editingLicense, city: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {t.contactEmail}
                  </label>
                  <input
                    type="email"
                    value={editingLicense.contactEmail || ''}
                    onChange={(e) => setEditingLicense({ ...editingLicense, contactEmail: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {t.validUntil}
                  </label>
                  <input
                    type="text"
                    value={editingLicense.validUntil || 'LIFETIME'}
                    onChange={(e) => setEditingLicense({ ...editingLicense, validUntil: e.target.value })}
                    placeholder="YYYY-MM-DD atau LIFETIME"
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {t.maxTeachersLabel}
                  </label>
                  <input
                    type="number"
                    value={editingLicense.maxTeachers || 50}
                    onChange={(e) => setEditingLicense({ ...editingLicense, maxTeachers: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="editActiveToggle"
                  checked={editingLicense.active}
                  onChange={(e) => setEditingLicense({ ...editingLicense, active: e.target.checked })}
                  className="w-4 h-4 text-purple-600 rounded-sm focus:ring-purple-500"
                />
                <label htmlFor="editActiveToggle" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                  {editingLicense.active ? t.active : t.inactive} (Status Lisensi)
                </label>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setEditingLicense(null)}
                  className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs disabled:opacity-50 transition-colors"
                >
                  {loading ? t.processing : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: View Registered Users for a School */}
      {viewingUsersSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 w-full max-w-2xl rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <School className="w-5 h-5 text-purple-600" />
                  {t.registeredUsersModalTitle}: {viewingUsersSchool.name}
                </h3>
                <p className="text-xs text-purple-600 font-mono font-bold mt-0.5">
                  Kode Lisensi: {viewingUsersSchool.code}
                </p>
              </div>
              <button
                onClick={() => setViewingUsersSchool(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {(() => {
                const schoolUsers = schoolUsersMap[viewingUsersSchool.code] || [];
                if (schoolUsers.length === 0) {
                  return (
                    <div className="p-8 text-center">
                      <UserCheck className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t.noRegisteredUsersForSchool}
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {schoolUsers.map((user) => (
                      <div key={user.id} className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
                            user.role === 'admin' 
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                          }`}>
                            {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                              {user.name || 'Pengguna'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {user.email}
                            </p>
                          </div>
                        </div>

                        <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${
                          user.role === 'admin'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                        }`}>
                          {user.role === 'admin' ? 'Admin Sekolah' : 'Guru'}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 flex justify-end">
              <button
                onClick={() => setViewingUsersSchool(null)}
                className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl text-sm font-semibold"
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add / Authorize New Super Admin */}
      {showAddAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  {t.addSuperAdminModalTitle}
                </h3>
              </div>
              <button
                onClick={() => setShowAddAdminModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSuperAdmin} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                  {t.superAdminEmailLabel} *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="contoh: kolega@gmail.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white placeholder:text-gray-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  {t.superAdminEmailDesc}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                  {t.superAdminNameLabel}
                </label>
                <div className="relative">
                  <Users className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={newAdminName}
                    onChange={(e) => setNewAdminName(e.target.value)}
                    placeholder="contoh: Budi Santoso, M.Kom"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white placeholder:text-gray-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                  {t.superAdminNotesLabel}
                </label>
                <input
                  type="text"
                  value={newAdminNotes}
                  onChange={(e) => setNewAdminNotes(e.target.value)}
                  placeholder="contoh: Tim Pengembang Pusat / Auditor Dinas"
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-white placeholder:text-gray-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                <strong>Catatan Keamanan:</strong> Email yang didaftarkan akan memiliki wewenang untuk masuk ke portal Super Admin, mengelola seluruh lisensi sekolah, dan memantau akun. Izin dapat dicabut kapan saja oleh Anda.
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowAddAdminModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={savingAdmin}
                  className="px-5 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {savingAdmin ? (
                    <span>{t.processing}</span>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>{t.grantAccessBtn}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
