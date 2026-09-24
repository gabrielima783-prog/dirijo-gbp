import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPlainLanguage, simplifyTechnicalLanguage } from '../src/core/content.js';

test('traduz nomes internos e termos técnicos antes de montar os slides', () => {
  const technical = 'ownerResponseCount = 0 e ownerResponseRate = 0. O site opera em HTTPS, tem sitemap e structured data, napConsistency negativos, score 94 e CTAs. O engajamento gera leads no CRM.';
  const simple = simplifyTechnicalLanguage(technical);
  assert.match(simple, /nenhuma das avaliações analisadas recebeu resposta pública da empresa/i);
  assert.match(simple, /conexão segura/i);
  assert.match(simple, /estrutura que ajuda o Google/i);
  assert.match(simple, /nome, endereço e telefone não encontrados/i);
  assert.match(simple, /94 pontos no teste de desempenho no celular/i);
  assert.match(simple, /interações gera pessoas interessadas na organização dos contatos/i);
  assert.doesNotMatch(simple, /ownerResponse|HTTPS|sitemap|structured data|napConsistency|score|CTA|engajamento|leads?|CRM/i);
  assert.doesNotThrow(() => assertPlainLanguage(simple));
});

test('bloqueia linguagem interna se alguma etapa tentar publicá-la', () => {
  for (const term of ['ownerResponseCount', 'napConsistency', 'structured data', 'sitemap', 'HTTPS', 'score 94', '105 reviews', 'business account', 'engajamento', 'prova social', 'leads', 'CRM', 'rastreamento', 'SEO']) {
    assert.throws(() => assertPlainLanguage(term));
  }
});
