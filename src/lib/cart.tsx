import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type CartItem = {
  key: string;
  productId: string;
  variantId?: string | null;
  volumeMl?: number | null;
  nicotineMg?: number | null;
  flavor?: string | null;
  slug: string;
  name: string;
  priceCents: number;
  /** Prix de base du flacon seul, hors boosters (variantes e-liquide). */
  baseUnitPriceCents?: number | null;
  /** Nombre de boosters de nicotine ajoutés à ce flacon. */
  boostersCount?: number | null;
  /** Prix unitaire du booster utilisé pour calculer la ligne. */
  boosterUnitPriceCents?: number | null;
  /** Mix personnalisé (DIY) associé à cette ligne, si applicable. */
  customMixId?: string | null;
  /** Session propriétaire du mix personnalisé (revérifiée côté serveur). */
  customMixSessionId?: string | null;
  photo: string | null;
  quantity: number;
  maxStock: number;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotalCents: number;
  add: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  setQuantity: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  hydrated: boolean;
};

const STORAGE_KEY = "bnv_cart_v2";
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setItems(parsed);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items, hydrated]);

  const add: CartContextValue["add"] = useCallback((item, qty = 1) => {
    setItems((current) => {
      const existing = current.find((c) => c.key === item.key);
      const cap = item.maxStock;
      if (existing) {
        const nextQty = Math.min(existing.quantity + qty, cap);
        return current.map((c) =>
          c.key === item.key ? { ...c, quantity: nextQty } : c,
        );
      }
      return [...current, { ...item, quantity: Math.min(qty, cap) }];
    });
  }, []);

  const setQuantity: CartContextValue["setQuantity"] = useCallback(
    (key, qty) => {
      setItems((current) =>
        current
          .map((c) =>
            c.key === key
              ? { ...c, quantity: Math.max(0, Math.min(qty, c.maxStock)) }
              : c,
          )
          .filter((c) => c.quantity > 0),
      );
    },
    [],
  );

  const remove: CartContextValue["remove"] = useCallback((key) => {
    setItems((current) => current.filter((c) => c.key !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((s, i) => s + i.quantity, 0);
    const subtotalCents = items.reduce(
      (s, i) => s + i.quantity * i.priceCents,
      0,
    );
    return { items, count, subtotalCents, add, setQuantity, remove, clear, hydrated };
  }, [items, add, setQuantity, remove, clear, hydrated]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}