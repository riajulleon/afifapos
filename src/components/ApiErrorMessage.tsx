import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/mockServer';

/** Turns an API error code into a sentence that says what went wrong and what to do. */
export function ApiErrorMessage({ error }: { error: unknown }) {
  const { t, i18n } = useTranslation();
  if (error instanceof ApiError) {
    const key = `errors.${error.code}`;
    if (i18n.exists(key)) return <>{t(key, error.params)}</>;
  }
  return <>{t('errors.generic')}</>;
}
