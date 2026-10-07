import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenAIDiagnosticClient } from '../src/server/adapters/openai.js';
import type { Evidence, FindingPriority, SlideLayout } from '../src/shared/types.js';

const layouts: SlideLayout[] = ['profile', 'reputation', 'responses', 'media'];

function modelOutput(pass: 'draft' | 'verified') {
  const evidenceByLayout: Record<string, string> = { profile: 'e-profile', reputation: 'e-reviews', responses: 'e-reviews', media: 'e-media' };
  const categoryByLayout: Record<string, string> = { profile: 'profile', reputation: 'reputation', responses: 'reputation', media: 'media' };
  return {
    findings: layouts.map((layout, index) => ({
      targetLayout: layout,
      headline: pass === 'verified' && layout === 'profile' ? 'Google Maps: a descrição pode facilitar o primeiro contato.' : `${layout}: conclusão personalizada.`,
      evidenceIds: [evidenceByLayout[layout]],
      category: categoryByLayout[layout],
      priority: (index === 3 ? 'strength' : index === 0 ? 'important' : 'opportunity') as FindingPriority,
      observation: layout === 'profile' ? 'O perfil tem nota 4,9, 105 reviews e não apresenta descrição.' : layout === 'responses' ? 'ownerResponseCount = 0 e ownerResponseRate = 0.' : `Leitura específica de ${layout}.`,
      possibleImpact: 'Quem pesquisa pode precisar comparar mais antes de entrar em contato.',
      idealState: 'A informação deve responder as dúvidas principais e facilitar a decisão.',
      recommendedDirection: 'Deixar a informação principal mais clara e conectada ao próximo passo.',
    })),
  };
}

test('Responses API gera, verifica e monta os slides localmente', async () => {
  const requests: Array<Record<string, unknown>> = [];
  let call = 0;
  const client = new OpenAIDiagnosticClient({
    apiKey: 'test-key',
    fetch: async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      call += 1;
      return new Response(JSON.stringify({
        id: `resp-${call}`,
        output_text: JSON.stringify(modelOutput(call === 1 ? 'draft' : 'verified')),
        usage: { input_tokens: 100 * call, output_tokens: 50 * call },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const observedAt = new Date().toISOString();
  const evidence: Evidence[] = [
    { id: 'e-profile', analysisId: 'a-1', source: 'maps', title: 'Perfil', value: { title: 'Empresa', totalScore: 4.9, reviewsCount: 105, description: '' }, category: 'profile', observedAt, confidence: 1 },
    { id: 'e-reviews', analysisId: 'a-1', source: 'reviews', title: 'Avaliações', value: { sampleSize: 10, ownerResponseRate: 20, reviews: [{ name: 'Pessoa real', rating: 5, text: 'Atendimento acolhedor.' }] }, category: 'reputation', observedAt, confidence: 1 },
    { id: 'e-media', analysisId: 'a-1', source: 'maps', title: 'Fotos e atividade', value: { photoCount: 8, updateCount: 2 }, category: 'media', observedAt, confidence: 1 },
  ];
  const result = await client.generate('Empresa', evidence);

  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.store, false);
    assert.equal((request.text as { format?: { type?: string; strict?: boolean } }).format?.type, 'json_schema');
    assert.equal((request.text as { format?: { type?: string; strict?: boolean } }).format?.strict, true);
  }
  const firstText = JSON.stringify(requests[0]?.input);
  const secondText = JSON.stringify(requests[1]?.input);
  assert.match(firstText, /representativeExamples/);
  assert.match(firstText, /Atendimento acolhedor/);
  assert.doesNotMatch(firstText, /Pessoa real/);
  assert.match(secondText, /draftFindings/);
  assert.match(secondText, /supportingEvidence/);
  assert.doesNotMatch(secondText, /slides/);
  assert.equal(result.verificationApplied, true);
  assert.equal(result.verificationResponseId, 'resp-2');
  assert.deepEqual(result.usage, { inputTokens: 300, outputTokens: 150 });
  assert.equal(result.output.slides[0]?.layout, 'cover');
  assert.equal(result.output.slides.at(-1)?.layout, 'cta');
  assert.match(result.output.slides.find((slide) => slide.layout === 'profile')?.title ?? '', /descrição pode facilitar/i);
  assert.doesNotMatch(JSON.stringify(result.output), /[\u2014\u2013\u2011]/u);
  const publishedText = [
    ...result.output.findings.flatMap((finding) => [finding.headline, finding.observation, finding.possibleImpact, finding.idealState, finding.recommendedDirection]),
    ...result.output.slides.flatMap((slide) => [slide.title, slide.body, slide.speakerNotes]),
  ].join(' ');
  assert.doesNotMatch(publishedText, /ownerResponse|\breviews?\b/i);
});

test('corrige achados da IA que negam respostas existentes e não confunde coleta vazia com falta de avaliações', async () => {
  for (const sampleSize of [5, 0]) {
    const client = new OpenAIDiagnosticClient({ apiKey: 'test-key', fetch: async () => {
      const output = modelOutput('verified');
      for (const finding of output.findings) if (['responses', 'reputation'].includes(finding.targetLayout)) finding.observation = 'Nenhuma avaliação analisada recebeu resposta da empresa.';
      return new Response(JSON.stringify({ output_text: JSON.stringify(output), usage: { input_tokens: 10, output_tokens: 10 } }), { status: 200 });
    } });
    const observedAt = new Date().toISOString();
    const evidence: Evidence[] = [
      { id: 'e-profile', analysisId: 'guard', source: 'maps', category: 'profile', title: 'Perfil', value: { title: 'Empresa', totalScore: 5, reviewsCount: 105 }, observedAt, confidence: 1 },
      { id: 'e-reviews', analysisId: 'guard', source: 'reviews', category: 'reputation', title: 'Avaliações', value: { sampleSize, positiveCount: sampleSize, ownerResponseCount: sampleSize, ownerResponseRate: sampleSize ? 100 : undefined, ownerResponseVerification: sampleSize ? 'verified' : 'unknown' }, observedAt, confidence: 1 },
      { id: 'e-media', analysisId: 'guard', source: 'maps', category: 'media', title: 'Fotos', value: { photoCount: 3 }, observedAt, confidence: 1 },
    ];
    const result = await client.generate('Empresa', evidence);
    const text = JSON.stringify(result.output);
    assert.doesNotMatch(text, /nenhuma avaliação analisada recebeu resposta|a clínica ainda não possui relatos|não foram encontradas avaliações públicas/iu);
    const responses = result.output.slides.find((slide) => slide.layout === 'responses')!;
    assert.match(responses.title, sampleSize ? /todas as avaliações analisadas/iu : /coleta precisa de confirmação/iu);
  }
});

test('limita espera da IA sem repetir POST pago e oculta detalhes da conexão', async () => {
  let calls = 0;
  const client = new OpenAIDiagnosticClient({apiKey:'test-key',timeoutMs:15,fetch:async(_url,init)=>{
    calls++;
    return new Promise<Response>((_resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('private network details')),1000);
      init?.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('private network details'));},{once:true});
    });
  }});
  await assert.rejects(client.generate('Empresa',[{id:'ig',analysisId:'timeout',source:'instagram',category:'instagram',title:'Instagram',value:{username:'empresa'},observedAt:new Date().toISOString(),confidence:1}]), /excedeu o tempo limite.*evidências coletadas foram preservadas/);
  assert.equal(calls,1);
});

test('timeout da verificação preserva a primeira análise validada', async () => {
  let calls=0;
  const observedAt=new Date().toISOString();
  const evidence:Evidence[]=[
    {id:'e-profile',analysisId:'timeout',source:'maps',category:'profile',title:'Perfil',value:{title:'Empresa',totalScore:5,reviewsCount:10},observedAt,confidence:1},
    {id:'e-reviews',analysisId:'timeout',source:'reviews',category:'reputation',title:'Avaliações',value:{sampleSize:10,ownerResponseCount:0,ownerResponseVerification:'verified'},observedAt,confidence:1},
    {id:'e-media',analysisId:'timeout',source:'maps',category:'media',title:'Fotos',value:{photoCount:3},observedAt,confidence:1},
  ];
  const client=new OpenAIDiagnosticClient({apiKey:'test-key',verificationTimeoutMs:15,fetch:async(_url,init)=>{
    if(++calls===1)return new Response(JSON.stringify({output_text:JSON.stringify(modelOutput('draft')),usage:{input_tokens:10,output_tokens:10}}));
    return new Promise<Response>((_resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('unexpected wait')),1000);
      init?.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('timeout'));},{once:true});
    });
  }});
  const result=await client.generate('Empresa',evidence);
  assert.equal(calls,2);assert.equal(result.verificationApplied,false);assert.ok(result.output.slides.length>0);
});


test('somente Instagram pede exatamente um achado e não preenche canais ausentes', async () => {
  const requests: Record<string, unknown>[] = [];
  const client = new OpenAIDiagnosticClient({ apiKey: 'test-key', fetch: async (_url, init) => {
    const request = JSON.parse(String(init?.body)); requests.push(request);
    const finding = { ...modelOutput('draft').findings[0], targetLayout: 'instagram', category: 'instagram', evidenceIds: ['ig'], observation: 'A bio informa o serviço e o link de contato.' };
    return new Response(JSON.stringify({ output_text: JSON.stringify({ findings: [finding] }), usage: {} }));
  } });
  const result = await client.generate('Empresa', [{ id: 'ig', analysisId: 'one', source: 'instagram', category: 'instagram', title: 'Instagram', value: { username: 'empresa', biography: 'Serviço e contato' }, observedAt: new Date().toISOString(), confidence: 1 }]);
  assert.equal(result.output.findings.length, 1);
  for (const r of requests) {
    const findings = (r as any).text.format.schema.properties.findings;
    assert.equal(findings.minItems, 1); assert.equal(findings.maxItems, 1);
    assert.deepEqual(findings.items.properties.targetLayout.enum, ['instagram']);
    assert.deepEqual(r.reasoning, { effort: 'low' });
  }
});


test('revisão por IA corrige nota técnica do rascunho antes da validação final', async () => {
  let calls = 0;
  const client = new OpenAIDiagnosticClient({ apiKey: 'test-key', fetch: async () => {
    const finding = { ...modelOutput('verified').findings[0], targetLayout: 'instagram', category: 'instagram', evidenceIds: ['ig'], observation: ++calls === 1 ? 'A página recebeu 80/100 no teste.' : 'A bio apresenta o serviço e um caminho de contato.' };
    return new Response(JSON.stringify({ output_text: JSON.stringify({ findings: [finding] }), usage: {} }));
  } });
  const result = await client.generate('Empresa', [{ id: 'ig', analysisId: 'one', source: 'instagram', category: 'instagram', title: 'Instagram', value: { username: 'empresa', biography: 'Serviço e contato' }, observedAt: new Date().toISOString(), confidence: 1 }]);
  assert.equal(calls, 2); assert.equal(result.verificationApplied, true);
  assert.doesNotMatch(JSON.stringify(result.output), /80\/100/);
});
