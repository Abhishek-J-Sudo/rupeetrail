import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { usePrefs } from './hooks';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

// The header's theme control: one icon button (showing the current choice) with a small
// Light / Dark / System menu. Settings and the phone More sheet keep the full ThemeSwitch.
export default function ThemeMenu() {
  const { theme, setTheme } = usePrefs();
  const Current = (OPTIONS.find((o) => o.value === theme) || OPTIONS[2]).icon;

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        aria-label="Theme"
        title="Theme"
        className="flex size-9 items-center justify-center rounded-control text-ink-muted outline-none transition-colors duration-fast hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent data-[state=open]:bg-surface-2 data-[state=open]:text-ink"
      >
        <Current className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="z-[60] min-w-[9.5rem] rounded-control border border-line bg-surface p-1 text-ink shadow-pop duration-fast data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <Menu.RadioGroup value={theme} onValueChange={setTheme}>
            {OPTIONS.map(({ value, label, icon: Icon }) => (
              <Menu.RadioItem
                key={value}
                value={value}
                className="relative flex cursor-pointer select-none items-center gap-2.5 rounded-[6px] py-2 pl-2.5 pr-8 text-[13px] text-ink-muted outline-none transition-colors duration-fast data-[highlighted]:bg-accent-soft data-[highlighted]:text-ink data-[state=checked]:font-semibold data-[state=checked]:text-ink"
              >
                <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
                {label}
                <Menu.ItemIndicator className="absolute right-2.5 inline-flex">
                  <Check className="size-3.5 text-accent" strokeWidth={2.2} aria-hidden="true" />
                </Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
