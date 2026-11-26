import type { Diagnostics } from "./diagnostics.ts";

export type Entity = Map<string, string>;

/** Parses the text of a Quake-family entity lump: `{ "key" "value" ... }` blocks. */
export function parseEntities(text: string, diag: Diagnostics): Entity[] {
  const tokens = /\s+|\/\/[^\n]*|"([^"]*)"|([{}])|([^\s{}"]+|")/y;
  const entities: Entity[] = [];
  let current: Entity | null = null;
  let key: string | null = null;

  let match: RegExpExecArray | null;
  while ((match = tokens.exec(text)) !== null) {
    const [, quoted, brace, stray] = match;
    if (brace === "{") {
      if (current) diag.error("entities.nested-block", "'{' inside an entity block");
      current = new Map();
      key = null;
    } else if (brace === "}") {
      if (!current) {
        diag.error("entities.unmatched-brace", "'}' without a matching '{'");
        continue;
      }
      if (key !== null) diag.warn("entities.missing-value", `key "${key}" has no value`);
      entities.push(current);
      current = null;
      key = null;
    } else if (quoted !== undefined) {
      if (!current) diag.warn("entities.text-outside-block", `"${quoted}" is outside an entity block`);
      else if (key === null) key = quoted;
      else {
        if (current.has(key)) diag.info("entities.duplicate-key", `key "${key}" repeats; last value wins`);
        current.set(key, quoted);
        key = null;
      }
    } else if (stray !== undefined) {
      diag.warn("entities.unexpected-token", `unexpected text ${JSON.stringify(stray.slice(0, 32))}`);
    }
  }
  if (current) diag.error("entities.unterminated-block", "entity lump ends inside a block");
  return entities;
}
