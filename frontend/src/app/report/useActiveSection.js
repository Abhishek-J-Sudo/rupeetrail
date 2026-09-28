import { useEffect, useState } from 'react';

// The section the reader is in: the first one crossing a line a third of the way down the
// screen (below the fixed header). `ready` flips once the sections are on the page.
export function useActiveSection(ids, ready = true) {
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    if (!ready) return undefined;
    const visible = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id)));
        const first = ids.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: '-30% 0px -65% 0px' }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [ids, ready]);

  return active;
}
