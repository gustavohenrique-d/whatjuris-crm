-- Fatia 2 do Financeiro: tipo de serviço na cobrança e preservação do valor
-- original ao editar uma parcela já paga.
--
-- Só colunas nullable em tabelas existentes: retrocompatível com as cobranças
-- já criadas, e sem RLS novo (charges/installments já têm, via 013).

ALTER TABLE "charges"      ADD COLUMN IF NOT EXISTS "service_type"    TEXT;
ALTER TABLE "installments" ADD COLUMN IF NOT EXISTS "original_amount" DECIMAL(14,2);
