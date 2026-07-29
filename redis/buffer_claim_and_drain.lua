-- WhatJuris CRM — Módulo 3: claim atômico + drain do buffer
-- redis/buffer_claim_and_drain.lua
-- Só a ÚLTIMA execução (latest == expected_id) reclama o lote. Move as
-- mensagens para a chave `processing` (recovery) e apaga messages/latest.
-- KEYS: 1=messages 2=latest 3=processing
-- ARGV: 1=expected_id 2=processing_ttl
-- Retorno (JSON): { claimed, recovered, owner_message_id?, items, reason? }

local messages_key    = KEYS[1]
local latest_key      = KEYS[2]
local processing_key  = KEYS[3]

local expected_id     = ARGV[1]
local processing_ttl  = tonumber(ARGV[2])

-- Recovery: se já existe um lote em processamento para este id, devolve-o.
local existing = redis.call('GET', processing_key)
if existing then
  return cjson.encode({
    claimed = true, recovered = true,
    owner_message_id = expected_id,
    items = cjson.decode(existing)
  })
end

local current_latest = redis.call('GET', latest_key)
if not current_latest then
  return cjson.encode({ claimed = false, recovered = false,
    reason = 'BUFFER_NOT_FOUND', items = {} })
end

if current_latest ~= expected_id then
  return cjson.encode({ claimed = false, recovered = false,
    reason = 'NOT_LATEST_EXECUTION', items = {} })
end

local items = redis.call('LRANGE', messages_key, 0, -1)
if #items == 0 then
  return cjson.encode({ claimed = false, recovered = false,
    reason = 'EMPTY_BUFFER', items = {} })
end

local encoded_items = cjson.encode(items)
redis.call('SET', processing_key, encoded_items, 'EX', processing_ttl)
redis.call('DEL', messages_key)
redis.call('DEL', latest_key)

return cjson.encode({
  claimed = true, recovered = false,
  owner_message_id = expected_id, items = items
})
