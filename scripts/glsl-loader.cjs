/**
 * ─── GLSL comments out of the shipped script ───
 *
 * A Turbopack loader (next.config.ts, production builds only). The hero's
 * shaders are written as `/* glsl *\/` template literals, explained at
 * length in their comments — about a fifth of the engine's script by size
 * (2026-10-23: ~48 KB of its ~240 KB), downloaded and parsed on every first
 * visit and handed to the GPU for nothing. This takes the comments out of
 * those templates before the module is compiled, and nothing else:
 *
 *   a block comment becomes one space (as GLSL itself reads it: so a
 *   directive or a token on either side stays exactly as it was), a line
 *   comment goes to the end of its line, and the lines left empty go;
 *
 *   only inside a template marked `/* glsl *\/`; a template whose comment
 *   holds an interpolation (`${…}`), or that this cannot follow, is left as
 *   it was.
 *
 * The compiled programs are the same: a comment is never part of one.
 */

const MARK = "/* glsl */";

/** The template literal opening at `start` (its backtick): its end (index
 *  after the closing backtick) and its parts, text and interpolations in
 *  turn — or null where it cannot be followed (a nested template). */
function parseTemplate(source, start) {
  const parts = [];
  let text = "";
  let i = start + 1;
  while (i < source.length) {
    const c = source[i];
    if (c === "\\") {
      text += source.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === "`") {
      parts.push({ text });
      return { end: i + 1, parts };
    }
    if (c === "$" && source[i + 1] === "{") {
      parts.push({ text });
      text = "";
      let depth = 1;
      let j = i + 2;
      while (j < source.length && depth > 0) {
        const d = source[j];
        if (d === "`" || d === "'" || d === '"') return null;
        if (d === "{") depth += 1;
        else if (d === "}") depth -= 1;
        j += 1;
      }
      if (depth > 0) return null;
      parts.push({ expression: source.slice(i, j) });
      i = j;
      continue;
    }
    text += c;
    i += 1;
  }
  return null;
}

/** The template's parts with GLSL's comments taken out, or null where a
 *  comment runs into an interpolation. */
function strip(parts) {
  let state = "code";
  const out = [];
  for (const part of parts) {
    if (part.expression !== undefined) {
      if (state !== "code") return null;
      out.push(part.expression);
      continue;
    }
    /* A template's CRLF is read as LF by the language itself. */
    const t = part.text.replace(/\r\n/g, "\n");
    let s = "";
    for (let i = 0; i < t.length; i += 1) {
      const c = t[i];
      if (state === "block") {
        if (c === "*" && t[i + 1] === "/") {
          state = "code";
          i += 1;
          s += " ";
        }
        continue;
      }
      if (state === "line") {
        if (c === "\n") {
          state = "code";
          s += c;
        }
        continue;
      }
      if (c === "/" && t[i + 1] === "*") {
        state = "block";
        i += 1;
        continue;
      }
      if (c === "/" && t[i + 1] === "/") {
        state = "line";
        i += 1;
        continue;
      }
      s += c;
    }
    /* What the comments leave: trailing blanks, empty lines. */
    s = s.replace(/[ \t]+\n/g, "\n").replace(/\n(?:[ \t]*\n)+/g, "\n");
    out.push(s);
  }
  /* A line comment may end the template; a block comment may not. */
  if (state === "block") return null;
  return out;
}

module.exports = function glslLoader(source) {
  let result = "";
  let from = 0;
  for (let at = source.indexOf(MARK); at >= 0; at = source.indexOf(MARK, at + MARK.length)) {
    let tick = at + MARK.length;
    while (source[tick] === " ") tick += 1;
    if (source[tick] !== "`") continue;
    const template = parseTemplate(source, tick);
    if (!template) continue;
    const stripped = strip(template.parts);
    if (!stripped) continue;
    result += source.slice(from, tick) + "`" + stripped.join("") + "`";
    from = template.end;
  }
  return result + source.slice(from);
};
