// shared/context/DealDrawerContext.js
// Context que expõe openDeal(id) e closeDeal() para toda a app admin.

import { createContext, useCallback, useContext, useState } from 'react';

const DealDrawerContext = createContext(null);

export function DealDrawerProvider({ children }) {
  const [dealId, setDealId] = useState(null);

  const openDeal = useCallback((id) => setDealId(id), []);
  const closeDeal = useCallback(() => setDealId(null), []);

  return (
    <DealDrawerContext.Provider value={{ dealId, openDeal, closeDeal }}>
      {children}
    </DealDrawerContext.Provider>
  );
}

export function useDealDrawer() {
  const ctx = useContext(DealDrawerContext);
  if (!ctx) throw new Error('useDealDrawer deve ser usado dentro de DealDrawerProvider');
  return ctx;
}
