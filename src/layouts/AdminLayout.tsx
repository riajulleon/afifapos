import clsx from 'clsx';
import { Bell, Boxes, ClipboardList, ExternalLink, Flame, History, LayoutDashboard, LogOut, MapPin, Menu, Settings, UserCheck, Users, X } from 'lucide-react';
import { AnimatePresence, motion, useAnimationControls } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { api, queryClient, useAdminOrders, useApplications, useMe } from '../api/queries';
import { subscribe } from '../api/mockServer';
import { Brand } from '../components/Brand';
import { Footer } from '../components/Footer';
import { LangSwitch, ThemeToggle } from '../components/controls';
import { eur } from '../domain/money';
import { formatRome } from '../domain/romeTime';
import { useLang } from '../lib/hooks';
import { toast } from '../store/toasts';

interface Alert { id: string; orderId: string; title: string; body: string; at: string; read: boolean }

/** New-order alerts: toast + bell + browser notification when the tab is in the background (spec §10). */
function useOrderAlerts() {
  const { t } = useTranslation();
  const lang = useLang();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const bell = useAnimationControls();
  useEffect(
    () =>
      subscribe((e) => {
        if (e.type !== 'order-placed') return;
        const title = t('admin.newOrder', { n: e.number });
        const body = `${e.business} · ${e.city} · ${eur(e.totalCents, lang)}`;
        setAlerts((a) => [{ id: `${e.orderId}-${Date.now()}`, orderId: e.orderId, title, body, at: new Date().toISOString(), read: false }, ...a].slice(0, 20));
        toast({ title, body, action: { label: t('admin.openOrder'), to: `/admin/orders/${e.orderId}` } });
        void bell.start({ rotate: [0, 14, -14, 14, -14, 4, 0], transition: { duration: 0.8 } });
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body, tag: e.orderId });
        }
      }),
    [t, lang, bell],
  );
  return { alerts, setAlerts, bell };
}

function BellMenu() {
  const { t } = useTranslation();
  const lang = useLang();
  const { alerts, setAlerts, bell } = useOrderAlerts();
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'denied'));
  const ref = useRef<HTMLDivElement>(null);
  const unread = alerts.filter((a) => !a.read).length;
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <motion.button animate={bell} type="button" onClick={() => setOpen((o) => !o)} aria-label={t('admin.alerts', { count: unread })} aria-expanded={open} className="relative grid size-8 place-items-center rounded-lg border border-line-strong bg-surface hover:bg-surface-2">
        <Bell className="size-4" />
        {unread > 0 && <span className="num absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-surface bg-inv-bg px-1 text-[10px] font-bold text-inv-fg">{unread}</span>}
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, scale: 0.96, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.18 }} className="absolute right-0 top-10 z-40 w-80 origin-top-right overflow-hidden rounded-xl border border-line bg-surface shadow-3">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <b className="text-sm font-medium">{t('admin.alertsTitle')}</b>
              {alerts.length > 0 && <button type="button" className="text-xs underline underline-offset-2" onClick={() => setAlerts((a) => a.map((x) => ({ ...x, read: true })))}>{t('admin.markRead')}</button>}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {alerts.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">{t('admin.noAlerts')}</p>}
              {alerts.map((a) => (
                <Link key={a.id} to={`/admin/orders/${a.orderId}`} onClick={() => { setOpen(false); setAlerts((all) => all.map((x) => (x.id === a.id ? { ...x, read: true } : x))); }} className="grid grid-cols-[8px_1fr] gap-3 border-b border-line px-4 py-2.5 text-[13px] last:border-0 hover:bg-canvas">
                  <span className={clsx('mt-1.5 size-2 rounded-full', a.read ? 'bg-transparent' : 'bg-fg')} />
                  <span><b className="font-medium">{a.title}</b><br /><span className="text-muted">{a.body} · {formatRome(a.at, lang).split(', ').pop()}</span></span>
                </Link>
              ))}
            </div>
            {perm === 'default' && (
              <button type="button" className="w-full border-t border-line px-4 py-2.5 text-left text-[13px] font-medium hover:bg-canvas" onClick={async () => setPerm(await Notification.requestPermission())}>
                {t('admin.enablePush')}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const apps = useApplications();
  const orders = useAdminOrders();
  const newOrders = orders.data?.filter((o) => o.status === 'received').length ?? 0;
  const item = ({ isActive }: { isActive: boolean }) => clsx('flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors', isActive ? 'bg-white/12 font-medium text-white' : 'text-[#c4c4c4] hover:bg-white/6 hover:text-white');
  const badge = (n: number) => n > 0 && <em className="num ml-auto rounded-full bg-white px-1.5 text-[10.5px] font-bold not-italic text-black">{n}</em>;
  const group = (label: string) => <p className="px-2.5 pb-1 pt-4 text-[10px] font-medium uppercase tracking-[.1em] text-[#8a8a8a]">{label}</p>;
  return (
    <nav className="grid content-start gap-0.5" aria-label="Admin" onClick={onNavigate}>
      <NavLink to="/admin" end className={item}><LayoutDashboard className="size-4" /> {t('admin.nav.overview')}</NavLink>
      <NavLink to="/admin/orders" className={item}><ClipboardList className="size-4" /> {t('admin.nav.orders')} {badge(newOrders)}</NavLink>
      <NavLink to="/admin/approvals" className={item}><UserCheck className="size-4" /> {t('admin.nav.approvals')} {badge(apps.data?.length ?? 0)}</NavLink>
      <NavLink to="/admin/resellers" className={item}><Users className="size-4" /> {t('admin.nav.resellers')}</NavLink>
      {group(t('admin.nav.catalog'))}
      <NavLink to="/admin/products" className={item}><Boxes className="size-4" /> {t('admin.nav.products')}</NavLink>
      <NavLink to="/admin/deals" className={item}><Flame className="size-4" /> {t('sale.nav')}</NavLink>
      {group(t('admin.nav.rules'))}
      <NavLink to="/admin/rules" className={item}><MapPin className="size-4" /> {t('admin.nav.cities')}</NavLink>
      {group(t('admin.nav.system'))}
      <NavLink to="/admin/settings" className={item}><Settings className="size-4" /> {t('admin.nav.settings')}</NavLink>
      <NavLink to="/admin/audit" className={item}><History className="size-4" /> {t('admin.nav.audit')}</NavLink>
    </nav>
  );
}

export function AdminLayout() {
  const { t } = useTranslation();
  const me = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const aside = 'inv flex h-full flex-col gap-2 p-3 [--inv-bg:#000] [--inv-fg:#fff] dark:[--inv-bg:#161616] dark:[--inv-fg:#ededed]';
  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[232px_1fr]">
      <aside className={clsx(aside, 'sticky top-0 hidden h-dvh lg:flex')}>
        <div className="px-2 pb-3 pt-1"><Brand sub="Admin" /></div>
        <SideNav />
      </aside>
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-black/40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
            <motion.aside className={clsx(aside, 'fixed inset-y-0 left-0 z-50 w-64 lg:hidden')} initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}>
              <div className="flex items-center justify-between px-2 pb-3 pt-1"><Brand sub="Admin" /><button type="button" onClick={() => setDrawer(false)} aria-label={t('common.close')}><X className="size-5" /></button></div>
              <SideNav onNavigate={() => setDrawer(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
      <div className="flex min-w-0 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6">
          <button type="button" className="grid size-8 place-items-center rounded-lg border border-line-strong lg:hidden" onClick={() => setDrawer(true)} aria-label={t('admin.menu')}><Menu className="size-4" /></button>
          <span className="hidden text-sm text-muted sm:inline">{new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date())} · {t('admin.romeTime')}</span>
          <div className="flex-1" />
          <Link to="/" className="hidden h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted hover:text-fg sm:inline-flex"><ExternalLink className="size-4" /> {t('admin.viewShop')}</Link>
          <LangSwitch className="hidden sm:inline-flex" />
          <ThemeToggle />
          <BellMenu />
          <button
            type="button"
            title={t('nav.signOut')}
            className="grid size-8 place-items-center rounded-full bg-surface-2 text-xs font-bold ring-1 ring-line hover:ring-line-strong"
            onClick={async () => { await api.logout(); queryClient.clear(); navigate('/login'); }}
            aria-label={t('nav.signOut')}
          >
            {me.data ? me.data.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('') : <LogOut className="size-4" />}
          </button>
        </header>
        <motion.main key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }} className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </motion.main>
        <Footer variant="admin" />
      </div>
    </div>
  );
}
