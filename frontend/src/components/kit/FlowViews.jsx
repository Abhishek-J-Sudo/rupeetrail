import { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { formatINR } from '@/lib/money';
import { countUp, stagger } from '@/theme/motion';
import { cn } from '@/lib/utils';

// Other ways to read "where it went" beside the Sankey: a treemap, a donut and ranked bars.
// Each takes spendItems() from lib/flow.js: the Sankey's outflows without the balancing "Left
// in account" row, since that money didn't go anywhere. Pointing at a piece highlights it and
// shows its share, like the Sankey.

const share = (amount, total) => (total > 0 ? Math.max(1, Math.round((amount / total) * 100)) : 0);
// Category colours are `rgb(... / 1)` strings; a tint for tile and track backgrounds
const tint = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

// ---------- Treemap ----------

// Squarified treemap: fills rows along the shorter side while that keeps tiles closer to square.
function squarify(items, rect) {
  const out = [];
  const sum = (row) => row.reduce((s, r) => s + r.area, 0);
  const worst = (row, side) => {
    const s = sum(row);
    const areas = row.map((r) => r.area);
    return Math.max((side * side * Math.max(...areas)) / (s * s), (s * s) / (side * side * Math.min(...areas)));
  };
  const place = (row, r) => {
    const s = sum(row);
    if (r.w >= r.h) {
      const w = s / r.h;
      let y = r.y;
      row.forEach((it) => {
        out.push({ ...it, x: r.x, y, w, h: it.area / w });
        y += it.area / w;
      });
      return { x: r.x + w, y: r.y, w: r.w - w, h: r.h };
    }
    const h = s / r.w;
    let x = r.x;
    row.forEach((it) => {
      out.push({ ...it, x, y: r.y, w: it.area / h, h });
      x += it.area / h;
    });
    return { x: r.x, y: r.y + h, w: r.w, h: r.h - h };
  };

  let r = rect;
  let row = [];
  for (const item of items) {
    const side = Math.min(r.w, r.h);
    if (!row.length || worst([...row, item], side) <= worst(row, side)) row.push(item);
    else {
      r = place(row, r);
      row = [item];
    }
  }
  if (row.length) place(row, r);
  return out;
}

export function FlowTreemap({ items }) {
  const ref = useRef(null);
  const width = useWidth(ref);
  const [focus, setFocus] = useState(null);
  const height = width < 600 ? 320 : 420;
  const total = items.reduce((s, i) => s + i.amount, 0);
  const tiles =
    width > 0 && total > 0
      ? squarify(
          items.map((i) => ({ ...i, area: (i.amount / total) * width * height })),
          { x: 0, y: 0, w: width, h: height }
        )
      : [];
  const delay = stagger(tiles.length);

  return (
    <div ref={ref} className="relative w-full" style={{ height }} role="img" aria-label="Where the money went, as boxes sized by amount">
      {tiles.map((t, i) => {
        const roomy = t.w > 96 && t.h > 56;
        const tiny = t.w < 44 || t.h < 26;
        return (
          <motion.div
            key={t.key}
            className="absolute p-[3px]"
            style={{ left: t.x, top: t.y, width: t.w, height: t.h }}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: focus && focus !== t.key ? 0.45 : 1, scale: 1 }}
            transition={{ ...countUp, delay: focus ? 0 : i * delay }}
            onPointerEnter={() => setFocus(t.key)}
            onPointerLeave={() => setFocus(null)}
          >
            <div
              className="flex h-full flex-col justify-between overflow-hidden rounded-[8px] border-l-[3px] px-2.5 py-2 transition-[background-color] duration-base"
              style={{ borderColor: t.color, backgroundColor: tint(t.color, focus === t.key ? 34 : 20) }}
              title={`${t.label}: ${formatINR(t.amount)} (${share(t.amount, total)}%)`}
            >
              {!tiny && (
                <>
                  <span className="truncate text-[12px] font-semibold leading-tight text-ink">{t.label}</span>
                  {roomy && (
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-display text-[15px] font-semibold text-ink">{formatINR(t.amount)}</span>
                      <span className="text-[11px] tabular-nums text-ink-muted">{share(t.amount, total)}%</span>
                    </span>
                  )}
                </>
              )}
            </div>
          </motion.div>
        );
      })}
      <Legend items={items} total={total} srOnly />
    </div>
  );
}

// ---------- Donut ----------

const R = 80;
const STROKE = 26;
const CIRC = 2 * Math.PI * R;
const GAP = 2; // px of track between segments

export function FlowDonut({ items }) {
  const [focus, setFocus] = useState(null);
  const total = items.reduce((s, i) => s + i.amount, 0);
  const focused = items.find((i) => i.key === focus);
  const segments = items.reduce((list, i) => {
    const start = list.length ? list[list.length - 1].end : 0;
    const len = total > 0 ? (i.amount / total) * CIRC : 0;
    return [...list, { ...i, start, end: start + len, len: Math.max(len - GAP, 0.5) }];
  }, []);
  const delay = stagger(segments.length);

  return (
    <div className="grid items-center gap-6 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:gap-10 md:px-6">
      <div className="relative mx-auto aspect-square w-full max-w-[300px]">
        <svg viewBox="0 0 220 220" className="block size-full -rotate-90" role="img" aria-label="Where the money went, as a ring">
          <circle cx="110" cy="110" r={R} fill="none" className="stroke-track" strokeWidth={STROKE} />
          {segments.map((s, i) => (
            <motion.circle
              key={s.key}
              cx="110"
              cy="110"
              r={R}
              fill="none"
              style={{ stroke: s.color, transition: 'stroke-width var(--rt-dur-base) var(--rt-ease-out), opacity var(--rt-dur-base)' }}
              strokeWidth={focus === s.key ? STROKE + 8 : STROKE}
              opacity={focus && focus !== s.key ? 0.35 : 1}
              strokeDashoffset={-s.start}
              initial={{ strokeDasharray: `0 ${CIRC}` }}
              animate={{ strokeDasharray: `${s.len} ${CIRC - s.len}` }}
              transition={{ ...countUp, duration: 0.7, delay: i * delay }}
              onPointerEnter={() => setFocus(s.key)}
              onPointerLeave={() => setFocus(null)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="max-w-[60%] truncate font-mono text-[11px] uppercase tracking-[0.06em] text-ink-faint">
            {focused ? focused.label : 'Total out'}
          </span>
          <span className="font-display text-2xl font-semibold tracking-tight text-ink">
            {formatINR(focused ? focused.amount : total)}
          </span>
          {focused && <span className="text-xs text-ink-muted">{share(focused.amount, total)}% of the total</span>}
        </div>
      </div>
      <Legend items={items} total={total} focus={focus} onFocus={setFocus} />
    </div>
  );
}

// ---------- Ranked bars ----------

export function FlowBars({ items }) {
  const [focus, setFocus] = useState(null);
  const total = items.reduce((s, i) => s + i.amount, 0);
  const max = items[0]?.amount || 1;
  const delay = stagger(items.length);

  return (
    <ul className="flex flex-col gap-1 md:px-6" aria-label="Where the money went, biggest first">
      {items.map((i, n) => (
        <li
          key={i.key}
          onPointerEnter={() => setFocus(i.key)}
          onPointerLeave={() => setFocus(null)}
          className={cn(
            'grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-control px-2 py-2 transition-[background-color,opacity] duration-base sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_7.5rem]',
            focus === i.key && 'bg-surface-2',
            focus && focus !== i.key && 'opacity-50'
          )}
        >
          <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: i.color }} aria-hidden="true" />
            <span className="truncate">{i.label}</span>
          </span>
          <span className="h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: tint(i.color, 14) }} aria-hidden="true">
            <motion.span
              className="block h-full origin-left rounded-full"
              style={{ width: `${(i.amount / max) * 100}%`, backgroundColor: i.color }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ ...countUp, delay: n * delay }}
            />
          </span>
          <span className="flex items-baseline justify-end gap-2 tabular-nums">
            <span className="text-xs text-ink-faint">{share(i.amount, total)}%</span>
            <span className="text-sm font-semibold text-ink">{formatINR(i.amount)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------- Legend (donut; screen-reader text for the treemap) ----------

function Legend({ items, total, focus, onFocus, srOnly = false }) {
  return (
    <ul className={srOnly ? 'sr-only' : 'flex flex-col divide-y divide-line/60'}>
      {items.map((i) => (
        <li
          key={i.key}
          onPointerEnter={onFocus && (() => onFocus(i.key))}
          onPointerLeave={onFocus && (() => onFocus(null))}
          className={cn(
            'flex items-center justify-between gap-3 py-2 text-sm transition-opacity duration-base',
            focus && focus !== i.key && 'opacity-40'
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: i.color }} aria-hidden="true" />
            <span className={cn('truncate text-ink', focus === i.key && 'font-semibold')}>{i.label}</span>
          </span>
          <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
            <span className="text-xs text-ink-faint">{share(i.amount, total)}%</span>
            <span className="font-semibold text-ink">{formatINR(i.amount)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
