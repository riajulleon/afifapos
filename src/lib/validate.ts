// Field rules for the reseller application (AUTH-03). Each returns an i18n error key, or null when valid.

export const MAX_UPLOAD = 10 * 1024 * 1024;
export const UPLOAD_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
];
export const UPLOAD_ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png';

export const onlyDigits = (s: string) => s.replace(/\D/g, '');

/** Strips +39 / 0039 and spaces; returns the national number. */
export function normalizeMobile(s: string): string {
  return onlyDigits(s).replace(/^(0039|39)(?=3\d{8,9}$)/, '');
}

export const rules = {
  required: (v: string) => (v.trim() ? null : 'v.required'),
  email: (v: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? null : 'v.email'),
  mobile: (v: string) => (/^3\d{8,9}$/.test(normalizeMobile(v)) ? null : 'v.mobile'),
  password: (v: string) => (v.length >= 10 ? null : 'v.password'),
  vatNumber: (v: string) => (/^(IT)?\d{11}$/i.test(v.replace(/\s/g, '')) ? null : 'v.vatNumber'),
  fiscalCode: (v: string) => (/^([A-Z0-9]{16}|\d{11})$/i.test(v.replace(/\s/g, '')) ? null : 'v.fiscalCode'),
  sdiOrPec: (v: string) => (/^[A-Z0-9]{7}$/i.test(v.trim()) || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? null : 'v.sdiOrPec'),
  file: (f: File | null) => (!f ? 'v.fileRequired' : f.size > MAX_UPLOAD ? 'v.fileSize' : UPLOAD_TYPES.includes(f.type) ? null : 'v.fileType'),
};

export function formatBytes(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}
