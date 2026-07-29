-- CreateTable
CREATE TABLE "conversation_controls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "deal_id" UUID,
    "instance_name" VARCHAR(100) NOT NULL,
    "chat_id" VARCHAR(100) NOT NULL,
    "mode" VARCHAR(10) NOT NULL DEFAULT 'ai',
    "blocked_until" TIMESTAMPTZ,
    "taken_over_at" TIMESTAMPTZ,
    "taken_over_by" UUID,
    "takeover_source" VARCHAR(30),
    "control_version" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_controls_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversation_controls_mode_check" CHECK ("mode" IN ('ai', 'human')),
    CONSTRAINT "conversation_controls_takeover_source_check"
        CHECK ("takeover_source" IS NULL OR "takeover_source" IN ('human_mobile', 'crm_human', 'admin', 'automatic_timeout'))
);

-- CreateIndex
CREATE UNIQUE INDEX "conversation_controls_instance_name_chat_id_key"
    ON "conversation_controls"("instance_name", "chat_id");

-- CreateTable
CREATE TABLE "conversation_control_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_control_id" UUID NOT NULL,
    "event_type" VARCHAR(30) NOT NULL,
    "actor_user_id" UUID,
    "source" VARCHAR(30) NOT NULL,
    "message_id" VARCHAR(255),
    "previous_mode" VARCHAR(10),
    "new_mode" VARCHAR(10) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_control_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversation_control_events_event_type_check"
        CHECK ("event_type" IN ('takeover_started', 'takeover_refreshed', 'takeover_released', 'takeover_expired', 'cache_rehydrated'))
);

-- CreateIndex
CREATE INDEX "conversation_control_events_control_id_idx"
    ON "conversation_control_events"("conversation_control_id");

-- AddForeignKey
ALTER TABLE "conversation_control_events"
    ADD CONSTRAINT "conversation_control_events_conversation_control_id_fkey"
    FOREIGN KEY ("conversation_control_id") REFERENCES "conversation_controls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (decisão travada 10): habilitado sem policy → bloqueia a API REST do Supabase.
ALTER TABLE "conversation_controls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversation_control_events" ENABLE ROW LEVEL SECURITY;
