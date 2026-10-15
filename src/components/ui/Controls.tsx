import { useId } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'default' | 'accent' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  variant?: Variant;
  size?: Size;
  block?: boolean;
  active?: boolean;
  shortcut?: string;
}

export function Button({ icon, variant = 'default', size = 'md', block, active, shortcut, children, className = '', ...rest }: ButtonProps) {
  const classes = [
    'btn',
    variant !== 'default' ? `btn--${variant}` : '',
    size === 'sm' ? 'btn--sm' : '',
    block ? 'btn--block' : '',
    active ? 'btn--active' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const title = shortcut ? `${rest.title ?? children?.toString() ?? ''} (${shortcut})`.trim() : rest.title;

  return (
    <button type="button" className={classes} title={title} aria-pressed={active ? true : undefined} {...rest}>
      {icon && <span className="btn__icon">{icon}</span>}
      {children && <span className="btn__label">{children}</span>}
    </button>
  );
}

interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string; note?: string; swatch?: string }[];
  value: T;
  onChange: (value: T) => void;
  compact?: boolean;
  ariaLabel: string;
}

export function Segmented<T extends string>({ options, value, onChange, compact, ariaLabel }: SegmentedProps<T>) {
  const active = options.find((option) => option.value === value);
  return (
    <>
      <div className={`segmented${compact ? ' segmented--compact' : ''}`} role="group" aria-label={ariaLabel}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="segmented__item"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.swatch && <span className="segmented__swatch" style={{ background: option.swatch }} aria-hidden="true" />}
            <span>{option.label}</span>
          </button>
        ))}
      </div>
      {active?.note && !compact && <p className="caption">{active.note}</p>}
    </>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}

export function Slider({ label, value, min, max, step, onChange, format }: SliderProps) {
  const id = useId();
  const display = format ? format(value) : value.toFixed(2);

  return (
    <div className="slider">
      <div className="slider__head">
        <label htmlFor={id}>{label}</label>
        <span className="slider__value">{display}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}

export function NumberField({ label, value, onCommit, step = 0.1, min, max, suffix }: NumberFieldProps) {
  const id = useId();
  return (
    <div className="vec__field">
      <label className="vec__label" htmlFor={id}>
        {label}
        {suffix ? ` ${suffix}` : ''}
      </label>
      <input
        id={id}
        className="vec__input"
        type="number"
        inputMode="decimal"
        value={round(value)}
        step={step}
        min={min}
        max={max}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onCommit(next);
        }}
      />
    </div>
  );
}

export function Section({ title, index, action, children }: { title: string; index?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <header className="section__header">
        <span className="mono">
          {index && <span className="section__index">{index} / </span>}
          {title}
        </span>
        {action}
      </header>
      {children}
    </section>
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}