-- CreateTable (Módulo 5 — fragmentos de resposta ao WhatsApp)
CREATE TABLE "outbound_message_fragments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "deal_id" UUID,
    "instance_name" VARCHAR(100) NOT NULL,
    "chat_id" VARCHAR(100) NOT NULL,
    "response_id" VARCHAR(255) NOT NULL,
    "source_message_id" VARCHAR(255) NOT NULL,
    "fragment_id" VARCHAR(300) NOT NULL,
    "fragment_index" INTEGER NOT NULL,
    "fragment_total" INTEGER NOT NULL,
    "content_hash" VARCHAR(128) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'reserved',
    "meta_message_id" VARCHAR(255),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" VARCHAR(100),
    "reserved_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_message_fragments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outbound_message_fragments_status_check"
        CHECK ("status" IN ('reserved','sending','sent','failed','unknown','cancelled'))
);

-- CreateIndex
CREATE UNIQUE INDEX "outbound_message_fragments_instance_name_chat_id_response_id_fragment_index_key"
    ON "outbound_message_fragments"("instance_name", "chat_id", "response_id", "fragment_index");

-- AddForeignKey
ALTER TABLE "outbound_message_fragments"
    ADD CONSTRAINT "outbound_message_fragments_deal_id_fkey"
    FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS (decisão travada 10)
ALTER TABLE "outbound_message_fragments" ENABLE ROW LEVEL SECURITY;
