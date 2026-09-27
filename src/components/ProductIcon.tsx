import {
  Apple, Baby, Bean, Beef, Beer, CakeSlice, Candy, Carrot, Cherry, Citrus, Coffee, Cookie, Croissant, CupSoda, Droplet,
  Drumstick, Egg, Fish, Grape, IceCreamCone, Leaf, Milk, Nut, Package, Pizza, Popcorn, Salad, Sandwich, Shell,
  ShoppingBasket, Snowflake, Soup, SprayCan, Sun, Wheat, Wine, type LucideProps,
} from 'lucide-react';
import { useCategories } from '../api/queries';
import type { Category } from '../domain/types';
import { useLang } from '../lib/hooks';

/** Built-in line icons for products and categories (CAT-02: pick one, or upload an image). */
const byName = {
  wheat: Wheat, droplet: Droplet, bean: Bean, sun: Sun, soup: Soup, leaf: Leaf, croissant: Croissant, package: Package,
  'cup-soda': CupSoda, apple: Apple, carrot: Carrot, cherry: Cherry, grape: Grape, citrus: Citrus, salad: Salad, nut: Nut,
  fish: Fish, shell: Shell, beef: Beef, drumstick: Drumstick, egg: Egg, milk: Milk, 'ice-cream': IceCreamCone,
  snowflake: Snowflake, cookie: Cookie, 'cake-slice': CakeSlice, candy: Candy, popcorn: Popcorn, pizza: Pizza,
  sandwich: Sandwich, coffee: Coffee, wine: Wine, beer: Beer, baby: Baby, 'spray-can': SprayCan, basket: ShoppingBasket,
};

export const ICON_CHOICES = Object.keys(byName);

/** Line-icon stand-in for product photos until the catalog has images. */
export function ProductIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = byName[name as keyof typeof byName] ?? Package;
  return <Icon strokeWidth={1.25} aria-hidden {...props} />;
}

/** A category's uploaded image, or its built-in icon. */
export function CategoryIcon({ category, className = 'size-[22px]' }: { category: Pick<Category, 'icon' | 'image'>; className?: string }) {
  if (category.image) return <img src={category.image} alt="" className={`${className} object-contain`} />;
  return <ProductIcon name={category.icon} className={className} strokeWidth={1.75} />;
}

/** Categories in their admin-set order, plus a name lookup in the reader's language. */
export function useCategoryList() {
  const cats = useCategories();
  const lang = useLang();
  const list = cats.data ?? [];
  const name = (id: string) => {
    const c = list.find((x) => x.id === id);
    return c ? c.name[lang] || c.name.en : id;
  };
  return { list, active: list.filter((c) => c.active), name, loading: cats.isLoading };
}
