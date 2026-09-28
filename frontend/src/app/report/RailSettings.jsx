import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, Monitor, Moon, PanelLeft, PanelRight, Settings2, Sun } from 'lucide-react';
import { usePrefs } from '@/app/hooks';

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];
const SIDES = [
  { value: 'left', label: 'Left', icon: PanelLeft },
  { value: 'right', label: 'Right', icon: PanelRight },
];

function Group({ label, options, value, onChange }) {
  return (
    <>
      <Menu.Label className="px-2.5 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </Menu.Label>
      <Menu.RadioGroup value={value} onValueChange={onChange}>
        {options.map(({ value: v, label: optionLabel, icon: Icon }) => (
          <Menu.RadioItem
            key={v}
            value={v}
            className="relative flex cursor-pointer select-none items-center gap-2.5 rounded-[6px] py-2 pl-2.5 pr-8 text-[13px] text-ink-muted outline-none transition-colors duration-fast data-[highlighted]:bg-accent-soft data-[highlighted]:text-ink data-[state=checked]:font-semibold data-[state=checked]:text-ink"
          >
            <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
            {optionLabel}
            <Menu.ItemIndicator className="absolute right-2.5 inline-flex">
              <Check className="size-3.5 text-accent" strokeWidth={2.2} aria-hidden="true" />
            </Menu.ItemIndicator>
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
    </>
  );
}

// The rail's own quick settings: theme and which edge the rail sits on (the same choices as
// Settings → Appearance). Opens towards the page, away from the screen edge.
export default function RailSettings({ side }) {
  const { theme, setTheme, railSide, setRailSide } = usePrefs();
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        aria-label="Display settings"
        title="Display settings"
        className="flex size-8 items-center justify-center rounded-full text-ink-faint outline-none transition-[color,background-color,transform] duration-fast ease-out hover:rotate-45 hover:bg-surface hover:text-accent focus-visible:ring-2 focus-visible:ring-accent data-[state=open]:rotate-45 data-[state=open]:bg-surface data-[state=open]:text-accent data-[state=open]:shadow-card"
      >
        <Settings2 className="size-4" strokeWidth={1.8} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          side={side === 'right' ? 'left' : 'right'}
          align="end"
          sideOffset={10}
          className="z-[60] min-w-[10rem] rounded-control border border-line bg-surface p-1 text-ink shadow-pop duration-fast data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <Group label="Theme" options={THEMES} value={theme} onChange={setTheme} />
          <Menu.Separator className="my-1 h-px bg-line" />
          <Group label="Section list" options={SIDES} value={railSide} onChange={setRailSide} />
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
