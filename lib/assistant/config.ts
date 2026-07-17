/** Model + cost knobs for the AI assistant. Change the model here only. */
export const ASSISTANT_MODEL = "claude-opus-4-8"

/** Maximum agent-loop steps (model turns) per request. */
export const MAX_STEPS = 8

/** Maximum output tokens per model turn. */
export const MAX_OUTPUT_TOKENS = 3000

/** Default number of rows a list tool returns when no limit is given. */
export const DEFAULT_ROW_LIMIT = 20

/** Hard cap on rows any list tool may return, regardless of requested limit. */
export const MAX_ROW_LIMIT = 50

/** Clamp a requested row limit into [1, MAX_ROW_LIMIT], defaulting when absent. */
export function clampRowLimit(limit?: number | null): number {
  if (limit == null || Number.isNaN(limit)) return DEFAULT_ROW_LIMIT
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_ROW_LIMIT)
}
