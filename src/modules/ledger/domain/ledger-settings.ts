import { AppError, ErrorCode, type FieldIssue } from "@/core/errors";
import { type Cents, MAX_ENTRY_CENTS } from "@/core/money";
import { err, ok, type Result } from "@/core/result";
import { type CreditPolicy, DEFAULT_POLICY } from "./account";
import { cleanText } from "./customer";

/** The ledger's own details and credit rules. Synced to every phone of the ledger (last write wins). */
export interface LedgerSettings extends CreditPolicy {
  readonly name: string;
  readonly updatedAt: Date;
}

export const LEDGER_NAME_MAX = 60;

export const DEFAULT_SETTINGS: LedgerSettings = {
  name: "My listahan",
  ...DEFAULT_POLICY,
  updatedAt: new Date(0),
};

export interface LedgerSettingsDraft {
  readonly name: string;
  readonly defaultLimit?: Cents;
  readonly overdueAfterDays?: number;
}

export function validateLedgerSettings(
  draft: LedgerSettingsDraft,
  current: LedgerSettings,
  now: Date,
): Result<LedgerSettings, AppError> {
  const issues: FieldIssue[] = [];
  const name = cleanText(draft.name);
  if (!name) issues.push({ field: "name", message: "Enter your listahan's name" });
  else if (name.length > LEDGER_NAME_MAX)
    issues.push({ field: "name", message: `Use ${LEDGER_NAME_MAX} characters or fewer` });

  const defaultLimit = draft.defaultLimit ?? current.defaultLimit;
  if (!Number.isSafeInteger(defaultLimit) || defaultLimit < 0 || defaultLimit > MAX_ENTRY_CENTS) {
    issues.push({ field: "defaultLimit", message: "Enter a limit between ₱0 and ₱10,000,000" });
  }
  const overdueAfterDays = draft.overdueAfterDays ?? current.overdueAfterDays;
  if (!Number.isInteger(overdueAfterDays) || overdueAfterDays < 1 || overdueAfterDays > 365) {
    issues.push({ field: "overdueAfterDays", message: "Use 1 to 365 days" });
  }
  if (issues.length || !name)
    return err(new AppError(ErrorCode.Validation, "Listahan settings are invalid", issues));
  return ok({ name, defaultLimit, overdueAfterDays, updatedAt: now });
}
