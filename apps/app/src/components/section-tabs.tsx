import { useRef, type ReactNode } from 'react';
import './section-tabs.css';

export function SectionTabs<Value extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: ReadonlyArray<{ value: Value; label: ReactNode }>;
  value: Value;
  onChange: (value: Value) => void;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <nav className="section-tabs" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.value}
          type="button"
          ref={(button) => {
            buttons.current[index] = button;
          }}
          aria-pressed={value === item.value}
          onClick={() => onChange(item.value)}
          onKeyDown={(event) => {
            const nextIndex =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? items.length - 1
                  : event.key === 'ArrowRight'
                    ? (index + 1) % items.length
                    : event.key === 'ArrowLeft'
                      ? (index + items.length - 1) % items.length
                      : null;
            if (nextIndex !== null) {
              event.preventDefault();
              buttons.current[nextIndex]?.focus();
              buttons.current[nextIndex]?.click();
            }
          }}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
