import assert from 'node:assert/strict';
import test from 'node:test';
import { toneForPriority, toneForSlide } from '../src/core/tone.js';
import type { FindingPriority } from '../src/shared/types.js';

const finding = (priority: FindingPriority, category: string, observation: string, evidenceId = category) => ({
  evidenceIds: [evidenceId], category, priority, observation,
  recommendedDirection: `Direção específica para ${observation}`,
});

test('mapeia prioridades para a legenda comercial aprovada', () => {
  assert.equal(toneForPriority('critical'), 'problem');
  assert.equal(toneForPriority('important'), 'problem');
  assert.equal(toneForPriority('opportunity'), 'attention');
  assert.equal(toneForPriority('strength'), 'positive');
});

test('perfil positivo fica verde em vez de vermelho fixo', () => {
  const profile = finding('strength', 'profile', 'O perfil tem nota alta e informações básicas preenchidas.', 'maps');
  assert.equal(toneForSlide({ layout: 'profile', body: profile.observation, evidenceIds: ['maps'] }, [profile]), 'positive');
});

test('site rápido não esconde uma correção importante', () => {
  const website = finding('important', 'website', 'O site é rápido, mas não deixa telefone e endereço visíveis.', 'site');
  assert.equal(toneForSlide({ layout: 'website', body: website.observation, evidenceIds: ['site', 'pagespeed'] }, [website]), 'problem');
});

test('Instagram com oportunidade fica amarelo e não vermelho automático', () => {
  const instagram = finding('opportunity', 'instagram', 'A frequência de publicações pode ser retomada.', 'instagram');
  assert.equal(toneForSlide({ layout: 'instagram', body: instagram.observation, evidenceIds: ['instagram'] }, [instagram]), 'attention');
});

test('respostas e reputação usam achados diferentes mesmo com a mesma evidência', () => {
  const reputation = finding('strength', 'reputation', 'As avaliações destacam atendimento e confiança.', 'reviews');
  const responses = finding('important', 'reputation', 'Nenhuma avaliação analisada recebeu resposta da empresa.', 'reviews');
  assert.equal(toneForSlide({ layout: 'reputation', body: reputation.observation, evidenceIds: ['reviews'] }, [reputation, responses]), 'positive');
  assert.equal(toneForSlide({ layout: 'responses', body: responses.observation, evidenceIds: ['reviews'] }, [reputation, responses]), 'problem');
});

test('mistura de ponto forte e problema adota o sinal mais importante', () => {
  const speed = finding('strength', 'website', 'O site carrega rapidamente no celular.', 'pagespeed');
  const contact = finding('important', 'website', 'O telefone não aparece nas páginas analisadas.', 'site');
  assert.equal(toneForSlide({ layout: 'website', body: `${speed.observation} ${contact.observation}`, evidenceIds: ['site', 'pagespeed'] }, [speed, contact]), 'problem');
});

test('slides institucionais permanecem neutros e prioridades ficam amarelas', () => {
  const slides = ['cover', 'summary', 'cta'];
  for (const layout of slides) assert.equal(toneForSlide({ layout, body: '', evidenceIds: [] }, []), 'neutral');
  assert.equal(toneForSlide({ layout: 'priorities', body: '', evidenceIds: [] }, []), 'attention');
});
