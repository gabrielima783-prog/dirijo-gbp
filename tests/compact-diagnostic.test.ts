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
test('Google e Instagram têm conclusões visíveis mesmo com dois achados em outros canais', () => { const a = base(); google(a); instagram(a); reviews(a); speed(a); a.input.channelPresence = { website: absent }; const d = buildCompactDiagnostic(a); assert.equal(d.pageCount, 6); assert.equal(d.scenario, 'google_instagram'); assert.equal(d.findings[0]?.source, 'Caminho de contato'); assert.equal(d.coverage.find(item => item.source === 'Instagram')?.kind, 'strength'); assert.match(d.coverage.find(item => item.source === 'Instagram')!.body, /contém um convite/); assert.equal(d.findings[0]?.proof?.[1]?.value, '10,0 s'); assert.doesNotMatch(JSON.stringify(d), /perdendo pacientes|dá pouca atenção|teve 0 publicações/); });
test('um achado produz quatro páginas, zero achados exige revisão sem fabricar problema', () => { const a = base(); google(a); reviews(a); assert.equal(buildCompactDiagnostic(a).pageCount, 4); const d = buildCompactDiagnostic(base()); assert.equal(d.pageCount, 4); assert.equal(d.reviewRequired, true); assert.equal(d.findings.length, 0); });
test('Google somente explica papel possível do Instagram sem prescrever site', () => { const a = base(); google(a); a.input.channelPresence = { instagram: absent, website: absent }; const d = buildCompactDiagnostic(a); assert.equal(d.scenario, 'google_only'); assert.match(JSON.stringify(d.priorities), /mostrar serviços e esclarecer dúvidas/); assert.doesNotMatch(JSON.stringify(d), /Criar um site/); });
test('Instagram somente explica Google ausente e condiciona implantação à modalidade de atendimento', () => {
 const a = base(); instagram(a);
 a.input.channelPresence = { google: absent, website: absent };
 a.input.googleEligibility = 'eligible';
 const eligible = buildCompactDiagnostic(a);
 assert.equal(eligible.scenario, 'instagram_only');
 assert.equal(eligible.findings.length, 1);
 assert.match(JSON.stringify(eligible.editorialPages[0]), /serviços|Serviços/);
 assert.match(JSON.stringify(eligible.editorialPages[0]), /localização|área de atendimento/);
 a.input.googleEligibility = 'unknown';
 const unknown = buildCompactDiagnostic(a);
 assert.equal(unknown.findings[0]?.source, 'Perfil no Google');
 assert.match(unknown.findings[0]!.direction!, /presencial|modalidade|elegib/i);
 a.input.googleEligibility = 'ineligible';
 const ineligible = buildCompactDiagnostic(a);
 assert.equal(ineligible.findings.length, 0);
 assert.match(JSON.stringify(ineligible.priorities), /não prescrever/);
});
test('ausência sem confirmação válida, falha e URL vazia não são achados negativos', () => { const a = base(); a.input.googleEligibility = 'eligible'; a.input.channelPresence = { google: { state: 'absent_confirmed', confirmation: { method: '', observedAt: date, reference: '' } } }; a.sourceStatuses.maps = { status: 'failed' }; const d = buildCompactDiagnostic(a); assert.equal(d.findings.length, 0); assert.equal(d.scenario, 'partial'); assert.match(d.coverage[0]!.body, /Leitura incompleta/); });
test('URL e evidência de perfil prevalecem sobre ausência declarada', () => { const a = base(); google(a); a.input.channelPresence = { google: absent }; a.input.googleEligibility = 'eligible'; assert.equal(buildCompactDiagnostic(a).findings.length, 0); });
test('PageSpeed de outra página na mesma plataforma não sustenta achado', () => { const a = base(); instagram(a); speed(a, 'https://linktr.ee/outro-negocio'); assert.equal(buildCompactDiagnostic(a).findings.length, 0); });
test('bio genérica revela falta de clareza e CTA sem inferir frequência dos contadores', () => {
 const a=base(); add(a,'instagram',{biography:'Olá, bem-vindo',signals:{postsWithCallToAction:0,postsLast30Days:0,sampleSize:12}});
 const d=buildCompactDiagnostic(a); assert.equal(d.findings.length,1); assert.equal(d.coverage[0]!.kind,'verification');
 const blocks=JSON.stringify(d.editorialPages[0]!.blocks); assert.match(blocks,/não identifica claramente o serviço/); assert.match(blocks,/Não há convite explícito na bio/); assert.match(blocks,/não têm datas suficientes/); assert.doesNotMatch(blocks,/0 posts|Abaixo da referência/);
});
test('revisão manual registra convite sem inventar estrutura de bio indisponível', () => {
 const a=base(); add(a,'instagram',{manual:{opportunities:'O serviço prioritário não fica claro no trecho da bio revisado.',callToAction:'Agendamentos pelo WhatsApp'}});
 const d=buildCompactDiagnostic(a); assert.equal(d.findings.length,0); assert.deepEqual(d.coverage[0]!.evidenceIds,['instagram']);
 assert.match(JSON.stringify(d.editorialPages[0]!.blocks),/revisão manual registrou um convite/); assert.match(JSON.stringify(d.editorialPages[0]!.blocks),/não avaliamos sua estrutura/);
});
test('CTA tem destino comercial aprovado e negócio no pedido de 20 minutos', () => { const d = buildCompactDiagnostic(base()); assert.equal(d.cta.button, 'Quero definir minha prioridade'); assert.match(d.cta.url, /^https:\/\/wa.me\/5527998615616/); assert.match(decodeURIComponent(d.cta.url), /Clínica exemplo.*20 minutos/); });

test('checklist manual persistido sozinho e aninhado preserva convite observado', () => {
 for(const value of [{checklist:{opportunities:'O serviço prioritário não ficou claro na revisão.',callToAction:'Agende sua avaliação'}},{signals:{},manual:{checklist:{opportunities:'O serviço prioritário não ficou claro na revisão.',callToAction:'Agende sua avaliação'}}}]) {
  const a=base();add(a,'instagram',value);const d=buildCompactDiagnostic(a);assert.equal(d.findings.length,0);assert.match(JSON.stringify(d.editorialPages[0]!.blocks),/revisão manual registrou um convite/);
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
test('link de WhatsApp não substitui CTA ausente na bio nem gera pedido de conferência à cliente',()=>{
 const a=base();google(a);reviews(a);add(a,'instagram',{username:'clinica',biography:'Estética integrativa. Corporal e facial.',externalUrl:'http://wa.me/5531999812371',latestPosts:[{caption:'Olá'}],signals:{}});
 const p=buildCompactDiagnostic(a).editorialPages[1]!;
 assert.equal(p.path,undefined);assert.match(JSON.stringify(p.blocks),/Estética integrativa/);assert.match(JSON.stringify(p.blocks),/Não há convite explícito na bio/);
 assert.doesNotMatch(JSON.stringify(p),/carrosséis|vídeos|provas sociais|destino.*confirmação|link.*conferir|funcionamento no celular a conferir/i);
});
test('destino lento ocupa uma página adicional sem misturar Google e Instagram',()=>{
 const a=base();google(a);reviews(a);instagram(a);speed(a);const d=buildCompactDiagnostic(a);
 assert.equal(d.pageCount,6);assert.equal(d.openingItems.length,2);assert.match(d.openingItems[1]!.body,/bio identifica a atuação e orienta o contato/);assert.equal(d.editorialPages[2]?.finding?.source,'Caminho de contato');
 assert.equal(d.editorialPages[2]?.metrics?.[1]?.value,'10,0 s');
 assert.equal(d.editorialPages[1]?.title,'Frequência, bio e CTA.');
});
test('cobertura desconhecida fica interna e Google somente permanece em quatro páginas',()=>{
 const a=base();google(a);reviews(a);a.sourceStatuses.instagram={status:'failed'};const d=buildCompactDiagnostic(a);
 assert.equal(d.pageCount,4);assert.match(JSON.stringify(d.coverage),/Leitura incompleta/);
 assert.doesNotMatch(JSON.stringify([d.editorialPages,d.openingItems,d.priorities]),/cobertura parcial|Presença a confirmar|Leitura incompleta|Site próprio/);
});
test('nome observado no perfil correspondente preserva grafia pública da abertura',()=>{
 const a=base();a.companyName='clinica exemplo';google(a);assert.equal(buildCompactDiagnostic(a).companyName,'Clínica exemplo');
});

for (const eligibility of ['eligible', 'unknown', undefined]) {
 test(`Google ausente confirmado com elegibilidade ${eligibility ?? 'não informada'} conduz cinco páginas e preserva Instagram e contato medido`, () => {
  const a = base();
  instagram(a); speed(a);
  a.input.channelPresence = { google: absent, website: absent };
  a.input.googleEligibility = eligibility;
  const d = buildCompactDiagnostic(a);
  assert.equal(d.pageCount, 5, `elegibilidade ${eligibility}`);
  assert.equal(d.editorialPages.length, 2);
  assert.match(d.editorialPages[0]!.section, /^Google/);
  assert.match(d.editorialPages[1]!.section, /^Instagram/);
  assert.equal(d.findings[0]?.source, 'Perfil no Google');
  assert.match(d.headline + ' ' + d.openingEmphasis, /pesquis|busc|Google|descoberta/i);
  assert.match(d.openingItems[0]!.title + ' ' + d.openingItems[0]!.body, /Google|perfil|descoberta/i);
  assert.match(d.priorities[0]!.title + ' ' + d.priorities[0]!.body, /Google|perfil local/i);
  assert.equal(d.priorities[0]!.label, 'Primeiro');
  assert.match(JSON.stringify(d.priorities.slice(1)), /39\/100/);
  assert.match(JSON.stringify(d.priorities.slice(1)), /10,0 s/);
  assert.doesNotMatch(JSON.stringify(d), /está perdendo|perde clientes|garantir.*posição/i);
  if (eligibility !== 'eligible') {
   assert.match(JSON.stringify([d.editorialPages[0], d.priorities[0]]), /presencial|modalidade|elegib/i);
   assert.doesNotMatch(d.editorialPages[0]!.note ?? '', /elegibilidade local informada/);
  }
 });
}

test('negócio inelegível não ganha capítulo nem prioridade de criação no Google pela ausência', () => {
 const a = base(); instagram(a); speed(a);
 a.input.channelPresence = { google: absent, website: absent };
 a.input.googleEligibility = 'ineligible';
 const d = buildCompactDiagnostic(a);
 assert.equal(d.findings.some(finding => finding.source === 'Perfil no Google'), false);
 assert.equal(d.editorialPages.some(page => /^Google/.test(page.section)), false);
 assert.equal(d.findings[0]?.source, 'Caminho de contato');
 assert.doesNotMatch(JSON.stringify(d.priorities), /cria[çc][ãa]o (?:do |de um )?perfil|iniciar o cadastro/i);
});

test('Google não informado, não localizado ou com falha permanece desconhecido mesmo quando seria elegível', () => {
 for (const state of ['not_provided', 'not_found', 'collection_failed', 'restricted', 'present_unassessed'] as const) {
  const a = base(); instagram(a); speed(a);
  a.input.channelPresence = { google: { state }, website: absent };
  a.input.googleEligibility = 'eligible';
  a.sourceStatuses.maps = { status: state === 'collection_failed' ? 'failed' : 'skipped' };
  const d = buildCompactDiagnostic(a);
  assert.equal(d.findings.some(finding => finding.source === 'Perfil no Google'), false, state);
  assert.equal(d.editorialPages.some(page => /^Google/.test(page.section)), false, state);
  assert.doesNotMatch(JSON.stringify([d.openingItems, d.priorities]), /ausência.*confirmada|criação.*perfil/i);
 }
});

test('URL Google declarada impede atribuir ausência e evita recomendar criação antes de avaliar', () => {
 const a = base(); instagram(a);
 a.input.mapsUrl = 'https://maps.google.com/?cid=123';
 a.input.channelPresence = { google: absent, website: absent };
 a.input.googleEligibility = 'unknown';
 const d = buildCompactDiagnostic(a);
 assert.equal(d.findings.some(finding => finding.source === 'Perfil no Google'), false);
 assert.equal(d.editorialPages.some(page => /^Google/.test(page.section)), false);
});

test('Instagram mantém conclusão própria e convite observado mesmo quando o Google ausente é o foco', () => {
 const a = base();
 add(a, 'instagram', {
  username: 'clinica', biography: 'Estética integrativa. Corporal e facial. Agende sua avaliação pelo WhatsApp.',
  externalUrl: 'https://wa.me/5527999999999',
  latestPosts: [{ caption: 'Conheça nossos serviços.' }, { caption: 'Marque sua avaliação pelo WhatsApp.' }],
  signals: { sampleSize: 2, postsWithCallToAction: 0, postsLast30Days: 0 },
 });
 a.input.channelPresence = { google: absent, website: absent };
 a.input.googleEligibility = 'unknown';
 const d = buildCompactDiagnostic(a);
 const page = d.editorialPages.find(item => /^Instagram/.test(item.section));
 assert.ok(page);
 assert.match(JSON.stringify(page.blocks), /Estética integrativa.*Corporal e facial/);
 assert.match(JSON.stringify(page), /WhatsApp/);
 assert.match(JSON.stringify(page), /2 posts|2 publicações/);
 assert.match(JSON.stringify(page.blocks), /convite|avaliação|orienta/i);
 assert.equal(d.coverage.find(item => item.source === 'Instagram')?.kind, 'strength');
 assert.deepEqual(d.coverage.find(item => item.source === 'Instagram')?.evidenceIds, ['instagram']);
 assert.doesNotMatch(JSON.stringify(page), /sem CTA|Não há convite|0 publicações|frequência.*baixa/i);
});

const datedPosts = (ages: number[]) => ages.map(age => ({ publishedAt: new Date(Date.parse(date) - age * 86_400_000).toISOString(), caption: 'Agende sua avaliação pelo WhatsApp.' }));
const instagramPage = (a: CompactDiagnosticInput) => buildCompactDiagnostic(a).editorialPages.find(page => /^Instagram/.test(page.section))!;
test('12 posts observados em 30 dias e bio clara com CTA sustentam leitura positiva', () => {
 const a=base();add(a,'instagram',{biography:'Estética facial para mulheres. Vila Velha ES. Agende sua avaliação.',latestPosts:datedPosts(Array.from({length:12},(_,i)=>i*2))});
 const d=buildCompactDiagnostic(a);const p=instagramPage(a);assert.equal(d.findings.length,0);assert.match(p.blocks![0]!.body,/12 de 12 posts nos últimos 30 dias.*Atinge a referência/);assert.match(p.blocks![1]!.body,/atuação e o público.*localização/);assert.match(p.blocks![2]!.body,/contém um convite/);
});
test('Ella com 9 posts recentes e bio sem CTA não ganha convite pela legenda', () => {
 const a=base();add(a,'instagram',{username:'ella',biography:'Clínica de estética para mulheres 40+. Ilha do Governador RJ.',latestPosts:datedPosts([1,3,5,7,10,15,20,25,29,31,40,60]),externalUrl:'https://linktr.ee/ella',signals:{postsWithCallToAction:12,postsLast30Days:12}});
 const d=buildCompactDiagnostic(a);const p=instagramPage(a);assert.match(p.blocks![0]!.body,/9 de 12 posts nos últimos 30 dias.*Abaixo da referência/);assert.match(p.blocks![2]!.body,/Não há convite explícito na bio/);assert.match(d.openingItems[0]!.body,/9 posts em 30 dias.*falta um convite/);assert.doesNotMatch(JSON.stringify(p),/destino.*confirmação|link.*conferir/i);
});
test('datas fora de ordem usam data da observação e limite de 30 dias', () => {
 const a=base();a.createdAt='2030-01-01T00:00:00Z';add(a,'instagram',{biography:'Clínica. Agende sua avaliação.',latestPosts:datedPosts([31,1,29,30,0,10])});
 assert.match(instagramPage(a).blocks![0]!.body,/4 de 6 posts nos últimos 30 dias/);assert.match(instagramPage(a).note!,/07\/10\/2026/);
});
test('datas indisponíveis não viram frequência zero nem oportunidade de constância', () => {
 for(const latestPosts of [[{caption:'Olá'}],[...datedPosts([40]),{caption:'Sem data'}]]) {
  const a=base();add(a,'instagram',{biography:'Clínica. Agende sua avaliação.',latestPosts,signals:{postsLast30Days:0,sampleSize:12}});
  const d=buildCompactDiagnostic(a);const body=instagramPage(a).blocks![0]!.body;assert.equal(d.findings.length,0);assert.match(body,/não concluímos|não conclui/);assert.doesNotMatch(body,/Abaixo da referência|0 de/);
 }
});
test('amostra recente informa limite do recorte sem afirmar todo histórico', () => {
 const a=base();add(a,'instagram',{biography:'Clínica. Agende sua avaliação.',latestPosts:datedPosts([1,2,3]),postsCount:660,signals:{postsLast30Days:99}});
 const p=instagramPage(a);assert.match(p.blocks![0]!.body,/3 de 3 posts/);assert.match(p.note!,/amostra não garante todo o histórico/i);assert.doesNotMatch(JSON.stringify(p),/99 posts|660 posts|teve apenas/);
});
test('bio vazia não comprova falta de CTA mesmo com convite nas legendas', () => {
 const a=base();add(a,'instagram',{biography:'',latestPosts:datedPosts(Array.from({length:12},(_,i)=>i)),externalUrl:'https://linktr.ee/clinica'});
 const d=buildCompactDiagnostic(a);const p=instagramPage(a);assert.equal(d.findings.length,0);assert.match(p.blocks![1]!.body,/texto da bio não ficou disponível/);assert.match(p.blocks![2]!.body,/Não concluímos que ele esteja ausente/);assert.doesNotMatch(JSON.stringify(p),/Não há convite explícito na bio|destino.*confirmação/);
});
