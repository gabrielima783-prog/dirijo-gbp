import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const app = readFileSync(join(root, 'src/web/src/App.tsx'), 'utf8');
const types = readFileSync(join(root, 'src/web/src/types.ts'), 'utf8');
const styles = readFileSync(join(root, 'src/web/src/styles.css'), 'utf8');
const mobileStyles = readFileSync(join(root, 'src/web/src/mobile-presentation.css'), 'utf8');
const presentationActionsStyles = readFileSync(join(root, 'src/web/src/presentation-actions.css'), 'utf8');
const settingsStyles = readFileSync(join(root, 'src/web/src/settings.css'), 'utf8');

test('frontend mantém o contrato público da API', () => {
  for (const status of ['draft', 'collecting', 'review', 'finalized', 'failed']) {
    assert.match(types, new RegExp(`\\b${status}\\b`));
  }
  for (const priority of ['critical', 'important', 'opportunity', 'strength']) {
    assert.match(types, new RegExp(`\\b${priority}\\b`));
  }
});

test('exportador encontra apresentação pronta e slides 16:9', () => {
  assert.match(app, /data-presentation-ready="true"/);
  assert.match(app, /data-slide/);
  assert.match(app, /presentation/);
  assert.match(styles, /aspect-ratio:16\/9/);
});

test('todas as análises podem ser exportadas em apresentação mobile 9:16', () => {
  assert.match(app, /format=mobile/);
  assert.match(app, /PDF para celular 9:16/);
  assert.match(app, /PDF celular 9:16/);
  assert.match(app, /slide-canvas--\$\{format\}/);
  assert.match(mobileStyles, /aspect-ratio:\s*9\s*\/\s*16/);
  assert.match(mobileStyles, /1080px/);
  assert.match(mobileStyles, /1920px/);
});

test('fluxo visual entrega o material pronto e mantém correção opcional', () => {
  assert.match(app, /Correção opcional/);
  assert.match(app, /O material já está pronto/);
  assert.match(app, /Salvar correções/);
  assert.doesNotMatch(app, /aprove todos os achados/);
  assert.match(app, /Evidências/);
  assert.match(app, /BroadcastChannel/);
  assert.match(app, /Modo apresentador/);
});

test('slide de site traduz métricas do PageSpeed para linguagem simples', () => {
  assert.match(app, /desempenho no celular/);
  assert.match(app, /conteúdo principal visível/);
  assert.match(app, /primeiro conteúdo visível/);
  assert.match(app, /pageSpeedValue\.performanceScore/);
});

test('apresentação organiza a dor, o impacto, o cenário correto e a direção', () => {
  assert.match(app, /function parseNarrative/);
  assert.match(app, /Por que isso pode custar oportunidades/);
  assert.match(app, /Como deveria estar/);
  assert.match(styles, /narrative-grid/);
});

test('cores da apresentação vêm da prioridade dos achados', () => {
  assert.match(app, /toneForSlide\(slide, analysis\.findings\)/);
  assert.doesNotMatch(app, /slide\.layout === 'profile'\) return 'problem'/);
  assert.match(styles, /priority--important \.priority-dot\{background:var\(--danger\)\}/);
  assert.match(styles, /priority--opportunity \.priority-dot\{background:var\(--drive\)\}/);
});

test('página de abertura explica canais e legenda sem antecipar conclusões', () => {
  assert.match(app, /function ScopeOverview/);
  assert.match(app, /Google Maps/);
  assert.match(styles, /scope-legend-item--positive/);
  assert.match(styles, /scope-legend-item--attention/);
  assert.match(styles, /scope-legend-item--problem/);
});

test('apresentação exibe a identificação da Dirijo e CTA clicável de WhatsApp', () => {
  assert.match(app, /@dirijo\.br/);
  assert.match(app, /5527998615616/);
  assert.match(app, /Gostei da análise\. Vamos agendar\?/);
  assert.match(app, /slide-cta-links/);
  assert.doesNotMatch(app, /Conhecer a Dirijo/);
  assert.match(presentationActionsStyles, /slide-handle/);
  assert.match(presentationActionsStyles, /slide-cta-link--primary/);
});

test('painel possui configurações visuais com credenciais protegidas', () => {
  assert.match(app, /Configurações/);
  assert.match(app, /Armazenamento local protegido/);
  assert.match(app, /Testar conexão/);
  assert.match(app, /apifyToken/);
  assert.match(app, /openaiApiKey/);
  assert.match(app, /pageSpeedApiKey/);
  assert.match(settingsStyles, /integration-card/);
});
