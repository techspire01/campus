export const DATA_INVALIDATION_EVENT = 'campus:data-invalidation';

export type DataInvalidationScope =
  | 'staff_workload'
  | 'timetable'
  | 'classes'
  | 'tamil'
  | 'english'
  | 'subjects'
  | 'staff';

export interface DataInvalidationDetail {
  scopes: DataInvalidationScope[];
  source?: string;
  at: number;
}

export function emitDataInvalidation(scopes: DataInvalidationScope[], source?: string) {
  if (typeof window === 'undefined' || scopes.length === 0) return;

  const detail: DataInvalidationDetail = {
    scopes: Array.from(new Set(scopes)),
    source,
    at: Date.now(),
  };

  window.dispatchEvent(new CustomEvent<DataInvalidationDetail>(DATA_INVALIDATION_EVENT, { detail }));
}

export function subscribeDataInvalidation(
  listener: (detail: DataInvalidationDetail) => void
) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<DataInvalidationDetail>;
    if (customEvent.detail) {
      listener(customEvent.detail);
    }
  };

  window.addEventListener(DATA_INVALIDATION_EVENT, handler as EventListener);

  return () => {
    window.removeEventListener(DATA_INVALIDATION_EVENT, handler as EventListener);
  };
}
