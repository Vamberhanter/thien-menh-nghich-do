import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Carved plaque heading. `sub` carries the Vietnamese gloss under the label. */
export function Plate({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="rod-plate">
      <div className="rod-plate__title">{title}</div>
      {sub ? <div className="rod-plate__sub">{sub}</div> : null}
    </div>
  );
}

export function Rule() {
  return <div className="rod-rule" />;
}

interface OrnateButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg';
  tone?: 'stone' | 'blood';
  /** Draws the gold lit state, for the button that owns the current view. */
  on?: boolean;
}

export function OrnateButton({
  size = 'md',
  tone = 'stone',
  on = false,
  className,
  children,
  ...rest
}: OrnateButtonProps) {
  const classes = [
    'rod-btn',
    size === 'lg' ? 'rod-btn--lg' : '',
    size === 'sm' ? 'rod-btn--sm' : '',
    tone === 'blood' ? 'rod-btn--blood' : '',
    on ? 'is-on' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}

/** Stone panel with riveted brass frame. `state` lights or dims the plaque. */
export function Panel({
  title,
  sub,
  state = 'plain',
  grow = false,
  className,
  children,
}: {
  title: string;
  sub?: string;
  state?: 'focus' | 'idle' | 'plain';
  grow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const classes = [
    'rod-panel',
    'rod-frame',
    grow ? 'rod-panel--grow' : '',
    state === 'focus' ? 'is-focus' : '',
    state === 'idle' ? 'is-idle' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <section className={classes}>
      <Plate title={title} sub={sub} />
      <div className="rod-panel__body">{children}</div>
    </section>
  );
}
