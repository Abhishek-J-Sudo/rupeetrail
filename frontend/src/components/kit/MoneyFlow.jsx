import { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { formatINR } from '@/lib/money';
import { countUp, stagger } from '@/theme/motion';

// A three-column Sankey: money in (sources) → one total bar → where it went (outflows).
// Both sides must add up to the same total; the caller adds "From balance" / "Left in
// account" to balance them (mark those `muted` for a fainter ribbon).
// Items: { key, label, amount, color, muted? } where color is any CSS
// colour, e.g. categoryColor('Groceries'), so the chart follows the theme without re-reading tokens.
// Pointing at a ribbon or a node highlights that path, fades the rest and shows its share of
// the total in the label over the middle bar.

const BAR = 10;
const PAD_TOP = 26; // room for the label over the middle bar
const PAD_BOTTOM = 4;
const MAX_SPAN_IN = 220;
const MAX_SPAN_OUT = 340;

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

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

// Places a column's nodes top to bottom, centred vertically.
function stack(items, scale, gap, height) {
  const used = items.reduce((s, n) => s + n.amount * scale, 0) + gap * (items.length - 1);
  let y = PAD_TOP + (height - PAD_TOP - PAD_BOTTOM - used) / 2;
  return items.map((n) => {
    const node = { ...n, y, h: n.amount * scale };
    y += node.h + gap;
    return node;
  });
}

// A ribbon of constant thickness h from (x1, a) to (x2, b), curved in the middle.
function ribbon(x1, a, x2, b, h) {
  const xm = (x1 + x2) / 2;
  return `M${x1},${a} C${xm},${a} ${xm},${b} ${x2},${b} L${x2},${b + h} C${xm},${b + h} ${xm},${a + h} ${x1},${a + h} Z`;
}

// Ribbons from each node to the middle bar (side 'in') or from it (side 'out'). They stack
// along the middle bar in the same order as their nodes.
function ribbons(nodes, side, { nodeX, midX, midY }) {
  let y = midY;
  return nodes.map((n) => {
    const d = side === 'in' ? ribbon(nodeX + BAR, n.y, midX, y, n.h) : ribbon(midX + BAR, y, nodeX, n.y, n.h);
    y += n.h;
    return { key: `${side}-${n.key}`, node: n.key, d, color: n.color, muted: n.muted };
  });
}

function Label({ x, y, anchor, name, amount, compact }) {
  if (compact) {
    return (
      <text x={x} y={y - 2} textAnchor={anchor} fontSize="11">
        <tspan className="fill-ink" fontWeight="600">
          {truncate(name, 13)}
        </tspan>
        <tspan x={x} dy="13" className="fill-ink-muted">
          {formatINR(amount)}
        </tspan>
      </text>
    );
  }
  return (
    <text x={x} y={y + 4} textAnchor={anchor} fontSize="12">
      <tspan className="fill-ink" fontWeight="600">
        {truncate(name, 20)}
      </tspan>
      <tspan dx="5" className="fill-ink-muted">
        {formatINR(amount)}
      </tspan>
    </text>
  );
}

export default function MoneyFlow({ sources, outflows, centerLabel, ariaLabel }) {
  const ref = useRef(null);
  const width = useWidth(ref);
  const compact = width < 600;
  const gap = compact ? 26 : 18;
  const labelW = compact ? 92 : 190;
  const rows = Math.max(sources.length, outflows.length);
  const baseHeight = compact ? 250 : 440;
  const height = Math.max(baseHeight, rows * (gap + 16) + PAD_TOP + PAD_BOTTOM);

  const total = outflows.reduce((s, n) => s + n.amount, 0);
  const scale = total > 0 ? (height - PAD_TOP - PAD_BOTTOM - gap * (rows - 1)) / total : 0;

  // Ribbon lengths are capped so a wide card doesn't stretch them into flat slabs; the
  // fan-out side gets more room. Whatever width is left over centres the chart.
  const avail = Math.max(width - labelW * 2 - BAR * 3, 0);
  const spanIn = Math.min(avail * 0.4, MAX_SPAN_IN);
  const spanOut = Math.min(avail * 0.6, MAX_SPAN_OUT);
  const offset = (avail - spanIn - spanOut) / 2;
  const leftX = Math.round(offset + labelW);
  const midX = Math.round(leftX + BAR + spanIn);
  const rightX = Math.round(midX + BAR + spanOut);

  const left = stack(sources, scale, gap, height);
  const right = stack(outflows, scale, gap, height);
  const [mid] = stack([{ amount: total }], scale, 0, height);

  const flows = [
    ...ribbons(left, 'in', { nodeX: leftX, midX, midY: mid.y }),
    ...ribbons(right, 'out', { nodeX: rightX, midX, midY: mid.y }),
  ];
  const delay = stagger(flows.length);

  const [focus, setFocus] = useState(null);
  const focused = focus && [...left, ...right].find((n) => n.key === focus);
  const hover = (key) => ({ onPointerEnter: () => setFocus(key), onPointerLeave: () => setFocus(null) });
  const fade = { transition: 'opacity var(--rt-dur-base) var(--rt-ease-out)' };
  const dim = (key) => (focus && key !== focus ? 0.4 : 1);
  const ribbonOpacity = (r) => {
    if (!focus) return r.muted ? 0.12 : 0.28;
    if (r.node !== focus) return 0.06;
    return r.muted ? 0.3 : 0.6;
  };

  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="block font-sans">
          {flows.map((r, i) => (
            <motion.path
              key={r.key}
              d={r.d}
              {...hover(r.node)}
              style={{ fill: r.color, fillOpacity: ribbonOpacity(r), transition: 'fill-opacity var(--rt-dur-base) var(--rt-ease-out)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...countUp, delay: i * delay }}
            />
          ))}

          <rect x={midX} y={mid.y} width={BAR} height={Math.max(mid.h, 2)} rx="2" className="fill-accent" />
          <text x={midX + BAR / 2} y={PAD_TOP - 10} textAnchor="middle" fontSize={compact ? 11 : 12}>
            {focused ? (
              <>
                <tspan className="fill-ink" fontWeight="600">
                  {truncate(focused.label, 24)}
                </tspan>
                <tspan dx="5" className="fill-ink-muted">
                  {total > 0 ? `${Math.max(1, Math.round((focused.amount / total) * 100))}% of the total` : ''}
                </tspan>
              </>
            ) : (
              <>
                <tspan className="fill-ink" fontWeight="600">
                  {centerLabel}
                </tspan>
                <tspan dx="5" className="fill-ink-muted">
                  {formatINR(total)}
                </tspan>
              </>
            )}
          </text>

          {left.map((n) => (
            <g key={n.key} {...hover(n.key)} opacity={dim(n.key)} style={fade}>
              <rect x={leftX} y={n.y} width={BAR} height={Math.max(n.h, 2)} rx="2" style={{ fill: n.color }} />
              <Label x={leftX - 8} y={n.y + n.h / 2} anchor="end" name={n.label} amount={n.amount} compact={compact} />
            </g>
          ))}
          {right.map((n) => (
            <g key={n.key} {...hover(n.key)} opacity={dim(n.key)} style={fade}>
              <rect x={rightX} y={n.y} width={BAR} height={Math.max(n.h, 2)} rx="2" style={{ fill: n.color }} />
              <Label x={rightX + BAR + 8} y={n.y + n.h / 2} anchor="start" name={n.label} amount={n.amount} compact={compact} />
            </g>
          ))}
        </svg>
      )}

      {/* The same numbers as text, for screen readers */}
      <ul className="sr-only">
        {sources.map((n) => (
          <li key={n.key}>
            In: {n.label} {formatINR(n.amount)}
          </li>
        ))}
        {outflows.map((n) => (
          <li key={n.key}>
            Out: {n.label} {formatINR(n.amount)}
          </li>
        ))}
      </ul>
    </div>
  );
}
