-- ===========================================================================
-- 011 — Sincroniza deals.stage_id a partir de deals.status
--
-- Fecha o lado simétrico da decisão 6 do CLAUDE.md. O trigger 002
-- (sync_deal_status_from_stage) já cobre etapa → status, mas o caminho
-- inverso ficava aberto: escrever `status = 'LOST'` sem tocar em stage_id
-- não disparava nada, e o deal ficava LOST apontando para uma etapa OPEN.
-- Como o board do funil agrupa por ETAPA e ignora o status, esses deals
-- apareciam na coluna "Novo contato" — o bug que originou esta migration.
--
-- Idempotente: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.sync_deal_stage_from_status()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_alvo    "StageType";
    v_atual   "StageType";
    v_stage   uuid;
BEGIN
    -- OPEN não força etapa: existem várias etapas OPEN no funil e escolher
    -- uma seria arbitrário — reabrir um deal não diz PARA ONDE ele volta.
    IF NEW.status = 'LOST' THEN
        v_alvo := 'LOST';
    ELSIF NEW.status = 'WON' THEN
        v_alvo := 'WON';
    ELSE
        RETURN NEW;
    END IF;

    -- O chamador moveu a etapa explicitamente neste mesmo UPDATE: a etapa é a
    -- fonte da verdade (decisão 6), então sai de cena e deixa o
    -- sync_deal_status_from_stage derivar o status dela. Sem esta guarda, um
    -- UPDATE com status e stage_id discordantes teria a etapa sobrescrita —
    -- exatamente o inverso da regra.
    IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
        RETURN NEW;
    END IF;

    SELECT s.type INTO v_atual
      FROM public.pipeline_stages s
     WHERE s.id = NEW.stage_id;

    -- Já coerente (inclusive quando o UPDATE mexeu em status E stage_id, e o
    -- chamador mandou os dois certos): nada a fazer.
    IF v_atual = v_alvo THEN
        RETURN NEW;
    END IF;

    -- Critério documentado para funil com mais de uma etapa do mesmo tipo:
    -- a de MENOR position; `id` como desempate para o resultado ser estável.
    SELECT s.id INTO v_stage
      FROM public.pipeline_stages s
     WHERE s.pipeline_id = NEW.pipeline_id
       AND s.type = v_alvo
     ORDER BY s.position ASC, s.id ASC
     LIMIT 1;

    -- Funil sem etapa desse tipo: preserva o status pedido e não inventa
    -- destino. Deixar stage_id intacto é melhor que falhar o UPDATE.
    IF v_stage IS NULL THEN
        RETURN NEW;
    END IF;

    NEW.stage_id  := v_stage;
    NEW.closed_at := COALESCE(NEW.closed_at, now());

    -- entered_stage_at NÃO é ajustado aqui de propósito: quem cuida disso é o
    -- deals_track_stage, que roda logo depois (ver nota de ordem abaixo) e
    -- também grava a linha em deal_stage_history.
    RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- ORDEM DE DISPARO (crítica). Postgres executa triggers BEFORE ... FOR EACH ROW
-- em ordem ALFABÉTICA do nome. Daí o prefixo `deals_`:
--
--   1. deals_sync_stage_from_status   (este)  → ajusta NEW.stage_id
--   2. deals_track_stage                      → vê OLD.stage_id <> NEW.stage_id,
--                                               grava o histórico e atualiza
--                                               entered_stage_at
--   3. sync_deal_status_from_stage            → só dispara se stage_id estiver
--                                               no SET; confirma o status
--
-- Se este trigger rodasse DEPOIS do deals_track_stage, a mudança de etapa que
-- ele faz não entraria em deal_stage_history.
--
-- SEM RECURSÃO: os três são BEFORE ... FOR EACH ROW e apenas modificam NEW.
-- Nenhum executa UPDATE aninhado, e alterar NEW dentro de um trigger BEFORE não
-- redispara trigger nenhum. O loop é impossível por construção, não por guarda.
--
-- CONFLITO status × stage no mesmo UPDATE: a etapa vence, porque
-- sync_deal_status_from_stage roda por último e deriva o status dela. Isso
-- mantém a decisão 6 (etapa é a fonte da verdade) — este trigger só cobre o
-- caso em que a etapa NÃO foi informada.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS deals_sync_stage_from_status ON public.deals;
CREATE TRIGGER deals_sync_stage_from_status
    BEFORE UPDATE OF status ON public.deals
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_deal_stage_from_status();
