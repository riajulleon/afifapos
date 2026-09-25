import clsx from 'clsx';
import { ChevronDown, Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, useAdminCities, useAdminSettings, useApi } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { Button, Card, ErrorNote, EuroInput, Field, Input, PageHeader, Skeleton } from '../../components/ui';
import { eur, parseEuro } from '../../domain/money';
import type { City } from '../../domain/types';
import { useDocumentTitle, useLang } from '../../lib/hooks';
import { toast } from '../../store/toasts';

const toStr = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2));
const fmt = (c: number | null) => (c === null ? 'inherit' : eur(c));

/** One city: its minimum and fee, plus zone overrides that inherit when empty (MIN-02/03, ZONE-02/03). */
function CityCard({ city, all, globalMin }: { city: City; all: City[]; globalMin: number }) {
  const { t } = useTranslation();
  const lang = useLang();
  const save = useApi(api.saveCities);
  const [open, setOpen] = useState(city.id === 'roma');
  const [min, setMin] = useState(toStr(city.minOrderCents));
  const [ship, setShip] = useState(toStr(city.shippingCents));
  const [zones, setZones] = useState(city.zones.map((z) => ({ ...z, minS: toStr(z.minOrderCents), shipS: toStr(z.shippingCents) })));
  const [newZone, setNewZone] = useState('');

  const minC = min.trim() ? parseEuro(min) : null;
  const shipC = parseEuro(ship);
  const invalid = (min.trim() !== '' && minC === null) || shipC === null || zones.some((z) => (z.minS.trim() && parseEuro(z.minS) === null) || (z.shipS.trim() && parseEuro(z.shipS) === null));
  const effMin = minC ?? globalMin;
  const effShip = shipC ?? city.shippingCents;

  const submit = async () => {
    if (invalid) return;
    const next: City = {
      ...city,
      minOrderCents: minC,
      shippingCents: shipC!,
      zones: zones.map(({ minS, shipS, ...z }) => ({ ...z, minOrderCents: minS.trim() ? parseEuro(minS) : null, shippingCents: shipS.trim() ? parseEuro(shipS) : null })),
    };
    const changes: string[] = [];
    if (next.minOrderCents !== city.minOrderCents) changes.push(`minimum ${fmt(city.minOrderCents)} → ${fmt(next.minOrderCents)}`);
    if (next.shippingCents !== city.shippingCents) changes.push(`shipping ${fmt(city.shippingCents)} → ${fmt(next.shippingCents)}`);
    next.zones.forEach((z) => {
      const before = city.zones.find((x) => x.id === z.id);
      if (!before) return changes.push(`added zone ${z.name}`);
      if (before.minOrderCents !== z.minOrderCents) changes.push(`${z.name} minimum ${fmt(before.minOrderCents)} → ${fmt(z.minOrderCents)}`);
      if (before.shippingCents !== z.shippingCents) changes.push(`${z.name} fee ${fmt(before.shippingCents)} → ${fmt(z.shippingCents)}`);
      if (before.active !== z.active) changes.push(`${z.name} ${z.active ? 'reactivated' : 'deactivated'}`);
    });
    if (!changes.length) return;
    await save.mutateAsync([all.map((c) => (c.id === city.id ? next : c)), `${city.name}: ${changes.join('; ')}`]);
    toast({ title: t('admin.rules.saved', { city: city.name }), tone: 'ok' });
  };

  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-canvas">
        <b className="flex-1 font-medium">{city.name}</b>
        <span className="num hidden text-sm text-muted sm:inline">{t('admin.rules.summary', { min: eur(effMin, lang), fee: eur(effShip, lang), n: city.zones.length })}</span>
        <ChevronDown className={clsx('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid gap-5 border-t border-line p-5">
          <div className="flex flex-wrap gap-6">
            <Field label={t('admin.rules.cityMin')} htmlFor={`min-${city.id}`} hint={minC === null ? t('admin.rules.usesGlobal', { v: eur(globalMin, lang) }) : undefined}>
              <EuroInput id={`min-${city.id}`} value={min} onChange={setMin} placeholder={(globalMin / 100).toFixed(2)} invalid={min.trim() !== '' && minC === null} />
            </Field>
            <Field label={t('admin.rules.cityFee')} htmlFor={`ship-${city.id}`} error={shipC === null ? t('v.required') : undefined}>
              <EuroInput id={`ship-${city.id}`} value={ship} onChange={setShip} invalid={shipC === null} />
            </Field>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[.06em] text-muted">
                  <th className="py-2 pr-3 font-medium">{t('apply.zone')}</th>
                  <th className="py-2 pr-3 font-medium">{t('admin.rules.zoneMin')}</th>
                  <th className="py-2 pr-3 font-medium">{t('admin.rules.zoneFee')}</th>
                  <th className="py-2 font-medium">{t('admin.rules.active')}</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((z, i) => {
                  const upd = (patch: Partial<typeof z>) => setZones(zones.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <tr key={z.id} className={clsx('border-t border-line', !z.active && 'opacity-55')}>
                      <td className="py-2 pr-3 font-medium">{z.name}</td>
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-1.5">
                          <EuroInput value={z.minS} onChange={(v) => upd({ minS: v })} placeholder={t('admin.rules.inherits', { v: (effMin / 100).toFixed(2) })} invalid={!!z.minS.trim() && parseEuro(z.minS) === null} />
                          {z.minS && <button type="button" onClick={() => upd({ minS: '' })} title={t('admin.rules.reset')} aria-label={t('admin.rules.reset')} className="text-muted hover:text-fg"><RotateCcw className="size-3.5" /></button>}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-1.5">
                          <EuroInput value={z.shipS} onChange={(v) => upd({ shipS: v })} placeholder={t('admin.rules.inherits', { v: (effShip / 100).toFixed(2) })} invalid={!!z.shipS.trim() && parseEuro(z.shipS) === null} />
                          {z.shipS && <button type="button" onClick={() => upd({ shipS: '' })} title={t('admin.rules.reset')} aria-label={t('admin.rules.reset')} className="text-muted hover:text-fg"><RotateCcw className="size-3.5" /></button>}
                          {z.shipS.trim() === '0' || z.shipS.trim() === '0.00' ? <span className="text-xs text-ok">{t('cart.free')}</span> : null}
                        </span>
                      </td>
                      <td className="py-2"><input type="checkbox" checked={z.active} onChange={(e) => upd({ active: e.target.checked })} className="size-4 accent-[var(--primary)]" aria-label={`${t('admin.rules.active')} ${z.name}`} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!newZone.trim()) return; setZones([...zones, { id: `${city.id}-${Date.now().toString(36)}`, name: newZone.trim(), minOrderCents: null, shippingCents: null, active: true, minS: '', shipS: '' }]); setNewZone(''); }}>
              <Input value={newZone} onChange={(e) => setNewZone(e.target.value)} placeholder={t('admin.rules.newZone')} className="!h-9 w-48" aria-label={t('admin.rules.newZone')} />
              <Button type="submit" size="sm" variant="ghost"><Plus className="size-4" /> {t('admin.rules.addZone')}</Button>
            </form>
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted">{t('admin.rules.inheritNote')}</p>
              <Button onClick={submit} disabled={invalid} loading={save.isPending}>{t('common.save')}</Button>
            </div>
          </div>
          {save.error && <ErrorNote><ApiErrorMessage error={save.error} /></ErrorNote>}
        </div>
      )}
    </Card>
  );
}

export function RulesPage() {
  const { t } = useTranslation();
  const lang = useLang();
  useDocumentTitle(t('admin.nav.cities'));
  const cities = useAdminCities();
  const settings = useAdminSettings();
  const saveSettings = useApi(api.updateSettings);
  const saveCities = useApi(api.saveCities);
  const [global, setGlobal] = useState<string | null>(null);
  const [newCity, setNewCity] = useState({ name: '', fee: '' });
  if (cities.isLoading || settings.isLoading) return <Skeleton className="h-96" />;
  const g = settings.data!.globalMinOrderCents;
  const gStr = global ?? (g / 100).toFixed(2);
  const gC = parseEuro(gStr);

  return (
    <div className="grid gap-5">
      <PageHeader title={t('admin.nav.cities')} sub={t('admin.rules.sub')} />
      <Card className="flex flex-wrap items-end justify-between gap-4 p-5">
        <Field label={t('admin.rules.global')} htmlFor="global-min" hint={t('admin.rules.globalHint')}>
          <EuroInput id="global-min" value={gStr} onChange={setGlobal} invalid={gC === null} />
        </Field>
        <Button
          disabled={gC === null || gC === g}
          loading={saveSettings.isPending}
          onClick={async () => {
            await saveSettings.mutateAsync([{ globalMinOrderCents: gC! }, `Global minimum ${eur(g)} → ${eur(gC!)}`]);
            setGlobal(null);
            toast({ title: t('admin.rules.globalSaved', { v: eur(gC!, lang) }), tone: 'ok' });
          }}
        >
          {t('common.save')}
        </Button>
      </Card>
      {cities.data!.map((c) => <CityCard key={JSON.stringify(c)} city={c} all={cities.data!} globalMin={g} />)}
      <Card className="p-5">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fee = parseEuro(newCity.fee);
            if (!newCity.name.trim() || fee === null) return;
            const id = newCity.name.trim().toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-');
            await saveCities.mutateAsync([[...cities.data!, { id, name: newCity.name.trim(), minOrderCents: null, shippingCents: fee, active: true, zones: [{ id: `${id}-c`, name: 'Centro', minOrderCents: null, shippingCents: null, active: true }] }], `Added city ${newCity.name.trim()} (fee ${eur(fee)})`]);
            setNewCity({ name: '', fee: '' });
          }}
        >
          <Field label={t('admin.rules.newCity')} htmlFor="nc-name"><Input id="nc-name" value={newCity.name} onChange={(e) => setNewCity({ ...newCity, name: e.target.value })} className="!h-9 w-48" /></Field>
          <Field label={t('admin.rules.cityFee')} htmlFor="nc-fee"><EuroInput id="nc-fee" value={newCity.fee} onChange={(v) => setNewCity({ ...newCity, fee: v })} /></Field>
          <Button type="submit" variant="ghost" disabled={!newCity.name.trim() || parseEuro(newCity.fee) === null}><Plus className="size-4" /> {t('admin.rules.addCity')}</Button>
        </form>
      </Card>
    </div>
  );
}
