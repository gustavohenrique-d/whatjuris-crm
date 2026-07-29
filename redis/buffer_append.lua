-- WhatJuris CRM — Módulo 3: append atômico no buffer de mensagens
-- redis/buffer_append.lua
-- Idempotência via SET `seen` + RPUSH na lista. Renova o `latest` (último id).
-- KEYS: 1=messages 2=latest 3=seen
-- ARGV: 1=payload(json) 2=message_id 3=buffer_ttl 4=seen_ttl 5=max_messages
-- Retorno (JSON): { appended, duplicate, length, force_flush }

local messages_key = KEYS[1]
local latest_key   = KEYS[2]
local seen_key     = KEYS[3]

local payload      = ARGV[1]
local message_id   = ARGV[2]
local buffer_ttl   = tonumber(ARGV[3])
local seen_ttl     = tonumber(ARGV[4])
local max_messages = tonumber(ARGV[5])

-- SADD devolve 0 quando o id já estava no set → mensagem duplicada.
local added = redis.call('SADD', seen_key, message_id)

if added == 0 then
  redis.call('EXPIRE', seen_key, seen_ttl)
  return cjson.encode({
    appended = false, duplicate = true,
    length = redis.call('LLEN', messages_key), force_flush = false
  })
end

redis.call('RPUSH', messages_key, payload)
redis.call('SET', latest_key, message_id, 'EX', buffer_ttl)
redis.call('EXPIRE', messages_key, buffer_ttl)
redis.call('EXPIRE', seen_key, seen_ttl)

local length = redis.call('LLEN', messages_key)
return cjson.encode({
  appended = true, duplicate = false,
  length = length, force_flush = length >= max_messages
})
