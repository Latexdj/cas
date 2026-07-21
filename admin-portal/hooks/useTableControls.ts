import { useMemo, useState } from 'react';

type SortDir = 'asc' | 'desc' | null;

export function useTableControls<T extends object>(
  data: T[],
  defaultPageSize: number | 'all' = 20,
) {
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(defaultPageSize);
  const [sortKey,  setSortKey]  = useState<string | null>(null);
  const [sortDir,  setSortDir]  = useState<SortDir>(null);

  function handleSort(key: string) {
    if (sortKey === key) {
      if (sortDir === 'asc')       setSortDir('desc');
      else                         { setSortKey(null); setSortDir(null); }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  }

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return data;
    return [...data].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      const an = parseFloat(as);
      const bn = parseFloat(bs);
      const cmp = !isNaN(an) && !isNaN(bn) ? an - bn : as < bs ? -1 : as > bs ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const total       = sorted.length;
  const displayRows = pageSize === 'all'
    ? sorted
    : sorted.slice((page - 1) * (pageSize as number), page * (pageSize as number));

  return {
    page, setPage,
    pageSize, setPageSize,
    sortKey, sortDir, handleSort,
    displayRows, total,
  };
}
