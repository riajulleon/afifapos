import { CreditCard, Landmark, Smartphone, Wallet, type LucideProps } from 'lucide-react';
import type { PaymentKind } from '../domain/types';

const icons = { bank: Landmark, paypal: Wallet, stripe: CreditCard, bkash: Smartphone, other: Wallet };

export function PaymentIcon({ kind, ...props }: { kind: PaymentKind } & LucideProps) {
  const Icon = icons[kind] ?? Wallet;
  return <Icon aria-hidden {...props} />;
}
