import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { formatINR } from '@/lib/money';
import { countUp } from '@/theme/motion';

// A number that rolls from its old value to the new one (e.g. when the month changes), shown
// as rupees unless `format` says otherwise. Shows the final value straight away on first render
// and when reduced motion is on.
export default function CountUp({ value, format = formatINR }) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) {
      current.current = value;
      return undefined;
    }
    const controls = animate(current.current, value, {
      ...countUp,
      onUpdate: (v) => {
        current.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [value, reduce]);

  return <>{format(reduce ? value : shown)}</>;
}
