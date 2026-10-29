/**
 * ─── Intro · content ───
 *
 * Copy and data live here, never inline in JSX. Headline lines are authored
 * as an array because each line is its own reveal mask — the break is a
 * design decision, not whatever the measure happens to wrap to.
 */

export const INTRO_EYEBROW = "Template / 01";

export const INTRO_HEADLINE: readonly string[] = [
  "Editorial structure,",
  "engineered motion.",
];

export const INTRO_BODY =
  "A starting point that carries the system: one root scaler, one unit per component, a twelve-column grid with intentional empty columns, and GSAP reveals that mask rather than fade.";

export interface IntroStat {
  readonly id: string;
  readonly value: string;
  readonly label: string;
}

export const INTRO_STATS: readonly IntroStat[] = [
  { id: "columns", value: "12", label: "Grid columns" },
  { id: "units", value: "1", label: "Unit per component" },
  { id: "curves", value: "1", label: "Fluid curve" },
];
