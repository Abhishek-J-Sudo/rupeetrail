import { Link } from 'react-router-dom';
import { useStorage } from './useStorage';

// One place for how we describe storage, so every screen says the same thing: everything
// happens on this computer (the browser shows the app, the part that reads and saves runs here
// too), and here is the real folder, as the backend reports it. Kept quiet on purpose: small
// grey bullets, not a feature callout.

export function FolderPath({ children }) {
  return <code className="break-all font-mono text-[0.95em] text-ink-muted">{children}</code>;
}

// The facts as a short bulleted list. `file` adds the line about the statement file itself (the
// import dialog shows it; Settings has the switch instead). `onSettings` runs when "Settings" is clicked.
export function StorageFacts({ info, file = false, onSettings }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-ink-muted marker:text-ink-faint">
      <li>
        Everything happens on your computer. RupeeTrail opens in your browser, but reading statements and saving your data
        happen here too. Nothing goes online unless you turn on AI.
      </li>
      <li>
        Transactions are saved in <FolderPath>{info?.data_dir || 'the data folder next to the app'}</FolderPath>.
      </li>
      {file && info && (
        <li>
          {info.keep_statements ? (
            <>
              A copy of each statement is kept in <FolderPath>{info.uploads_dir}</FolderPath>
            </>
          ) : (
            'The statement file is deleted after reading'
          )}{' '}
          (change in{' '}
          <Link to="/settings" onClick={onSettings} className="text-accent underline-offset-2 hover:underline">
            Settings
          </Link>
          ).
        </li>
      )}
    </ul>
  );
}

// For the import dialog footer.
export default function StorageNote({ onSettings }) {
  const { info } = useStorage();
  return <StorageFacts info={info} file onSettings={onSettings} />;
}
