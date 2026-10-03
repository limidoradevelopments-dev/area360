/**
 * Conditional class joiner.
 *
 * Keeps long Tailwind strings out of JSX attributes: call sites pass an array
 * of short, grouped fragments instead of one unreadable line, and falsy
 * branches simply drop out.
 */
export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");

export default cx;
