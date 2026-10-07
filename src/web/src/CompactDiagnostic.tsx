import type { ComponentChildren } from 'preact';
import type { Analysis } from './types';
import { buildCompactDiagnostic } from '../../core/compact-diagnostic.js';
import './compact-diagnostic.css';

export function CompactDiagnostic({ analysis }: { analysis: Analysis }) {
  const diagnostic = buildCompactDiagnostic(analysis);
  const company = diagnostic.companyName;
  const contactEvidence = analysis.evidence.find(item => item.source === 'website' && diagnostic.findings.some(finding => finding.source === 'Caminho de contato' && finding.evidenceIds.includes(item.id)));
  const contactValue = contactEvidence?.value as { screenshotDataUrl?: string } | undefined;
  const screenshot = /^data:image\/(?:png|jpeg|webp);base64,/.test(contactValue?.screenshotDataUrl ?? '') ? contactValue!.screenshotDataUrl : undefined;
  const coverageIndex = diagnostic.findings.length === 2 ? 1 : 0;
  function Page({ number, section, dark = false, children }: { number: number; section: string; dark?: boolean; children: ComponentChildren }) {
    return <section class={`compact-page${dark ? ' compact-page--dark' : ''}`} data-slide={String(number)} data-format="mobile" aria-label={`Página ${number}: ${section}`}>
      <header class="compact-page-header"><div class="compact-brand" aria-label="Dirijo"><img src="/dirijo-simbolo.svg" alt="" width="55" height="55"/><b>dirijo</b></div><span>@dirijo.br</span></header>
      <div class="compact-page-content"><p class="compact-section-label">{section}</p>{children}</div>
      <footer class="compact-page-footer"><span>{company}</span><span>{diagnostic.date} · {String(number).padStart(2, '0')} / {String(diagnostic.pageCount).padStart(2, '0')}</span></footer>
    </section>;
  }
  const prioritiesNumber = diagnostic.pageCount - 1;
  return <div class="compact-diagnostic" data-compact-diagnostic="true" data-presentation-ready="true" data-review-required={String(diagnostic.reviewRequired)}>
    <Page number={1} section={`Análise de ${company}`}>
      <h1 class="compact-headline">{diagnostic.headline}</h1><p class="compact-intro">{diagnostic.intro}</p>
      {diagnostic.metrics.length > 0 && <div class="compact-metrics">{diagnostic.metrics.map(metric => <div key={metric.label} data-evidence-ids={metric.evidenceIds.join(',')}><b>{metric.value}</b><span>{metric.label}</span></div>)}</div>}
      <div class="compact-findings">{diagnostic.findings.map((finding, index) => <article class="compact-finding" key={finding.title}><span class="compact-finding-number">0{index + 1}</span><div><h3>{finding.title}</h3></div></article>)}</div>
      {diagnostic.strength && <div class="compact-direction" data-evidence-ids={diagnostic.strength.evidenceIds.join(',')}><h3>O que já ajuda na escolha.</h3><p>{diagnostic.strength.body}</p></div>}
      <div class="compact-opening-coverage">{diagnostic.coverage.map(item => <p key={item.source} data-evidence-ids={item.evidenceIds.join(',')}><strong>{item.title}</strong></p>)}</div>
      <p class="compact-note">{diagnostic.reviewRequired ? 'Revisão necessária: conferir os canais e aprofundar as informações com o responsável.' : 'Cada conclusão se limita à empresa, aos canais e às amostras observadas.'}</p>
    </Page>
    {diagnostic.findings.length > 0 ? diagnostic.findings.map((finding, index) => <Page key={finding.title} number={index + 2} section={`${index ? 'Segunda' : 'Primeira'} oportunidade · ${finding.source}`}>
      <h2 class="compact-headline">{finding.title}</h2>
      <p class="compact-intro" data-evidence-ids={finding.evidenceIds.join(',')}>{finding.body}</p>
      {finding.source === 'Caminho de contato' && screenshot && <figure class="compact-proof-screen"><div><img src={screenshot} alt="Captura original do destino público de contato analisado"/></div><figcaption>Destino da empresa · captura de {diagnostic.date}</figcaption></figure>}
      {finding.proof && <div class="compact-metrics">{finding.proof.map(item => <div key={item.label}><b>{item.value}</b><span>{item.label}</span></div>)}</div>}
      {finding.source === 'Caminho de contato' && finding.proof?.length === 2 && <p class="compact-note">Esse tempo não mede quando o botão ficou clicável.</p>}
      <div class="compact-insight"><h3>O que isso pode influenciar.</h3><p>{finding.consequence}</p></div>
      <div class="compact-direction"><h3>Por onde começar.</h3><p>{finding.direction}</p></div>
      {index === coverageIndex && finding.source !== 'Caminho de contato' && <div class="compact-coverage">{diagnostic.coverage.filter(item => item.source === 'Instagram').map(item => <article key={item.source} data-evidence-ids={item.evidenceIds.join(',')}><h3>{item.title}</h3><p>{item.body}</p></article>)}</div>}
      <p class="compact-note">Evidências de {diagnostic.date}. Resultados comerciais não medidos.</p>
    </Page>) : <Page number={2} section="Cobertura e revisão"><h2 class="compact-headline">O que sabemos.<br/><em>O que falta confirmar.</em></h2><p class="compact-intro">Um canal não informado ou uma leitura incompleta não comprovam ausência ou falha da empresa.</p><div class="compact-direction"><h3>Preservar os pontos fortes.</h3><p>{diagnostic.strength?.body ?? 'Não há evidência suficiente para definir um problema comercial. A próxima leitura precisa completar os dados disponíveis.'}</p></div><div class="compact-coverage">{diagnostic.coverage.filter(item => item.source === 'Instagram').map(item => <article key={item.source} data-evidence-ids={item.evidenceIds.join(',')}><h3>{item.title}</h3><p>{item.body}</p></article>)}</div><div class="compact-insight"><h3>Antes de entregar.</h3><p>Conferir empresa, unidade e canais. Entender os objetivos do responsável e revisar o material sem criar um problema para preencher as páginas.</p></div></Page>}
    <Page number={prioritiesNumber} section="Direção · Ordem sugerida">
      <h2 class="compact-headline">O que cuidar agora.<br/><em>O que decidir com você.</em></h2>
      <div class="compact-priorities">{diagnostic.priorities.map((priority, index) => <article key={priority.title}><span>0{index + 1}</span><div><h3>{priority.title}</h3><p>{priority.body}</p></div></article>)}</div>
      <div class="compact-coverage" aria-label="Conclusões dos canais">{diagnostic.coverage.filter(item => item.source !== 'Instagram' || diagnostic.findings[coverageIndex]?.source === 'Caminho de contato').map(item => <article key={item.source} data-evidence-ids={item.evidenceIds.join(',')}><h3>{item.title}</h3><p>{item.body}</p></article>)}</div>
      <p class="compact-note">Escopo: canais e amostras coletados. No Instagram, Stories, destaques, conversas, alcance e anúncios exigem evidência específica.</p>
    </Page>
    <Page number={diagnostic.pageCount} section="Conversa com Gabriel · Dirijo" dark>
      <h2 class="compact-headline">{diagnostic.cta.headline}</h2><p class="compact-intro">{diagnostic.cta.body}</p>
      <div class="compact-meeting"><h3>Você sai da conversa com:</h3>{['Uma prioridade definida para o momento do negócio.', 'Uma recomendação prática para o caminho até o contato.', 'Clareza sobre como a Dirijo pode ajudar e qual seria o próximo passo.'].map((item, index) => <p key={item}><span>0{index + 1}</span>{item}</p>)}</div>
      <div class="compact-cta"><h3>Vamos olhar isso juntos?</h3><p class="compact-cta-body">Eu, Gabriel, vou explicar por onde começaria e tirar suas dúvidas sobre esta análise.</p><p class="compact-cta-meta">20 minutos · Sem custo</p><p class="compact-no-commitment">Sem compromisso de contratação.</p><a class="compact-cta-button" href={diagnostic.cta.url} target="_blank" rel="noopener noreferrer">{diagnostic.cta.button}<span aria-hidden="true">→</span></a></div>
    </Page>
  </div>;
}
