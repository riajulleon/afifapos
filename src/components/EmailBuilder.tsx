// Block-based email editor (MAIL-03): drag blocks in from the palette or reorder them, edit in place,
// insert {{variables}} where the cursor is, and see the exact email in a live preview.
import clsx from 'clsx';
import {
  Bold, ChevronDown, ChevronUp, Copy, GripVertical, Heading, ImagePlus, Italic, Link2, List, Minus, Monitor, MousePointerClick, MoveVertical, ShoppingCart, Smartphone, Trash2, Type, Underline,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminSettings, useEmailPreviewOrder } from '../api/queries';
import { newBlockId, TEMPLATE_VARIABLES, unknownVariables } from '../domain/email';
import { eur } from '../domain/money';
import type { EmailBlock, EmailContent, EmailTrigger, Lang } from '../domain/types';
import { resizeImage } from '../lib/image';
import { sanitizeHtml } from '../lib/sanitize';
import { compose, orderVars, baseVars } from '../mock/mailer';
import { Button, Input } from './ui';

type Kind = EmailTrigger | 'campaign';
const PALETTE: EmailBlock['type'][] = ['heading', 'text', 'button', 'image', 'divider', 'spacer', 'order'];
const ICON = { heading: Heading, text: Type, button: MousePointerClick, image: ImagePlus, divider: Minus, spacer: MoveVertical, order: ShoppingCart } as const;

function newBlock(type: EmailBlock['type'], lang: Lang): EmailBlock {
  const id = newBlockId();
  switch (type) {
    case 'heading': return { id, type, text: lang === 'it' ? 'Titolo' : 'Heading' };
    case 'text': return { id, type, html: lang === 'it' ? 'Scrivi qui il testo.' : 'Write your text here.' };
    case 'button': return { id, type, label: lang === 'it' ? 'Apri' : 'Open', url: 'https://' };
    case 'image': return { id, type, src: '', alt: '', width: 536 };
    case 'spacer': return { id, type, size: 16 };
    default: return { id, type } as EmailBlock;
  }
}

/** Sample data for the preview: a real recent order, so the preview looks like the real email. */
function usePreviewVars(lang: Lang) {
  const settings = useAdminSettings();
  const order = useEmailPreviewOrder();
  return useMemo(() => {
    if (!settings.data) return null;
    const db = { settings: settings.data, templates: [] };
    const who = { fullName: 'Marco De Luca', businessName: order.data?.businessName ?? 'Bottega Sapori S.r.l.' };
    const vars: Record<string, string> = {
      ...(order.data ? orderVars(db, order.data, who, lang) : baseVars(db, who, lang)),
      amount: eur(order.data?.totalCents ?? 48210, lang), receipt_number: 'RC-2026-000123', receipt_link: `${location.origin}/receipt/demo`,
      balance: eur(0, lang), reason: lang === 'it' ? 'prodotto non più disponibile' : 'product no longer available', unsubscribe_link: `${location.origin}/account#emails`,
    };
    return { db, vars, order: order.data ?? undefined };
  }, [settings.data, order.data, lang]);
}

export function EmailPreview({ content, lang, kind, width = 600, className }: { content: EmailContent; lang: Lang; kind: Kind; width?: number; className?: string }) {
  const p = usePreviewVars(lang);
  const html = useMemo(() => (p ? compose(p.db, content, lang, p.vars, kind.startsWith('order') ? p.order : undefined) : null), [p, content, lang, kind]);
  const { t } = useTranslation();
  if (!html) return null;
  return (
    <div className={clsx('grid gap-2', className)}>
      <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px]"><span className="text-muted">{t('mail.subject')}:</span> <b className="font-medium">{html.subject}</b></div>
      <iframe title={t('mail.preview')} srcDoc={html.html} sandbox="" className="mx-auto h-[640px] w-full rounded-lg border border-line bg-white transition-[max-width] duration-300" style={{ maxWidth: width + 2 }} />
    </div>
  );
}

/** contentEditable text block with a tiny formatting bar. Output is sanitised on every change. */
function RichText({ html, onChange, onFocus }: { html: string; onChange: (h: string) => void; onFocus: (el: HTMLElement) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current && ref.current.innerHTML !== html) ref.current.innerHTML = html;
  }, [html]);
  const cmd = (c: string, v?: string) => {
    ref.current?.focus();
    document.execCommand(c, false, v);
    onChange(sanitizeHtml(ref.current?.innerHTML ?? ''));
  };
  const tools: [string, typeof Bold, () => void][] = [
    [t('mail.bold'), Bold, () => cmd('bold')], [t('mail.italic'), Italic, () => cmd('italic')], [t('mail.underline'), Underline, () => cmd('underline')],
    [t('mail.list'), List, () => cmd('insertUnorderedList')],
    [t('mail.link'), Link2, () => { const u = prompt(t('mail.linkPrompt'), 'https://'); if (u && /^(https?:|mailto:|\{\{)/i.test(u)) cmd('createLink', u); }],
  ];
  return (
    <div className="grid gap-1">
      <div className="flex gap-0.5">
        {tools.map(([label, Icon, run]) => <button key={label} type="button" onMouseDown={(e) => { e.preventDefault(); run(); }} className="grid size-7 place-items-center rounded hover:bg-surface-2" aria-label={label} title={label}><Icon className="size-3.5" /></button>)}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={t('mail.block.text')}
        onFocus={(e) => onFocus(e.currentTarget)}
        onInput={(e) => onChange(sanitizeHtml(e.currentTarget.innerHTML))}
        onBlur={(e) => onChange(sanitizeHtml(e.currentTarget.innerHTML))}
        className="min-h-16 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm leading-relaxed outline-none focus:border-fg focus:ring-[3px] focus:ring-[var(--ring)] [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5"
      />
    </div>
  );
}

export function EmailBuilder({ value, onChange, kind }: { value: Record<Lang, EmailContent>; onChange: (v: Record<Lang, EmailContent>) => void; kind: Kind }) {
  const { t } = useTranslation();
  const [lang, setLang] = useState<Lang>('en');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [drag, setDrag] = useState<{ from: number | null; type?: EmailBlock['type'] } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const focused = useRef<HTMLElement | null>(null);
  const content = value[lang];
  const set = (next: EmailContent) => onChange({ ...value, [lang]: next });
  const setBlocks = (blocks: EmailBlock[]) => set({ ...content, blocks });
  const upd = (id: string, patch: Partial<EmailBlock>) => setBlocks(content.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as EmailBlock) : b)));
  const vars = TEMPLATE_VARIABLES[kind];
  const unknown = unknownVariables(content, kind);

  const insertAt = (i: number, b: EmailBlock) => setBlocks([...content.blocks.slice(0, i), b, ...content.blocks.slice(i)]);
  const move = (from: number, to: number) => {
    const next = [...content.blocks];
    const [b] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, b);
    setBlocks(next);
  };
  const drop = (i: number) => {
    if (!drag) return;
    if (drag.type) insertAt(i, newBlock(drag.type, lang));
    else if (drag.from !== null && drag.from !== i && drag.from + 1 !== i) move(drag.from, i);
    setDrag(null);
    setOver(null);
  };

  /** Puts {{name}} at the cursor of the last field you were in (subject, heading, text, button). */
  const insertVar = (name: string) => {
    const el = focused.current;
    const token = `{{${name}}}`;
    if (!el) return;
    if (el instanceof HTMLInputElement) {
      const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? s;
      const v = el.value.slice(0, s) + token + el.value.slice(e);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
    } else {
      el.focus();
      document.execCommand('insertText', false, token);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  const track = (el: HTMLElement) => { focused.current = el; };

  const zone = (i: number) => (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(i); }}
      onDragLeave={() => setOver((o) => (o === i ? null : o))}
      onDrop={(e) => { e.preventDefault(); drop(i); }}
      className={clsx('rounded transition-all', drag ? 'h-3' : 'h-1', over === i && 'h-8 border-2 border-dashed border-fg bg-surface-2')}
      aria-hidden
    />
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-line-strong p-0.5 text-[13px]" role="tablist" aria-label={t('mail.language')}>
            {(['en', 'it'] as const).map((l) => (
              <button key={l} type="button" role="tab" aria-selected={lang === l} onClick={() => setLang(l)} className={clsx('h-7 rounded-md px-3', lang === l ? 'bg-inv-bg font-medium text-inv-fg' : 'text-muted')}>{l.toUpperCase()}</button>
            ))}
          </div>
          <Button size="sm" variant="quiet" onClick={() => onChange({ ...value, [lang]: structuredClone(value[lang === 'en' ? 'it' : 'en']) })}><Copy className="size-4" /> {t('mail.copyFrom', { l: lang === 'en' ? 'IT' : 'EN' })}</Button>
        </div>

        <label className="grid gap-1.5">
          <span className="text-[13px] font-medium text-muted">{t('mail.subject')}</span>
          <Input value={content.subject} onFocus={(e) => track(e.currentTarget)} onChange={(e) => set({ ...content, subject: e.target.value })} maxLength={200} />
        </label>

        <div className="grid gap-1.5">
          <span className="text-[13px] font-medium text-muted">{t('mail.variables')}</span>
          <div className="flex flex-wrap gap-1">
            {vars.map((v) => (
              <button key={v} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertVar(v)} className="rounded-md border border-line-strong bg-surface px-1.5 py-0.5 font-mono text-[11.5px] hover:bg-surface-2" title={t('mail.insertVar')} aria-label={`${t('mail.insertVar')}: {{${v}}}`}>{`{{${v}}}`}</button>
            ))}
          </div>
          {unknown.length > 0 && <p className="text-[12.5px] text-bad">{t('mail.unknownVars', { vars: unknown.map((v) => `{{${v}}}`).join(', ') })}</p>}
        </div>

        <div className="grid gap-1.5">
          <span className="text-[13px] font-medium text-muted">{t('mail.addBlock')}</span>
          <div className="flex flex-wrap gap-1.5">
            {PALETTE.filter((p) => p !== 'order' || kind !== 'campaign').map((type) => {
              const Icon = ICON[type];
              return (
                <button key={type} type="button" draggable onDragStart={() => setDrag({ from: null, type })} onDragEnd={() => { setDrag(null); setOver(null); }} onClick={() => setBlocks([...content.blocks, newBlock(type, lang)])}
                  className="inline-flex h-8 cursor-grab items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-2.5 text-[13px] hover:bg-surface-2 active:cursor-grabbing">
                  <Icon className="size-4" /> {t(`mail.block.${type}`)}
                </button>
              );
            })}
          </div>
          <p className="text-[12px] text-muted">{t('mail.dragHint')}</p>
        </div>

        <div className="grid rounded-xl border border-line bg-canvas p-2">
          {zone(0)}
          {content.blocks.map((b, i) => {
            const Icon = ICON[b.type];
            return (
              <div key={b.id}>
                <div
                  draggable
                  onDragStart={(e) => { if ((e.target as HTMLElement).closest('input,textarea,[contenteditable]')) { e.preventDefault(); return; } setDrag({ from: i }); }}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  className={clsx('grid gap-2 rounded-lg border bg-surface p-3 shadow-1', drag?.from === i ? 'border-fg opacity-50' : 'border-line')}
                >
                  <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
                    <GripVertical className="size-4 cursor-grab" aria-hidden />
                    <Icon className="size-3.5" /> <span className="flex-1 font-medium">{t(`mail.block.${b.type}`)}</span>
                    <button type="button" className="grid size-7 place-items-center rounded hover:bg-surface-2 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={t('admin.settings.moveUp')}><ChevronUp className="size-4" /></button>
                    <button type="button" className="grid size-7 place-items-center rounded hover:bg-surface-2 disabled:opacity-30" disabled={i === content.blocks.length - 1} onClick={() => move(i, i + 2)} aria-label={t('admin.settings.moveDown')}><ChevronDown className="size-4" /></button>
                    <button type="button" className="grid size-7 place-items-center rounded hover:bg-surface-2" onClick={() => insertAt(i + 1, { ...structuredClone(b), id: newBlockId() })} aria-label={t('mail.duplicate')}><Copy className="size-3.5" /></button>
                    <button type="button" className="grid size-7 place-items-center rounded text-bad hover:bg-bad-soft disabled:opacity-30" disabled={content.blocks.length === 1} onClick={() => setBlocks(content.blocks.filter((x) => x.id !== b.id))} aria-label={t('common.remove')}><Trash2 className="size-3.5" /></button>
                  </div>
                  {b.type === 'heading' && <Input value={b.text} onFocus={(e) => track(e.currentTarget)} onChange={(e) => upd(b.id, { text: e.target.value })} className="!h-9 font-bold" aria-label={t('mail.block.heading')} />}
                  {b.type === 'text' && <RichText html={b.html} onChange={(html) => upd(b.id, { html })} onFocus={track} />}
                  {b.type === 'button' && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input value={b.label} onFocus={(e) => track(e.currentTarget)} onChange={(e) => upd(b.id, { label: e.target.value })} className="!h-9" aria-label={t('mail.buttonLabel')} placeholder={t('mail.buttonLabel')} />
                      <Input value={b.url} onFocus={(e) => track(e.currentTarget)} onChange={(e) => upd(b.id, { url: e.target.value })} className="!h-9 font-mono text-[13px]" aria-label={t('mail.buttonUrl')} placeholder="https:// or {{order_link}}" />
                    </div>
                  )}
                  {b.type === 'image' && (
                    <div className="grid gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-surface-2">
                          <ImagePlus className="size-4" /> {b.src ? t('mail.replaceImage') : t('admin.settings.upload')}
                          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) upd(b.id, { src: await resizeImage(f, 1072, 0.82) }); }} />
                        </label>
                        {b.src && <img src={b.src} alt="" className="h-10 rounded border border-line object-cover" />}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
                        <Input value={b.alt} onChange={(e) => upd(b.id, { alt: e.target.value })} className="!h-9" placeholder={t('mail.alt')} aria-label={t('mail.alt')} />
                        <label className="flex items-center gap-2 text-[12.5px] text-muted">{t('mail.width')}<input type="range" min={120} max={536} value={b.width} onChange={(e) => upd(b.id, { width: Number(e.target.value) })} className="w-full accent-[var(--primary)]" /></label>
                      </div>
                    </div>
                  )}
                  {b.type === 'spacer' && <label className="flex items-center gap-2 text-[12.5px] text-muted">{t('mail.height', { px: b.size })}<input type="range" min={4} max={80} value={b.size} onChange={(e) => upd(b.id, { size: Number(e.target.value) })} className="w-48 accent-[var(--primary)]" /></label>}
                  {b.type === 'order' && <p className="text-[12.5px] text-muted">{t('mail.orderBlock')}</p>}
                  {b.type === 'divider' && <hr className="border-line" />}
                </div>
                {zone(i + 1)}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid content-start gap-2 xl:sticky xl:top-[72px]">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-muted">{t('mail.preview')} · {lang.toUpperCase()}</span>
          <div className="flex rounded-lg border border-line-strong p-0.5" role="group" aria-label={t('mail.device')}>
            <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')} className={clsx('grid h-7 w-8 place-items-center rounded-md', device === 'desktop' ? 'bg-inv-bg text-inv-fg' : 'text-muted')} aria-label={t('mail.desktop')}><Monitor className="size-4" /></button>
            <button type="button" aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')} className={clsx('grid h-7 w-8 place-items-center rounded-md', device === 'mobile' ? 'bg-inv-bg text-inv-fg' : 'text-muted')} aria-label={t('mail.mobile')}><Smartphone className="size-4" /></button>
          </div>
        </div>
        <EmailPreview content={content} lang={lang} kind={kind} width={device === 'mobile' ? 375 : 640} />
      </div>
    </div>
  );
}
