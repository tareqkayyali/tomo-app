/**
 * Auto-heal patch transformer.
 *
 * Takes a CQE ProposedPatch (see services/quality/autoRepair.ts) and produces
 * concrete file edits. Phase 5 MVP supports ONE patch_type:
 *
 *   constant_update — change a numeric constant's value, capped by max_value.
 *     Example spec (from seed in migration 051):
 *       {
 *         type: "constant_update",
 *         symbol: "RAG_TOP_K",
 *         proposed_new_value: "current+2",
 *         max_value: 10
 *       }
 *
 * Other patch_types (prompt_block_reinforce, intent_registry, etc.) return
 * an unsupported error until Phase 6 extends this module.
 *
 * Pure functions. I/O is done by the applier in services/autoHeal/applier.ts —
 * this module takes file content strings and returns transformed content
 * strings. Makes it testable and keeps safety decisions visible.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface PatchSpec {
  type: string;
  // constant_update fields
  symbol?: string;
  proposed_new_value?: string | number;
  max_value?: number;
  // other patch_type fields tolerated but not consumed here
  [key: string]: unknown;
}

export type TransformSuccess = {
  ok: true;
  newContent: string;
  before: string; // the matched line text
  after: string;  // the replaced line text
  oldValue: string;
  newValue: string;
  symbol: string;
};

export type TransformFailure = {
  ok: false;
  reason: string;
};

export type TransformResult = TransformSuccess | TransformFailure;


// ── Public entry ─────────────────────────────────────────────────────

export function applyPatchToFile(args: {
  fileContent: string;
  filePath: string;
  patchSpec: PatchSpec;
}): TransformResult {
  const { type } = args.patchSpec;

  switch (type) {
    case "constant_update":
      return applyConstantUpdate(args.fileContent, args.patchSpec);
    case "prompt_block_reinforce":
    case "intent_registry":
      return {
        ok: false,
        reason: `patch_type '${type}' not yet supported by Phase 5 applier`,
      };
    default:
      return {
        ok: false,
        reason: `unknown patch_type '${type}'`,
      };
  }
}


// ── constant_update implementation ───────────────────────────────────

function applyConstantUpdate(
  fileContent: string,
  spec: PatchSpec,
): TransformResult {
  if (!spec.symbol || typeof spec.symbol !== "string") {
    return { ok: false, reason: "constant_update missing 'symbol'" };
  }
  if (spec.proposed_new_value === undefined || spec.proposed_new_value === null) {
    return {
      ok: false,
      reason: "constant_update missing 'proposed_new_value'",
    };
  }

  const symbol = spec.symbol;
  const match = findConstantDeclaration(fileContent, symbol);
  if (!match) {
    return {
      ok: false,
      reason: `symbol '${symbol}' not found as a top-level const declaration`,
    };
  }

  const currentNum = parseNumericLiteral(match.valueExpr);
  if (currentNum === null) {
    return {
      ok: false,
      reason: `symbol '${symbol}' current value '${match.valueExpr}' is not a simple numeric literal; refusing to modify`,
    };
  }

  const resolved = resolveProposedValue(spec.proposed_new_value, currentNum);
  if (resolved === null) {
    return {
      ok: false,
      reason: `could not resolve proposed_new_value '${String(spec.proposed_new_value)}'`,
    };
  }

  let finalValue = resolved;
  if (typeof spec.max_value === "number" && Number.isFinite(spec.max_value)) {
    finalValue = Math.min(finalValue, spec.max_value);
  }

  // Guardrail: refuse a no-op change. Subsequent dedup depends on seeing
  // a real diff; no-ops would churn the PR queue.
  if (finalValue === currentNum) {
    return {
      ok: false,
      reason: `proposed value ${finalValue} equals current value ${currentNum} (would be a no-op)`,
    };
  }

  // Guardrail: refuse negative or NaN.
  if (!Number.isFinite(finalValue) || finalValue < 0) {
    return {
      ok: false,
      reason: `proposed value ${finalValue} is invalid (NaN or negative)`,
    };
  }

  const newLine = match.fullLine.replace(
    match.valueExpr,
    String(finalValue),
  );
  const newContent =
    fileContent.slice(0, match.lineStart) +
    newLine +
    fileContent.slice(match.lineStart + match.fullLine.length);

  return {
    ok: true,
    newContent,
    before: match.fullLine,
    after: newLine,
    oldValue: String(currentNum),
    newValue: String(finalValue),
    symbol,
  };
}


// ── Helpers (pure) ───────────────────────────────────────────────────

interface ConstantMatch {
  fullLine: string;      // text of the matched line (no trailing newline)
  lineStart: number;     // byte offset of line start in fileContent
  valueExpr: string;     // the raw value expression ('10', '10.5', etc.)
}

/**
 * Find a top-level `const SYMBOL = <value>;` declaration. Accepts optional
 * `export` modifier and optional type annotation. Returns the first match
 * encountered; refuses when there are multiple matches to avoid ambiguity.
 */
export function findConstantDeclaration(
  content: string,
  symbol: string,
): ConstantMatch | null {
  // Escape regex metachars in symbol.
  const escSym = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Matches: `(export )? const FOO(: type)? = value;` at line start.
  const re = new RegExp(
    `^(?:export\\s+)?const\\s+${escSym}\\s*(?::\\s*[^=]+)?\\s*=\\s*([^;\\n]+);`,
    "gm",
  );

  let matches: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    matches.push(m);
    if (matches.length > 1) break; // ambiguous — stop
  }

  if (matches.length === 0) return null;
  if (matches.length > 1) {
    // Ambiguous — caller's error path returns a failure
    return null;
  }

  const hit = matches[0];
  const lineStart = hit.index;
  const fullLine = hit[0];
  const valueExpr = hit[1].trim();
  return { fullLine, lineStart, valueExpr };
}

/**
 * Parse a simple numeric literal. Accepts `10`, `10.5`, `+2`, `-3`.
 * Returns null for anything complex (function calls, string concat, etc.)
 * because rewriting those safely is out of scope for the MVP transformer.
 */
export function parseNumericLiteral(expr: string): number | null {
  const trimmed = expr.trim();
  if (!/^[-+]?\d+(?:\.\d+)?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve a proposed value that may be:
 *   - a number: 10
 *   - a numeric string: "10"
 *   - a relative expression: "current+N" or "current-N"
 */
export function resolveProposedValue(
  proposed: unknown,
  current: number,
): number | null {
  if (typeof proposed === "number" && Number.isFinite(proposed)) {
    return proposed;
  }
  if (typeof proposed !== "string") return null;
  const trimmed = proposed.trim();

  const relMatch = trimmed.match(/^current\s*([+-])\s*(\d+(?:\.\d+)?)$/);
  if (relMatch) {
    const sign = relMatch[1] === "+" ? 1 : -1;
    const delta = parseFloat(relMatch[2]);
    if (!Number.isFinite(delta)) return null;
    return current + sign * delta;
  }

  // Plain numeric string
  const plain = parseNumericLiteral(trimmed);
  return plain;
}
