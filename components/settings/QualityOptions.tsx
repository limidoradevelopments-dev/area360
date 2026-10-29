import { motion } from "framer-motion";
import { Fragment } from "react";

import type { QualityChoice, QualityLevel } from "@/components/ui/renderQuality";

import { AUTO_NOTE, LEVEL_NAMES, QUALITY_OPTIONS, QUALITY_TITLE } from "./content";
import { DOCK_MOTION } from "./motion";

/**
 * ─── QualityOptions ───
 *
 * The four choices as NATIVE RADIOS, visually hidden inside their labels:
 * arrow keys move the choice, Tab leaves the group, a screen reader says
 * "radio, 2 of 4" — all for free, none of it rebuilt by hand.
 *
 * Auto stands alone above a rule, with what it measured under it ("High
 * Quality"); the three levels below. Each ends in its mark, "( )", and the
 * choice's holds the user's drawn cross — ONE cross, which travels from
 * the old choice's parentheses to the new one's (a Framer layoutId): the
 * hand that marked one box moves to the next, nothing blinks out and in.
 */
export interface QualityOptionsProps {
  /** The radios' group name: unique on the page. */
  name: string;
  choice: QualityChoice;
  /** What the scene is drawing at (Auto's measure, or the choice). */
  level: QualityLevel | null;
  onChoose: (choice: QualityChoice) => void;
}

export default function QualityOptions({ name, choice, level, onChoose }: QualityOptionsProps) {
  const autoNote = choice === "auto" && level ? `${LEVEL_NAMES[level]} ${AUTO_NOTE.suffix}` : AUTO_NOTE.idle;
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">{QUALITY_TITLE}</legend>
      {QUALITY_OPTIONS.map((option) => {
        const checked = option.value === choice;
        const auto = option.value === "auto";
        return (
          <Fragment key={option.value}>
            <label
              data-settings-option
              data-auto={auto ? "" : undefined}
              data-checked={checked ? "" : undefined}
              className="flex cursor-pointer flex-col"
            >
              <input type="radio" name={name} value={option.value} checked={checked} onChange={() => onChoose(option.value)} className="sr-only" />
              <span className="flex items-baseline justify-between">
                {option.label}
                <span data-settings-mark aria-hidden className="inline-flex items-center">
                  (
                  <span data-settings-slot className="relative inline-block">
                    {checked && <motion.span layoutId={`${name}-cross`} data-settings-cross className="absolute inset-0" transition={DOCK_MOTION.pick} />}
                  </span>
                  )
                </span>
              </span>
              {auto && <span data-settings-note>{autoNote}</span>}
            </label>
            {auto && <span data-settings-rule aria-hidden />}
          </Fragment>
        );
      })}
    </fieldset>
  );
}
