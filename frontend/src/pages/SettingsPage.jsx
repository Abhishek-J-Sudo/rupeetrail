import { HardDrive, KeyRound, PanelLeft, PanelRight, Palette } from 'lucide-react';
import PageHeader from '@/app/PageHeader';
import ThemeSwitch from '@/app/ThemeSwitch';
import AISettings from '@/app/AISettings';
import ClearDataDialog from '@/app/ClearDataDialog';
import { usePrefs } from '@/app/hooks';
import Segmented from '@/components/kit/Segmented';
import Switch from '@/components/kit/Switch';
import { FolderPath, StorageFacts } from '@/app/StorageNote';
import { useStorage } from '@/app/useStorage';
import { cn } from '@/lib/utils';

const SIDE_OPTIONS = [
  { value: 'left', label: 'Left', icon: PanelLeft },
  { value: 'right', label: 'Right', icon: PanelRight },
];

function Row({ label, hint, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2">
      <div>
        <p className="font-medium text-ink">{label}</p>
        {hint && <p className="text-xs text-ink-faint">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Section({ icon: Icon, title, className, children }) {
  return (
    <section className={cn('flex gap-4 rounded-card border border-line bg-surface p-5 shadow-card', className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent">
        <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
        <div className="text-sm text-ink-muted">{children}</div>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const { railSide, setRailSide } = usePrefs();
  const storage = useStorage();
  const { info } = storage;
  return (
    <>
      <PageHeader title="Settings" subtitle="RupeeTrail runs entirely on your computer" />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Section icon={HardDrive} title="Your data">
          <div className="mt-2">
            <StorageFacts info={info} />
          </div>
          <div className="mt-3 border-t border-line pt-2">
            <Switch
              title="Keep a copy of statement files"
              hint={
                info?.keep_statements ? (
                  <>
                    Copies are saved in <FolderPath>{info.uploads_dir}</FolderPath>
                  </>
                ) : (
                  'Off: each file is deleted once its transactions are saved'
                )
              }
              checked={Boolean(info?.keep_statements)}
              disabled={!info}
              onChange={storage.setKeep}
            />
            {storage.error && (
              <p role="alert" className="text-xs text-bad">
                {storage.error}.
              </p>
            )}
          </div>
          <ClearDataDialog keepStatements={Boolean(info?.keep_statements)} />
        </Section>
        <Section icon={Palette} title="Appearance">
          <Row label="Theme" hint="System follows your computer’s light or dark setting">
            <ThemeSwitch />
          </Row>
          <Row label="Section list" hint="The trail of section stops beside the report, on wide screens">
            <Segmented label="Section list side" options={SIDE_OPTIONS} value={railSide} onChange={setRailSide} />
          </Row>
        </Section>
        <Section icon={KeyRound} title="AI" className="lg:col-span-2">
          <AISettings />
        </Section>
      </div>
    </>
  );
}
