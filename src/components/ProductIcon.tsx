import { Bean, Croissant, CupSoda, Droplet, Leaf, Package, Soup, Sun, Wheat, type LucideProps } from 'lucide-react';
import type { CategoryId } from '../domain/types';

const byName = { wheat: Wheat, droplet: Droplet, bean: Bean, sun: Sun, soup: Soup, leaf: Leaf, croissant: Croissant, package: Package, 'cup-soda': CupSoda };

/** Line-icon stand-in for product photos until the catalog has images. */
export function ProductIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = byName[name as keyof typeof byName] ?? Package;
  return <Icon strokeWidth={1.25} aria-hidden {...props} />;
}

export const categoryIcon: Record<CategoryId, string> = {
  grain: 'wheat',
  oil: 'droplet',
  spice: 'leaf',
  flour: 'croissant',
  canned: 'package',
  drink: 'cup-soda',
};

export const categories: CategoryId[] = ['grain', 'oil', 'spice', 'flour', 'canned', 'drink'];
