import type { Analysis } from './types';
import { buildCompactDiagnostic } from '../../core/compact-diagnostic.js';
import './compact-diagnostic.css';

function DiagnosticBrand() {
  return <div class="compact-brand" aria-label="Dirijo">
    <img src="/dirijo-simbolo.svg" alt="" width="55" height="55" />
    <b>dirijo</b>
  </div>;
}

function Headline({ text }: { text: string }) {
  // Keep the approved headline's deliberate reading rhythm on the printed page.
  const loss = text.match(/^(.*?)\s+(perdendo (?:pacientes|clientes))\s+(.*)$/i);
  if (loss) return <h1 class="compact-headline compact-headline--loss">
    <span>{loss[1]}</span><em>{loss[2]}</em>
    <span>{loss[3]?.replace(/antes mesmo da primeira conversa\.?$/i, 'antes mesmo da')}</span>
    {/antes mesmo da primeira conversa\.?$/i.test(loss[3] ?? '') && <span>primeira conversa.</span>}
  </h1>;
  return <h1 class="compact-headline">{text}</h1>;
}

function PageHeader({ section }: { section?: string }) {
  return <><header class="compact-page-header"><DiagnosticBrand /><span>@dirijo.br</span></header>
    {section && <p class="compact-section-label">{section}</p>}</>;
}

function PageFooter({ company, date, page }: { company: string; date: string; page: number }) {
  const parsed = new Date(date);
  const formatted = /^\d{2}\/\d{2}\/\d{4}$/.test(date) || Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(parsed);
  return <footer class="compact-page-footer"><span>{company}</span><span>{formatted} · 0{page} / 02</span></footer>;
}

export function CompactDiagnostic({ analysis }: { analysis: Analysis }) {
  const diagnostic = buildCompactDiagnostic(analysis);
  return <div class="compact-diagnostic" data-compact-diagnostic="true" data-presentation-ready="true">
    <section class="compact-page compact-page--diagnosis" data-slide="1" data-format="mobile" aria-label="Página 1: diagnóstico personalizado">
      <PageHeader section="Diagnóstico personalizado" />
      <div class="compact-page-content">
        <Headline text={diagnostic.headline} />
        <p class="compact-intro">Analisei a presença digital da <strong>{diagnostic.companyName}</strong> e encontrei estes pontos.</p>
        <p class="compact-findings-label">{diagnostic.hasProblems ? 'Oportunidades de melhoria' : 'Pontos do diagnóstico'}</p>
        <div class="compact-findings">
          {diagnostic.findings.map((finding, index) => <article class={`compact-finding compact-finding--${finding.kind}`} key={finding.title} data-evidence-ids={finding.evidenceIds.join(',')}>
            <span class="compact-finding-number">0{index + 1}</span>
            <div><h2>{finding.title}</h2></div>
          </article>)}
        </div>
        <section class={`compact-impact ${diagnostic.hasProblems ? 'compact-impact--attention' : ''}`} aria-label={diagnostic.hasProblems ? 'O que isso pode dificultar' : 'O próximo passo'}>
          <h2>{diagnostic.hasProblems ? 'O que isso pode dificultar.' : 'O próximo passo.'}</h2>
          {diagnostic.impactTopics.length > 0
            ? <ul class="compact-impact-topics">{diagnostic.impactTopics.map(topic => <li key={topic}>{topic}</li>)}</ul>
            : <p>{diagnostic.bridge}</p>}
        </section>
      </div>
      <PageFooter company={diagnostic.companyName} date={diagnostic.date} page={1} />
    </section>
    <section class="compact-page compact-page--solution" data-slide="2" data-format="mobile" aria-label="Página 2: oportunidades e próximo passo">
      <PageHeader />
      <div class="compact-page-content">
        <h2 class="compact-solution-headline">Como eu, Gabriel, posso<br />ajudar sua {diagnostic.patientBusiness ? 'clínica' : 'empresa'} a<br /><em>conquistar mais {diagnostic.patientBusiness ? 'pacientes' : 'clientes'}.</em></h2>
        <div class="compact-services">
          {diagnostic.services.map((service, index) => <article class="compact-service" key={service.title}>
            <span class="compact-finding-number">0{index + 1}</span>
            <div><h3>{service.title}</h3></div>
          </article>)}
        </div>
        <p class="compact-scope-note">Este diagnóstico avalia sua presença pública. Anúncios, rastreamento e automações precisam de uma análise mais profunda.</p>
        <div class="compact-cta">
          <p class="compact-cta-label">VOCÊ GANHOU</p>
          <h3>Uma conversa sobre <em>a sua {diagnostic.patientBusiness ? 'clínica' : 'empresa'}.</em></h3>
          <p class="compact-cta-body">{diagnostic.cta.body}</p>
          <p class="compact-cta-meta">{diagnostic.cta.durationMinutes} minutos · Sem custo</p>
          <a class="compact-cta-button" href={diagnostic.cta.url} target="_blank" rel="noopener noreferrer">{diagnostic.cta.button}<span aria-hidden="true">→</span></a>
        </div>
      </div>
      <PageFooter company={diagnostic.companyName} date={diagnostic.date} page={2} />
    </section>
  </div>;
}
