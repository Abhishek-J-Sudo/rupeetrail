import { Monitor, Moon, Sun } from 'lucide-react';
import Segmented from '@/components/kit/Segmented';
import { usePrefs } from './hooks';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

// Light / Dark / System, used in the sidebar, the phone "More" sheet and Settings.
export default function ThemeSwitch(props) {
  const { theme, setTheme } = usePrefs();
  return <Segmented label="Theme" options={OPTIONS} value={theme} onChange={setTheme} {...props} />;
}
