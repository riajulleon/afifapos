import { usePublicSettings } from '../api/queries';
import type { SaleBanner } from '../domain/types';

/**
 * Background photo for the Today's Sale banner, faded into the banner colour so the text stays readable.
 * Desktop: the photo shows on the right and fades out towards the text on the left.
 * Phone (text covers the whole banner): an even wash over the whole photo.
 * Place inside an element with `relative isolate overflow-hidden`.
 */
export function SaleBackdropView({ banner }: { banner: SaleBanner }) {
  if (!banner.image) return null;
  return (
    <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
      <img src={banner.image} alt="" className="size-full object-cover" style={{ opacity: banner.strength }} />
      {/* Fades use the banner's own colour, so they work in the light and dark themes. */}
      <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--inv-bg)_74%,transparent)] md:hidden" />
      <div className="absolute inset-0 hidden bg-[linear-gradient(90deg,var(--inv-bg)_0%,var(--inv-bg)_30%,color-mix(in_srgb,var(--inv-bg)_55%,transparent)_58%,transparent_100%)] md:block" />
    </div>
  );
}

export function SaleBackdrop() {
  const settings = usePublicSettings();
  const banner = settings.data?.saleBanner;
  return banner ? <SaleBackdropView banner={banner} /> : null;
}
