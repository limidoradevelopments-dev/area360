import type { QualityChoice, QualityLevel } from "@/components/ui/renderQuality";

/**
 * ─── Settings · copy ───
 */

export const SETTINGS_BUTTON = {
  open: "Open settings",
  close: "Close settings",
} as const;

/* The sound toggle's name; whether it is on, the button itself says
   (pressed or not). */
export const SOUND_BUTTON = {
  label: "Sound",
} as const;

/* The group's name for a screen reader: the design shows no title. */
export const QUALITY_TITLE = "Quality";

export interface QualityOption {
  readonly value: QualityChoice;
  readonly label: string;
}

/* Auto first, alone above the rule: the default, and the only one that is
   a measurement rather than a level. */
export const QUALITY_OPTIONS: readonly QualityOption[] = [
  { value: "auto", label: "Auto" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export const LEVEL_NAMES: Record<QualityLevel, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/* Under Auto: what it measured this device onto while it is the choice
   ("High Quality"); what it would do while another level is. */
export const AUTO_NOTE = {
  suffix: "Quality",
  idle: "Picks for this device",
} as const;
