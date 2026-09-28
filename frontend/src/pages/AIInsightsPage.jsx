import PageHeader from '@/app/PageHeader';
import { AIAnalysis } from '@/sections/AISummary';

// The full AI analysis of the period chosen in the header (the same period as the report);
// Overview shows the brief version.
export default function AIInsightsPage() {
  return (
    <>
      <PageHeader title="AI insights" subtitle="A written read of the period, with ways to save, using your own AI" />
      <AIAnalysis />
    </>
  );
}
