import { Fragment } from "react";

import RevealLine from "@/components/ui/RevealLine";

import type { HeroPhrase } from "../content";

/**
 * ─── HeroStatement ───
 *
 * The big text at the top left: the headline (the section's h1) and the
 * words under it, both in the statement voice (tokens.css: Newsreader
 * medium, the whole white).
 *
 * EACH PASSAGE IS WRITTEN ONCE, AS PHRASES (content.ts), each phrase its
 * own mask and the frames' breaks between them: a break is a line break
 * the stylesheet shows in its band only (copy.css, data-hero-break), so
 * the 1920 frame's lines stand from 1280 up and the 390 frame's under it,
 * from one text. The passage never wraps on its own (copy.css: nowrap):
 * every break is a frame's. The phrases on one line drop together
 * (HeroCopy: by where they stand).
 *
 * Server component: markup and data- hooks only.
 */
export interface HeroStatementProps {
  /** The headline's id: the section is labelled by it. */
  headingId: string;
  title: readonly HeroPhrase[];
  lede: readonly HeroPhrase[];
}

export default function HeroStatement({ headingId, title, lede }: HeroStatementProps) {
  return (
    <div data-hero-statement>
      <h1 id={headingId} data-hero-title>
        <Phrases phrases={title} />
      </h1>
      <p data-hero-lede>
        <Phrases phrases={lede} />
      </p>
    </div>
  );
}

function Phrases({ phrases }: { phrases: readonly HeroPhrase[] }) {
  return phrases.map((phrase, k) => (
    <Fragment key={phrase.text}>
      <RevealLine>{phrase.text}</RevealLine>
      {/* The space a reader of the text needs between two phrases; dropped
          at a line's end on the screen. */}
      {k < phrases.length - 1 ? " " : null}
      {phrase.breakAfter ? <br data-hero-break={phrase.breakAfter} /> : null}
    </Fragment>
  ));
}
