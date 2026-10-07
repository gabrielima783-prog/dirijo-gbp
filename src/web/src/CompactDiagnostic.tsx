import type { ComponentChildren } from 'preact';
import type { Analysis } from './types';
import { buildCompactDiagnostic } from '../../core/compact-diagnostic.js';
import './compact-diagnostic.css';

export function CompactDiagnostic({ analysis }: { analysis: Analysis }) {
  const diagnostic = buildCompactDiagnostic(analysis);
  const company = diagnostic.companyName;
  function Page({ number, section, dark = false, children }: { number: number; section: string; dark?: boolean; children: ComponentChildren }) {
    return <section class={`compact-page${dark ? ' compact-page--dark' : ''}`} data-slide={String(number)} data-format="mobile" aria-label={`Página ${number}: ${section}`}>
      <header class="compact-page-header"><div class="brand" aria-label="Dirijo"><img src="/dirijo-simbolo.svg" alt="" width="46" height="46"/><b>dirijo</b></div><span>@dirijo.br</span></header>
      <div class="compact-page-content"><p class="eyebrow">{section}</p>{children}</div>
      <div class="push"/><footer class="compact-page-footer"><span>{company}</span><span>{diagnostic.date} · {String(number).padStart(2, '0')} / {String(diagnostic.pageCount).padStart(2, '0')}</span></footer>
    </section>;
  }
  const Metrics = ({items}: {items: {value:string;label:string}[]}) => <div class="stats">{items.map(item=><div key={item.label}><b>{item.value}</b><span>{item.label}</span></div>)}</div>;
  return <div class="compact-diagnostic compact-editorial" data-compact-diagnostic="true" data-presentation-ready="true" data-review-required={String(diagnostic.reviewRequired)}>
    <Page number={1} section={`Análise de ${company}`}>
      <h1>{diagnostic.headline}<br/><em>{diagnostic.openingEmphasis}</em></h1><p class="lead">{diagnostic.intro}</p>
      {diagnostic.metrics.length>0&&<Metrics items={diagnostic.metrics}/>}
      {diagnostic.openingItems.map((item,index)=><div class="entry" key={item.title}><span>0{index+1}</span><div><h3>{item.title}</h3><p>{item.body}</p></div></div>)}
      <p class="source">{diagnostic.reviewRequired?'Revisão necessária: completar as evidências antes de entregar este material.':`${diagnostic.editorialPages.map(item=>item.section.split(' · ')[0]).join(', ')} analisados em ${diagnostic.date}.`}</p>
    </Page>
    {diagnostic.editorialPages.map((chapter,index)=>{
      const evidence=chapter.finding?.source==='Caminho de contato'?analysis.evidence.find(item=>item.source==='website'&&chapter.finding?.evidenceIds.includes(item.id)):undefined;
      const value=evidence?.value as {screenshotDataUrl?:string}|undefined;
      const screenshot=/^data:image\/(?:png|jpeg|webp);base64,/.test(value?.screenshotDataUrl??'')?value!.screenshotDataUrl:undefined;
      return <Page key={chapter.section} number={index+2} section={chapter.section}>
        <h2>{chapter.title}{chapter.emphasis&&<><br/><em>{chapter.emphasis}</em></>}</h2><p class="lead">{chapter.intro}</p>
        {screenshot&&<figure class="proof"><div><img src={screenshot} alt="Captura original do destino de contato analisado"/></div><figcaption>Destino da empresa · captura de {diagnostic.date}</figcaption></figure>}
        {chapter.metrics?.length&&<Metrics items={chapter.metrics}/>}
        {chapter.path&&<div class="path">{chapter.path.map((step,i)=><>{i>0&&<span aria-hidden="true">→</span>}<div>{step.title}<small>{step.body}</small></div></>)}</div>}
        {chapter.blocks?.map((block,i)=><div key={block.title} class={(chapter.section.startsWith('Instagram')?i===0:i===(chapter.blocks?.length??0)-1)?'box':'block'}><h3>{block.title}</h3><p class="body">{block.body}</p></div>)}
        {chapter.note&&<p class="source">{chapter.note}</p>}
      </Page>;
    })}
    <Page number={diagnostic.pageCount-1} section="Direção · Ordem sugerida">
      <h2>O que cuidar agora.<br/><em>O que decidir com você.</em></h2><p class="lead">{diagnostic.bridge}</p>
      {diagnostic.priorities.map((priority,index)=><div class="priority" key={priority.title}><span>0{index+1}</span><div><p class="label">{priority.label??(index===0?'Primeiro':index===diagnostic.priorities.length-1?'Para decidir na conversa':'Em seguida')}</p><h3>{priority.title}</h3><p>{priority.body}</p></div></div>)}
    </Page>
    <Page number={diagnostic.pageCount} section="Conversa com Gabriel · Dirijo" dark>
      <h2>Qual ponto vale<br/>cuidar primeiro<br/><em>{company.length>28 ? (diagnostic.patientBusiness?'na sua clínica':'na sua empresa') : `na ${company}`}?</em></h2><p class="lead">{diagnostic.cta.body}</p>
      <div class="meeting"><h3>Você sai da conversa com:</h3>
        <div class="entry"><span>01</span><p><strong>Uma prioridade definida</strong> para o momento do negócio.</p></div>
        <div class="entry"><span>02</span><p><strong>Uma recomendação prática</strong> para {diagnostic.cta.focus}.</p></div>
        <div class="entry"><span>03</span><p><strong>Clareza sobre como a Dirijo pode ajudar</strong> e o próximo passo.</p></div>
      </div>
      <div class="offer"><h3>Vamos olhar isso juntos?</h3><p>Eu, Gabriel, vou explicar por onde começaria.</p><p class="meta">20 minutos · Sem custo</p><p class="commitment">Sem compromisso de contratação.</p><a class="button" href={diagnostic.cta.url} target="_blank" rel="noopener noreferrer">{diagnostic.cta.button}<span aria-hidden="true">→</span></a></div>
    </Page>
  </div>;
}
