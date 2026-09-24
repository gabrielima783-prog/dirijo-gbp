import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from './api';
import type { Analysis, AnalysisInput, Evidence, Finding, FindingPriority, InstagramChecklist, PublicSettings, SettingsProvider, SettingsUpdate, SlideSpec, SourceKey } from './types';
import { sourceLabels } from './types';
import { toneForSlide, type SlideTone } from '../../core/tone.js';

const priorities: FindingPriority[] = ['critical', 'important', 'opportunity', 'strength'];
const priorityLabels: Record<FindingPriority, string> = { critical: 'crítico', important: 'importante', opportunity: 'oportunidade', strength: 'ponto forte' };
const sourceOrder: SourceKey[] = ['maps', 'reviews', 'competitors', 'website', 'pagespeed', 'instagram', 'ai'];
type PresentationFormat = 'desktop' | 'mobile';

function Brand({ compact = false }: { compact?: boolean }) {
  return <div class={`brand ${compact ? 'brand--compact' : ''}`} aria-label="Dirijo GBP">
    <svg viewBox="0 0 170 170" aria-hidden="true"><path d="M139 85C139 67.736 132.913 53.923 122.618 44.386C112.272 34.802 97.084 29 78 29H33V141H78C97.084 141 112.272 135.198 122.618 125.614C132.913 116.078 139 102.264 139 85ZM153 85C153 105.736 145.586 123.422 132.132 135.886C118.728 148.302 99.916 155 78 155H19V15H78C99.916 15 118.728 21.699 132.132 34.114C145.586 46.578 153 64.264 153 85Z" fill="#23C5C9"/><path d="M118 96H106V70.484L52 124.485L43.515 116L97.516 62H72V50H118V96Z" fill="#FFB52B"/></svg>
    <span><b>dirijo</b>{!compact && <small>GBP · diagnóstico local</small>}</span>
  </div>;
}

function formatDate(value?: string) {
  if (!value) return 'agora';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function money(value?: number) {
  return typeof value === 'number' ? `US$ ${value.toFixed(3)}` : '-';
}

function statusLabel(status: Analysis['status']) {
  return ({ draft: 'Rascunho', collecting: 'Coletando', review: 'Em revisão', finalized: 'Finalizada', failed: 'Com falha' })[status] || status;
}

function useRoute() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const listener = () => setPath(location.pathname);
    addEventListener('popstate', listener);
    return () => removeEventListener('popstate', listener);
  }, []);
  const go = (next: string) => { history.pushState({}, '', next); setPath(next); scrollTo(0, 0); };
  return { path, go };
}

function Shell({ children, go, active }: { children: ComponentChildren; go: (p: string) => void; active: string }) {
  return <div class="shell">
    <header class="topbar">
      <button class="brand-button" onClick={() => go('/')}><Brand /></button>
      <nav aria-label="Navegação principal">
        <button class={active === 'history' ? 'active' : ''} onClick={() => go('/')}>Diagnósticos</button>
        <button class={active === 'new' ? 'active' : ''} onClick={() => go('/nova')}>Nova análise</button>
        <button class={active === 'settings' ? 'active' : ''} onClick={() => go('/configuracoes')}>Configurações</button>
      </nav>
      <button class="primary-action" onClick={() => go('/nova')}>Analisar empresa <span>→</span></button>
    </header>
    <main>{children}</main>
  </div>;
}

function EmptyState({ go }: { go: (p: string) => void }) {
  return <section class="empty-state">
    <p class="eyebrow">Primeiro diagnóstico</p>
    <h2>Uma análise que mostra que você <em>realmente olhou.</em></h2>
    <p>Transforme dados públicos do perfil, avaliações e site em uma conversa comercial com contexto, evidências e direção.</p>
    <button class="primary-action" onClick={() => go('/nova')}>Criar primeiro diagnóstico →</button>
  </section>;
}

function History({ go }: { go: (p: string) => void }) {
  const [items, setItems] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { api.list().then(setItems).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  const duplicate = async (id: string) => { const item = await api.duplicate(id); go(`/analises/${item.id}`); };
  return <Shell go={go} active="history">
    <section class="page-intro">
      <div><p class="eyebrow">Mesa de diagnóstico</p><h1>O que merece ser <em>visto.</em></h1></div>
      <p class="intro-copy">Cada dossiê reúne sinais reais do negócio e prepara uma apresentação pessoal, clara e difícil de ignorar.</p>
    </section>
    <div class="rule-heading"><span>Arquivo de análises</span><span>{items.length.toString().padStart(2, '0')} registros</span></div>
    {loading && <div class="loading-line">Carregando arquivo…</div>}
    {error && <Notice tone="error">{error}</Notice>}
    {!loading && !error && items.length === 0 && <EmptyState go={go} />}
    <section class="analysis-ledger">
      {items.map((item, index) => { const collectedSources = sourceOrder.filter(source => item.sourceStatuses?.[source]?.status === 'completed').map(source => sourceLabels[source]); return <article class="ledger-row" key={item.id}>
        <button class="ledger-main" onClick={() => go(`/analises/${item.id}`)}>
          <span class="ledger-index">{String(index + 1).padStart(2, '0')}</span>
          <span class="ledger-name"><b>{item.companyName || 'Empresa em identificação'}</b><small>{collectedSources.length ? collectedSources.join(' · ') : 'Aguardando coleta'}</small></span>
          <span class={`status status--${item.status}`}>{statusLabel(item.status)}</span>
          <span class="ledger-meta"><b>{formatDate(item.updatedAt)}</b><small>{money(item.actualCostUsd ?? item.estimatedCostUsd)}</small></span>
          <span class="arrow">→</span>
        </button>
        <button class="quiet-action" onClick={() => duplicate(item.id)}>Duplicar</button>
      </article>})}
    </section>
  </Shell>;
}

function Notice({ children, tone = 'info' }: { children: ComponentChildren; tone?: 'info' | 'error' | 'success' }) {
  return <div class={`notice notice--${tone}`}><span>{tone === 'error' ? '×' : tone === 'success' ? '✓' : '·'}</span>{children}</div>;
}

const providerCopy: Record<SettingsProvider, { index: string; name: string; role: string; keyLabel: string; placeholder: string }> = {
  apify: { index: '01', name: 'Apify', role: 'Coleta Google Maps, avaliações, concorrentes e Instagram.', keyLabel: 'Token da Apify', placeholder: 'apify_api_...' },
  openai: { index: '02', name: 'OpenAI', role: 'Interpreta as evidências, revisa os achados e personaliza o diagnóstico.', keyLabel: 'Chave da OpenAI', placeholder: 'sk-proj-...' },
  pagespeed: { index: '03', name: 'Google PageSpeed', role: 'Mede a experiência mobile e o desempenho do site analisado.', keyLabel: 'Chave da API PageSpeed', placeholder: 'AIza...' },
};

function SettingsPage({ go }: { go: (p: string) => void }) {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [form, setForm] = useState<Record<string, string>>({ apifyToken: '', openaiApiKey: '', pageSpeedApiKey: '', openaiModel: '', apifyActorId: '', apifyInstagramActorId: '' });
  const [visible, setVisible] = useState<Record<SettingsProvider, boolean>>({ apify: false, openai: false, pagespeed: false });
  const [testing, setTesting] = useState<SettingsProvider | null>(null);
  const [results, setResults] = useState<Partial<Record<SettingsProvider, { ok: boolean; message: string }>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const load = () => api.settings().then(value => {
    setSettings(value);
    setForm(current => ({ ...current, openaiModel: value.openai.model, apifyActorId: value.apify.actorId, apifyInstagramActorId: value.apify.instagramActorId }));
  }).catch(error => setMessage({ tone: 'error', text: error.message }));
  useEffect(load, []);
  const field = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));
  const save = async (event: Event) => {
    event.preventDefault(); setBusy(true); setMessage(null);
    const payload: SettingsUpdate = {
      openaiModel: form.openaiModel,
      apifyActorId: form.apifyActorId,
      apifyInstagramActorId: form.apifyInstagramActorId,
      ...(form.apifyToken ? { apifyToken: form.apifyToken } : {}),
      ...(form.openaiApiKey ? { openaiApiKey: form.openaiApiKey } : {}),
      ...(form.pageSpeedApiKey ? { pageSpeedApiKey: form.pageSpeedApiKey } : {}),
    };
    try {
      const next = await api.updateSettings(payload); setSettings(next);
      setForm(current => ({ ...current, apifyToken: '', openaiApiKey: '', pageSpeedApiKey: '' }));
      setMessage({ tone: 'success', text: 'Configurações salvas e aplicadas nesta instalação.' });
    } catch (error) { setMessage({ tone: 'error', text: (error as Error).message }); }
    finally { setBusy(false); }
  };
  const test = async (provider: SettingsProvider) => {
    setTesting(provider); setResults(current => ({ ...current, [provider]: undefined }));
    try { const result = await api.testSetting(provider); setResults(current => ({ ...current, [provider]: result })); }
    catch (error) { setResults(current => ({ ...current, [provider]: { ok: false, message: (error as Error).message } })); }
    finally { setTesting(null); }
  };
  const clear = async (provider: SettingsProvider) => {
    const key = provider === 'apify' ? 'apifyToken' : provider === 'openai' ? 'openaiApiKey' : 'pageSpeedApiKey';
    try { setSettings(await api.updateSettings({ [key]: null })); setResults(current => ({ ...current, [provider]: undefined })); }
    catch (error) { setMessage({ tone: 'error', text: (error as Error).message }); }
  };
  const providerStatus = (provider: SettingsProvider) => provider === 'pagespeed' ? settings?.pageSpeed : settings?.[provider];
  return <Shell go={go} active="settings">
    <section class="settings-hero">
      <div><p class="eyebrow">Configuração local</p><h1>Conexões sob seu <em>controle.</em></h1></div>
      <div class="settings-security"><span>✓</span><p><b>Armazenamento local protegido</b>As chaves ficam criptografadas neste computador e nunca voltam completas para a tela.</p></div>
    </section>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    <form class="settings-sheet" onSubmit={save}>
      {(['apify', 'openai', 'pagespeed'] as SettingsProvider[]).map(provider => {
        const copy = providerCopy[provider]; const status = providerStatus(provider); const result = results[provider];
        const key = provider === 'apify' ? 'apifyToken' : provider === 'openai' ? 'openaiApiKey' : 'pageSpeedApiKey';
        return <section class={`integration-card integration-card--${status?.configured ? 'ready' : 'missing'}`} key={provider}>
          <div class="integration-number">{copy.index}</div>
          <div class="integration-intro"><div class="integration-title"><h2>{copy.name}</h2><span>{status?.configured ? 'Conectada' : 'Pendente'}</span></div><p>{copy.role}</p>{status?.configured && <small>Chave ativa: {status.maskedValue} · origem: {status.source}</small>}</div>
          <div class="integration-fields">
            <label class="secret-field"><span>{copy.keyLabel}</span><div><input type={visible[provider] ? 'text' : 'password'} autocomplete="off" placeholder={status?.configured ? 'Digite somente para substituir a chave atual' : copy.placeholder} value={form[key]} onInput={event => field(key, event.currentTarget.value)}/><button type="button" onClick={() => setVisible(current => ({ ...current, [provider]: !current[provider] }))}>{visible[provider] ? 'Ocultar' : 'Mostrar'}</button></div></label>
            {provider === 'apify' && <div class="settings-subgrid"><label class="field"><span>Ator Google Maps</span><input value={form.apifyActorId} onInput={event => field('apifyActorId', event.currentTarget.value)}/></label><label class="field"><span>Ator Instagram</span><input value={form.apifyInstagramActorId} onInput={event => field('apifyInstagramActorId', event.currentTarget.value)}/></label></div>}
            {provider === 'openai' && <label class="field"><span>Modelo</span><input value={form.openaiModel} onInput={event => field('openaiModel', event.currentTarget.value)}/></label>}
            <div class="integration-actions"><button type="button" class="secondary-action" disabled={!status?.configured || testing === provider} onClick={() => test(provider)}>{testing === provider ? 'Testando…' : 'Testar conexão'}</button>{status?.source === 'painel' && <button type="button" class="quiet-action" onClick={() => clear(provider)}>Remover chave salva</button>}</div>
            {result && <div class={`connection-result connection-result--${result.ok ? 'ok' : 'error'}`}><span>{result.ok ? '✓' : '×'}</span>{result.message}</div>}
          </div>
        </section>;
      })}
      <div class="settings-footer"><div><b>As alterações valem imediatamente.</b><span>Não é necessário reiniciar o painel depois de salvar.</span></div><button class="primary-action primary-action--large" disabled={busy}>{busy ? 'Salvando…' : 'Salvar configurações →'}</button></div>
    </form>
  </Shell>;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
}

const checklistFields: Array<[keyof InstagramChecklist, string, string]> = [
  ['bio', 'Bio', 'O que a bio comunica em poucos segundos?'],
  ['positioning', 'Posicionamento', 'Está claro para quem é e qual transformação entrega?'],
  ['services', 'Serviços', 'Quais serviços aparecem e como são apresentados?'],
  ['recentContent', 'Conteúdo recente', 'Frequência, temas e consistência percebida.'],
  ['socialProof', 'Prova social', 'Resultados, bastidores, depoimentos e autoridade.'],
  ['callToAction', 'Próximo passo', 'Existe uma chamada clara para contato ou agendamento?'],
  ['bioLink', 'Link da bio', 'Destino, clareza e possíveis atritos.'],
  ['strengths', 'Pontos fortes', 'O que vale reconhecer na apresentação?'],
  ['opportunities', 'Oportunidades', 'O que pode melhorar com maior impacto?'],
];

function NewAnalysis({ go }: { go: (p: string) => void }) {
  const [input, setInput] = useState<AnalysisInput>({ mapsUrl: '', instagramChecklist: {}, instagramScreenshots: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key: keyof AnalysisInput, value: unknown) => setInput(current => ({ ...current, [key]: value }));
  const setChecklist = (key: keyof InstagramChecklist, value: string) => setInput(current => ({ ...current, instagramChecklist: { ...current.instagramChecklist, [key]: value } }));
  const uploadLogo = async (files: FileList | null) => { if (files?.[0]) set('companyLogo', await fileToDataUrl(files[0])); };
  const uploadPrints = async (files: FileList | null) => { if (files) set('instagramScreenshots', await Promise.all(Array.from(files).slice(0, 4).map(fileToDataUrl))); };
  const submit = async (event: Event) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { const created = await api.create(input); go(`/analises/${created.id}`); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <Shell go={go} active="new">
    <section class="page-intro page-intro--form">
      <div><p class="eyebrow">Novo dossiê</p><h1>Comece pelo <em>lugar.</em></h1></div>
      <p class="intro-copy">O link do Maps ancora a análise. Site e Instagram ampliam a leitura quando fizer sentido para a conversa.</p>
    </section>
    <form class="intake" onSubmit={submit}>
      <section class="form-chapter form-chapter--dark">
        <div class="chapter-number">01 / 03</div>
        <div class="chapter-copy"><h2>A empresa.</h2><p>Informe o perfil que o lead autorizou você a analisar.</p></div>
        <div class="fields">
          <label class="field field--wide"><span>Link do Google Maps <b>obrigatório</b></span><input type="url" required placeholder="https://maps.google.com/…" value={input.mapsUrl} onInput={e => set('mapsUrl', e.currentTarget.value)} /></label>
          <label class="field"><span>Site <i>opcional · confirme o endereço correto</i></span><input type="url" placeholder="https://empresa.com.br" value={input.websiteUrl || ''} onInput={e => set('websiteUrl', e.currentTarget.value)} /></label>
          <label class="field"><span>Instagram <i>opcional · leitura automática pelo link</i></span><input type="url" placeholder="https://instagram.com/empresa" value={input.instagramUrl || ''} onInput={e => set('instagramUrl', e.currentTarget.value)} /></label>
          <label class="field"><span>Nome do contato</span><input placeholder="Como você chama essa pessoa?" value={input.contactName || ''} onInput={e => set('contactName', e.currentTarget.value)} /></label>
          <label class="file-field"><span>Logo da empresa</span><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={e => uploadLogo(e.currentTarget.files)} /><b>{input.companyLogo ? 'Logo adicionada ✓' : 'Escolher arquivo →'}</b></label>
        </div>
      </section>
      <section class="form-chapter">
        <div class="chapter-number">02 / 03</div>
        <div class="chapter-copy"><h2>Contexto do Instagram.</h2><p>O link coleta o perfil e as publicações recentes. Use estes campos apenas para acrescentar algo que você percebeu.</p></div>
        <div class="checklist-grid">
          {checklistFields.map(([key, title, hint]) => <label class="field" key={key}><span>{title}</span><textarea rows={3} placeholder={hint} value={input.instagramChecklist?.[key] || ''} onInput={e => setChecklist(key, e.currentTarget.value)} /></label>)}
          <label class="file-field file-field--prints"><span>Capturas do Instagram</span><input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={e => uploadPrints(e.currentTarget.files)} /><b>{input.instagramScreenshots?.length ? `${input.instagramScreenshots.length}/4 capturas adicionadas` : 'Adicionar até 4 capturas →'}</b></label>
        </div>
      </section>
      <section class="form-chapter form-chapter--submit">
        <div class="chapter-number">03 / 03</div>
        <div class="chapter-copy"><h2>Gerar apresentação.</h2><p>A coleta entrega slides e PDFs prontos. Abra a correção somente se algo precisar de ajuste.</p></div>
        <div class="submit-block"><p><b>Custo protegido.</b> A ferramenta estima o uso antes da coleta e pede confirmação acima de US$ 1.</p>{error && <Notice tone="error">{error}</Notice>}<button disabled={busy} class="primary-action primary-action--large">{busy ? 'Preparando…' : 'Criar diagnóstico →'}</button></div>
      </section>
    </form>
  </Shell>;
}

function SourceProgress({ analysis, onRetry }: { analysis: Analysis; onRetry: (key: SourceKey) => void }) {
  return <div class="source-list">{sourceOrder.map((key, index) => {
    const state = analysis.sourceStatuses?.[key] || { status: 'pending' };
    return <div class={`source-row source-row--${state.status}`} key={key}>
      <span class="source-index">{String(index + 1).padStart(2, '0')}</span><span class="source-name"><b>{sourceLabels[key]}</b><small>{state.error || ({ pending: 'Aguardando', running: 'Consultando fonte…', completed: 'Dados preservados', failed: 'Etapa interrompida', skipped: 'Não aplicável' }[state.status])}</small></span>
      <span class="source-mark">{state.status === 'completed' ? '✓' : state.status === 'running' ? '●' : state.status === 'failed' ? '×' : '-'}</span>
      {state.status === 'failed' && <button class="quiet-action" onClick={() => onRetry(key)}>Tentar novamente</button>}
    </div>;
  })}</div>;
}

function Collection({ analysis, reload, go }: { analysis: Analysis; reload: () => void; go: (p: string) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const start = async (confirmed = false) => {
    setBusy(true); setError('');
    try { await api.collect(analysis.id, confirmed); reload(); }
    catch (e) { const message = (e as Error).message; if (/US\$ ?1|limite|budget/i.test(message) && confirm(`${message}\n\nDeseja confirmar esta execução?`)) start(true); else setError(message); }
    finally { setBusy(false); }
  };
  const retry = async (key: SourceKey) => { await api.retry(analysis.id, key); reload(); };
  const done = analysis.status === 'review' || analysis.status === 'finalized';
  return <>
    <section class="analysis-hero"><div><p class="eyebrow">Dossiê {analysis.id.slice(0, 8)}</p><h1>{analysis.companyName || 'Empresa em identificação'}<em>.</em></h1><p>{analysis.input.contactName ? `Preparado para a conversa com ${analysis.input.contactName}.` : 'Uma leitura baseada em sinais públicos e evidências preservadas.'}</p></div><div class="cost-note"><small>Custo estimado</small><b>{money(analysis.estimatedCostUsd)}</b><span>limite automático · US$ 1</span></div></section>
    {error && <Notice tone="error">{error}</Notice>}
    <section class="collection-sheet"><div class="collection-head"><div><p class="eyebrow">Rastro da coleta</p><h2>{analysis.status === 'finalized' ? 'Apresentação e PDFs prontos.' : done ? 'Material disponível para correção.' : analysis.status === 'collecting' ? 'Estamos reunindo os sinais.' : 'Pronto para começar.'}</h2></div>{analysis.status === 'draft' && <button class="primary-action" disabled={busy} onClick={() => start()}>{busy ? 'Iniciando…' : 'Iniciar coleta →'}</button>}{done && <div class="collection-actions"><button class="secondary-action" onClick={() => go(`/analises/${analysis.id}/editar`)}>Corrigir conteúdo</button>{analysis.status === 'finalized' && <><button class="primary-action" onClick={() => go(`/apresentacao/${analysis.id}`)}>Apresentar →</button><a class="secondary-action" href={`/api/analyses/${analysis.id}/pdf?format=desktop`} target="_blank">PDF apresentação 16:9</a><a class="secondary-action" href={`/api/analyses/${analysis.id}/pdf?format=mobile`} target="_blank">PDF para celular 9:16</a></>}</div>}</div><SourceProgress analysis={analysis} onRetry={retry} /></section>
  </>;
}

function FindingEditor({ finding, onChange, onRemove }: { finding: Finding; onChange: (next: Finding) => void; onRemove: () => void }) {
  const patch = (next: Partial<Finding>) => onChange({ ...finding, ...next });
  return <article class={`finding-editor priority--${finding.priority}`}>
    <div class="finding-top"><span class="priority-dot"/><select value={finding.priority} onChange={e => patch({ priority: e.currentTarget.value as FindingPriority })}>{priorities.map(p => <option value={p}>{priorityLabels[p]}</option>)}</select><span>{finding.category}</span><button class="quiet-action" type="button" onClick={onRemove}>Ocultar do material</button></div>
    <label><span>O que foi observado</span><textarea value={finding.observation} onInput={e => patch({ observation: e.currentTarget.value })}/></label>
    <div class="finding-columns"><label><span>Por que isso pode custar oportunidades</span><textarea value={finding.possibleImpact} onInput={e => patch({ possibleImpact: e.currentTarget.value })}/></label><label><span>Como deveria estar</span><textarea value={finding.idealState} onInput={e => patch({ idealState: e.currentTarget.value })}/></label></div>
    <label><span>Direção recomendada</span><textarea value={finding.recommendedDirection} onInput={e => patch({ recommendedDirection: e.currentTarget.value })}/></label>
    <small>{finding.evidenceIds.length} evidência(s) vinculada(s)</small>
  </article>;
}

function stringifyBody(body: unknown) {
  if (typeof body === 'string') return body;
  if (Array.isArray(body)) return body.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('\n');
  if (body && typeof body === 'object') return Object.values(body as Record<string, unknown>).map(v => typeof v === 'string' ? v : JSON.stringify(v)).join('\n');
  return String(body || '');
}

type NarrativeParts = { issue: string; impact: string; ideal: string; direction: string; source?: string };
const channelLabels: Record<string, string> = {
  cover: 'Diagnóstico personalizado', summary: 'Como analisamos', profile: 'Google Maps · perfil', reputation: 'Google Maps · avaliações',
  responses: 'Google Maps · respostas', media: 'Google Maps · fotos e atualizações', website: 'Site', instagram: 'Instagram',
  priorities: 'Plano de prioridades', cta: 'Próximo passo · Dirijo',
};

function parseNarrative(body: string): NarrativeParts | undefined {
  const pattern = /O que encontramos\s*\n([\s\S]*?)\n\s*Por que isso pode custar oportunidades\s*\n([\s\S]*?)\n\s*Como deveria estar\s*\n([\s\S]*?)\n\s*Direção\s*\n([\s\S]*?)(?:\n\s*Fonte:\s*([\s\S]*))?$/i;
  const match = body.trim().match(pattern);
  if (!match) return undefined;
  return { issue: match[1]!.trim(), impact: match[2]!.trim(), ideal: match[3]!.trim(), direction: match[4]!.trim(), ...(match[5]?.trim() ? { source: match[5].trim() } : {}) };
}

type ScopeOverviewParts = { intro: string; channels: Array<{ title: string; text: string }>; legend: Array<{ tone: string; title: string; text: string }> };

function parseScopeOverview(body: string): ScopeOverviewParts | undefined {
  const pattern = /^([^\n]+)\n\nGoogle Maps\n([^\n]+)\n\nReputação\n([^\n]+)\n\nSite\n([^\n]+)\n\nInstagram\n([^\n]+)\n\nVerde\n([^\n]+)\n\nAmarelo\n([^\n]+)\n\nVermelho\n([^\n]+)$/i;
  const match = body.trim().match(pattern);
  if (!match) return undefined;
  return {
    intro: match[1]!.trim(),
    channels: [
      { title: 'Google Maps', text: match[2]!.trim() }, { title: 'Reputação', text: match[3]!.trim() },
      { title: 'Site', text: match[4]!.trim() }, { title: 'Instagram', text: match[5]!.trim() },
    ],
    legend: [
      { tone: 'positive', title: 'Verde', text: match[6]!.trim() }, { tone: 'attention', title: 'Amarelo', text: match[7]!.trim() },
      { tone: 'problem', title: 'Vermelho', text: match[8]!.trim() },
    ],
  };
}

function ScopeOverview({ parts }: { parts: ScopeOverviewParts }) {
  return <div class="scope-overview">
    <p class="scope-intro">{parts.intro}</p>
    <div class="scope-channels">{parts.channels.map((item, index) => <div class="scope-channel"><small>{String(index + 1).padStart(2, '0')}</small><b>{item.title}</b><p>{item.text}</p></div>)}</div>
    <div class="scope-legend">{parts.legend.map(item => <div class={`scope-legend-item scope-legend-item--${item.tone}`}><i/><span><b>{item.title}</b>{item.text}</span></div>)}</div>
  </div>;
}

function Narrative({ parts, tone }: { parts: NarrativeParts; tone: SlideTone }) {
  const labels = tone === 'positive'
    ? { issue: 'Ponto forte confirmado', impact: 'O que isso favorece', ideal: 'O que vale preservar', direction: 'Próximo avanço' }
    : tone === 'problem'
      ? { issue: 'O que precisa ser corrigido', impact: 'Por que isso pode custar oportunidades', ideal: 'Como deveria estar', direction: 'Direção recomendada' }
      : { issue: 'Oportunidade encontrada', impact: 'O que ainda pode limitar o resultado', ideal: 'Como deveria estar', direction: 'Direção recomendada' };
  return <div class="narrative-grid">
    <div class="narrative-block narrative-block--issue"><small>{labels.issue}</small><p>{parts.issue}</p></div>
    <div class="narrative-block"><small>{labels.impact}</small><p>{parts.impact}</p></div>
    <div class="narrative-block"><small>{labels.ideal}</small><p>{parts.ideal}</p></div>
    <div class="narrative-block narrative-block--direction"><small>{labels.direction}</small><p>{parts.direction}</p></div>
    {parts.source && <div class="narrative-source">Fonte: {parts.source}</div>}
  </div>;
}

function SlideEditor({ slide, index, total, onChange, onMove, onRegenerate, onRemove }: { slide: SlideSpec; index: number; total: number; onChange: (s: SlideSpec) => void; onMove: (delta: number) => void; onRegenerate: () => void; onRemove: () => void }) {
  const patch = (next: Partial<SlideSpec>) => onChange({ ...slide, ...next });
  return <article class="slide-editor">
    <div class="slide-thumbnail"><span>{String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</span><strong>{slide.title}</strong><p>{stringifyBody(slide.body)}</p></div>
    <div class="slide-fields">
      <div class="slide-tools"><span>{slide.layout}</span><button disabled={index === 0} onClick={() => onMove(-1)}>↑</button><button disabled={index === total - 1} onClick={() => onMove(1)}>↓</button><button onClick={onRegenerate}>Regenerar</button><button disabled={total <= 8} onClick={onRemove}>Ocultar</button></div>
      <label><span>Título do slide</span><input value={slide.title} onInput={e => patch({ title: e.currentTarget.value })}/></label>
      <label><span>Conteúdo</span><textarea value={stringifyBody(slide.body)} onInput={e => patch({ body: e.currentTarget.value })}/></label>
      <label><span>Roteiro de fala · {slide.durationSeconds || 0}s</span><textarea class="speaker-notes" value={slide.speakerNotes} onInput={e => patch({ speakerNotes: e.currentTarget.value })}/></label>
    </div>
  </article>;
}

function Editor({ analysis, reload, go }: { analysis: Analysis; reload: () => void; go: (p: string) => void }) {
  const approvedFindings = (items: Finding[]) => items.map(item => ({ ...item, approved: true }));
  const approvedSlides = (items: SlideSpec[]) => items.map(item => ({ ...item, approved: true }));
  const [findings, setFindings] = useState(approvedFindings(analysis.findings || [])); const [slides, setSlides] = useState(approvedSlides(analysis.slides || [])); const [error, setError] = useState(''); const [saved, setSaved] = useState(false); const [tab, setTab] = useState<'findings' | 'slides' | 'evidence'>('findings');
  useEffect(() => { setFindings(approvedFindings(analysis.findings || [])); setSlides(approvedSlides(analysis.slides || [])); }, [analysis.updatedAt]);
  const persist = async () => { const readyFindings=approvedFindings(findings); const readySlides=approvedSlides(slides); await api.updateFindings(analysis.id, readyFindings); await api.updateSlides(analysis.id, readySlides); setFindings(readyFindings); setSlides(readySlides); };
  const save = async () => { try { await persist(); await api.finalize(analysis.id); setSaved(true); setTimeout(() => setSaved(false), 2000); reload(); } catch (e) { setError((e as Error).message); } };
  const openPresentation = async () => { try { await persist(); await api.finalize(analysis.id); go(`/apresentacao/${analysis.id}`); } catch (e) { setError((e as Error).message); } };
  const move = (index: number, delta: number) => setSlides(current => { const next = [...current]; const [item] = next.splice(index, 1); if (!item) return current; next.splice(index + delta, 0, item); return next; });
  return <>
    <section class="editor-header"><div><p class="eyebrow">Correção opcional</p><h1>{analysis.companyName || 'Diagnóstico'}<em>.</em></h1><p class="editor-description">O material já está pronto. Edite, oculte ou regenere apenas o que precisar.</p></div><div class="editor-actions"><a class="secondary-action" href={`/api/analyses/${analysis.id}/pdf?format=desktop`} target="_blank">PDF 16:9</a><a class="secondary-action" href={`/api/analyses/${analysis.id}/pdf?format=mobile`} target="_blank">PDF celular 9:16</a><button class="secondary-action" onClick={save}>{saved ? 'Correções salvas ✓' : 'Salvar correções'}</button><button class="primary-action" onClick={openPresentation}>Abrir apresentação →</button></div></section>
    {error && <Notice tone="error">{error}</Notice>}
    <nav class="editor-tabs"><button class={tab === 'findings' ? 'active' : ''} onClick={() => setTab('findings')}>Achados <span>{findings.length}</span></button><button class={tab === 'slides' ? 'active' : ''} onClick={() => setTab('slides')}>Slides <span>{slides.length}</span></button><button class={tab === 'evidence' ? 'active' : ''} onClick={() => setTab('evidence')}>Evidências <span>{analysis.evidence.length}</span></button></nav>
    {tab === 'findings' && <section class="editor-stack">{findings.map((finding, index) => <FindingEditor key={finding.id} finding={finding} onChange={next => setFindings(current => current.map((f, i) => i === index ? next : f))} onRemove={() => setFindings(current => current.filter((_, i) => i !== index))}/>)}</section>}
    {tab === 'slides' && <section class="editor-stack">{slides.map((slide, index) => <SlideEditor key={slide.id} slide={slide} index={index} total={slides.length} onChange={next => setSlides(current => current.map((s, i) => i === index ? next : s))} onMove={delta => move(index, delta)} onRegenerate={async () => { await api.regenerateSlide(analysis.id, slide.id); reload(); }} onRemove={() => setSlides(current => current.filter((_, i) => i !== index))}/>)}</section>}
    {tab === 'evidence' && <section class="evidence-table">{analysis.evidence.map((evidence, index) => <article><span>{String(index + 1).padStart(2, '0')}</span><div><small>{evidence.source} · {formatDate(evidence.observedAt)}</small><h3>{evidence.title}</h3><pre>{typeof evidence.value === 'string' ? evidence.value : JSON.stringify(evidence.value, null, 2)}</pre>{evidence.sourceUrl && <a href={evidence.sourceUrl} target="_blank">Abrir fonte →</a>}</div></article>)}</section>}
  </>;
}

function AnalysisPage({ id, edit, go }: { id: string; edit: boolean; go: (p: string) => void }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null); const [error, setError] = useState('');
  const reload = () => api.get(id).then(setAnalysis).catch(e => setError(e.message));
  useEffect(() => { reload(); }, [id]);
  useEffect(() => { if (analysis?.status !== 'collecting') return; const timer = setInterval(reload, 2500); return () => clearInterval(timer); }, [analysis?.status]);
  return <Shell go={go} active="history">{error && <Notice tone="error">{error}</Notice>}{!analysis ? <div class="loading-line">Abrindo dossiê…</div> : edit ? <Editor analysis={analysis} reload={reload} go={go}/> : <Collection analysis={analysis} reload={reload} go={go}/>}</Shell>;
}

function SlideCanvas({ slide, analysis, compact = false, format = 'desktop' }: { slide: SlideSpec; analysis: Analysis; compact?: boolean; format?: PresentationFormat }) {
  const bodyText = stringifyBody(slide.body);
  const body = bodyText.split('\n').filter(Boolean);
  const narrative = parseNarrative(bodyText);
  const scopeOverview = slide.layout === 'summary' ? parseScopeOverview(bodyText) : undefined;
  const dark = /cover|capa|closing|final|cta/i.test(slide.layout) || slide === analysis.slides[0] || slide === analysis.slides[analysis.slides.length - 1];
  const linkedEvidence = analysis.evidence.filter(item => slide.evidenceIds.includes(item.id));
  const visualEvidence = slide.layout === 'website'
    ? [...linkedEvidence].sort((a, b) => Number(b.source === 'pagespeed') - Number(a.source === 'pagespeed'))
    : linkedEvidence;
  const visualFromEvidence = visualEvidence.map(item => {
    const value = item.value as Record<string, unknown> | null;
    if (!value || typeof value !== 'object') return undefined;
    if (typeof value.screenshotDataUrl === 'string') return value.screenshotDataUrl;
    if (Array.isArray(value.imageDataUrls) && typeof value.imageDataUrls[0] === 'string') return value.imageDataUrls[0];
    return undefined;
  }).find(Boolean);
  const allowsEvidenceVisual = ['media', 'website', 'instagram'].includes(slide.layout);
  const visual = allowsEvidenceVisual ? visualFromEvidence || (slide.layout === 'instagram' ? analysis.input.instagramScreenshots?.[0] : undefined) : undefined;
  const evidenceValue = (source: string, category?: string) => linkedEvidence.find(item => item.source === source && (!category || (item as Evidence & { category?: string }).category === category))?.value as Record<string, unknown> | undefined;
  const profileValue = evidenceValue('maps', 'profile');
  const reviewsValue = evidenceValue('reviews');
  const mediaValue = evidenceValue('maps', 'media');
  const comparisonValue = evidenceValue('competitors');
  const instagramValue = evidenceValue('instagram');
  const pageSpeedValue = (
    linkedEvidence.find(item => item.source === 'pagespeed') ||
    (slide.layout === 'website' ? analysis.evidence.find(item => item.source === 'pagespeed') : undefined)
  )?.value as Record<string, unknown> | undefined;
  const metrics: Array<{ value: string; label: string }> = [];
  if (slide.layout === 'profile') {
    if (typeof profileValue?.totalScore === 'number') metrics.push({ value: profileValue.totalScore.toLocaleString('pt-BR', { minimumFractionDigits: 1 }), label: 'nota pública' });
    if (typeof profileValue?.reviewsCount === 'number') metrics.push({ value: profileValue.reviewsCount.toLocaleString('pt-BR'), label: 'avaliações' });
  }
  if (slide.layout === 'reputation' && typeof reviewsValue?.sampleSize === 'number') metrics.push({ value: reviewsValue.sampleSize.toLocaleString('pt-BR'), label: 'avaliações analisadas' });
  if (slide.layout === 'responses' && typeof reviewsValue?.ownerResponseRate === 'number') metrics.push({ value: `${reviewsValue.ownerResponseRate}%`, label: 'receberam resposta da empresa' });
  if (slide.layout === 'media') {
    if (typeof mediaValue?.photoCount === 'number') metrics.push({ value: mediaValue.photoCount.toLocaleString('pt-BR'), label: 'fotos coletadas' });
    if (typeof mediaValue?.updateCount === 'number') metrics.push({ value: mediaValue.updateCount.toLocaleString('pt-BR'), label: 'atualizações observadas' });
  }
  if (slide.layout === 'profile' && Array.isArray(comparisonValue?.competitors)) metrics.push({ value: comparisonValue.competitors.length.toLocaleString('pt-BR'), label: 'negócios comparados' });
  if (slide.layout === 'website' && pageSpeedValue) {
    if (typeof pageSpeedValue.performanceScore === 'number') metrics.push({ value: `${pageSpeedValue.performanceScore}/100`, label: 'desempenho no celular' });
    if (typeof pageSpeedValue.largestContentfulPaint === 'string') metrics.push({ value: pageSpeedValue.largestContentfulPaint, label: 'conteúdo principal visível' });
    if (typeof pageSpeedValue.firstContentfulPaint === 'string') metrics.push({ value: pageSpeedValue.firstContentfulPaint, label: 'primeiro conteúdo visível' });
  }
  const instagramSignals = instagramValue?.signals as Record<string, unknown> | undefined;
  if (slide.layout === 'instagram' && instagramSignals) {
    if (typeof instagramSignals.postsLast30Days === 'number') metrics.push({ value: String(instagramSignals.postsLast30Days), label: 'publicações nos últimos 30 dias' });
    if (typeof instagramSignals.postsWithCallToAction === 'number') metrics.push({ value: String(instagramSignals.postsWithCallToAction), label: 'publicações que convidam ao contato' });
  }
  const comparisonMeta = slide.layout === 'profile' && comparisonValue ? [comparisonValue.term, comparisonValue.location, comparisonValue.observedAt ? formatDate(String(comparisonValue.observedAt)) : undefined].filter(Boolean).join(' · ') : '';
  const tone: SlideTone = toneForSlide(slide, analysis.findings);
  return <section data-slide data-format={format} class={`slide-canvas slide-canvas--${format} ${dark ? 'slide-canvas--dark' : ''} slide-canvas--${tone} layout--${slide.layout}`}>
    <header><Brand compact/><span>{formatDate(analysis.updatedAt)}</span></header>
    <div class="slide-content"><p class="eyebrow">{channelLabels[slide.layout] || 'Diagnóstico de presença digital'}</p><h1>{slide.title}</h1>{scopeOverview ? <ScopeOverview parts={scopeOverview}/> : narrative ? <Narrative parts={narrative} tone={tone}/> : <div class="slide-body">{body.map((line, i) => <p key={i}>{line}</p>)}</div>}{comparisonMeta && <div class="comparison-meta">Consulta: {comparisonMeta}</div>}{metrics.length > 0 && <div class="slide-metrics">{metrics.slice(0, 2).map(metric => <div><b>{metric.value}</b><span>{metric.label}</span></div>)}</div>}</div>
    {visual && <img class="evidence-visual" src={visual} alt="Evidência visual da análise"/>}
    {analysis.input.companyLogo && slide === analysis.slides[0] && <img class="client-logo" src={analysis.input.companyLogo} alt={`Logo ${analysis.companyName || 'da empresa'}`}/>} 
    <footer><span>{analysis.companyName || 'Empresa analisada'}</span></footer>
  </section>;
}

function usePresentation(id: string) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null); const [index, setIndex] = useState(0); const channel = useRef<BroadcastChannel>();
  useEffect(() => { api.get(id).then(setAnalysis); channel.current = new BroadcastChannel(`dirijo-gbp-${id}`); channel.current.onmessage = event => { if (event.data?.type === 'slide') setIndex(event.data.index); }; return () => channel.current?.close(); }, [id]);
  const move = (next: number) => { if (!analysis) return; const safe = Math.max(0, Math.min(analysis.slides.length - 1, next)); setIndex(safe); channel.current?.postMessage({ type: 'slide', index: safe }); };
  return { analysis, index, move };
}

function Presentation({ id, presenter = false }: { id: string; presenter?: boolean }) {
  const { analysis, index, move } = usePresentation(id); const [seconds, setSeconds] = useState(0); const [running, setRunning] = useState(false);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (['ArrowRight', ' ', 'PageDown'].includes(e.key)) { e.preventDefault(); move(index + 1); } if (['ArrowLeft', 'PageUp'].includes(e.key)) move(index - 1); if (e.key === 'f') document.documentElement.requestFullscreen?.(); }; addEventListener('keydown', key); return () => removeEventListener('keydown', key); }, [index, analysis]);
  useEffect(() => { if (!running) return; const timer = setInterval(() => setSeconds(s => s + 1), 1000); return () => clearInterval(timer); }, [running]);
  if (!analysis) return <div class="presentation-loading"><Brand/><p>Preparando apresentação…</p></div>;
  const params = new URLSearchParams(location.search);
  const printMode = params.get('print') === '1';
  const format: PresentationFormat = params.get('format') === 'mobile' ? 'mobile' : 'desktop';
  if (printMode) return <div class={`print-deck print-deck--${format}`} data-presentation-ready="true">{analysis.slides.map(item => <SlideCanvas key={item.id} slide={item} analysis={analysis} format={format}/>)}</div>;
  const slide = analysis.slides[index]; const next = analysis.slides[index + 1]; const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  if (!slide) return <div class="presentation-loading"><Brand/><p>Nenhum slide disponível para apresentar.</p></div>;
  if (presenter) return <div class="presenter-view">
    <header><Brand/><div class="presenter-clock"><small>tempo da gravação</small><b>{clock}</b><button onClick={() => setRunning(!running)}>{running ? 'Pausar' : 'Iniciar'}</button><button onClick={() => setSeconds(0)}>Zerar</button></div></header>
    <main><div class="presenter-preview"><SlideCanvas slide={slide} analysis={analysis} compact format={format}/><div class="presenter-controls"><button onClick={() => move(index - 1)}>← Anterior</button><span>{index + 1} / {analysis.slides.length}</span><button onClick={() => move(index + 1)}>Próximo →</button></div></div><aside><p class="eyebrow">Roteiro · {slide.durationSeconds || 0}s</p><h1>{slide.title}</h1><div class="notes">{slide.speakerNotes}</div>{next && <div class="next-up"><small>Em seguida</small><b>{next.title}</b></div>}</aside></main>
  </div>;
  return <div class={`presentation-view presentation-view--${format}`} data-presentation-ready="true"><SlideCanvas slide={slide} analysis={analysis} format={format}/><div class="presentation-controls"><button onClick={() => move(index - 1)}>←</button><span>{index + 1} / {analysis.slides.length}</span><button onClick={() => move(index + 1)}>→</button><button onClick={() => open(`/presenter/${id}?format=${format}`, '_blank')}>Modo apresentador</button><a href={`/apresentacao/${id}?format=${format === 'mobile' ? 'desktop' : 'mobile'}`}>{format === 'mobile' ? 'Ver apresentação 16:9' : 'Ver formato celular 9:16'}</a><a href={`/api/analyses/${id}/pdf?format=desktop`} target="_blank">Baixar PDF 16:9</a><a href={`/api/analyses/${id}/pdf?format=mobile`} target="_blank">Baixar PDF para celular 9:16</a></div></div>;
}

export function App() {
  const { path, go } = useRoute();
  const presenter = path.match(/^\/(?:apresentador|presenter)\/([^/]+)/); if (presenter?.[1]) return <Presentation id={presenter[1]} presenter/>;
  const presentation = path.match(/^\/(?:apresentacao|presentation)\/([^/]+)/); if (presentation?.[1]) return <Presentation id={presentation[1]}/>;
  const editor = path.match(/^\/analises\/([^/]+)\/editar/); if (editor?.[1]) return <AnalysisPage id={editor[1]} edit go={go}/>;
  const analysis = path.match(/^\/analises\/([^/]+)/); if (analysis?.[1]) return <AnalysisPage id={analysis[1]} edit={false} go={go}/>;
  if (path === '/configuracoes') return <SettingsPage go={go}/>;
  if (path === '/nova') return <NewAnalysis go={go}/>;
  return <History go={go}/>;
}
