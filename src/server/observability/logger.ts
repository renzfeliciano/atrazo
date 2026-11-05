/* eslint-disable no-console -- this module is the one sanctioned sink for server logs. */

/**
 * Structured JSON logs for Vercel's log viewer. Callers pass event names, ids and error codes:
 * never recovery codes, tokens, ciphertext, IP addresses or anything a person typed.
 */
type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFields = Record<string, string | number | boolean | null | undefined>;

function threshold(): number {
  const v = process.env.LOG_LEVEL as Level | undefined;
  return order[v ?? "info"] ?? order.info;
}

function emit(level: Level, event: string, fields: LogFields = {}) {
  if (order[level] < threshold()) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const log = {
  debug: (event: string, fields?: LogFields) => emit("debug", event, fields),
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
  error: (event: string, fields?: LogFields) => emit("error", event, fields),
};
