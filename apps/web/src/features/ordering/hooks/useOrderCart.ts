import { useCallback, useState } from "react";

const MAX_PER_DISH = 20;

/** The dishes a guest has picked so far: dish id to quantity. */
export function useOrderCart() {
  const [cart, setCart] = useState<Record<string, number>>({});

  const setQty = useCallback((id: string, qty: number) => {
    setCart((current) => {
      const next = { ...current };
      if (qty <= 0) delete next[id];
      else next[id] = Math.min(qty, MAX_PER_DISH);
      return next;
    });
  }, []);

  const clear = useCallback(() => setCart({}), []);
  const count = Object.values(cart).reduce((sum, q) => sum + q, 0);

  return { cart, setQty, clear, count };
}

export type OrderCart = ReturnType<typeof useOrderCart>;
