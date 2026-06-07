// Test-only SQL-seed parser. Lets `seed-migration-parity.test.ts` compare the
// applied seed migration against `lib/programs/seed.ts` so the two hand-authored
// copies of the program/university data cannot silently drift.

export type SqlValue = string | number | boolean | null | string[];

/**
 * Parse one `insert into <table> (cols) values (..),(..) on conflict …` block into
 * row objects keyed by column name. Values are decoded to JS: quoted → string,
 * `NULL` → null, `ARRAY[..]` → string[], bare numerics → number.
 */
export function parseInsertBlock(sql: string, table: string): Record<string, SqlValue>[] {
  const re = new RegExp(
    `insert\\s+into\\s+${table.replace(/\./g, "\\.")}\\s*\\(([^)]*)\\)\\s*values\\s*([\\s\\S]*?)\\s*on\\s+conflict`,
    "i",
  );
  const m = sql.match(re);
  if (!m || m[1] === undefined || m[2] === undefined) {
    throw new Error(`parseInsertBlock: no insert block found for ${table}`);
  }
  const columns = m[1].split(",").map((c) => c.trim());
  return splitTuples(m[2]).map((tuple) => {
    const values = splitTopLevel(tuple).map(parseValue);
    if (values.length !== columns.length) {
      throw new Error(
        `parseInsertBlock: ${table} row has ${values.length} values for ${columns.length} columns — ${tuple}`,
      );
    }
    const row: Record<string, SqlValue> = {};
    columns.forEach((c, i) => (row[c] = values[i]!));
    return row;
  });
}

/** Top-level parenthesised tuples, ignoring parens inside quoted strings (e.g. "(Hons)"). */
function splitTuples(block: string): string[] {
  const tuples: string[] = [];
  let depth = 0;
  let inQuote = false;
  let start = -1;
  for (let i = 0; i < block.length; i++) {
    const ch = block[i];
    if (inQuote) {
      if (ch === "'") {
        if (block[i + 1] === "'") {
          i++; // escaped '' inside a string
          continue;
        }
        inQuote = false;
      }
      continue;
    }
    if (ch === "'") inQuote = true;
    else if (ch === "(") {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0 && start >= 0) {
        tuples.push(block.slice(start, i));
        start = -1;
      }
    }
  }
  return tuples;
}

/** Split comma-separated values, respecting quotes and ARRAY[...] brackets. */
function splitTopLevel(tuple: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inQuote = false;
  let cur = "";
  for (let i = 0; i < tuple.length; i++) {
    const ch = tuple[i];
    if (inQuote) {
      cur += ch;
      if (ch === "'") {
        if (tuple[i + 1] === "'") {
          cur += tuple[++i];
          continue;
        }
        inQuote = false;
      }
      continue;
    }
    if (ch === "'") {
      inQuote = true;
      cur += ch;
    } else if (ch === "[") {
      depth++;
      cur += ch;
    } else if (ch === "]") {
      depth--;
      cur += ch;
    } else if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim() !== "") out.push(cur.trim());
  return out;
}

function parseValue(tok: string): SqlValue {
  if (tok === "NULL") return null;
  if (tok.startsWith("'") && tok.endsWith("'")) return tok.slice(1, -1).replace(/''/g, "'");
  if (tok.startsWith("ARRAY[")) {
    const inner = tok.slice(tok.indexOf("[") + 1, tok.lastIndexOf("]"));
    return inner.trim() === "" ? [] : splitTopLevel(inner).map((s) => parseValue(s) as string);
  }
  const n = Number(tok);
  return !Number.isNaN(n) && tok.trim() !== "" ? n : tok;
}
