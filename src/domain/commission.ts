// Commission rules (COM). Pure functions, unit-tested; the API keeps the entries in step with orders.
import { roundHalfUp } from './money';
import type { CommissionEntry, CommissionSettings, Order } from './types';

/** Commission base: goods after discount, excluding VAT and shipping (COM-02). */
export const commissionBase = (o: Pick<Order, 'subtotalCents'>) => o.subtotalCents;

export const commissionAmount = (baseCents: number, pct: number) => roundHalfUp((baseCents * pct) / 100);

/** Status an order's commission should have now (`paid` is only ever set by a payout). */
export function commissionStatus(o: Pick<Order, 'status' | 'paymentStatus'>, rules: CommissionSettings): 'pending' | 'payable' | 'void' {
  if (o.status === 'cancelled') return 'void';
  const ready = rules.payableWhen === 'paid' ? o.paymentStatus === 'paid' : o.status === 'delivered';
  return ready ? 'payable' : 'pending';
}

/**
 * Brings the commission lines of one order in step with the order (COM-03). Idempotent.
 *
 * Paid lines never change, so a payout statement stays true forever. Whatever is still owed
 * (what the order earns now, minus what was already paid) sits on at most one open line:
 * edits change that line, and after a payout they become an adjustment line. A cancelled order earns
 * nothing, so anything already paid comes back as a negative line that the next payout deducts.
 * The rate and the staff member are fixed when the order is placed; changing them later only affects new orders.
 */
export function syncOrderCommission(
  o: Order,
  entries: CommissionEntry[],
  pct: number,
  rules: CommissionSettings,
  newId: () => string,
  now = new Date().toISOString(),
): { update: CommissionEntry[]; add: CommissionEntry[] } {
  const mine = entries.filter((e) => e.orderId === o.id);
  if (!o.pocId && !mine.length) return { update: [], add: [] };
  const rate = mine[0]?.pct ?? pct;
  const status = commissionStatus(o, rules);
  const earned = status === 'void' ? 0 : commissionAmount(commissionBase(o), rate);
  const paid = mine.filter((e) => e.status === 'paid').reduce((a, e) => a + e.amountCents, 0);
  const owed = earned - paid;
  // A clawback is due as soon as the order is cancelled.
  const openStatus = status === 'void' ? 'payable' : status;
  const [line, ...extra] = mine.filter((e) => e.status === 'pending' || e.status === 'payable');
  const update: CommissionEntry[] = extra.map((e) => ({ ...e, status: 'void' }));
  const add: CommissionEntry[] = [];
  if (line) {
    update.unshift(owed === 0 ? { ...line, status: 'void' } : { ...line, baseCents: commissionBase(o), amountCents: owed, status: openStatus });
  } else if (owed !== 0) {
    add.push({
      id: newId(), orderId: o.id, orderNumber: o.number, staffId: mine[0]?.staffId ?? o.pocId!, resellerId: o.userId, businessName: o.businessName,
      romeDate: o.romeDate, baseCents: commissionBase(o), pct: rate, amountCents: owed, status: openStatus, adjustment: mine.length > 0, createdAt: now,
    });
  }
  return { update, add };
}
