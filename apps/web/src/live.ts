import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

export function useDexieLive<T>(querier: () => Promise<T>, initial: T): T {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const subscription = liveQuery(querier).subscribe({ next: setValue, error: console.error });
    return () => subscription.unsubscribe();
  }, [querier]);
  return value;
}
