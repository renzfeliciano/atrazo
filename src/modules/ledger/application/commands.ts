import { AppError, ErrorCode } from "@/core/errors";
import { type Cents } from "@/core/money";
import { err, ok, type Result } from "@/core/result";
import { type AccountSummary, summarizeAccount } from "../domain/account";
import * as customer from "../domain/customer";
import { type Customer, type CustomerDraft } from "../domain/customer";
import * as entry from "../domain/entry";
import { type Entry } from "../domain/entry";
import { type CustomerId, type EntryId } from "../domain/ids";
import { type LedgerDeps } from "./ports";

export interface RecordEntryInput {
  readonly customerId: CustomerId;
  readonly kind: "utang" | "bayad";
  readonly amount: Cents;
  readonly note?: string | null;
  readonly occurredAt?: Date;
}

export interface RecordedEntry {
  readonly entry: Entry;
  readonly customer: Customer;
  readonly account: AccountSummary;
}

export interface CreateCustomerInput extends CustomerDraft {
  /** A balance carried over from a paper notebook; saved as the first utang entry. */
  readonly startingBalance?: Cents | null;
}

export type UndoOutcome = "removed" | "voided";

const notFound = (what: string) => err(new AppError(ErrorCode.NotFound, `${what} not found`));

/** Write-side use cases of the ledger. Every write is atomic and queued for encrypted backup. */
export function ledgerCommands(deps: LedgerDeps) {
  const { customers, entries, outbox, settings, uow, ids, clock } = deps;

  async function accountOf(c: Customer, now: Date): Promise<AccountSummary> {
    return summarizeAccount(await entries.listByCustomer(c.id), await settings.getPolicy(), c.creditLimit, now);
  }

  async function addEntry(e: Entry): Promise<void> {
    await entries.add(e);
    await outbox.enqueue({ type: "entry.added", entry: e });
  }

  return {
    async createCustomer(input: CreateCustomerInput): Promise<Result<Customer, AppError>> {
      const now = clock.now();
      const created = customer.createCustomer(ids.customerId(), input, now);
      if (!created.ok) return created;

      let opening: Entry | null = null;
      if (input.startingBalance != null && input.startingBalance !== 0) {
        const r = entry.recordEntry(
          { id: ids.entryId(), customerId: created.value.id, kind: "utang", amount: input.startingBalance, note: "Starting balance", occurredAt: now },
          now,
        );
        if (!r.ok) return err(new AppError(ErrorCode.Validation, r.error.message, r.error.issues.map((i) => ({ ...i, field: "startingBalance" }))));
        opening = r.value;
      }

      await uow.run(async () => {
        await customers.save(created.value);
        await outbox.enqueue({ type: "customer.saved", customer: created.value });
        if (opening) await addEntry(opening);
      });
      return created;
    },

    async updateCustomer(id: CustomerId, draft: CustomerDraft): Promise<Result<Customer, AppError>> {
      return uow.run(async () => {
        const current = await customers.get(id);
        if (!current) return notFound("Customer");
        const updated = customer.updateCustomer(current, draft, clock.now());
        if (!updated.ok) return updated;
        await customers.save(updated.value);
        await outbox.enqueue({ type: "customer.saved", customer: updated.value });
        return updated;
      });
    },

    async setHidden(id: CustomerId, hidden: boolean): Promise<Result<Customer, AppError>> {
      return uow.run(async () => {
        const current = await customers.get(id);
        if (!current) return notFound("Customer");
        const now = clock.now();
        const next = hidden ? customer.hideCustomer(current, now) : customer.restoreCustomer(current, now);
        if (next !== current) {
          await customers.save(next);
          await outbox.enqueue({ type: "customer.saved", customer: next });
        }
        return ok(next);
      });
    },

    async recordEntry(input: RecordEntryInput): Promise<Result<RecordedEntry, AppError>> {
      return uow.run(async () => {
        const c = await customers.get(input.customerId);
        if (!c || c.hiddenAt) return notFound("Customer");
        const now = clock.now();
        const r = entry.recordEntry(
          { id: ids.entryId(), customerId: c.id, kind: input.kind, amount: input.amount, note: input.note ?? null, occurredAt: input.occurredAt ?? now },
          now,
        );
        if (!r.ok) return r;
        await addEntry(r.value);
        return ok({ entry: r.value, customer: c, account: await accountOf(c, now) });
      });
    },

    async voidEntry(id: EntryId, reason?: string | null): Promise<Result<Entry, AppError>> {
      return uow.run(async () => {
        const target = await entries.get(id);
        if (!target) return notFound("Entry");
        const v = entry.voidEntry(target, await entries.listByCustomer(target.customerId), { id: ids.entryId(), reason: reason ?? null }, clock.now());
        if (!v.ok) return v;
        await addEntry(v.value);
        return v;
      });
    },

    /**
     * The toast's Undo. An entry that never left this phone is removed as if it never happened;
     * one that was already backed up is voided, so other phones see the correction.
     */
    async undoEntry(id: EntryId): Promise<Result<UndoOutcome, AppError>> {
      return uow.run(async () => {
        const target = await entries.get(id);
        if (!target) return notFound("Entry");
        if (await outbox.discard(id)) {
          await entries.removeUnsynced(id);
          return ok("removed" as const);
        }
        const v = entry.voidEntry(target, await entries.listByCustomer(target.customerId), { id: ids.entryId(), reason: "Undone" }, clock.now());
        if (!v.ok) return v;
        await addEntry(v.value);
        return ok("voided" as const);
      });
    },
  };
}

export type LedgerCommands = ReturnType<typeof ledgerCommands>;
