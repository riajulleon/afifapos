/** Lower-case, accents removed: "Caffè" → "caffe". Used by every search box (PRD-01). */
export const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Also ignores spaces and hyphens, so "af202601482" matches "AF-2026-01482" (ORD-02). */
export const compact = (s: string) => norm(s).replace(/[\s\-/]/g, '');
