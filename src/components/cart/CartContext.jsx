import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const CartContext = createContext(null);
const KEY = 'aurora_cart';

export default function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(items));
  }, [items]);

  const addItem = (item) => setItems((prev) => [...prev, { ...item, cart_id: crypto.randomUUID() }]);

  const updateQuantity = (cartId, quantity) =>
    setItems((prev) =>
      prev.map((i) =>
        i.cart_id === cartId
          ? { ...i, quantity: Math.max(1, quantity), line_total: i.unit_total * Math.max(1, quantity) }
          : i
      )
    );

  const removeItem = (cartId) => setItems((prev) => prev.filter((i) => i.cart_id !== cartId));
  const clearCart = () => setItems([]);

  const subtotal = useMemo(() => items.reduce((s, i) => s + (i.line_total || 0), 0), [items]);
  const count = useMemo(() => items.reduce((s, i) => s + (i.quantity || 0), 0), [items]);
  const depositDue = useMemo(() => items.reduce((s, i) => s + (i.deposit || 0) * (i.quantity || 1), 0), [items]);
  const requiresApproval = useMemo(() => items.some((i) => i.requires_approval), [items]);

  return (
    <CartContext.Provider
      value={{ items, addItem, updateQuantity, removeItem, clearCart, subtotal, count, depositDue, requiresApproval }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);