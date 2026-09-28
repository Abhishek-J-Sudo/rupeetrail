import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Eye,
  ListFilter,
  ReceiptText,
  Search,
  X,
} from 'lucide-react';
import { useData, usePeriod } from '@/app/hooks';
import { Card, CardHeader } from '@/components/kit/Card';
import CategoryTag from '@/components/kit/CategoryTag';
import Pill from '@/components/kit/Pill';
import Segmented from '@/components/kit/Segmented';
import Select from '@/components/kit/Select';
import TransactionDialog from '@/components/transactions/TransactionDialog';
import SimilarDialog from '@/components/transactions/SimilarDialog';
import {
  bulkUpdateCategories,
  getCategories,
  getTransactions,
  toggleTransactionExclude,
  toggleTransactionSavings,
  updateTransaction,
} from '@/services/api';
import { SET_BY_OPTIONS, filterTransactions, sortTransactions, totals } from '@/lib/transactions';
import { formatINR, formatTxnAmount } from '@/lib/money';
import { spring } from '@/theme/motion';
import { cn } from '@/lib/utils';
import { payeeName } from '@/lib/payee';
import { ReviewPayeesButton } from '@/components/transactions/PayeeReviewDialog';
import { SetByMark } from '@/components/transactions/SetBy';

// Rows per page: 20 by default, 50 on request (remembered in this browser)
const PAGE_SIZES = [20, 50];
const PAGE_SIZE_KEY = 'rt-page-size';

function readPageSize() {
  try {
    const stored = Number(localStorage.getItem(PAGE_SIZE_KEY));
    return PAGE_SIZES.includes(stored) ? stored : PAGE_SIZES[0];
  } catch {
    return PAGE_SIZES[0];
  }
}
const count = (v) => Math.round(v).toLocaleString('en-IN');
const shortDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const DIRECTIONS = [
  { value: 'all', label: 'Money in & out' },
  { value: 'out', label: 'Money out' },
  { value: 'in', label: 'Money in' },
];
// Desktop columns: tick, date, merchant + narration, category, amount
const COLUMNS = 'grid-cols-[1.25rem_minmax(0,1fr)_auto] md:grid-cols-[1.25rem_4.5rem_minmax(0,1fr)_11rem_8rem]';

const fetchAll = () => Promise.all([getTransactions({ limit: 50000, include_excluded: true }), getCategories()]);

// ---------- Table pieces ----------

function SortButton({ field, sort, onSort, className, children }) {
  const active = sort.by === field;
  const Arrow = sort.order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      aria-label={`Sort by ${children}`}
      className={cn(
        'inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.06em] transition-colors duration-fast hover:text-ink',
        active ? 'text-ink' : 'text-ink-faint',
        className
      )}
    >
      {children}
      {active && <Arrow className="size-3" strokeWidth={2} aria-hidden="true" />}
    </button>
  );
}

// Category with an invisible native select on top: click the tag to change it.
function CategoryPicker({ t, categories, onChange, className }) {
  const value = t.category || 'Other';
  return (
    <label
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'group relative inline-flex min-w-0 max-w-full items-center gap-1 rounded-control px-1.5 py-1 transition-colors duration-fast focus-within:ring-2 focus-within:ring-accent hover:bg-surface-2',
        className
      )}
    >
      <span className="sr-only">Category for {payeeName(t)}</span>
      <select
        value={value}
        onChange={(e) => onChange(t, e.target.value)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <CategoryTag category={value} />
      <SetByMark t={t} />
      <ChevronDown
        className="size-3 shrink-0 text-ink-faint opacity-0 transition-opacity duration-fast group-hover:opacity-100"
        strokeWidth={2}
        aria-hidden="true"
      />
    </label>
  );
}

function Row({ t, checked, onCheck, onOpen, categories, onCategory }) {
  const excluded = t.is_excluded === 1;
  const savings = t.is_savings_transfer === 1;
  return (
    <li
      onClick={() => onOpen(t)}
      className={cn(
        'grid cursor-pointer items-center gap-x-3 px-1 py-2.5 transition-colors duration-fast hover:bg-surface-2',
        COLUMNS,
        checked && 'bg-accent-soft/60 hover:bg-accent-soft'
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onCheck(t.id)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select ${payeeName(t)}, ${shortDate(t.date)}`}
        className="size-4 cursor-pointer accent-accent"
      />
      <span className={cn('hidden font-mono text-xs text-ink-faint md:block', excluded && 'opacity-60')}>{shortDate(t.date)}</span>
      <span className={cn('flex min-w-0 flex-col', excluded && 'opacity-60')}>
        <span className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(t);
            }}
            className="truncate text-left text-sm font-semibold text-ink outline-none hover:text-accent focus-visible:underline"
          >
            {payeeName(t)}
          </button>
          {excluded && <Pill tone="neutral">Excluded</Pill>}
          {savings && <Pill tone="accent">Savings</Pill>}
        </span>
        <span className="truncate font-mono text-[11px] text-ink-faint" title={t.narration}>
          {t.narration}
        </span>
        <span className="mt-1 flex items-center gap-2 md:hidden">
          <span className="font-mono text-[11px] text-ink-faint">{shortDate(t.date)}</span>
          <CategoryPicker t={t} categories={categories} onChange={onCategory} className="-my-1" />
        </span>
      </span>
      <CategoryPicker t={t} categories={categories} onChange={onCategory} className="hidden justify-self-start md:inline-flex" />
      <span
        className={cn(
          'text-right text-sm font-semibold tabular-nums',
          t.txn_type === 'credit' ? 'text-good' : 'text-ink',
          excluded && 'text-ink-faint line-through decoration-1'
        )}
      >
        {formatTxnAmount(t)}
      </span>
    </li>
  );
}

// Shown while rows are ticked: set a category or leave them out of totals in one go.
function SelectionBar({ picked, categories, onCategory, onExclude, onClear }) {
  const names = [...new Set(picked.map(payeeName))];
  const allExcluded = picked.every((t) => t.is_excluded === 1);
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={spring}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control bg-sidebar-active px-3 py-2.5 text-sidebar-active-ink"
    >
      <span className="flex min-w-0 flex-1 items-baseline gap-2 text-sm">
        <b className="shrink-0 font-semibold">{picked.length} selected</b>
        <span className="truncate text-[13px] text-sidebar-active-ink/75">
          {names.slice(0, 3).join(' · ')}
          {names.length > 3 && ` · +${names.length - 3} more`}
        </span>
      </span>
      <label className="relative inline-flex items-center gap-1.5 rounded-control bg-sidebar-active-ink/10 px-3 py-1.5 text-[13px] font-semibold hover:bg-sidebar-active-ink/20">
        <span>Set category</span>
        <ChevronDown className="size-3.5" strokeWidth={2} aria-hidden="true" />
        <select
          value=""
          onChange={(e) => e.target.value && onCategory(picked.map((t) => t.id), e.target.value)}
          className="absolute inset-0 cursor-pointer appearance-none opacity-0"
          aria-label="Set category for selected"
        >
          <option value="" disabled>
            Set category…
          </option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => onExclude(picked, !allExcluded)}
        className="inline-flex items-center gap-1.5 rounded-control bg-sidebar-active-ink/10 px-3 py-1.5 text-[13px] font-semibold hover:bg-sidebar-active-ink/20"
      >
        {allExcluded ? <Eye className="size-3.5" strokeWidth={2} aria-hidden="true" /> : <EyeOff className="size-3.5" strokeWidth={2} aria-hidden="true" />}
        {allExcluded ? 'Count in totals' : 'Leave out of totals'}
      </button>
      <button
        type="button"
        onClick={onClear}
        className="rounded-control p-1.5 hover:bg-sidebar-active-ink/15"
        aria-label="Clear selection"
      >
        <X className="size-4" strokeWidth={2} aria-hidden="true" />
      </button>
    </motion.div>
  );
}

// ---------- Page ----------

export default function TransactionsSection() {
  const { dataVersion, refresh } = useData();
  const { inPeriod, label } = usePeriod();

  // Own copy that includes excluded rows (the shared data leaves them out)
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [direction, setDirection] = useState('all');
  const [setBy, setSetBy] = useState('all');
  const [sort, setSort] = useState({ by: 'date', order: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(readPageSize);
  const [ticked, setTicked] = useState(() => new Set());
  const [openId, setOpenId] = useState(null);
  const [offer, setOffer] = useState(null);
  const [actionError, setActionError] = useState(null);

  const applyLoaded = useCallback(([data, cats]) => {
    setRows(data);
    setCategories(cats);
    setLoadError(null);
  }, []);
  const load = useCallback(() => fetchAll().then(applyLoaded), [applyLoaded]);

  // dataVersion bumps after uploads and other outside changes
  useEffect(() => {
    let live = true;
    fetchAll()
      .then((result) => live && applyLoaded(result))
      .catch(() => live && setLoadError('Couldn’t load transactions.'));
    return () => {
      live = false;
    };
  }, [applyLoaded, dataVersion]);

  const periodRows = useMemo(() => rows.filter((t) => inPeriod(t.date)), [rows, inPeriod]);
  const filtered = useMemo(
    () => sortTransactions(filterTransactions(periodRows, { query, category, direction, setBy }), sort.by, sort.order),
    [periodRows, query, category, direction, setBy, sort]
  );
  const sums = useMemo(() => totals(filtered), [filtered]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * pageSize, current * pageSize);
  const picked = filtered.filter((t) => ticked.has(t.id));
  const pageAllTicked = shown.length > 0 && shown.every((t) => ticked.has(t.id));
  const filtersOn = query.trim() !== '' || category !== 'all' || direction !== 'all' || setBy !== 'all';
  const open = rows.find((t) => t.id === openId) || null;

  const categoryOptions = useMemo(() => {
    const present = [...new Set(periodRows.map((t) => t.category || 'Other'))].sort();
    return [{ value: 'all', label: 'All categories' }, ...present.map((c) => ({ value: c, label: c }))];
  }, [periodRows]);

  // Changing a filter starts again at page 1 with nothing ticked
  const refilter = (setter) => (value) => {
    setter(value);
    setPage(1);
    setTicked(new Set());
  };
  const setPageSize = (value) => {
    const size = Number(value);
    setPageSizeState(size);
    setPage(1);
    try {
      localStorage.setItem(PAGE_SIZE_KEY, String(size));
    } catch {
      // Storage blocked: the choice still applies for this session
    }
  };
  const clearFilters = () => {
    setQuery('');
    setCategory('all');
    setDirection('all');
    setSetBy('all');
    setPage(1);
    setTicked(new Set());
  };
  const onSort = (by) => setSort((s) => ({ by, order: s.by === by && s.order === 'desc' ? 'asc' : 'desc' }));
  const toggleTick = (id) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const tickPage = () =>
    setTicked((prev) => {
      const next = new Set(prev);
      shown.forEach((t) => (pageAllTicked ? next.delete(t.id) : next.add(t.id)));
      return next;
    });

  // Every change reloads this page's copy and the shared data the other pages use
  const afterChange = async () => {
    await load();
    refresh();
  };
  const guarded = (fn) => async (...args) => {
    setActionError(null);
    try {
      await fn(...args);
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Couldn’t save that change. Please try again.');
      throw err;
    }
  };

  const changeCategory = guarded(async (t, next) => {
    if ((t.category || 'Other') === next) return;
    const res = await updateTransaction(t.id, { category: next });
    await afterChange();
    const others = (res.similar_transactions || []).filter((s) => (s.category || 'Other') !== next);
    if (others.length) {
      setOpenId(null);
      setOffer({ merchant: payeeName(t), category: next, items: others });
    }
  });
  const bulkCategory = guarded(async (ids, next) => {
    await bulkUpdateCategories(ids, next);
    setTicked(new Set());
    await afterChange();
  });
  const setExcluded = guarded(async (list, value) => {
    await Promise.all(list.map((t) => toggleTransactionExclude(t.id, value)));
    setTicked(new Set());
    await afterChange();
  });
  const setSavings = guarded(async (t, value) => {
    await toggleTransactionSavings(t.id, value);
    await afterChange();
  });
  const quiet = (fn) => (...args) => fn(...args).catch(() => {});

  // ← → move between pages, unless typing or a dialog is open
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (openId || offer || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(1, Math.min(p, pages) - 1));
      if (e.key === 'ArrowRight') setPage((p) => Math.min(pages, p + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pages, openId, offer]);

  return (
    <>
      <div className="flex flex-col gap-4">

        <Card aria-labelledby="txn-title" className="overflow-hidden">
          <CardHeader
            band
            id="txn-title"
            title="All transactions"
            icon={ReceiptText}
            subtitle={
              `${filtersOn ? `${count(filtered.length)} of ${count(periodRows.length)} match` : `${count(periodRows.length)} in ${label}`}` +
              ` · ${formatINR(sums.moneyOut)} out · ${formatINR(sums.moneyIn)} in` +
              (sums.uncategorised ? ` · ${count(sums.uncategorised)} need a category` : '')
            }
          >
            <ReviewPayeesButton />
          </CardHeader>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="relative flex min-w-[220px] flex-1 items-center rounded-control border border-line bg-surface transition-colors duration-fast focus-within:border-accent">
              <Search className="pointer-events-none absolute left-3 size-4 text-ink-faint" strokeWidth={1.8} aria-hidden="true" />
              <span className="sr-only">Search</span>
              <input
                type="search"
                value={query}
                onChange={(e) => refilter(setQuery)(e.target.value)}
                placeholder="Search merchant, narration or amount (>2000)"
                className="w-full bg-transparent py-2 pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-ink-faint"
              />
            </label>
            <Select label="Category" icon={ListFilter} value={category} onChange={refilter(setCategory)} options={categoryOptions} className="max-w-[14rem]" />
            <Select label="Direction" value={direction} onChange={refilter(setDirection)} options={DIRECTIONS} />
            <Select label="Set by" value={setBy} onChange={refilter(setSetBy)} options={SET_BY_OPTIONS} />
            {filtersOn && (
              <button type="button" onClick={clearFilters} className="px-1.5 text-[13px] font-semibold text-accent hover:text-accent-hover">
                Clear filters
              </button>
            )}
          </div>

          <AnimatePresence initial={false}>
            {picked.length > 0 && (
              <SelectionBar
                picked={picked}
                categories={categories}
                onCategory={quiet(bulkCategory)}
                onExclude={quiet(setExcluded)}
                onClear={() => setTicked(new Set())}
              />
            )}
          </AnimatePresence>

          {(actionError || loadError) && (
            <p role="alert" className="text-sm text-bad">
              {actionError || loadError}
            </p>
          )}

          <div className="-mx-1">
            <div className={cn('grid items-center gap-x-3 border-b border-line px-1 pb-2', COLUMNS)}>
              <input
                type="checkbox"
                checked={pageAllTicked}
                onChange={tickPage}
                aria-label="Select all on this page"
                className="size-4 cursor-pointer accent-accent"
              />
              <SortButton field="date" sort={sort} onSort={onSort} className="hidden md:inline-flex">
                Date
              </SortButton>
              <span className="flex items-center gap-3">
                <SortButton field="merchant" sort={sort} onSort={onSort}>
                  Merchant
                </SortButton>
                <SortButton field="date" sort={sort} onSort={onSort} className="md:hidden">
                  Date
                </SortButton>
                <span className="hidden font-mono text-[11px] uppercase tracking-[0.06em] text-ink-faint lg:inline">· bank narration</span>
              </span>
              <span className="hidden font-mono text-[11px] uppercase tracking-[0.06em] text-ink-faint md:block">Category</span>
              <SortButton field="amount" sort={sort} onSort={onSort} className="justify-self-end">
                Amount
              </SortButton>
            </div>

            {shown.length ? (
              <ul className="divide-y divide-line">
                {shown.map((t) => (
                  <Row
                    key={t.id}
                    t={t}
                    checked={ticked.has(t.id)}
                    onCheck={toggleTick}
                    onOpen={(row) => setOpenId(row.id)}
                    categories={categories}
                    onCategory={quiet(changeCategory)}
                  />
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                <p className="font-display text-base font-semibold text-ink">
                  {rows.length ? 'Nothing matches' : 'Loading transactions…'}
                </p>
                {filtersOn && (
                  <button type="button" onClick={clearFilters} className="text-sm font-semibold text-accent hover:text-accent-hover">
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>

          {filtered.length > PAGE_SIZES[0] && (
            <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5">
              <span className="flex items-center gap-3">
                <Segmented
                  label="Rows per page"
                  options={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} rows` }))}
                  value={String(pageSize)}
                  onChange={setPageSize}
                />
                <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-ink-faint">
                {count((current - 1) * pageSize + 1)}–{count(Math.min(current * pageSize, filtered.length))} of {count(filtered.length)}
                <span className="hidden sm:inline"> · ← → keys change page</span>
                </span>
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <span className="mr-1.5 hidden text-[13px] text-ink-muted sm:inline">
                  Page {current} of {pages}
                </span>
                {[
                  { label: 'Previous page', icon: ChevronLeft, to: current - 1, disabled: current === 1 },
                  { label: 'Next page', icon: ChevronRight, to: current + 1, disabled: current === pages },
                ].map(({ label: l, icon: Icon, to, disabled }) => (
                  <button
                    key={l}
                    type="button"
                    aria-label={l}
                    disabled={disabled}
                    onClick={() => setPage(to)}
                    className="rounded-control border border-line p-1.5 text-ink transition-colors duration-fast hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
                  </button>
                ))}
              </span>
            </nav>
          )}
        </Card>
      </div>

      <TransactionDialog
        transaction={open}
        categories={categories}
        onClose={() => setOpenId(null)}
        onCategory={changeCategory}
        onExclude={setExcluded}
        onSavings={setSavings}
      />
      <SimilarDialog offer={offer} onApply={bulkCategory} onClose={() => setOffer(null)} />
    </>
  );
}
