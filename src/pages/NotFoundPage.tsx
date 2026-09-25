import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="grid justify-items-center gap-3 text-center">
        <p className="num text-5xl font-bold">404</p>
        <p className="text-muted">{t('errors.notFoundPage')}</p>
        <Link to="/" className="text-sm font-medium underline underline-offset-4">{t('nav.home')}</Link>
      </div>
    </div>
  );
}
