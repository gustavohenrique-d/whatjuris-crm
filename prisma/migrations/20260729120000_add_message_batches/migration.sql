-- CreateTable
CREATE TABLE "message_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "instance_name" VARCHAR(100) NOT NULL,
    "chat_id" VARCHAR(100) NOT NULL,
    "owner_message_id" VARCHAR(255) NOT NULL,
    "message_ids" JSONB NOT NULL,
    "consolidated_message" TEXT NOT NULL,
    "message_count" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ,

    CONSTRAINT "message_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "message_batches_status_check" CHECK ("status" IN ('pending', 'processing', 'processed', 'failed'))
);

-- CreateIndex
CREATE UNIQUE INDEX "message_batches_instance_name_chat_id_owner_message_id_key"
    ON "message_batches"("instance_name", "chat_id", "owner_message_id");

-- RLS (decisão travada 10)
ALTER TABLE "message_batches" ENABLE ROW LEVEL SECURITY;
