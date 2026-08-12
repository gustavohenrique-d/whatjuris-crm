-- CreateEnum (Financeiro fatia 1 — contas a receber)
DO $$ BEGIN
    CREATE TYPE "ChargeStatus" AS ENUM ('OPEN', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PAID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "charges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contact_id" UUID,
    "deal_id" UUID,
    "payer_name" TEXT,
    "description" TEXT NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "status" "ChargeStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "created_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "installments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "charge_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    -- DATE de propósito: vencimento é dia, não instante (sem fuso).
    "due_date" DATE NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMP(3),
    "paid_amount" DECIMAL(14,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "charges_contact_id_idx" ON "charges"("contact_id");
CREATE INDEX IF NOT EXISTS "charges_deal_id_idx" ON "charges"("deal_id");
CREATE UNIQUE INDEX IF NOT EXISTS "installments_charge_id_number_key" ON "installments"("charge_id", "number");
-- Índice da consulta de atrasado: PENDING com due_date < hoje.
CREATE INDEX IF NOT EXISTS "installments_status_due_date_idx" ON "installments"("status", "due_date");

-- AddForeignKey
ALTER TABLE "charges" DROP CONSTRAINT IF EXISTS "charges_contact_id_fkey";
ALTER TABLE "charges" ADD CONSTRAINT "charges_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "charges" DROP CONSTRAINT IF EXISTS "charges_deal_id_fkey";
ALTER TABLE "charges" ADD CONSTRAINT "charges_deal_id_fkey"
    FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "charges" DROP CONSTRAINT IF EXISTS "charges_created_by_fkey";
ALTER TABLE "charges" ADD CONSTRAINT "charges_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "installments" DROP CONSTRAINT IF EXISTS "installments_charge_id_fkey";
ALTER TABLE "installments" ADD CONSTRAINT "installments_charge_id_fkey"
    FOREIGN KEY ("charge_id") REFERENCES "charges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
