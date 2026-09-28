import clsx from 'clsx';
import { Copy, KeyRound, Plus, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { api, useApi, useMe, useRoles, useStaffUsers } from '../../api/queries';
import type { StaffInput } from '../../api/mockServer';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { Button, Card, ErrorNote, Field, Input, PageHeader, Pill, Select, Skeleton } from '../../components/ui';
import { PERMISSIONS, type Lang, type Permission, type StaffRole, type User } from '../../domain/types';
import { useDocumentTitle } from '../../lib/hooks';
import { toast } from '../../store/toasts';

/** Permission groups as shown in the role editor (ROLE-01). */
const GROUPS: { key: string; perms: Permission[] }[] = [
  { key: 'orders', perms: ['orders.view', 'orders.edit', 'orders.status', 'orders.cancel', 'orders.export', 'payments.record'] },
  { key: 'resellers', perms: ['resellers.view', 'resellers.create', 'resellers.edit', 'resellers.approve', 'resellers.delete', 'resellers.import'] },
  { key: 'catalog', perms: ['products.view', 'products.edit', 'categories.edit', 'deals.edit'] },
  { key: 'sales', perms: ['pos.use', 'pos.discount', 'reports.view', 'commissions.manage'] },
  { key: 'settings', perms: ['rules.edit', 'settings.edit', 'email.manage'] },
  { key: 'system', perms: ['users.manage', 'audit.view'] },
];

/* ---------- users ---------- */

function UserForm({ user, roles, onDone }: { user?: User; roles: StaffRole[]; onDone: () => void }) {
  const { t } = useTranslation();
  const save = useApi(api.saveStaffUser);
  const [f, setF] = useState<StaffInput>({ id: user?.id, fullName: user?.fullName ?? '', email: user?.email ?? '', mobile: user?.mobile ?? '', roleId: user?.roleId ?? 'manager', lang: user?.lang ?? 'it', password: '', commissionPct: user?.commissionPct ?? null });
  const [rate, setRate] = useState(user?.commissionPct !== undefined ? String(user.commissionPct).replace('.', ',') : '');
  const rateN = rate.trim() === '' ? null : Number(rate.replace(',', '.'));
  const rateBad = rateN !== null && !(rateN >= 0 && rateN <= 50);
  const set = <K extends keyof StaffInput>(k: K, v: StaffInput[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="grid gap-4 rounded-xl border border-line bg-canvas p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (rateBad) return;
        await save.mutateAsync([{ ...f, password: f.password || undefined, commissionPct: rateN }]);
        toast({ title: user ? t('staff.saved') : t('staff.created', { name: f.fullName }), tone: 'ok' });
        onDone();
      }}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={t('apply.fullName')} htmlFor="su-name"><Input id="su-name" value={f.fullName} onChange={(e) => set('fullName', e.target.value)} required /></Field>
        <Field label={t('apply.email')} htmlFor="su-email"><Input id="su-email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} required /></Field>
        <Field label={t('apply.mobile')} htmlFor="su-mob"><Input id="su-mob" inputMode="tel" value={f.mobile} onChange={(e) => set('mobile', e.target.value)} /></Field>
        <Field label={t('staff.role')} htmlFor="su-role">
          <Select id="su-role" value={f.roleId} onChange={(e) => set('roleId', e.target.value)}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label={t('account.language')} htmlFor="su-lang">
          <Select id="su-lang" value={f.lang} onChange={(e) => set('lang', e.target.value as Lang)}>
            <option value="it">Italiano</option>
            <option value="en">English</option>
          </Select>
        </Field>
        <Field label={user ? t('staff.newPassword') : t('staff.password')} htmlFor="su-pw" hint={t('staff.passwordHint')}>
          <Input id="su-pw" type="password" autoComplete="new-password" value={f.password} onChange={(e) => set('password', e.target.value)} required={!user} minLength={10} />
        </Field>
        <Field label={t('team.rateLabel')} htmlFor="su-rate" hint={t('team.rateHint')} error={rateBad ? t('team.rateBad') : undefined}>
          <Input id="su-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={t('team.rateDefault')} invalid={rateBad} />
        </Field>
      </div>
      {save.error && <ErrorNote><ApiErrorMessage error={save.error} /></ErrorNote>}
      <div className="flex gap-2"><Button type="submit" loading={save.isPending}>{user ? t('common.save') : t('staff.create')}</Button><Button type="button" variant="quiet" onClick={onDone}>{t('common.cancel')}</Button></div>
    </form>
  );
}

function UsersTab() {
  const { t } = useTranslation();
  const users = useStaffUsers();
  const roles = useRoles();
  const me = useMe();
  const setActive = useApi(api.setStaffActive);
  const del = useApi(api.deleteStaffUser);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  if (users.isLoading || roles.isLoading) return <Skeleton className="h-64" />;
  const roleName = (id?: string) => roles.data?.find((r) => r.id === id)?.name ?? '—';
  const error = setActive.error ?? del.error;
  return (
    <div className="grid gap-4">
      <div className="flex justify-end">{editing === null && <Button onClick={() => setEditing('new')}><UserPlus className="size-4" /> {t('staff.add')}</Button>}</div>
      {editing === 'new' && <UserForm roles={roles.data!} onDone={() => setEditing(null)} />}
      {error && <ErrorNote><ApiErrorMessage error={error} /></ErrorNote>}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-1">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[.06em] text-muted">
              <th className="px-4 py-2.5 font-medium">{t('apply.fullName')}</th>
              <th className="px-4 py-2.5 font-medium">{t('staff.role')}</th>
              <th className="px-4 py-2.5 font-medium">{t('admin.stateCol')}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {users.data!.map((u) => (
              <tr key={u.id} className="border-t border-line align-top">
                <td className="px-4 py-3">
                  <b className="font-medium">{u.fullName}</b>{u.id === me.data?.id && <span className="ml-1.5 text-xs text-muted">({t('staff.you')})</span>}
                  <br /><span className="text-muted">{u.email}{u.mobile ? ` · +39 ${u.mobile}` : ''}</span>
                  {editing === u.id && <div className="mt-3"><UserForm user={u} roles={roles.data!} onDone={() => setEditing(null)} /></div>}
                </td>
                <td className="px-4 py-3">{roleName(u.roleId)}</td>
                <td className="px-4 py-3"><Pill tone={u.state === 'approved' ? 'ok' : 'muted'}>{u.state === 'approved' ? t('staff.active') : t('staff.inactive')}</Pill></td>
                <td className="px-4 py-3 text-right">
                  {editing !== u.id && (
                    <span className="inline-flex flex-wrap justify-end gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(u.id)}>{t('common.edit')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setActive.mutate([u.id, u.state !== 'approved'])}>{u.state === 'approved' ? t('staff.deactivate') : t('staff.reactivate')}</Button>
                      <Button size="sm" variant="danger" onClick={() => del.mutate([u.id])} aria-label={t('common.remove')}><Trash2 className="size-4" /></Button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[13px] text-muted">{t('staff.note')}</p>
    </div>
  );
}

/* ---------- roles ---------- */

function RoleEditor({ role, onDone }: { role: StaffRole; onDone: () => void }) {
  const { t } = useTranslation();
  const save = useApi(api.saveRole);
  const [name, setName] = useState(role.name);
  const [perms, setPerms] = useState<Set<Permission>>(new Set(role.permissions));
  const readOnly = role.builtIn;
  const toggle = (p: Permission) => setPerms((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  return (
    <Card className="grid gap-4 p-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('staff.roleName')} htmlFor="role-name"><Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} className="w-64" /></Field>
        {readOnly && <p className="pb-2 text-[13px] text-muted">{t('staff.builtInNote')}</p>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {GROUPS.map((g) => (
          <fieldset key={g.key} className="grid content-start gap-2 rounded-xl border border-line p-4">
            <legend className="px-1 text-[11.5px] font-medium uppercase tracking-[.08em] text-muted">{t(`perm.group.${g.key}`)}</legend>
            {g.perms.map((p) => (
              <label key={p} className={clsx('flex items-start gap-2.5 text-sm', readOnly && 'opacity-80')}>
                <input type="checkbox" checked={perms.has(p)} onChange={() => toggle(p)} disabled={readOnly} className="mt-1 size-4 accent-[var(--primary)]" />
                <span>{t(`perm.${p.replace('.', '_')}`)}<br /><code className="text-[11px] text-muted">{p}</code></span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      {save.error && <ErrorNote><ApiErrorMessage error={save.error} /></ErrorNote>}
      <div className="flex gap-2">
        {!readOnly && <Button loading={save.isPending} disabled={!name.trim()} onClick={async () => { await save.mutateAsync([{ ...role, name: name.trim(), permissions: PERMISSIONS.filter((p) => perms.has(p)) }]); toast({ title: t('staff.roleSaved'), tone: 'ok' }); onDone(); }}>{t('common.save')}</Button>}
        <Button variant="quiet" onClick={onDone}>{readOnly ? t('common.close') : t('common.cancel')}</Button>
      </div>
    </Card>
  );
}

function RolesTab() {
  const { t } = useTranslation();
  const roles = useRoles();
  const users = useStaffUsers();
  const del = useApi(api.deleteRole);
  const [open, setOpen] = useState<StaffRole | null>(null);
  if (roles.isLoading) return <Skeleton className="h-64" />;
  const count = (id: string) => users.data?.filter((u) => u.roleId === id).length ?? 0;
  if (open) return <RoleEditor key={open.id} role={open} onDone={() => setOpen(null)} />;
  return (
    <div className="grid gap-4">
      <div className="flex justify-end"><Button onClick={() => setOpen({ id: '', name: '', builtIn: false, permissions: ['orders.view', 'products.view'] })}><Plus className="size-4" /> {t('staff.newRole')}</Button></div>
      {del.error && <ErrorNote><ApiErrorMessage error={del.error} /></ErrorNote>}
      <div className="grid gap-3 md:grid-cols-2">
        {roles.data!.map((r) => (
          <Card key={r.id} className="grid gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <b className="flex items-center gap-2 font-medium"><KeyRound className="size-4 text-muted" /> {r.name}</b>
              {r.builtIn ? <Pill tone="muted">{t('staff.builtIn')}</Pill> : <Pill tone="info">{t('staff.custom')}</Pill>}
            </div>
            <p className="text-[13px] text-muted">{t('staff.roleSummary', { p: r.permissions.length, total: PERMISSIONS.length, u: count(r.id) })}</p>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setOpen(r)}>{r.builtIn ? t('staff.viewRole') : t('common.edit')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen({ ...r, id: '', builtIn: false, name: t('staff.copyOf', { name: r.name }) })}><Copy className="size-4" /> {t('staff.copy')}</Button>
              {!r.builtIn && <Button size="sm" variant="danger" onClick={() => del.mutate([r.id])}><Trash2 className="size-4" /> {t('common.remove')}</Button>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function StaffPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('admin.nav.users'));
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'roles' ? 'roles' : 'users';
  return (
    <div className="grid gap-5">
      <PageHeader title={t('admin.nav.users')} sub={t('staff.sub')} />
      <div className="flex gap-1 border-b border-line" role="tablist">
        {(['users', 'roles'] as const).map((x) => (
          <button key={x} role="tab" type="button" aria-selected={tab === x} onClick={() => setParams(x === 'users' ? {} : { tab: x }, { replace: true })} className={clsx('-mb-px h-10 border-b-2 px-3 text-sm transition-colors', tab === x ? 'border-fg font-medium text-fg' : 'border-transparent text-muted hover:text-fg')}>
            {t(`staff.tab.${x}`)}
          </button>
        ))}
      </div>
      {tab === 'users' ? <UsersTab /> : <RolesTab />}
    </div>
  );
}
