import { ArrowLeft, Ban, FileText, Mail, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { api, useAdminProducts, useAdminSettings, useApi, useOrder, useResellers } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { QtyStepper } from '../../components/controls';
import { FLOW, PaymentPill, StatusPill, TrackingBar } from '../../components/orderBits';
import { PaymentIcon } from '../../components/PaymentIcon';
import { Button, Card, ErrorNote, EuroInput, Field, Input, Pill, Select, Skeleton } from '../../components/ui';
import { eur, parseEuro } from '../../domain/money';
import { orderTotals, unitPrice } from '../../domain/pricing';
import { formatRome, romeDateKey } from '../../domain/romeTime';
import { PAYMENT_KINDS, type Order, type PaymentKind } from '../../domain/types';
import { useBands, useDocumentTitle, useLang } from '../../lib/hooks';
import { toast } from '../../store/toasts';
import { OrderLines, OrderTotals } from '../shop/OrderPage';

interface DraftLine { productId: string; qty: number; price: string; vatPercent: number }

/** Edit an order before it ships: quantities, prices, products, shipping fee, payment method. */
function OrderEditor({ order, onDone }: { order: Order; onDone: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const products = useAdminProducts();
  const settings = useAdminSettings();
  const edit = useApi(api.editOrder);
  const [lines, setLines] = useState<DraftLine[]>(order.lines.map((l) => ({ productId: l.productId, qty: l.qty, price: (l.unitCents / 100).toFixed(2), vatPercent: l.vatPercent })));
  const [ship, setShip] = useState((order.shippingCents / 100).toFixed(2));
  const [methodId, setMethodId] = useState(order.paymentMethodId);
  const [addId, setAddId] = useState('');
  const { bands, min } = useBands();
  if (products.isLoading || settings.isLoading) return <Skeleton className="h-64" />;

  const pById = new Map(products.data!.map((p) => [p.id, p]));
  const vatOf = (id: string) => settings.data!.vatRates.find((v) => v.id === pById.get(id)?.vatRateId)?.percent ?? 22;
  const shipC = parseEuro(ship);
  const bad = lines.some((l) => parseEuro(l.price) === null) || shipC === null || !lines.length;
  const totals = orderTotals(lines.map((l) => ({ netCents: (parseEuro(l.price) ?? 0) * l.qty, vatPercent: l.vatPercent })), shipC ?? 0);
  const upd = (i: number, patch: Partial<DraftLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addable = products.data!.filter((p) => p.active && !lines.some((l) => l.productId === p.id));

  const save = async () => {
    if (bad) return;
    await edit.mutateAsync([order.id, { lines: lines.map((l) => ({ productId: l.productId, qty: l.qty, unitCents: parseEuro(l.price)! })), shippingCents: shipC!, paymentMethodId: methodId }]);
    toast({ title: t('admin.edit.saved'), body: t('admin.edit.savedBody'), tone: 'ok' });
    onDone();
  };

  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[.06em] text-muted">
              <th className="py-2 pr-3 font-medium">{t('order.item')}</th>
              <th className="py-2 pr-3 font-medium">{t('order.cases')}</th>
              <th className="py-2 pr-3 font-medium">{t('admin.edit.unitPrice')}</th>
              <th className="py-2 pr-3 text-right font-medium">{t('order.line')}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const p = pById.get(l.productId);
              const cents = parseEuro(l.price);
              return (
                <tr key={l.productId} className="border-b border-line">
                  <td className="py-2 pr-3">{p?.name[lang] ?? l.productId} <span className="text-muted">· {l.vatPercent}%</span></td>
                  <td className="py-2 pr-3"><QtyStepper value={l.qty} min={1} max={9999} onChange={(v) => upd(i, { qty: v })} label={t('order.cases')} /></td>
                  <td className="py-2 pr-3"><EuroInput value={l.price} onChange={(v) => upd(i, { price: v })} invalid={cents === null} /></td>
                  <td className="num py-2 pr-3 text-right">{cents === null ? '—' : eur(cents * l.qty, lang)}</td>
                  <td className="py-2 text-right">
                    <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={lines.length === 1} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-bad disabled:opacity-30" aria-label={t('common.remove')}>
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Field label={t('admin.edit.addProduct')} htmlFor="edit-add">
          <Select id="edit-add" value={addId} onChange={(e) => setAddId(e.target.value)} className="!h-9 w-64">
            <option value="">{t('apply.choose')}</option>
            {addable.map((p) => <option key={p.id} value={p.id}>{p.name[lang]} · {eur(p.tiers[0], lang)}</option>)}
          </Select>
        </Field>
        <Button
          variant="ghost"
          disabled={!addId}
          onClick={() => {
            const p = pById.get(addId)!;
            setLines([...lines, { productId: p.id, qty: min, price: (unitPrice(p, min, undefined, bands).unitCents / 100).toFixed(2), vatPercent: vatOf(p.id) }]);
            setAddId('');
          }}
        >
          <Plus className="size-4" /> {t('admin.edit.add')}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('admin.edit.shipping')} htmlFor="edit-ship"><EuroInput id="edit-ship" value={ship} onChange={setShip} invalid={shipC === null} /></Field>
        <Field label={t('cart.payWith')} htmlFor="edit-pm">
          <Select id="edit-pm" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
            {settings.data!.paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name[lang]}{m.enabled ? '' : ` (${t('admin.settings.off')})`}</option>)}
          </Select>
        </Field>
      </div>

      <dl className="ml-auto grid w-full max-w-sm gap-1.5 rounded-xl border border-line bg-canvas p-4 text-sm">
        <div className="flex justify-between"><dt>{t('cart.subtotal')}</dt><dd className="num">{eur(totals.subtotalCents, lang)}</dd></div>
        <div className="flex justify-between"><dt>{t('admin.edit.shipping')}</dt><dd className="num">{eur(totals.shippingCents, lang)}</dd></div>
        {totals.vat.map((r) => <div key={r.percent} className="flex justify-between text-muted"><dt>{t('cart.vatRow', { p: r.percent, base: eur(r.baseCents, lang) })}</dt><dd className="num">{eur(r.vatCents, lang)}</dd></div>)}
        <div className="mt-1 flex justify-between border-t border-line pt-2 font-bold"><dt>{t('admin.edit.newTotal')}</dt><dd className="num">{eur(totals.totalCents, lang)}</dd></div>
        <p className="text-xs text-muted">{t('admin.edit.was', { total: eur(order.totalCents, lang) })}</p>
      </dl>

      {edit.error && <ErrorNote><ApiErrorMessage error={edit.error} /></ErrorNote>}
      <p className="text-[13px] text-muted">{t('admin.edit.note')}</p>
      <div className="flex gap-2">
        <Button onClick={save} disabled={bad} loading={edit.isPending}>{t('admin.edit.save')}</Button>
        <Button variant="quiet" onClick={onDone}>{t('common.cancel')}</Button>
      </div>
    </div>
  );
}

/** Record a manual payment: method, date, amount and the transaction / reference number (PAY-04). */
function PaymentForm({ order, onDone }: { order: Order; onDone: () => void }) {
  const { t } = useTranslation();
  const settings = useAdminSettings();
  const markPaid = useApi(api.markPaid);
  const defaultKind = settings.data?.paymentMethods.find((m) => m.id === order.paymentMethodId)?.kind ?? 'bank';
  const due = order.totalCents - order.payments.reduce((a, p) => a + p.amountCents, 0);
  const [f, setF] = useState({ kind: defaultKind as PaymentKind, receivedOn: romeDateKey(), amount: (Math.max(0, due) / 100).toFixed(2), reference: '', note: '' });
  const [tried, setTried] = useState(false);
  const cents = parseEuro(f.amount);
  const refMissing = !f.reference.trim();
  return (
    <form
      className="grid gap-3 rounded-xl border border-line bg-canvas p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setTried(true);
        if (cents === null || cents <= 0 || refMissing) return;
        const rec = await markPaid.mutateAsync([order.id, { kind: f.kind, receivedOn: f.receivedOn, amountCents: cents, reference: f.reference.trim(), note: f.note.trim() }]);
        toast({ title: t('admin.paidSaved'), body: t('receipt.created', { n: rec.receiptNumber }), tone: 'ok', action: { label: t('receipt.view'), to: `/receipt/${order.id}/${rec.id}` } });
        onDone();
      }}
    >
      <Field label={t('admin.pay.method')} htmlFor="p-kind">
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5" role="radiogroup" id="p-kind">
          {PAYMENT_KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => setF({ ...f, kind: k })} className={`flex h-9 items-center justify-center gap-1.5 rounded-lg border text-[13px] transition-colors ${f.kind === k ? 'border-primary bg-primary text-primary-ink' : 'border-line-strong bg-surface hover:bg-surface-2'}`}>
              <PaymentIcon kind={k} className="size-3.5" /> {t(`admin.pay.kind.${k}`)}
            </button>
          ))}
        </div>
      </Field>
      <Field label={t('admin.pay.reference')} htmlFor="p-ref" error={tried && refMissing ? t('admin.pay.referenceRequired') : undefined} hint={t(`admin.pay.refHint.${f.kind}`)}>
        <Input id="p-ref" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} invalid={tried && refMissing} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('admin.receivedOn')} htmlFor="p-date"><Input id="p-date" type="date" value={f.receivedOn} onChange={(e) => setF({ ...f, receivedOn: e.target.value })} /></Field>
        <Field label={t('admin.amount')} htmlFor="p-amt"><EuroInput id="p-amt" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} invalid={cents === null || cents <= 0} /></Field>
      </div>
      <Field label={t('admin.note')} htmlFor="p-note"><Input id="p-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      {markPaid.error && <ErrorNote><ApiErrorMessage error={markPaid.error} /></ErrorNote>}
      <div className="flex gap-2"><Button type="submit" size="sm" loading={markPaid.isPending}>{t('common.save')}</Button><Button type="button" size="sm" variant="quiet" onClick={onDone}>{t('common.cancel')}</Button></div>
    </form>
  );
}

export function AdminOrderPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const { id = '' } = useParams();
  const order = useOrder(id);
  const resellers = useResellers();
  const setStatus = useApi(api.setOrderStatus);
  const resend = useApi(api.resendInvoice);
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  useDocumentTitle(order.data?.number);

  if (order.isLoading) return <Skeleton className="h-96" />;
  if (!order.data) return <ErrorNote><ApiErrorMessage error={order.error} /></ErrorNote>;
  const o = order.data;
  const buyer = resellers.data?.find((u) => u.id === o.userId);
  const nextStatus = o.status === 'cancelled' ? null : FLOW[FLOW.indexOf(o.status) + 1] ?? null;
  const editable = o.status === 'received' || o.status === 'confirmed';
  const error = setStatus.error ?? resend.error;

  return (
    <div className="grid gap-5">
      <Link to="/admin/orders" className="inline-flex items-center gap-1.5 justify-self-start text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> {t('admin.nav.orders')}</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="num text-[26px] font-bold tracking-tight">{o.number}</h1>
          <StatusPill status={o.status} />
          <PaymentPill status={o.paymentStatus} />
          {o.editedAt && <Pill tone="muted">{t('admin.edit.edited', { when: formatRome(o.editedAt, lang) })}</Pill>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/invoice/${o.id}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2"><FileText className="size-4" /> {t('order.invoice')} {o.invoiceNumber}</Link>
          {o.payments.map((p) => (
            <Link key={p.id} to={`/receipt/${o.id}/${p.id}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2"><Receipt className="size-4" /> {t('receipt.short')} {p.receiptNumber}</Link>
          ))}
          <Button variant="ghost" loading={resend.isPending} onClick={async () => { await resend.mutateAsync([o.id]); toast({ title: t('admin.resent'), tone: 'ok' }); }}><Mail className="size-4" /> {t('admin.resend')}</Button>
        </div>
      </div>
      {!!error && <ErrorNote><ApiErrorMessage error={error} /></ErrorNote>}
      <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="grid gap-6 p-5">
          {o.status !== 'cancelled' && <TrackingBar order={o} />}
          {!editing && (
            <div className="flex flex-wrap gap-2">
              {nextStatus && <Button loading={setStatus.isPending} onClick={() => setStatus.mutate([o.id, nextStatus])}>{t(`admin.next.${nextStatus}`)}</Button>}
              {editable && <Button variant="ghost" onClick={() => setEditing(true)}><Pencil className="size-4" /> {t('admin.edit.button')}</Button>}
              {o.status !== 'cancelled' && o.status !== 'delivered' && !confirmCancel && <Button variant="danger" onClick={() => setConfirmCancel(true)}><Ban className="size-4" /> {t('admin.cancelOrder')}</Button>}
              {confirmCancel && (
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-bad">{t('admin.cancelConfirm')}</span>
                  <Button size="sm" variant="danger" onClick={() => { setStatus.mutate([o.id, 'cancelled']); setConfirmCancel(false); }}>{t('admin.cancelYes')}</Button>
                  <Button size="sm" variant="quiet" onClick={() => setConfirmCancel(false)}>{t('common.cancel')}</Button>
                </span>
              )}
            </div>
          )}
          {editing ? (
            <OrderEditor order={o} onDone={() => setEditing(false)} />
          ) : (
            <>
              <OrderLines order={o} />
              <OrderTotals order={o} />
            </>
          )}
          {!editable && o.status !== 'cancelled' && <p className="text-[13px] text-muted">{t('admin.edit.locked')}</p>}
        </Card>
        <div className="grid gap-5">
          <Card className="grid gap-2 p-5 text-sm">
            <h2 className="font-medium">{t('admin.reseller')}</h2>
            <p><b className="font-medium">{o.businessName}</b><br />{o.address}<br /><span className="text-muted">{o.cityName}{o.zoneName ? ` › ${o.zoneName}` : ''}</span></p>
            {buyer && <p className="text-muted">{buyer.fullName} · {buyer.email} · +39 {buyer.mobile}<br />P.IVA {buyer.vatNumber} · SDI/PEC {buyer.sdiOrPec}</p>}
            <p className="text-muted">{t('order.placed')}: {formatRome(o.placedAt, lang)}</p>
          </Card>
          <Card className="grid gap-3 p-5 text-sm">
            <div className="flex items-center justify-between"><h2 className="font-medium">{t('admin.payment')}</h2><PaymentPill status={o.paymentStatus} /></div>
            <p className="text-muted">{t('admin.pay.chosen')}: {o.paymentMethodName[lang]} · {eur(o.totalCents, lang)}</p>
            {o.payments.map((p) => (
              <div key={p.id} className="grid gap-2 rounded-xl border border-line bg-canvas p-3">
                <div className="flex items-center justify-between gap-2">
                  <b className="num flex items-center gap-1.5 font-medium"><PaymentIcon kind={p.kind} className="size-3.5" /> {eur(p.amountCents, lang)} · {t(`admin.pay.kind.${p.kind}`)}</b>
                  <Link to={`/receipt/${o.id}/${p.id}`} className="inline-flex items-center gap-1 text-[13px] font-medium underline underline-offset-4"><Receipt className="size-3.5" /> {p.receiptNumber}</Link>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
                  <dt className="text-muted">{t('admin.pay.reference')}</dt><dd className="num font-medium">{p.reference || '—'}</dd>
                  <dt className="text-muted">{t('admin.receivedOn')}</dt><dd>{p.receivedOn}</dd>
                  {p.note && <><dt className="text-muted">{t('admin.note')}</dt><dd>{p.note}</dd></>}
                  <dt className="text-muted">{t('receipt.recordedByShort')}</dt><dd>{p.recordedBy} · {formatRome(p.recordedAt, lang)}</dd>
                </dl>
              </div>
            ))}
            {o.paymentStatus === 'partial' && <p className="text-[13px] text-warn">{t('admin.pay.stillDue', { x: eur(o.totalCents - o.payments.reduce((a, p) => a + p.amountCents, 0), lang) })}</p>}
            {o.paymentStatus !== 'paid' && !paying && <Button variant="ghost" className="justify-self-start" onClick={() => setPaying(true)}>{o.payments.length ? t('admin.pay.update') : t('admin.markPaid')}</Button>}
            {paying && <PaymentForm order={o} onDone={() => setPaying(false)} />}
          </Card>
        </div>
      </div>
    </div>
  );
}
