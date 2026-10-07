'use client';

/**
 * Company Profile Store (update ASAHI — cetak/PDF).
 *
 * Identitas perusahaan (logo + nama + alamat + kontak) untuk header semua
 * dokumen cetak/PDF. Sebelumnya hardcoded COMPANY_INFO "ASAHI Books" di
 * lib/pdf-utils — sekarang diambil dari backend (Pengaturan → Profil
 * Perusahaan) dan di-cache di store ini sepanjang sesi.
 *
 * Prinsip:
 * - Fetch sekali per sesi (ensureLoaded); hasil dipakai semua tab cetak.
 * - Fail-open ke nilai default lama bila endpoint gagal (cetak tetap jalan).
 */

import { useEffect } from 'react';
import { create } from 'zustand';
import { api } from '@/lib/api';
import type { CompanyProfileResponse } from '@/types/api';

// Default = nilai lama yang dulu hardcoded di lib/pdf-utils (COMPANY_INFO),
// dipakai saat profil belum termuat / endpoint gagal.
export const COMPANY_INFO_DEFAULT = {
  name: 'ASAHI Books',
  address: 'Jalan Simpangan No.18, RT.03/RW.06, Jatireja, Kec. Cikarang Tim., Kabupaten Bekasi, Jawa Barat 17530',
  telepon: '' as string | null,
  email: '' as string | null,
  logo: '' as string | null
};

interface CompanyState {
  profile: CompanyProfileResponse | null;
  loaded: boolean;
  loading: boolean;
  /** Muat profil (sekali; force=true untuk refresh setelah edit). */
  fetch: (force?: boolean) => Promise<void>;
  /** Pastikan sudah termuat — dipanggil dari mount komponen cetak/sidebar. */
  ensureLoaded: () => void;
  /** Reset saat logout. */
  reset: () => void;
}

export const useCompanyStore = create<CompanyState>((set, get) => ({
  profile: null,
  loaded: false,
  loading: false,

  fetch: async (force = false) => {
    if (get().loading) return;
    if (get().loaded && !force) return;
    set({ loading: true });
    try {
      const res = await api.get<CompanyProfileResponse>('/master/company-profile');
      set({ profile: res, loaded: true, loading: false });
    } catch {
      // Fail-open: tandai loaded agar tidak retry terus; komponen memakai default.
      set({ loaded: true, loading: false });
    }
  },

  ensureLoaded: () => {
    if (!get().loaded && !get().loading) {
      void get().fetch();
    }
  },

  reset: () => {
    set({ profile: null, loaded: false, loading: false });
  }
}));

/** Info perusahaan ter-resolve (fallback ke default bila belum termuat). */
export interface ResolvedCompanyInfo {
  name: string;
  address: string;
  telepon: string | null;
  email: string | null;
  logo: string | null;
}

/**
 * Hook untuk komponen cetak/PDF — resolve info perusahaan + pastikan ter-fetch.
 * Selalu mengembalikan nilai (fallback default) sehingga render tidak pernah
 * menunggu network.
 */
export function useCompanyInfo(): ResolvedCompanyInfo {
  const profile = useCompanyStore((s) => s.profile);
  const ensureLoaded = useCompanyStore((s) => s.ensureLoaded);

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  return {
    name: profile?.namaPerusahaan || COMPANY_INFO_DEFAULT.name,
    address: profile?.alamat || COMPANY_INFO_DEFAULT.address,
    telepon: profile?.telepon || null,
    email: profile?.email || null,
    logo: profile?.logo || null
  };
}
