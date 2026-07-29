-- AlterTable (Módulo 4 — triagem jurídica)
ALTER TABLE "deals" ADD COLUMN "urgencia" VARCHAR(10);
ALTER TABLE "deals" ADD COLUMN "fase_triagem" VARCHAR(30) NOT NULL DEFAULT 'coletando_dados';
ALTER TABLE "deals" ADD COLUMN "qualified_at" TIMESTAMPTZ;
ALTER TABLE "deals" ADD COLUMN "instance_name" VARCHAR(100);

-- CheckConstraints
ALTER TABLE "deals" ADD CONSTRAINT "deals_urgencia_check"
    CHECK ("urgencia" IS NULL OR "urgencia" IN ('Baixa', 'Média', 'Alta'));
ALTER TABLE "deals" ADD CONSTRAINT "deals_fase_triagem_check"
    CHECK ("fase_triagem" IN ('coletando_dados', 'qualificado', 'desqualificado'));

-- CreateIndex
CREATE INDEX "deals_instance_name_idx" ON "deals"("instance_name");
