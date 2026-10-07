import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCompactDiagnostic, type CompactDiagnosticInput } from '../src/core/compact-diagnostic.js';
const date = '2026-10-07T13:00:00Z';
const absent = { state: 'absent_confirmed' as const, confirmation: { method: 'responsável', observedAt: date, reference: 'conferência da unidade' } };
const base = (): CompactDiagnosticInput => ({ input: { companyName: 'Clínica exemplo' }, createdAt: date, evidence: [], sourceStatuses: {} });
const add = (analysis: CompactDiagnosticInput, source: string, value: unknown, sourceUrl?: string) => { analysis.evidence.push({ id: source, source, category: source === 'maps' ? 'profile' : source, value, observedAt: date, confidence: 1, sourceUrl }); analysis.sourceStatuses[source] = { status: 'completed' }; };
const google = (analysis: CompactDiagnosticInput) => add(analysis, 'maps', { title: 'Clínica exemplo', totalScore: 5, reviewsCount: 21 });
const instagram = (analysis: CompactDiagnosticInput) => add(analysis, 'instagram', { biography: 'Clínica de estética. Agendamentos pelo WhatsApp.', externalUrl: 'https://linktr.ee/clinica', latestPosts: [{ caption: 'Marque sua avaliação.' }], signals: { sampleSize: 1, postsWithCallToAction: 0, postsLast30Days: 0 } });
const reviews = (analysis: CompactDiagnosticInput) => add(analysis, 'reviews', { sampleSize: 21, ownerResponseCount: 0, ownerResponseVerification: 'verified' });
const speed = (analysis: CompactDiagnosticInput, tested = 'https://linktr.ee/clinica') => { add(analysis, 'website', { origin: 'https://linktr.ee', pages: [{ url: 'https://linktr.ee/clinica', status: 200, title: 'Clínica' }] }, 'https://linktr.ee/clinica'); add(analysis, 'pagespeed', { strategy: 'mobile', performanceScore: 39, largestContentfulPaint: 10000 }, tested); };
test('Google e Instagram têm conclusões visíveis mesmo com dois achados em outros canais', () => { const a = base(); google(a); instagram(a); reviews(a); speed(a); a.input.channelPresence = { website: absent }; const d = buildCompactDiagnostic(a); assert.equal(d.pageCount, 6); assert.equal(d.scenario, 'google_instagram'); assert.equal(d.findings[0]?.source, 'Caminho de contato'); assert.equal(d.coverage.find(item => item.source === 'Instagram')?.kind, 'strength'); assert.match(d.coverage.find(item => item.source === 'Instagram')!.body, /orientam/); assert.equal(d.findings[0]?.proof?.[1]?.value, '10,0 s'); assert.doesNotMatch(JSON.stringify(d), /perdendo pacientes|dá pouca atenção|teve 0 publicações/); });
test('um achado produz quatro páginas, zero achados exige revisão sem fabricar problema', () => { const a = base(); google(a); reviews(a); assert.equal(buildCompactDiagnostic(a).pageCount, 4); const d = buildCompactDiagnostic(base()); assert.equal(d.pageCount, 4); assert.equal(d.reviewRequired, true); assert.equal(d.findings.length, 0); });
test('Google somente explica papel possível do Instagram sem prescrever site', () => { const a = base(); google(a); a.input.channelPresence = { instagram: absent, website: absent }; const d = buildCompactDiagnostic(a); assert.equal(d.scenario, 'google_only'); assert.match(JSON.stringify(d.priorities), /mostrar serviços e esclarecer dúvidas/); assert.doesNotMatch(JSON.stringify(d), /Criar um site/); });
test('Instagram somente explica descoberta local apenas após ausência e elegibilidade confirmadas', () => { const a = base(); instagram(a); a.input.channelPresence = { google: absent, website: absent }; a.input.googleEligibility = 'eligible'; const d = buildCompactDiagnostic(a); assert.equal(d.scenario, 'instagram_only'); assert.equal(d.findings.length, 1); assert.match(d.findings[0]!.body, /localização, horários, serviços e contato/); a.input.googleEligibility = 'ineligible'; assert.equal(buildCompactDiagnostic(a).findings.length, 0); assert.match(JSON.stringify(buildCompactDiagnostic(a).priorities), /não prescrever/); });
test('ausência sem confirmação válida, falha e URL vazia não são achados negativos', () => { const a = base(); a.input.googleEligibility = 'eligible'; a.input.channelPresence = { google: { state: 'absent_confirmed', confirmation: { method: '', observedAt: date, reference: '' } } }; a.sourceStatuses.maps = { status: 'failed' }; const d = buildCompactDiagnostic(a); assert.equal(d.findings.length, 0); assert.equal(d.scenario, 'partial'); assert.match(d.coverage[0]!.body, /Leitura incompleta/); });
test('URL e evidência de perfil prevalecem sobre ausência declarada', () => { const a = base(); google(a); a.input.channelPresence = { google: absent }; a.input.googleEligibility = 'eligible'; assert.equal(buildCompactDiagnostic(a).findings.length, 0); });
test('PageSpeed de outra página na mesma plataforma não sustenta achado', () => { const a = base(); instagram(a); speed(a, 'https://linktr.ee/outro-negocio'); assert.equal(buildCompactDiagnostic(a).findings.length, 0); });
test('bio genérica e contadores automáticos não viram clareza de atuação ou falta de CTA', () => { const a = base(); add(a, 'instagram', { biography: 'Olá, bem-vindo', signals: { postsWithCallToAction: 0, postsLast30Days: 0, sampleSize: 12 } }); const d = buildCompactDiagnostic(a); assert.equal(d.findings.length, 0); assert.equal(d.coverage[0]!.kind, 'verification'); assert.doesNotMatch(d.coverage[0]!.body, /bio contém informações sobre a atuação/); });
test('revisão manual Instagram sustenta oportunidade com evidência, independente de contadores', () => { const a = base(); add(a, 'instagram', { manual: { opportunities: 'O serviço prioritário não fica claro no trecho da bio revisado.', callToAction: 'Agendamentos pelo WhatsApp' } }); const d = buildCompactDiagnostic(a); assert.equal(d.findings.length, 1); assert.deepEqual(d.findings[0]!.evidenceIds, ['instagram']); assert.match(d.coverage[0]!.body, /orientam/); });
test('CTA tem destino comercial aprovado e negócio no pedido de 20 minutos', () => { const d = buildCompactDiagnostic(base()); assert.equal(d.cta.button, 'Quero definir minha prioridade'); assert.match(d.cta.url, /^https:\/\/wa.me\/5527998615616/); assert.match(decodeURIComponent(d.cta.url), /Clínica exemplo.*20 minutos/); });

test('checklist manual persistido sozinho e aninhado na coleta preserva oportunidades', () => {
 for (const value of [{ checklist: { opportunities: 'O serviço prioritário não ficou claro na revisão.', callToAction: 'Agende sua avaliação' } }, { signals: {}, manual: { checklist: { opportunities: 'O serviço prioritário não ficou claro na revisão.', callToAction: 'Agende sua avaliação' } } }]) {
  const a=base(); add(a, 'instagram', value); const d=buildCompactDiagnostic(a); assert.equal(d.findings.length, 1); assert.match(d.coverage[0]!.body,/orientam/);
 }
});
test('URL informada para auditoria prevalece sobre outro destino do Google', () => { const a=base(); google(a); (a.evidence[0]!.value as Record<string,unknown>).website='https://linktr.ee/outro'; a.input.websiteUrl='https://linktr.ee/clinica'; speed(a); assert.equal(buildCompactDiagnostic(a).findings[0]?.source,'Caminho de contato'); });

test('LCP textual do provedor é apresentado em segundos sem atribuir tempo ao clique', () => { const a=base(); instagram(a); speed(a); (a.evidence.find(item=>item.source==='pagespeed')!.value as Record<string,unknown>).largestContentfulPaint='10.0\u00a0s'; const d=buildCompactDiagnostic(a); assert.equal(d.findings[0]?.proof?.[1]?.value,'10,0 s'); assert.match(d.findings[0]!.proof![1]!.label,/principal elemento visual/); });


test('Google e Instagram ocupam capítulos próprios mesmo com apenas um achado', () => {
 const a=base();google(a);reviews(a);instagram(a);const d=buildCompactDiagnostic(a);
 assert.equal(d.findings.length,1);assert.equal(d.pageCount,5);
 assert.deepEqual(d.editorialPages.map(p=>p.section),['Google · Reputação e escolha','Instagram · Apresentação e contato']);
 assert.match(d.headline,/Nota 5,0 no Google/);assert.match(d.openingEmphasis,/confiança/);
 assert.doesNotMatch(JSON.stringify(d.editorialPages[0]),/Instagram|Bio observada/);
 assert.doesNotMatch(JSON.stringify(d.editorialPages[1]),/avaliações analisadas|respostas públicas/);
 assert.equal(d.openingItems.length,2);
 assert.doesNotMatch(JSON.stringify(d.priorities),/página própria|site/);
});
test('WhatsApp conecta interpretação da bio ao contato sem inventar site ou formatos',()=>{
 const a=base();google(a);reviews(a);add(a,'instagram',{ username:'clinica',biography:'Estética integrativa. Corporal e facial.',externalUrl:'http://wa.me/5531999812371',latestPosts:[{caption:'Olá'}],signals:{} });
 const d=buildCompactDiagnostic(a);const p=d.editorialPages[1]!;
 assert.equal(p.emphasis,'O WhatsApp é o próximo passo.');assert.match(p.intro,/estética integrativa e atuação corporal e facial/);
 assert.doesNotMatch(p.intro,/Bio observada|“/);assert.equal(p.path?.[2]?.body,'Link para WhatsApp');
 assert.doesNotMatch(JSON.stringify(p),/carrosséis|vídeos|provas sociais/);
 assert.match(p.note!,/funcionamento no celular a conferir/);
});
test('destino lento ocupa uma página adicional sem misturar Google e Instagram',()=>{
 const a=base();google(a);reviews(a);instagram(a);speed(a);const d=buildCompactDiagnostic(a);
 assert.equal(d.pageCount,6);assert.equal(d.openingItems.length,2);assert.match(d.openingItems[1]!.body,/link do Instagram/);assert.equal(d.editorialPages[2]?.finding?.source,'Caminho de contato');
 assert.equal(d.editorialPages[2]?.metrics?.[1]?.value,'10,0 s');
 assert.equal(d.editorialPages[1]?.emphasis,'O link conduz ao próximo passo.');
});
test('cobertura desconhecida fica interna e Google somente permanece em quatro páginas',()=>{
 const a=base();google(a);reviews(a);a.sourceStatuses.instagram={status:'failed'};const d=buildCompactDiagnostic(a);
 assert.equal(d.pageCount,4);assert.match(JSON.stringify(d.coverage),/Leitura incompleta/);
 assert.doesNotMatch(JSON.stringify([d.editorialPages,d.openingItems,d.priorities]),/cobertura parcial|Presença a confirmar|Leitura incompleta|Site próprio/);
});
test('nome observado no perfil correspondente preserva grafia pública da abertura',()=>{
 const a=base();a.companyName='clinica exemplo';google(a);assert.equal(buildCompactDiagnostic(a).companyName,'Clínica exemplo');
});
