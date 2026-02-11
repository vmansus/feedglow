'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { FeedType } from '@/lib/api';

type FeedTypeSelection = FeedType | 'all';

interface FeedTypeContextValue {
  selectedType: FeedTypeSelection;
  setSelectedType: (type: FeedTypeSelection) => void;
}

const FeedTypeContext = createContext<FeedTypeContextValue>({
  selectedType: 'all',
  setSelectedType: () => {},
});

export function FeedTypeProvider({ children }: { children: ReactNode }) {
  const [selectedType, setSelectedType] = useState<FeedTypeSelection>('all');
  return (
    <FeedTypeContext.Provider value={{ selectedType, setSelectedType }}>
      {children}
    </FeedTypeContext.Provider>
  );
}

export function useFeedType() {
  return useContext(FeedTypeContext);
}
