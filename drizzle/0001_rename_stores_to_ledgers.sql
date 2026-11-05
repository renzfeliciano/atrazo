-- The app calls a store a "listahan"; the database now says "ledger".
-- Renames only: no row, key or backup is moved, copied or dropped.
-- Every step checks first, so this also works on a database where part of it was already done
-- by hand (for example, the table renamed in the Neon console).
DO $$
BEGIN
  IF to_regclass('public.stores') IS NOT NULL THEN
    ALTER TABLE "stores" RENAME TO "ledgers";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'devices' AND column_name = 'store_id') THEN
    ALTER TABLE "devices" RENAME COLUMN "store_id" TO "ledger_id";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'changes' AND column_name = 'store_id') THEN
    ALTER TABLE "changes" RENAME COLUMN "store_id" TO "ledger_id";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_pkey') THEN
    ALTER TABLE "ledgers" RENAME CONSTRAINT "stores_pkey" TO "ledgers_pkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'changes_store_id_id_pk') THEN
    ALTER TABLE "changes" RENAME CONSTRAINT "changes_store_id_id_pk" TO "changes_ledger_id_id_pk";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'changes_store_id_stores_id_fk') THEN
    ALTER TABLE "changes" RENAME CONSTRAINT "changes_store_id_stores_id_fk" TO "changes_ledger_id_ledgers_id_fk";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devices_store_id_stores_id_fk') THEN
    ALTER TABLE "devices" RENAME CONSTRAINT "devices_store_id_stores_id_fk" TO "devices_ledger_id_ledgers_id_fk";
  END IF;
END $$;--> statement-breakpoint
ALTER INDEX IF EXISTS "stores_code_lookup_uq" RENAME TO "ledgers_code_lookup_uq";--> statement-breakpoint
ALTER INDEX IF EXISTS "devices_store_idx" RENAME TO "devices_ledger_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "changes_store_seq_idx" RENAME TO "changes_ledger_seq_idx";
