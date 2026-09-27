import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/mockServer';

/** API field names → the label the person saw on the form. */
const FIELD_LABELS: Record<string, string> = {
  fullName: 'apply.fullName', businessName: 'apply.businessName', address: 'apply.address', cityId: 'apply.city',
  zoneId: 'apply.zone', email: 'apply.email', mobile: 'apply.mobile', vatNumber: 'apply.vatNumber',
  fiscalCode: 'apply.fiscalCode', sdiOrPec: 'apply.sdiOrPec', password: 'auth.password',
};

/** Turns an API error code into a sentence that says what went wrong and what to do. */
export function ApiErrorMessage({ error }: { error: unknown }) {
  const { t, i18n } = useTranslation();
  if (error instanceof ApiError) {
    const key = `errors.${error.code}`;
    const params = { ...error.params };
    if (typeof params.field === 'string' && FIELD_LABELS[params.field]) params.field = t(FIELD_LABELS[params.field]);
    if (i18n.exists(key)) return <>{t(key, params)}</>;
  }
  return <>{t('errors.generic')}</>;
}
