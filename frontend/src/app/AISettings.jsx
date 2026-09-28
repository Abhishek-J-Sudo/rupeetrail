import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import Select from '@/components/kit/Select';
import { aiErrorMessage, getAISettings, getOllamaModels, saveAISettings, testAI } from '@/services/api';
import { cn } from '@/lib/utils';

// Settings → AI: pick a provider, add your own key, check it works. The key goes to the app on
// this computer (backend/.env) and never comes back to the browser, only its last 4 characters.

const OFF = 'none';
const INPUT =
  'w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors duration-fast placeholder:text-ink-faint focus:border-accent';
const BUTTON =
  'inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-accent transition-colors duration-fast hover:border-accent hover:bg-accent-soft disabled:opacity-60';

const errorText = (err) => {
  const detail = err.response?.data?.detail;
  return Array.isArray(detail) ? 'Check the values and try again.' : aiErrorMessage(err);
};

function Field({ label, hint, htmlFor, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

// What an AI provider gets, said plainly before you pick one. Quiet like the storage note:
// small grey bullets. Ollama keeps everything on your computer, so it gets the short version.
const LIST = 'flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-ink-muted marker:text-ink-faint';

function DataNote({ spec }) {
  if (!spec) return null;
  if (!spec.needs_key)
    return (
      <ul className={LIST}>
        <li>Ollama runs the AI on your computer: nothing is sent anywhere.</li>
      </ul>
    );
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-medium text-ink">What the AI sees</p>
      <ul className={LIST}>
        <li>Only when you press an AI button. Nothing is sent in the background.</li>
        <li>
          AI summary: money in, spending, investments and savings for the period and the one before, spending per category,
          your budgets, your top business payees, and your five largest payments (a payment to a person shows only as “a
          person”).
        </li>
        <li>Review payees: business names, each with its category, number of payments and average amount.</li>
        <li>
          Never sent: your name, account numbers, balances, the bank’s descriptions, dated transactions, or the names of
          people you pay.
        </li>
        <li>
          It goes to your own account with the AI provider, so they can link it to you: enough to see roughly how much you
          spend, where, and on what. How long they keep it, and whether they use it to train their models, is set by their
          terms
          {spec.privacy_url && (
            <>
              {' '}
              (
              <a href={spec.privacy_url} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
                {spec.label} privacy policy
              </a>
              )
            </>
          )}
          .
        </li>
        <li>For nothing to leave your computer, use Ollama instead.</li>
        <li>Each AI screen has “Show exactly what gets sent” to check before sending.</li>
      </ul>
    </div>
  );
}

// Installed Ollama models as a dropdown, or a note when Ollama isn't running
function OllamaModel({ value, onChange, baseUrl, fallback }) {
  const [models, setModels] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getOllamaModels(baseUrl)
      .then((list) => {
        if (cancelled) return;
        setModels(list);
        // An empty model would mean the provider default, which may not be installed
        if (list.length) onChange((current) => (current && list.includes(current) ? current : list.includes(fallback) ? fallback : list[0]));
        setError(list.length ? null : 'No models installed yet. Run “ollama pull llama3.1” first.');
      })
      .catch((err) => !cancelled && setError(errorText(err)));
    return () => {
      cancelled = true;
    };
  }, [baseUrl, fallback, onChange]);

  if (models?.length) {
    const current = value || models[0];
    return (
      <Select
        label="Ollama model"
        value={current}
        onChange={onChange}
        options={models.map((m) => ({ value: m, label: m }))}
        className="w-full sm:w-72"
      />
    );
  }
  return <p className="text-[13px] text-ink-muted">{error ?? 'Looking for Ollama…'}</p>;
}

export default function AISettings() {
  const [saved, setSaved] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [provider, setProvider] = useState(OFF);
  const [key, setKey] = useState('');
  const [replacingKey, setReplacingKey] = useState(false);
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState(null); // 'test' | 'save'
  const [result, setResult] = useState(null); // { ok, text }

  const pick = useCallback((settings, id) => {
    const spec = settings.providers.find((p) => p.id === id);
    setProvider(id);
    setKey('');
    setReplacingKey(false);
    setModel(spec?.model ?? '');
    setBaseUrl(spec?.base_url ?? '');
    setResult(null);
  }, []);

  useEffect(() => {
    getAISettings()
      .then((settings) => {
        setSaved(settings);
        pick(settings, settings.provider ?? OFF);
      })
      .catch(() => setLoadError('Couldn’t read the AI settings. Is the app still running?'));
  }, [pick]);

  if (loadError)
    return (
      <p role="alert" className="mt-1 text-[13px] text-bad">
        {loadError}
      </p>
    );
  if (!saved) return <p className="mt-1 text-[13px] text-ink-muted">Loading…</p>;

  const spec = saved.providers.find((p) => p.id === provider);
  const keyInput = spec?.needs_key && (!spec.key_saved || replacingKey);
  const missingKey = spec?.needs_key && !spec.key_saved && !key.trim();
  const settings = () => ({
    provider: spec ? provider : null,
    api_key: key.trim() ? key.trim() : null,
    model: model.trim(),
    base_url: provider === 'ollama' ? baseUrl.trim() : undefined,
  });

  const test = async () => {
    setBusy('test');
    setResult(null);
    try {
      const res = await testAI(settings());
      setResult({ ok: true, text: `It works: ${spec.label} answered using ${res.model}.` });
    } catch (err) {
      setResult({ ok: false, text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    setResult(null);
    try {
      const next = await saveAISettings(settings());
      setSaved(next);
      pick(next, next.provider ?? OFF);
      setResult({ ok: true, text: spec ? `Saved. AI now uses ${spec.label}.` : 'Saved. AI is off.' });
    } catch (err) {
      setResult({ ok: false, text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  const removeKey = async () => {
    setBusy('save');
    try {
      const next = await saveAISettings({ provider, api_key: '' });
      setSaved(next);
      pick(next, provider);
      setResult({ ok: true, text: 'Key removed.' });
    } catch (err) {
      setResult({ ok: false, text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  const options = [
    { value: OFF, label: 'Off' },
    ...saved.providers.map((p) => ({ value: p.id, label: p.label })),
  ];

  return (
    <div className="mt-2 flex flex-col gap-4">
      <p>
        Optional. AI writes a summary of each period with ways to save, and suggests categories and clean names for
        payees. It uses your own account with the provider, or Ollama on your computer.
      </p>

      {/* Desktop: the settings on the left, what the AI sees beside them */}
      <div className="grid gap-x-10 gap-y-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <Field label="Provider" htmlFor="ai-provider">
            <Select label="AI provider" value={provider} onChange={(id) => pick(saved, id)} options={options} className="w-full sm:w-72" />
          </Field>

          {spec?.needs_key && (
            <Field
              label="API key"
              htmlFor="ai-key"
              hint={
                <a href={spec.key_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:text-accent-hover">
                  Get a {spec.label} key
                  <ExternalLink className="size-3" strokeWidth={2} aria-hidden="true" />
                </a>
              }
            >
              {keyInput ? (
                <input
                  id="ai-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="Paste your key"
                  className={cn(INPUT, 'font-mono sm:w-96')}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-[13px] text-ink">Saved {spec.key_hint}</span>
                  <button type="button" onClick={() => setReplacingKey(true)} className="text-[13px] font-semibold text-accent hover:text-accent-hover">
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={removeKey}
                    disabled={busy !== null}
                    className="text-[13px] font-semibold text-ink-muted hover:text-ink"
                  >
                    Remove
                  </button>
                </div>
              )}
            </Field>
          )}

          {provider === 'ollama' && (
            <Field label="Ollama address" htmlFor="ai-base-url" hint="Leave empty for the usual address on your computer.">
              <input
                id="ai-base-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={spec.default_base_url}
                spellCheck={false}
                className={cn(INPUT, 'font-mono sm:w-96')}
              />
            </Field>
          )}

          {spec && (
            <Field
              label="Model"
              htmlFor="ai-model"
              hint={provider === 'ollama' ? 'Models already downloaded to Ollama.' : `Leave empty for ${spec.default_model}.`}
            >
              {provider === 'ollama' ? (
                <OllamaModel value={model} onChange={setModel} baseUrl={baseUrl.trim()} fallback={spec.default_model} />
              ) : (
                <input
                  id="ai-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={spec.default_model}
                  spellCheck={false}
                  className={cn(INPUT, 'font-mono sm:w-72')}
                />
              )}
            </Field>
          )}

          {!spec && <p className="text-[13px]">AI is off: nothing is sent anywhere, and the app works fully without it.</p>}
        </div>
        <DataNote spec={spec} />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        {spec && (
          <button type="button" onClick={test} disabled={busy !== null || missingKey} className={BUTTON}>
            {busy === 'test' && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            Test
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={busy !== null || missingKey}
          className="rounded-control bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg transition-colors duration-fast hover:bg-accent-hover disabled:opacity-60"
        >
          {busy === 'save' ? 'Saving…' : 'Save'}
        </button>
        {result && (
          <p role={result.ok ? 'status' : 'alert'} className={cn('flex items-center gap-1.5 text-[13px]', result.ok ? 'text-good' : 'text-bad')}>
            {result.ok && <CheckCircle2 className="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />}
            {result.text}
          </p>
        )}
      </div>
    </div>
  );
}
