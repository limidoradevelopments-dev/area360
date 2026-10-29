/**
 * ─── DockMarks ───
 *
 * The settings button's drawing, from the user's Figma frame (2026-10-29),
 * as inline SVG on the 16px artboard's own pixels — each a unit a CSS
 * pixel at the origin, so a 1-unit stroke is a hairline that rides the
 * root scaler with the rest. (The sound wave beside it is drawn by its own
 * button: SoundToggle.)
 *
 *   SettingsGlyph  two sliders, each a track with its knob — the upper's
 *                  toward the right, the lower's toward the left, as the
 *                  frame draws them (Lucide's nearest, the settings-2
 *                  glyph, puts them the other way round)
 */

export function SettingsGlyph() {
  return (
    <svg data-settings-glyph viewBox="0 0 12 12" fill="none" aria-hidden focusable="false">
      <path d="M0.5 3.5H7.25M10.25 3.5H11.5M0.5 8.5H1.75M4.75 8.5H11.5" stroke="currentColor" strokeWidth={1} strokeLinecap="round" />
      <circle cx="8.75" cy="3.5" r="1.5" stroke="currentColor" strokeWidth={1} />
      <circle cx="3.25" cy="8.5" r="1.5" stroke="currentColor" strokeWidth={1} />
    </svg>
  );
}
