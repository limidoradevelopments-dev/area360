"use client";

import gsap from "gsap";
import { useGSAP } from "@gsap/react";

import OSDivider from "@/components/ui/OSDivider";
import { cx } from "@/components/ui/cx";
import { useRevealOnce } from "@/components/ui/useRevealOnce";

import IntroHeadline from "./IntroHeadline";
import IntroStatCard from "./IntroStatCard";
import { INTRO_BODY, INTRO_EYEBROW, INTRO_HEADLINE, INTRO_STATS } from "./content";
import { INTRO_MOTION, INTRO_REDUCED, INTRO_THRESHOLD } from "./motion";

gsap.registerPlugin(useGSAP);

/**
 * ─── IntroSection ───
 *
 * The example section. Copy it as the shape of every new feature:
 *
 *   components/<feature>/
 *     index.ts            public exports only
 *     content.ts          copy + data
 *     motion.ts           every timing, with reasons
 *     <Feature>Section    the client component that owns the timeline
 *     <Parts>.tsx         server components; markup + data- hooks only
 *
 * THE GRID. Twelve columns between the master margin, one gutter. Columns
 * 1–4 under the cards are left empty on purpose: the headline holds the
 * left edge, the body and cards push right, and the empty well between them
 * is the tension that makes it read as a magazine spread rather than a
 * centred landing page.
 *
 * THE ENTRANCE. One timeline, fired once when the section is 20% on screen.
 * Lines unmask, supporting copy lifts, cards float up out of a blur — each
 * group staggered so the eye travels the composition in reading order.
 */
export interface IntroSectionProps {
  className?: string;
  /**
   * Off by default: the signature motion plays for everyone. When on and the
   * visitor prefers reduced motion, travel, scale and blur are dropped and
   * everything simply arrives with a short fade.
   */
  respectReducedMotion?: boolean;
}

export default function IntroSection({
  className,
  respectReducedMotion = false,
}: IntroSectionProps) {
  const [scope, revealed] = useRevealOnce<HTMLElement>(INTRO_THRESHOLD);

  useGSAP(
    () => {
      if (!revealed) return;

      const run = (reduced: boolean) => {
        const m = INTRO_MOTION;

        if (reduced) {
          gsap.set("[data-reveal-line], [data-reveal-card]", {
            yPercent: 0, y: 0, scale: 1, filter: "blur(0px)",
          });
          gsap.fromTo(
            "[data-reveal-line], [data-reveal-fade], [data-reveal-card]",
            { opacity: 0 },
            { opacity: 1, duration: INTRO_REDUCED.seconds, overwrite: true },
          );
          return;
        }

        const tl = gsap.timeline({ defaults: { ease: m.ease, overwrite: true } });

        /* `y: 0` IS LOAD-BEARING. GSAP parses the CSS pre-state transform
           into its own px `y` and would stack yPercent on top of it — the
           lines would travel and then stop exactly one pre-state short. The
           offset is re-expressed as yPercent so it tracks the type size. */
        tl.fromTo(
          "[data-reveal-line]",
          { yPercent: m.line.fromYPercent, y: 0 },
          { yPercent: 0, duration: m.line.seconds, stagger: m.line.stagger },
          0,
        )
          .fromTo(
            "[data-reveal-fade]",
            { opacity: 0, y: `${m.supportLiftRem}rem` },
            { opacity: 1, y: 0, duration: m.supportSeconds, stagger: 0.08 },
            m.supportDelay,
          )
          .fromTo(
            "[data-reveal-card]",
            {
              opacity: 0,
              y: m.card.fromY,
              scale: m.card.fromScale,
              filter: `blur(${m.card.fromBlurPx}px)`,
            },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              filter: "blur(0px)",
              duration: m.card.seconds,
              stagger: m.card.stagger,
              /* Drop the filter once landed so the card is not left on its
                 own filtered layer for the rest of the session. */
              clearProps: "filter",
            },
            m.cardDelay,
          );
      };

      if (!respectReducedMotion) {
        run(false);
        return;
      }

      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => run(false));
      media.add("(prefers-reduced-motion: reduce)", () => run(true));
      return () => media.revert();
    },
    { scope, dependencies: [revealed, respectReducedMotion] },
  );

  return (
    <section
      ref={scope}
      aria-labelledby="intro-heading"
      className={cx("relative w-full bg-surface bg-noise", className)}
    >
      <div
        className={cx(
          "relative z-[1] grid grid-cols-12 gap-gutter px-margin",
          "py-[var(--space-intro-block)]",
        )}
      >
        <OSDivider
          left={INTRO_EYEBROW}
          right="Next.js · GSAP · Tailwind v4"
          className="col-span-12 mb-[var(--space-intro-block)]"
        />

        <IntroHeadline
          id="intro-heading"
          lines={INTRO_HEADLINE}
          className="col-span-12 lg:col-span-8"
        />

        <p
          data-reveal-fade
          className={cx(
            "col-span-12 md:col-span-6 md:col-start-7 lg:col-span-4 lg:col-start-9",
            "self-end mt-[var(--space-intro-row)] lg:mt-0 text-muted",
            "text-[length:var(--text-intro-body)] [line-height:var(--leading-intro-body)]",
          )}
        >
          {INTRO_BODY}
        </p>

        <div
          className={cx(
            "col-span-12 lg:col-span-8 lg:col-start-5",
            "mt-[var(--space-intro-block)] grid grid-cols-1 sm:grid-cols-3 gap-gutter",
          )}
        >
          {INTRO_STATS.map((stat) => (
            <IntroStatCard key={stat.id} stat={stat} />
          ))}
        </div>
      </div>
    </section>
  );
}
