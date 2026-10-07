import assert from 'node:assert/strict';
import test from 'node:test';
import { isRelevantAuditLink } from '../src/server/adapters/website.js';

test('auditoria de perfil Linktree não incorpora a página institucional do fornecedor ou outro negócio', () => {
  const profile = new URL('https://linktr.ee/clinica');
  assert.equal(isRelevantAuditLink(profile, new URL('https://linktr.ee/?utm_source=profile')), false);
  assert.equal(isRelevantAuditLink(profile, new URL('https://linktr.ee/outra-clinica')), false);
  assert.equal(isRelevantAuditLink(profile, new URL('https://linktr.ee/clinica/')), true);
  assert.equal(isRelevantAuditLink(new URL('https://clinica.example'), new URL('https://clinica.example/servicos')), true);
  assert.equal(isRelevantAuditLink(new URL('https://clinica.example'), new URL('https://outra.example/servicos')), false);
});
