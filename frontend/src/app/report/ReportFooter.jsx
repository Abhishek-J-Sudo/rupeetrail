import { Lock } from 'lucide-react';
import Logo from '@/components/brand/Logo';

// A quiet strip at the end of every screen.
export default function ReportFooter() {
  return (
    <footer className="relative mt-14 border-t border-line">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 pt-6 pb-3 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-3">
          <Logo showWordmark={false} className="opacity-80 [&_img]:size-5" />
          <span>
            <b className="font-semibold text-ink-muted">RupeeTrail</b> · Local. Private. Yours.
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5">
            <Lock className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
            Stored only on your computer
          </span>
          <span aria-hidden="true">·</span>
          <span>© {new Date().getFullYear()} RupeeTrail</span>
        </span>
      </div>
      <p className="mx-auto max-w-[1440px] pb-6 text-xs text-ink-faint">
        Not financial advice. Check totals against your bank statement. Not affiliated with HDFC Bank or any other bank.
      </p>
    </footer>
  );
}
