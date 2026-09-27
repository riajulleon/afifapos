import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMe } from '../api/queries';
import type { Permission } from '../domain/types';
import { EmptyState } from './ui';

/** Page-level guard for admin routes (USR-06). The API refuses the calls anyway; this explains why the page is empty. */
export function RequirePerm({ perm, children }: { perm: Permission; children: ReactNode }) {
  const { t } = useTranslation();
  const me = useMe();
  if (me.isLoading) return null;
  if (!me.data?.permissions?.includes(perm)) {
    return <EmptyState icon={<Lock className="size-5" />} title={t('access.title')} body={t('access.body')} />;
  }
  return <>{children}</>;
}
