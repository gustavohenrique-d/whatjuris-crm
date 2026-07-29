-- CreateTable
CREATE TABLE "webhook_idempotency" (
    "id" UUID NOT NULL,
    "message_id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_idempotency_message_id_key" ON "webhook_idempotency"("message_id");

-- CreateIndex
CREATE INDEX "webhook_idempotency_processed_at_idx" ON "webhook_idempotency"("processed_at");
