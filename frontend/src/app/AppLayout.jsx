import { Suspense, useLayoutEffect, useState } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { PageRoutes } from '@/components/brand/Route';
import { pageTransition } from '@/theme/motion';
import { applyTheme } from '@/theme/theme';
import { cn } from '@/lib/utils';
import ReportHeader from './report/ReportHeader';
import ReportFooter from './report/ReportFooter';
import ReportMobileBar from './report/ReportMobileBar';
import UploadDialog from './UploadDialog';
import { useData, usePrefs } from './hooks';
import { ErrorState, LoadingState } from './StateViews';
import Welcome, { SampleBanner } from './Welcome';

// Screens that work without any transactions
const NO_DATA_PAGES = ['/settings'];

// The frame around every screen: fixed header (with the period picker on the report), the
// screen itself, and the footer strip. The report adds its own section rail and phone bar.
export default function AppLayout() {
  const [uploadOpen, setUploadOpen] = useState(false);
  // A file dropped on the welcome screen opens the import dialog with it chosen
  const [dropped, setDropped] = useState(null); // { file, n }
  const { loading, error, transactions, refresh, sample } = useData();
  const { railSide, theme } = usePrefs();
  const location = useLocation();
  const outlet = useOutlet();
  const openUpload = () => setUploadOpen(true);
  const importFile = (file) => {
    setDropped((d) => ({ file, n: (d?.n ?? 0) + 1 }));
    setUploadOpen(true);
  };
  const isReport = location.pathname === '/';
  // The AI page follows the report's period, so it shows the same period switcher
  const hasPeriod = isReport || location.pathname === '/ai';
  const ready = !loading && !error && transactions.length > 0;

  // Before paint, so a theme change never flashes the old one
  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  let content = outlet;
  if (!NO_DATA_PAGES.includes(location.pathname)) {
    if (loading) content = <LoadingState />;
    else if (error) content = <ErrorState message={error} onRetry={refresh} />;
    else if (!transactions.length) content = <Welcome onFile={importFile} />;
  }

  return (
    <div className="min-h-screen bg-bg">
      <ReportHeader onUpload={openUpload} period={hasPeriod && ready} railSide={isReport ? railSide : null} />
      <main
        className={cn(
          'relative isolate px-4 pb-28 md:px-8 lg:pb-6',
          isReport && (railSide === 'right' ? 'lg:pr-24' : 'lg:pl-24')
        )}
        style={{ paddingTop: 'calc(var(--header-h, 112px) + 28px)' }}
      >
        <PageRoutes edge="top" />
        <PageRoutes edge="bottom" />
        <div className="relative mx-auto max-w-[1440px]">
          {sample && <SampleBanner onImport={openUpload} />}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={location.pathname} {...pageTransition}>
              <Suspense fallback={<LoadingState />}>{content}</Suspense>
            </motion.div>
          </AnimatePresence>
        </div>
        <ReportFooter />
      </main>
      {/* The report shows its own bar, which follows the section being read */}
      {!isReport && <ReportMobileBar active={null} />}
      <UploadDialog key={dropped?.n ?? 0} initialFile={dropped?.file} open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}
