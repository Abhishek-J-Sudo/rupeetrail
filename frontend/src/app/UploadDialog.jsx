import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, FileText, FileUp, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { LightTrail, TrailIcon } from '@/components/brand/Route';
import { uploadPDFWithProgress } from '@/services/api';
import { pressable, spring } from '@/theme/motion';
import { cn } from '@/lib/utils';
import { useData } from './hooks';
import StorageNote from './StorageNote';

const EXTENSIONS = ['.pdf', '.xls', '.xlsx'];

function isStatementFile(file) {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  return EXTENSIONS.includes(ext);
}

function fileSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const UNSUPPORTED = 'That file type isn’t supported. Use a PDF or Excel statement (.pdf, .xls, .xlsx).';

const reveal = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: spring };

// Also used big on the welcome screen
export function Dropzone({ onFile, disabled, className }) {
  const [active, setActive] = useState(false);
  const inputRef = useRef(null);

  const onDrag = (e) => {
    e.preventDefault();
    setActive(e.type === 'dragenter' || e.type === 'dragover');
  };
  const onDrop = (e) => {
    e.preventDefault();
    setActive(false);
    if (e.dataTransfer.files?.[0]) onFile(e.dataTransfer.files[0]);
  };

  return (
    <label
      onDragEnter={onDrag}
      onDragOver={onDrag}
      onDragLeave={onDrag}
      onDrop={onDrop}
      className={cn(
        'flex cursor-pointer flex-col items-center gap-3 rounded-card border-2 border-dashed px-6 py-9 text-center transition-colors duration-fast focus-within:border-accent',
        active ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2 hover:border-line-strong',
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={EXTENSIONS.join(',')}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.files?.[0]) onFile(e.target.files[0]);
          e.target.value = '';
        }}
        className="sr-only"
      />
      <span className="flex size-12 items-center justify-center rounded-[12px] bg-surface text-accent shadow-card">
        <FileUp className="size-6" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="flex flex-col gap-1">
        <span className="font-display text-base font-semibold text-ink">
          {active ? 'Drop to add it' : 'Drop your statement here'}
        </span>
        <span className="text-sm text-ink-muted">
          or <span className="font-semibold text-accent">choose a file</span> from your computer
        </span>
      </span>
      <span className="flex gap-1.5">
        {EXTENSIONS.map((ext) => (
          <span key={ext} className="rounded-full border border-line bg-surface px-2 py-0.5 font-mono text-[10px] uppercase text-ink-muted">
            {ext.slice(1)}
          </span>
        ))}
      </span>
    </label>
  );
}

function Progress({ stage, percent, details }) {
  const facts = [
    details.total_pages > 0 && ['Pages', `${details.page} / ${details.total_pages}`],
    details.transactions > 0 && ['Found', details.transactions.toLocaleString('en-IN')],
    details.elapsed > 0 && ['Elapsed', `${details.elapsed.toFixed(1)}s`],
    details.eta > 0 && ['Left', `~${details.eta.toFixed(0)}s`],
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-2.5" role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-ink">{stage || 'Starting…'}</span>
        <span className="font-mono text-xs text-ink-muted">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-track">
        <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${percent}%` }} transition={spring} />
      </div>
      {facts.length > 0 && (
        <dl className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] uppercase tracking-[0.04em] text-ink-faint">
          {facts.map(([k, v]) => (
            <div key={k} className="flex gap-1.5">
              <dt>{k}</dt>
              <dd className="text-ink-muted">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function Result({ result }) {
  const rows = [
    ['Transactions found', result.total],
    ['Added', result.saved],
    result.duplicates > 0 && ['Already imported, skipped', result.duplicates],
    // A GPay statement next to a bank statement: each payment is kept once
    result.inBankStatement > 0 && ['Already in your bank statement', result.inBankStatement],
    result.notInBankStatement > 0 && ['Not in your bank statement, skipped', result.notInBankStatement],
    result.replaced > 0 && ['Replaced the GPay entry', result.replaced],
    result.removed > 0 && ['GPay entries not in this statement, removed', result.removed],
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-3 rounded-card border border-good/30 bg-good-soft px-4 py-3.5">
      <p className="flex items-center gap-2 text-sm font-semibold text-good">
        <CheckCircle2 className="size-4" strokeWidth={2} aria-hidden="true" />
        Statement imported{result.elapsed ? ` in ${result.elapsed.toFixed(1)}s` : ''}
      </p>
      <dl className="flex flex-col gap-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="font-semibold tabular-nums text-ink">{Number(v || 0).toLocaleString('en-IN')}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// Upload a bank statement. Closing mid-import is fine: the import carries on and the pages
// refresh when it finishes. `initialFile` (a file dropped on the welcome screen) starts it
// with that file chosen; the layout remounts the dialog for each one.
export default function UploadDialog({ open, onOpenChange, initialFile = null }) {
  const { refreshAll } = useData();
  const [file, setFile] = useState(() => (initialFile && isStatementFile(initialFile) ? initialFile : null));
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(() => (initialFile && !isStatementFile(initialFile) ? UNSUPPORTED : null));

  const pickFile = (next) => {
    setResult(null);
    if (isStatementFile(next)) {
      setFile(next);
      setError(null);
    } else {
      setError(UNSUPPORTED);
    }
  };

  const upload = async () => {
    setUploading(true);
    setError(null);
    setProgress({ stage: 'Starting…', percent: 0 });
    try {
      const res = await uploadPDFWithProgress(file, (data) => setProgress(data));
      setResult(res);
      setFile(null);
      refreshAll();
    } catch (err) {
      setError(err.message || 'The import failed. Please try again.');
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  const reset = (next) => {
    // Start fresh next time, unless an import is still running
    if (!next && !uploading) {
      setFile(null);
      setResult(null);
      setError(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent hideClose className="max-w-xl gap-0 overflow-hidden p-0">
        <div className="relative overflow-hidden border-b border-line bg-surface-2 px-5 py-4">
          <LightTrail className="right-14" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <TrailIcon icon={FileUp} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <DialogTitle className="leading-tight text-ink">Import statement</DialogTitle>
                <DialogDescription className="text-[13px] text-ink-muted">HDFC statement (PDF or Excel) or Google Pay statement (PDF)</DialogDescription>
              </div>
            </div>
            <DialogClose className="-mr-1.5 rounded-control p-1.5 text-ink-muted transition-colors duration-fast hover:bg-surface hover:text-ink">
              <X className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
        </div>

        <div className="flex flex-col gap-4 p-5">
          {!file && !uploading && <Dropzone onFile={pickFile} disabled={uploading} />}

          <AnimatePresence initial={false}>
            {file && (
              <motion.div key="file" {...reveal} className="flex flex-col gap-4">
                <div className="flex items-center gap-3 rounded-card border border-line px-4 py-3">
                  <FileText className="size-5 shrink-0 text-accent" strokeWidth={1.8} aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-ink">{file.name}</span>
                    <span className="font-mono text-[11px] text-ink-faint">{fileSize(file.size)}</span>
                  </span>
                  {!uploading && (
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="rounded-control px-2 py-1 text-[13px] font-medium text-ink-muted transition-colors duration-fast hover:bg-surface-2 hover:text-ink"
                    >
                      Remove
                    </button>
                  )}
                </div>
                {uploading ? (
                  <Progress stage={progress?.stage} percent={progress?.percent || 0} details={progress || {}} />
                ) : (
                  <motion.button
                    type="button"
                    onClick={upload}
                    {...pressable}
                    className="flex items-center justify-center gap-2 rounded-control bg-cta px-4 py-3 text-sm font-semibold text-cta-fg transition-colors duration-fast hover:bg-cta-hover"
                  >
                    <FileUp className="size-4" strokeWidth={2} aria-hidden="true" />
                    Import statement
                  </motion.button>
                )}
              </motion.div>
            )}
            {result && (
              <motion.div key="result" {...reveal}>
                <Result result={result} />
              </motion.div>
            )}
            {error && (
              <motion.p
                key="error"
                {...reveal}
                role="alert"
                className="flex items-start gap-2 rounded-card border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col gap-2 border-t border-line bg-surface-2 px-5 py-3.5">
          <StorageNote onSettings={() => reset(false)} />
          <p className="text-xs leading-relaxed text-ink-faint">
            Automatic reading can miss or misread lines, so check the totals against your bank statement.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
