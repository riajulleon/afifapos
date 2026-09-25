import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { api, queryClient, useCities, useMe } from '../../api/queries';
import { LangSwitch, ThemeToggle } from '../../components/controls';
import { Button, Card, PageHeader } from '../../components/ui';
import { useDocumentTitle } from '../../lib/hooks';

export function AccountPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('nav.account'));
  const me = useMe();
  const cities = useCities();
  const navigate = useNavigate();
  const u = me.data;
  if (!u) return null;
  const city = cities.data?.find((c) => c.id === u.cityId);
  const zone = city?.zones.find((z) => z.id === u.zoneId);
  const rows: [string, string][] = [
    [t('apply.fullName'), u.fullName],
    [t('apply.businessName'), u.businessName],
    [t('apply.address'), `${u.address}${city ? ` · ${city.name}` : ''}${zone ? ` › ${zone.name}` : ''}`],
    [t('apply.email'), u.email],
    [t('apply.mobile'), `+39 ${u.mobile}`],
    [t('apply.vatNumber'), u.vatNumber],
    [t('apply.fiscalCode'), u.fiscalCode],
    [t('apply.sdiOrPec'), u.sdiOrPec],
  ];
  return (
    <div className="grid max-w-3xl gap-5">
      <PageHeader title={t('nav.account')} />
      <Card className="p-6">
        <h2 className="mb-4 font-medium">{t('account.business')}</h2>
        <dl className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[180px_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[13px] text-muted">{t('account.changeNote')}</p>
      </Card>
      <Card className="grid gap-4 p-6">
        <h2 className="font-medium">{t('account.appearance')}</h2>
        <div className="flex items-center justify-between gap-4 text-sm"><span>{t('account.language')}</span><LangSwitch /></div>
        <div className="flex items-center justify-between gap-4 text-sm"><span>{t('account.theme')}</span><ThemeToggle /></div>
      </Card>
      <Button
        variant="ghost"
        className="justify-self-start"
        onClick={async () => {
          await api.logout();
          queryClient.clear();
          navigate('/login');
        }}
      >
        <LogOut className="size-4" /> {t('nav.signOut')}
      </Button>
    </div>
  );
}
