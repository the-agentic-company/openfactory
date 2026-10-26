// Adapted from T3 Code ProjectIconPickerDialog (MIT). See third-party/T3-CODE-LICENSE.
import {
  firstEmoji,
  monogramSchema,
  type AgentAppearance,
  type IconColor,
} from '@openfactory/core';
import { useId, useState } from 'react';
import { PROJECT_ICON_COLORS, projectIconColorClassName } from '../icon-colors';
import { popularIcons, projectEmojis } from '../icon-options';
import { LucideGlyph, lucideIconNames } from './icon-library';
import { AppearanceGlyph } from './appearance-glyph';

export function IconPickerFields({
  value,
  name,
  onChange,
}: {
  value: AgentAppearance;
  name: string;
  onChange: (appearance: AgentAppearance) => void;
}) {
  const id = useId();
  const mode = value.kind;
  const [icon, setIcon] = useState(value.kind === 'icon' ? value.name : 'folder-code');
  const [color, setColor] = useState<IconColor>(
    value.kind !== 'emoji' ? (value.color ?? 'gray') : 'gray',
  );
  const [letters, setLetters] = useState(
    value.kind === 'monogram'
      ? value.text
      : Array.from(name.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase())
          .slice(0, 2)
          .join('') || 'PR',
  );
  const [emoji, setEmoji] = useState(value.kind === 'emoji' ? value.value : '💻');
  const [query, setQuery] = useState('');
  const [customEmoji, setCustomEmoji] = useState('');
  const normalized = query.trim().toLowerCase().replaceAll(/\s+/g, '-');
  const choices = normalized
    ? lucideIconNames.filter((candidate) => candidate.includes(normalized)).slice(0, 60)
    : popularIcons;
  const monogram = letters.normalize('NFKC').trim().toUpperCase();
  const validMonogram = monogramSchema.safeParse(monogram).success;

  return (
    <div className="identity-picker">
      <div className="identity-preview">
        <AppearanceGlyph appearance={value} size={32} />
      </div>
      <fieldset className="identity-modes" aria-label="Icon type">
        {(['icon', 'emoji', 'monogram'] as const).map((next) => (
          <button
            key={next}
            type="button"
            aria-pressed={mode === next}
            onClick={() => {
              onChange(
                next === 'icon'
                  ? { kind: 'icon', name: icon, color }
                  : next === 'emoji'
                    ? { kind: 'emoji', value: emoji }
                    : { kind: 'monogram', text: monogram, color },
              );
            }}
          >
            {next === 'icon' ? 'Icons' : next === 'emoji' ? 'Emoji' : 'Monogram'}
          </button>
        ))}
      </fieldset>
      {mode !== 'emoji' && (
        <div>
          <span className="identity-label">Color</span>
          <fieldset className="identity-colors" aria-label="Icon color">
            {PROJECT_ICON_COLORS.map((option) => (
              <button
                type="button"
                key={option.value}
                aria-label={option.label}
                aria-pressed={color === option.value}
                onClick={() => {
                  setColor(option.value);
                  onChange(
                    mode === 'monogram'
                      ? { kind: 'monogram', text: monogram, color: option.value }
                      : { kind: 'icon', name: icon, color: option.value },
                  );
                }}
              >
                <span className={option.swatchClassName} />
              </button>
            ))}
          </fieldset>
        </div>
      )}
      {mode === 'icon' ? (
        <>
          <input
            type="search"
            aria-label="Search Lucide icons"
            placeholder="Search all Lucide icons"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <fieldset
            className={`identity-grid ${projectIconColorClassName(color)}`}
            aria-label="Icons"
          >
            {choices.map((candidate) => (
              <button
                key={candidate}
                type="button"
                title={candidate}
                aria-label={`Use ${candidate} icon`}
                aria-pressed={icon === candidate}
                onClick={() => {
                  setIcon(candidate);
                  onChange({ kind: 'icon', name: candidate, color });
                }}
              >
                <LucideGlyph name={candidate} />
              </button>
            ))}
          </fieldset>
          {choices.length === 0 && <p className="muted-copy">No icons found.</p>}
        </>
      ) : mode === 'emoji' ? (
        <>
          <fieldset className="identity-grid identity-emoji-grid" aria-label="Emoji">
            {projectEmojis.map((option) => (
              <button
                type="button"
                key={option.emoji}
                aria-label={`Use ${option.label.toLowerCase()} emoji`}
                aria-pressed={emoji === option.emoji}
                onClick={() => {
                  setEmoji(option.emoji);
                  onChange({ kind: 'emoji', value: option.emoji });
                }}
              >
                {option.emoji}
              </button>
            ))}
          </fieldset>
          <label className="identity-label" htmlFor={`${id}-emoji`}>
            Or paste any emoji
          </label>
          <input
            id={`${id}-emoji`}
            aria-label="Custom emoji"
            placeholder="Paste an emoji"
            value={customEmoji}
            onChange={(event) => {
              const raw = event.target.value;
              setCustomEmoji(raw);
              const next = firstEmoji(raw);
              if (next) {
                setEmoji(next);
                onChange({ kind: 'emoji', value: next });
              }
            }}
          />
        </>
      ) : (
        <div>
          <label className="identity-label" htmlFor={`${id}-letters`}>
            Letters
          </label>
          <input
            id={`${id}-letters`}
            value={letters}
            autoComplete="off"
            aria-invalid={!validMonogram}
            aria-describedby={`${id}-hint`}
            onChange={(event) => {
              setLetters(event.target.value);
              onChange({
                kind: 'monogram',
                text: event.target.value.normalize('NFKC').trim().toUpperCase(),
                color,
              });
            }}
          />
          <p id={`${id}-hint`} className="muted-copy">
            One or two letters or numbers.
          </p>
        </div>
      )}
    </div>
  );
}
