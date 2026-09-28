import { lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { MotionConfig } from "motion/react";
import AppLayout from "./app/AppLayout";
import { DataProvider } from "./app/DataContext";
import { InsightProvider } from "./app/InsightContext";
import { PeriodProvider } from "./app/PeriodContext";
import { PrefsProvider } from "./app/PrefsContext";

// Each screen is its own chunk, so the first load only pulls in what it shows.
// The report (home) holds Overview, Cash flow, Spending, Budgets and Transactions as sections.
const ReportPage = lazy(() => import("./pages/ReportPage"));
const RecurringPage = lazy(() => import("./pages/RecurringPage"));
const AIInsightsPage = lazy(() => import("./pages/AIInsightsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
// Dev-only design sandbox; the DEV check drops it from production builds
const SandboxPage = import.meta.env.DEV
  ? lazy(() => import("./pages/SandboxPage"))
  : null;

export default function App() {
  return (
    // reducedMotion="user": springs become instant when the OS asks for reduced motion
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <PrefsProvider>
          <DataProvider>
            <PeriodProvider>
              <InsightProvider>
                <Routes>
                  <Route element={<AppLayout />}>
                    <Route index element={<ReportPage />} />
                    {/* Old page addresses (and the /report preview) land on their report section */}
                    {[
                      "overview",
                      "transactions",
                      "cash-flow",
                      "spending",
                      "budgets",
                    ].map((id) => (
                      <Route
                        key={id}
                        path={id}
                        element={
                          <Navigate
                            to={{ pathname: "/", hash: `#${id}` }}
                            replace
                          />
                        }
                      />
                    ))}
                    <Route
                      path="report"
                      element={<Navigate to="/" replace />}
                    />
                    <Route path="recurring" element={<RecurringPage />} />
                    <Route path="ai" element={<AIInsightsPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                    {SandboxPage && (
                      <Route path="sandbox" element={<SandboxPage />} />
                    )}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </Routes>
              </InsightProvider>
            </PeriodProvider>
          </DataProvider>
        </PrefsProvider>
      </BrowserRouter>
    </MotionConfig>
  );
}
