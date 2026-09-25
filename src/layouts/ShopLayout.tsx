import clsx from 'clsx';
import { ArrowRight, ClipboardList, Flame, House, LayoutGrid, LogOut, Search, ShieldCheck, ShoppingCart, User } from 'lucide-react';
import { motion, useAnimationControls } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { api, useMe } from '../api/queries';
import { Brand } from '../components/Brand';
import { Countdown, LangSwitch, ThemeToggle } from '../components/controls';
import { discountPct, useSale } from '../lib/hooks';
import { cartCount, useCart } from '../store/cart';
import { queryClient } from '../api/queries';

function useCartBadge() {
  const count = useCart((s) => cartCount(s.items));
  const controls = useAnimationControls();
  const prev = useRef(count);
  useEffect(() => {
    if (count > prev.current) void controls.start({ scale: [1, 1.35, 1], transition: { type: 'spring', stiffness: 420, damping: 14 } });
    prev.current = count;
  }, [count, controls]);
  return { count, controls };
}

function SaleBar() {
  const { t } = useTranslation();
  const { live, window, now, productById } = useSale();
  if (!live.length) return null;
  const maxPct = Math.max(...live.map((d) => discountPct(productById.get(d.productId)?.tiers[0] ?? d.priceCents, d.priceCents)));
  return (
    <div className="inv no-print flex items-center justify-center gap-2.5 px-4 py-2 text-[13px] font-medium">
      <Flame className="size-4" aria-hidden />
      <span className="hidden sm:inline">{t('sale.bar', { pct: maxPct })}</span>
      <span className="sm:hidden">{t('sale.nav')}</span>
      <Countdown to={window.end} now={now} size="inline" />
      <Link to="/sale" className="ml-1 inline-flex items-center gap-1 underline underline-offset-4">
        {t('sale.shopShort')} <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}

const navLink = ({ isActive }: { isActive: boolean }) =>
  clsx('inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors', isActive ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg');

function AccountMenu() {
  const { t } = useTranslation();
  const me = useMe();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const initials = (me.data?.fullName ?? '?').split(' ').map((w) => w[0]).slice(0, 2).join('');
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={t('nav.account')} className="grid size-8 place-items-center rounded-full bg-surface-2 text-xs font-bold text-fg ring-1 ring-line transition hover:ring-line-strong">
        {initials}
      </button>
      {open && (
        <motion.div initial={{ opacity: 0, scale: 0.96, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.18 }} className="absolute right-0 top-10 z-40 grid w-60 origin-top-right gap-0.5 rounded-xl border border-line bg-surface p-1.5 shadow-3">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium">{me.data?.businessName}</p>
            <p className="truncate text-xs text-muted">{me.data?.email}</p>
          </div>
          <MenuLink to="/orders" icon={<ClipboardList className="size-4" />} label={t('nav.orders')} onClick={() => setOpen(false)} />
          <MenuLink to="/account" icon={<User className="size-4" />} label={t('nav.account')} onClick={() => setOpen(false)} />
          {me.data?.role !== 'reseller' && <MenuLink to="/admin" icon={<ShieldCheck className="size-4" />} label={t('nav.admin')} onClick={() => setOpen(false)} />}
          <button
            type="button"
            className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-muted hover:bg-surface-2 hover:text-fg"
            onClick={async () => {
              await api.logout();
              queryClient.clear();
              navigate('/login');
            }}
          >
            <LogOut className="size-4" /> {t('nav.signOut')}
          </button>
        </motion.div>
      )}
    </div>
  );
}

function MenuLink({ to, icon, label, onClick }: { to: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Link to={to} onClick={onClick} className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm hover:bg-surface-2">
      {icon} {label}
    </Link>
  );
}

function SearchBox() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      className="hidden h-9 max-w-sm flex-1 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-sm text-muted focus-within:border-fg focus-within:ring-[3px] focus-within:ring-[var(--ring)] lg:flex"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(`/catalog?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('catalog.search')} aria-label={t('catalog.search')} className="w-full bg-transparent text-fg outline-none placeholder:text-muted" />
    </form>
  );
}

export function ShopLayout() {
  const { t } = useTranslation();
  const { live } = useSale(5000);
  const { count, controls } = useCartBadge();
  const location = useLocation();

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <SaleBar />
      <header className="no-print sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-4 px-4 sm:px-6">
          <Link to="/" aria-label="Home">
            <Brand />
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            <NavLink to="/" end className={navLink}>
              <House className="size-4" /> {t('nav.home')}
            </NavLink>
            <NavLink to="/catalog" className={navLink}>
              <LayoutGrid className="size-4" /> {t('nav.catalog')}
            </NavLink>
            <NavLink to="/sale" className={({ isActive }) => clsx('inv inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-sm font-bold', isActive && 'ring-2 ring-[var(--ring)] ring-offset-2 ring-offset-[var(--bg)]')}>
              {live.length > 0 ? <span className="live-dot" aria-hidden /> : <Flame className="size-3.5" aria-hidden />}
              {t('sale.nav')}
            </NavLink>
            <NavLink to="/orders" className={navLink}>
              <ClipboardList className="size-4" /> {t('nav.orders')}
            </NavLink>
          </nav>
          <div className="flex-1" />
          <SearchBox />
          <div className="flex items-center gap-2">
            <LangSwitch className="hidden sm:inline-flex" />
            <ThemeToggle />
            <Link to="/cart" aria-label={`${t('nav.cart')} (${count})`} className="relative hidden h-8 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium transition-colors hover:bg-surface-2 md:inline-flex">
              <ShoppingCart className="size-4" aria-hidden /> {t('nav.cart')}
              {count > 0 && (
                <motion.span animate={controls} className="num absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full border-2 border-surface bg-inv-bg px-1 text-[11px] font-bold text-inv-fg">
                  {count}
                </motion.span>
              )}
            </Link>
            <AccountMenu />
          </div>
        </div>
      </header>

      <motion.main key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }} className="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-28 pt-6 sm:px-6 md:pb-16">
        <Outlet />
      </motion.main>

      {/* Phone tab bar with Sale in the middle (spec §05). */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom,0px)] md:hidden" aria-label="Tabs">
        {[
          { to: '/', icon: House, label: t('nav.home'), end: true },
          { to: '/catalog', icon: LayoutGrid, label: t('nav.catalog') },
          { to: '/sale', icon: Flame, label: t('sale.tab') },
          { to: '/cart', icon: ShoppingCart, label: t('nav.cart'), badge: count },
          { to: '/account', icon: User, label: t('nav.account') },
        ].map(({ to, icon: Icon, label, end, badge }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => clsx('relative grid justify-items-center gap-0.5 py-2 text-[10.5px]', isActive ? 'font-bold text-fg' : 'text-muted')}>
            <Icon className="size-5" aria-hidden />
            {label}
            {!!badge && <span className="num absolute left-1/2 top-1 ml-2 grid h-4 min-w-4 place-items-center rounded-full bg-inv-bg px-1 text-[10px] font-bold text-inv-fg">{badge}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
