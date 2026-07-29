import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

describe('workflow n8n modulo-03', () => {
  const raw = readFileSync(path.join(process.cwd(), 'workflows/modulo-03-buffer-mensagens.json'), 'utf8');

  it('é JSON válido (caso 22)', () => {
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('não contém segredos hardcoded (caso 21)', () => {
    expect(/sk-[A-Za-z0-9]/.test(raw)).toBe(false);
    expect(/Bearer\s+[A-Za-z0-9]/.test(raw)).toBe(false);
    expect(/"password"\s*:\s*"[^"]+"/.test(raw)).toBe(false);
    // auth via credencial Custom Auth no n8n — header x-webhook-secret removido.
    expect(raw.includes('WEBHOOK_SECRET')).toBe(false);
  });

  it('tem o nó Wait usando MESSAGE_BUFFER_WAIT_SECONDS', () => {
    const wf = JSON.parse(raw);
    const wait = wf.nodes.find((n) => n.type === 'n8n-nodes-base.wait');
    expect(wait).toBeTruthy();
    expect(String(wait.parameters.amount)).toContain('MESSAGE_BUFFER_WAIT_SECONDS');
  });
});
