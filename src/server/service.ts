import type { Analysis, AnalysisSummary, AnalysisInput, CostEstimate, Evidence, PlaceSnapshot, SourceName } from "../shared/types.js";
import { AnalysisRepository } from "./repository.js";
import { ApifyClient, instagramUsername, normalizeInstagramProfile, normalizePlace } from "./adapters/apify.js";
import { OpenAIDiagnosticClient } from "./adapters/openai.js";
import { PageSpeedClient, WebsiteAuditor, type WebsiteContactAction, type WebsitePage } from "./adapters/website.js";
import { createDiagnostic } from "../core/diagnostic.js";
import type { AssessedEvidence } from "../core/types.js";

export interface AnalysisServiceDependencies {
  repository: AnalysisRepository;
  apify?: ApifyClient | undefined;
  instagram?: ApifyClient | undefined;
  openai?: OpenAIDiagnosticClient | undefined;
  website?: WebsiteAuditor | undefined;
  pageSpeed?: PageSpeedClient | undefined;
  costLimitUsd?: number | undefined;
}

export class AnalysisService {
  private readonly running = new Map<string, Promise<Analysis>>();
  private heavyOperationRunning = false;

  ensureAvailable(): void {
    if (this.heavyOperationRunning) throw new OperationBusyError();
  }

  withHeavyOperation<T>(operation: () => Promise<T>): Promise<T> {
    this.ensureAvailable();
    this.heavyOperationRunning = true;
    try {
      return operation().finally(() => { this.heavyOperationRunning = false; });
    } catch (error) {
      this.heavyOperationRunning = false;
      throw error;
    }
  }
  constructor(private readonly deps: AnalysisServiceDependencies) {}

  updateIntegrations(next: Pick<AnalysisServiceDependencies, "apify" | "instagram" | "openai" | "pageSpeed">): void {
    this.deps.apify = next.apify;
    this.deps.instagram = next.instagram;
    this.deps.openai = next.openai;
    this.deps.pageSpeed = next.pageSpeed;
  }

  estimate(input: AnalysisInput): CostEstimate {
    const breakdown: Partial<Record<SourceName, number>> = { ai: 0.08 };
    if (input.mapsUrl?.trim()) Object.assign(breakdown, { maps: 0.08, reviews: 0.08, competitors: 0.12 });
    if (input.websiteUrl) { breakdown.website = 0; breakdown.pagespeed = 0; }
    if (input.instagramUrl) breakdown.instagram = 0.01;
    const totalUsd = Object.values(breakdown).reduce((sum, amount) => sum + (amount ?? 0), 0);
    const capUsd = this.deps.costLimitUsd ?? 1;
    return { currency: "USD", totalUsd, capUsd, breakdown, requiresConfirmation: totalUsd > capUsd };
  }

  create(input: AnalysisInput): Analysis {
    validateInput(input);
    const estimate = this.estimate(input);
    return this.deps.repository.create(input, estimate.totalUsd, estimate.capUsd);
  }

  collect(id: string, confirmOverCap = false): Promise<Analysis> {
    const existing = this.running.get(id);
    if (existing) return existing;
    const promise = this.withHeavyOperation(() => this.collectInternal(id, confirmOverCap)).finally(() => this.running.delete(id));
    this.running.set(id, promise);
    return promise;
  }

  isRunning(id: string): boolean { return this.running.has(id); }

  get(id: string): Analysis { return this.require(id); }
  list(): AnalysisSummary[] { return this.deps.repository.list(); }

  regenerateSlide(id: string, slideId: string): Promise<Analysis> {
    return this.withHeavyOperation(() => this.regenerateSlideInternal(id, slideId));
  }

  private async regenerateSlideInternal(id: string, slideId: string): Promise<Analysis> {
    const before = this.require(id);
    if (before.actualCostUsd >= before.costLimitUsd) throw new CostLimitError(before.actualCostUsd, before.costLimitUsd);
    const targetIndex = before.slides.findIndex((slide) => slide.id === slideId);
    if (targetIndex < 0) throw new NotFoundError();
    if (!this.deps.openai) throw new Error("OpenAI não configurada.");
    const generated = await this.deps.openai.generate(before.companyName ?? "Empresa analisada", before.evidence);
    const replacement = generated.output.slides.find((slide) => slide.layout === before.slides[targetIndex]?.layout) ?? generated.output.slides[targetIndex];
    if (!replacement) throw new Error("A IA não retornou uma alternativa para este slide.");
    const slides = before.slides.map((slide, position) => position === targetIndex ? { ...replacement, id: slide.id, position, approved: true } : { ...slide, approved: true, position });
    this.deps.repository.replaceSlides(id, slides);
    const amount = (generated.usage.inputTokens * 0.25 + generated.usage.outputTokens * 2) / 1_000_000;
    this.deps.repository.addCost(id, "ai", amount, generated.usage.inputTokens + generated.usage.outputTokens, {
      model: this.deps.openai.model,
      regeneration: slideId,
      responseId: generated.responseId,
      verificationResponseId: generated.verificationResponseId,
      verificationApplied: generated.verificationApplied,
      calls: generated.verificationApplied ? 2 : 1,
    });
    this.makeReady(id, "review");
    return this.require(id);
  }

  retry(id: string, source: SourceName, confirmOverCap = false): Promise<Analysis> {
    return this.withHeavyOperation(() => this.retryInternal(id, source, confirmOverCap));
  }

  private async retryInternal(id: string, source: SourceName, confirmOverCap: boolean): Promise<Analysis> {
    const analysis = this.require(id);
    if (analysis.actualCostUsd >= analysis.costLimitUsd && !confirmOverCap) throw new CostLimitError(analysis.actualCostUsd, analysis.costLimitUsd);
    this.deps.repository.clearSourceData(id, source);
    try {
      await this.runSource(id, source, analysis.input);
      if (source !== "ai" && this.deps.openai) await this.runSource(id, "ai", analysis.input);
    } catch (error) {
      if (source === "ai" && this.require(id).evidence.length) this.generateLocalDraft(id, analysis.input);
      this.deps.repository.setSource(id, source, "failed", errorMessage(error));
    }
    this.makeReady(id, "review");
    return this.require(id);
  }

  finalize(id: string): Analysis {
    const analysis = this.require(id);
    if (!analysis.findings.length || !analysis.slides.length) throw new Error("A análise precisa de achados e slides antes da finalização.");
    if (analysis.findings.some((finding) => !finding.approved)) {
      this.deps.repository.replaceFindings(id, analysis.findings.map((finding) => ({ ...finding, approved: true })));
    }
    if (analysis.slides.some((slide) => !slide.approved)) {
      this.deps.repository.replaceSlides(id, analysis.slides.map((slide) => ({ ...slide, approved: true })));
    }
    this.deps.repository.saveFinalVersion(id);
    this.deps.repository.setStatus(id, "finalized");
    return this.require(id);
  }

  private async collectInternal(id: string, confirmOverCap: boolean): Promise<Analysis> {
    const analysis = this.require(id);
    const estimate = this.estimate(analysis.input);
    if (estimate.requiresConfirmation && !confirmOverCap) throw new CostLimitError(estimate.totalUsd, estimate.capUsd);
    this.deps.repository.setStatus(id, "collecting");
    const phases: SourceName[][] = [
      ["maps"],
      ["reviews", "competitors", "website", "pagespeed", "instagram", "operator"],
      ["ai"],
    ];
    let successes = 0;
    const runOne = async (source: SourceName): Promise<void> => {
      const relevant = this.isRelevant(id, source, analysis.input);
      if (!relevant) { this.deps.repository.setSource(id, source, "skipped"); return; }
      if (!confirmOverCap && this.require(id).actualCostUsd >= this.require(id).costLimitUsd) {
        this.deps.repository.setSource(id, source, "skipped", "Limite de custo atingido; confirme para continuar.");
        return;
      }
      try { await this.runSource(id, source, analysis.input); successes += 1; }
      catch (error) {
        if (source === "ai" && this.require(id).evidence.length) this.generateLocalDraft(id, analysis.input);
        this.deps.repository.setSource(id, source, "failed", errorMessage(error));
      }
    };
    for (const phase of phases) {
      await Promise.all(phase.map(runOne));
    }
    this.makeReady(id, successes > 0 ? "review" : "failed");
    return this.require(id);
  }

  private async runSource(id: string, source: SourceName, input: AnalysisInput): Promise<void> {
    this.deps.repository.setSource(id, source, "running");
    const observedAt = new Date().toISOString();
    if (source === "maps") {
      if (!input.mapsUrl?.trim()) {
        this.deps.repository.setCompanyName(id, input.companyName!.trim());
        this.deps.repository.replaceEvidence(id, "maps", missingGoogleProfileEvidence(observedAt));
        this.deps.repository.setSource(id, "maps", "completed", "Ausência do Perfil da Empresa no Google registrada como oportunidade.");
        return;
      }
      if (!this.deps.apify) throw new Error("Apify não configurada.");
      const result = await this.deps.apify.collectPlace(input.mapsUrl, "newest", 30);
      const place = normalizePlace(result.items[0], input.mapsUrl);
      const imageDataUrls = await downloadImages(place.imageUrls.slice(0, 4));
      this.deps.repository.setCompanyName(id, input.companyName?.trim() || place.title);
      const { reviews, ...profile } = place;
      this.deps.repository.replaceEvidence(id, "maps", [
        { ...evidence("maps", "Perfil público no Google", { ...profile, recentReviews: reviews }, place.sourceUrl, observedAt, 0.98), category: "profile" },
        { ...evidence("maps", "Fotos, vídeos e sinais de atividade", { photoCount: place.imageUrls.length, updateCount: place.ownerUpdates?.length ?? 0, questionCount: place.questionsAndAnswers?.length ?? 0, imageDataUrls }, place.sourceUrl, observedAt, 0.92), category: "media" },
      ]);
      this.deps.repository.addCost(id, "maps", result.costUsd, 1, { runId: result.runId, datasetId: result.datasetId });
      this.deps.repository.setSource(id, "maps", "completed", undefined, { runId: result.runId }, result.runId);
      return;
    }
    if (source === "reviews") {
      if (!this.deps.apify) throw new Error("Apify não configurada.");
      const primary = this.profile(id) as PlaceSnapshot & { recentReviews?: PlaceSnapshot["reviews"] };
      const negative = await this.deps.apify.collectPlace(primary.sourceUrl, "lowestRanking", 20);
      const low = normalizePlace(negative.items[0], primary.sourceUrl);
      const reviews = dedupeReviews([...(primary.recentReviews ?? []), ...low.reviews]).slice(0, 100);
      this.deps.repository.replaceEvidence(id, "reviews", [evidence("reviews", "O que as avaliações revelam antes do contato", { ...summarizeReviews(reviews), reviews, distribution: primary.reviewsDistribution }, primary.sourceUrl, observedAt, 0.95)]);
      this.deps.repository.addCost(id, "reviews", negative.costUsd, reviews.length, { runIds: [negative.runId] });
      this.deps.repository.setSource(id, "reviews", "completed", undefined, { runIds: [negative.runId] });
      return;
    }
    if (source === "competitors") {
      if (!this.deps.apify) throw new Error("Apify não configurada.");
      const place = this.profile(id);
      const category = place.category ?? place.categories[0]; const location = place.city ?? place.address;
      if (!category || !location) throw new Error("Categoria ou cidade não disponível para comparação.");
      const result = await this.deps.apify.collectCompetitors(category, location);
      const competitors = result.items.map((item) => normalizePlace(item, input.mapsUrl!)).filter((item) => item.title !== place.title).slice(0, 5).map(safeCompetitor);
      this.deps.repository.replaceEvidence(id, "competitors", [evidence("competitors", "Retrato comparativo local", { term: category, location, observedAt, competitors }, input.mapsUrl, observedAt, 0.85)]);
      this.deps.repository.addCost(id, "competitors", result.costUsd, competitors.length, { runId: result.runId });
      this.deps.repository.setSource(id, "competitors", "completed", undefined, { runId: result.runId, term: category, location }, result.runId);
      return;
    }
    if (source === "website") {
      const websiteUrl = this.websiteUrlFor(id, input);
      if (!websiteUrl) {
        this.deps.repository.replaceEvidence(id, "website", [{
          ...evidence("website", "Ausência de site próprio", { present: false, reason: input.mapsUrl ? "Nenhum site foi informado nem encontrado no Perfil da Empresa no Google." : "Nenhum site próprio foi informado." }, undefined, observedAt, 0.98),
          category: "website", assessment: "negative", impact: "high",
          recommendation: "Criar uma página própria que apresente os serviços, reforce a confiança e conduza até o WhatsApp ou agendamento.",
        }]);
        this.deps.repository.setSource(id, "website", "skipped", "Nenhum site público foi informado ou encontrado.");
        return;
      }
      if (!this.deps.website) throw new Error("Auditor de site não configurado.");
      const audit = await this.deps.website.audit(websiteUrl);
      const pages = audit.pages.map(({ visibleText: _visibleText, ...page }) => page);
      const place = this.mapsProfile(id);
      const napConsistency = place ? compareWebsiteToProfile(audit.pages, place) : undefined;
      this.deps.repository.replaceEvidence(id, "website", [evidence("website", "Auditoria do site", { ...audit, pages, ...(napConsistency ? { napConsistency } : {}) }, websiteUrl, observedAt, 0.95)]);
      this.deps.repository.setSource(id, "website", "completed"); return;
    }
    if (source === "pagespeed") {
      const websiteUrl = this.websiteUrlFor(id, input);
      if (!websiteUrl || !this.deps.pageSpeed) throw new Error("PageSpeed não configurado.");
      const result = await this.deps.pageSpeed.inspect(websiteUrl);
      this.deps.repository.replaceEvidence(id, "pagespeed", [evidence("pagespeed", "Desempenho mobile", result, websiteUrl, observedAt, 0.9)]);
      this.deps.repository.setSource(id, "pagespeed", "completed"); return;
    }
    if (source === "instagram") {
      const manual = { checklist: input.instagramChecklist ?? {}, screenshots: input.instagramScreenshots ?? [] };
      if (input.instagramUrl) {
        if (!this.deps.instagram) throw new Error("Coleta automática do Instagram não configurada.");
        const username = instagramUsername(input.instagramUrl);
        const result = await this.deps.instagram.run({ usernames: [username], includeAboutSection: false });
        const profile = normalizeInstagramProfile(result.items[0], input.instagramUrl);
        if (profile.privateAccount) throw new Error("O perfil do Instagram é privado e não pode ser analisado automaticamente.");
        if (!this.require(id).companyName && profile.fullName?.trim()) this.deps.repository.setCompanyName(id, profile.fullName.trim());
        const imageDataUrls = await downloadImages(profile.latestPosts.map((post) => post.imageUrl).filter((url): url is string => Boolean(url)).slice(0, 6));
        this.deps.repository.replaceEvidence(id, "instagram", [
          { ...evidence("instagram", "Como o Instagram conduz até o contato", { ...profile, imageDataUrls, manual }, input.instagramUrl, observedAt, 0.95), category: "instagram" },
        ]);
        this.deps.repository.addCost(id, "instagram", result.costUsd, 1, { runId: result.runId, datasetId: result.datasetId });
        this.deps.repository.setSource(id, "instagram", "completed", undefined, { runId: result.runId, username }, result.runId);
        return;
      }
      this.deps.repository.replaceEvidence(id, "instagram", [
        { ...evidence("instagram", "Observação manual do Instagram", manual, undefined, observedAt, 1), category: "instagram" },
      ]);
      this.deps.repository.setSource(id, "instagram", "completed"); return;
    }
    if (source === "operator") {
      this.deps.repository.replaceEvidence(id, "operator", [evidence("operator", "Contexto informado pelo operador", { contactName: input.contactName, companyName: input.companyName }, undefined, observedAt, 1)]);
      this.deps.repository.setSource(id, "operator", "completed"); return;
    }
    if (source === "ai") {
      if (!this.deps.openai) throw new Error("OpenAI não configurada.");
      const current = this.require(id); if (!current.evidence.length) throw new Error("Não há evidências para analisar.");
      const generated = await this.deps.openai.generate(current.companyName ?? input.companyName ?? "Empresa analisada", current.evidence);
      this.deps.repository.replaceFindings(id, generated.output.findings.map((item, position) => ({ ...item, approved: true, position })));
      this.deps.repository.replaceSlides(id, generated.output.slides.map((item, position) => ({ ...item, approved: true, position })));
      const amount = (generated.usage.inputTokens * 0.25 + generated.usage.outputTokens * 2) / 1_000_000;
      const metadata = {
        model: this.deps.openai.model,
        usage: generated.usage,
        responseId: generated.responseId,
        verificationResponseId: generated.verificationResponseId,
        verificationApplied: generated.verificationApplied,
        calls: generated.verificationApplied ? 2 : 1,
      };
      this.deps.repository.addCost(id, "ai", amount, generated.usage.inputTokens + generated.usage.outputTokens, metadata);
      this.deps.repository.setSource(id, "ai", "completed", undefined, metadata); return;
    }
  }

  private profile(id: string): PlaceSnapshot {
    const profile = this.mapsProfile(id);
    if (!profile) throw new Error("Perfil principal ainda não coletado.");
    return profile;
  }
  private mapsProfile(id: string): PlaceSnapshot | undefined {
    const value = this.require(id).evidence.find((item) => {
      if (item.source !== "maps" || item.category !== "profile" || !item.value || typeof item.value !== "object") return false;
      return (item.value as Record<string, unknown>).present !== false;
    })?.value;
    return value as PlaceSnapshot | undefined;
  }
  private isRelevant(id: string, source: SourceName, input: AnalysisInput): boolean {
    if (source === "reviews" || source === "competitors") return Boolean(input.mapsUrl?.trim());
    if (source === "website") return true;
    if (source === "pagespeed") return Boolean(this.deps.pageSpeed && this.websiteUrlFor(id, input));
    if (source === "instagram") return Boolean(input.instagramUrl || input.instagramChecklist || input.instagramScreenshots?.length);
    if (source === "operator") return Boolean(input.contactName || input.companyName);
    return true;
  }
  private websiteUrlFor(id: string, input: AnalysisInput): string | undefined {
    const informed = input.websiteUrl?.trim();
    if (informed) return informed;
    try { return this.profile(id).website?.trim(); } catch { return undefined; }
  }
  private generateLocalDraft(id: string, input: AnalysisInput): void {
    const current = this.require(id);
    const result = createDiagnostic({
      analysisId: id,
      input,
      ...(current.companyName ? { companyName: current.companyName } : {}),
      evidence: current.evidence as AssessedEvidence[],
      generatedAt: new Date().toISOString(),
    });
    this.deps.repository.replaceFindings(id, result.findings.map((item, position) => ({ ...item, approved: true, position })));
    this.deps.repository.replaceSlides(id, result.presentation.slides.map((item, position) => ({ ...item, approved: true, position })));
  }
  private makeReady(id: string, fallbackStatus: Analysis["status"]): void {
    const analysis = this.require(id);
    if (!analysis.findings.length || !analysis.slides.length) {
      this.deps.repository.setStatus(id, fallbackStatus);
      return;
    }
    if (analysis.findings.some((finding) => !finding.approved)) {
      this.deps.repository.replaceFindings(id, analysis.findings.map((finding) => ({ ...finding, approved: true })));
    }
    if (analysis.slides.some((slide) => !slide.approved)) {
      this.deps.repository.replaceSlides(id, analysis.slides.map((slide) => ({ ...slide, approved: true })));
    }
    this.deps.repository.saveFinalVersion(id);
    this.deps.repository.setStatus(id, "finalized");
  }
  private require(id: string): Analysis { const analysis = this.deps.repository.get(id); if (!analysis) throw new NotFoundError(); return analysis; }
}

export class NotFoundError extends Error { constructor() { super("Análise não encontrada."); } }
export class CostLimitError extends Error { constructor(readonly estimatedUsd: number, readonly limitUsd: number) { super(`Custo estimado de US$ ${estimatedUsd.toFixed(2)} excede o limite de US$ ${limitUsd.toFixed(2)}.`); } }
function validateInput(input: AnalysisInput): void {
  const mapsUrl = input.mapsUrl?.trim();
  const hasAlternativeSource = Boolean(input.websiteUrl?.trim() || input.instagramUrl?.trim() || input.instagramScreenshots?.length || Object.values(input.instagramChecklist ?? {}).some((value) => value?.trim()));
  if (!mapsUrl && !input.companyName?.trim()) throw new Error("Informe o nome da empresa quando ela não possui Perfil da Empresa no Google.");
  if (!mapsUrl && !hasAlternativeSource) throw new Error("Informe ao menos o Instagram, o site ou observações públicas para analisar a empresa sem Google Maps.");
  if (mapsUrl) {
    let url: URL;
    try { url = new URL(mapsUrl); } catch { throw new Error("Link do Google Maps inválido."); }
    const sharedGoogleLink = /(^|\.)share\.google$/i.test(url.hostname);
    const mapsLink = /(google\.[^/]+\/maps|maps\.google\.[^/]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(url.href);
    if (!/^https?:$/.test(url.protocol) || (!mapsLink && !sharedGoogleLink)) throw new Error("Informe um link válido do Google Maps.");
  }
  if (input.instagramUrl) instagramUsername(input.instagramUrl);
  if ((input.instagramScreenshots?.length ?? 0) > 4) throw new Error("Use no máximo quatro capturas do Instagram.");
}
function missingGoogleProfileEvidence(observedAt: string): Array<Omit<Evidence, "id" | "analysisId">> {
  const base = { present: false, reason: "Nenhum Perfil da Empresa no Google foi informado para esta empresa." };
  return [
    { ...evidence("maps", "Ausência do Perfil da Empresa no Google", { ...base, targetLayout: "profile", headline: "Google: a empresa ainda não possui sua principal vitrine nas buscas locais." }, undefined, observedAt, 1), category: "profile", assessment: "negative", impact: "high", recommendation: "Criar e validar o Perfil da Empresa no Google com categoria, serviços, localização, contato e horários corretos." },
    { ...evidence("maps", "Ausência de avaliações públicas no Google", { ...base, sampleSize: 0, targetLayout: "reputation", headline: "Avaliações no Google: hoje não existe uma reputação pública para apoiar a decisão." }, undefined, observedAt, 1), category: "reputation", assessment: "negative", impact: "high", recommendation: "Após a validação do perfil, criar uma rotina legítima para solicitar avaliações de clientes atendidos." },
    { ...evidence("maps", "Ausência de respostas públicas no Google", { ...base, sampleSize: 0, targetLayout: "responses", headline: "Respostas no Google: a rotina pode nascer junto com as primeiras avaliações." }, undefined, observedAt, 1), category: "reputation", assessment: "neutral", impact: "medium", recommendation: "Definir desde o início quem acompanhará e responderá as avaliações recebidas." },
    { ...evidence("maps", "Ausência de fotos e atualizações no Google", { ...base, photoCount: 0, updateCount: 0, targetLayout: "media", headline: "Fotos no Google: quem pesquisa ainda não encontra sinais visuais da empresa." }, undefined, observedAt, 1), category: "media", assessment: "negative", impact: "high", recommendation: "Publicar fotos reais, serviços, estrutura e atualizações assim que o perfil estiver validado." },
  ];
}
function errorMessage(error:unknown):string{return error instanceof Error?error.message:"Falha inesperada.";}
function evidence(source:SourceName,title:string,value:unknown,sourceUrl:string|undefined,observedAt:string,confidence:number):Omit<Evidence,"id"|"analysisId">{return{source,title,value,sourceUrl,observedAt,confidence};}
export function dedupeReviews(reviews: PlaceSnapshot["reviews"]) {
  const merged = new Map<string, PlaceSnapshot["reviews"][number]>();
  for (const review of reviews) {
    const key = `${review.rating ?? 0}|${review.publishedAt ?? ""}|${review.text ?? ""}`;
    const prior = merged.get(key);
    const rank = (item: PlaceSnapshot["reviews"][number]) => item.responseText || item.responseAt || item.responseStatus === "present" ? 2 : item.responseStatus === "absent" ? 1 : 0;
    if (!prior || rank(review) > rank(prior)) merged.set(key, review);
  }
  return [...merged.values()];
}
export function summarizeReviews(reviews: PlaceSnapshot["reviews"], now = new Date()) {
  const ageInDays = (value?: string) => value && !Number.isNaN(Date.parse(value)) ? Math.max(0, Math.floor((now.getTime() - Date.parse(value)) / 86_400_000)) : undefined;
  const themePatterns: Array<[string, RegExp]> = [
    ["atendimento", /atendimento|atendente|equipe|recep[cç][aã]o|funcion[aá]ri/iu],
    ["demora", /demora|espera|atras|lent[oa]|retorno/iu],
    ["agendamento e contato", /agend|whats(?:app)?|telefone|contato|responde|mensagem/iu],
    ["preço e cobrança", /pre[cç]o|caro|valor|cobran[cç]a|pagamento|estacionamento/iu],
    ["estrutura e conforto", /estrutura|ambiente|limpeza|banheiro|ar-condicionado|mofo|teto|confort/iu],
    ["qualidade percebida", /qualidade|excelente|recomendo|resultado|profissional|competente/iu],
  ];
  const themes = themePatterns.map(([theme, pattern]) => {
    const matched = reviews.filter((review) => pattern.test(review.text ?? ""));
    const ratings = matched.map((review) => review.rating).filter((rating): rating is number => typeof rating === "number");
    const averageRating = ratings.length ? Number((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)) : undefined;
    return { theme, count: matched.length, averageRating };
  }).filter((theme) => theme.count > 0).sort((a, b) => b.count - a.count);
  const responses = reviews.filter((review) => Boolean(review.responseText || review.responseAt) || review.responseStatus === "present").length;
  const unknown = reviews.filter((review) => !review.responseText && !review.responseAt && review.responseStatus !== "present" && review.responseStatus !== "absent").length;
  const dated = reviews.map((review) => ageInDays(review.publishedAt)).filter((age): age is number => age !== undefined);
  return {
    sampleSize: reviews.length,
    positiveCount: reviews.filter((review) => (review.rating ?? 0) >= 4).length,
    criticalCount: reviews.filter((review) => (review.rating ?? 5) <= 3).length,
    ownerResponseCount: responses,
    ownerResponseRate: reviews.length && unknown === 0 ? Math.round((responses / reviews.length) * 100) : undefined,
    ownerResponseUnknownCount: unknown,
    ownerResponseVerification: reviews.length && unknown === 0 ? "verified" : "unknown",
    reviewsLast90Days: dated.filter((age) => age <= 90).length,
    daysSinceLatestReview: dated.length ? Math.min(...dated) : undefined,
    themes,
  };
}
function safeCompetitor(place:PlaceSnapshot){return{title:place.title,category:place.category,categories:place.categories,address:place.address,website:place.website,totalScore:place.totalScore,reviewsCount:place.reviewsCount,recentReviewCount:place.reviews.length,hasOwnerResponses:place.reviews.some((review)=>Boolean(review.responseText || review.responseAt) || review.responseStatus === "present") ? true : place.reviews.length && place.reviews.every((review)=>review.responseStatus === "absent") ? false : undefined,hasUpdates:Boolean(place.ownerUpdates?.length),hasImages:Boolean(place.imageUrls.length),sourceUrl:place.sourceUrl};}
async function downloadImages(urls:string[]):Promise<string[]>{const results:string[]=[];for(const url of urls){try{const response=await fetch(url,{signal:AbortSignal.timeout(8_000)});if(!response.ok)continue;const type=response.headers.get("content-type")??"";const length=Number(response.headers.get("content-length")??0);if(!type.startsWith("image/")||length>3_000_000)continue;const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>3_000_000)continue;results.push(`data:${type};base64,${bytes.toString("base64")}`);}catch{/* mantém as demais evidências */}}return results;}
function normalizeLoose(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function websiteNameMatches(title: string, place: PlaceSnapshot, pages: WebsitePage[]): boolean {
  const generic = new Set(["clinica", "estetica", "empresa", "unidade", "loja", "de", "da", "do", "das", "dos", "e", "em"]);
  const cityTokens = new Set(normalizeLoose(place.city ?? "").split(" ").filter(Boolean));
  const profileTokens = normalizeLoose(title).split(" ").filter((token) => token.length > 1 && !generic.has(token) && !cityTokens.has(token));
  const required = profileTokens.slice(0, 2);
  if (!required.length) return false;
  return pages.some((page) => [page.title, ...page.h1].filter((item): item is string => Boolean(item)).some((candidate) => {
    const tokens = new Set(normalizeLoose(candidate).split(" "));
    return required.every((token) => tokens.has(token));
  }));
}

interface AddressReference {
  street: string;
  number: string;
  snippet: string;
}

function addressReferences(value: string): AddressReference[] {
  const matches = value.match(/\b(?:rua|r|avenida|av|travessa|tv|praça|praca|alameda|estrada|rodovia)\.?(?:\s+|,\s*)[^.;\n]{0,140}?(?:\bn[º°o.]?\s*)?\d{1,5}\b[^.;\n]{0,100}/giu) ?? [];
  return matches.flatMap((snippet) => {
    const normalized = normalizeLoose(snippet);
    const parts = normalized.match(/(?:^|\b)(?:rua|r|avenida|av|travessa|tv|praca|alameda|estrada|rodovia)\s+(.+?)\s+(?:n(?:umero)?\s+)?(\d{1,5})\b/i);
    if (!parts?.[1] || !parts[2]) return [];
    return [{ street: parts[1].trim(), number: parts[2], snippet: snippet.replace(/\s+/g, " ").trim().slice(0, 240) }];
  });
}

function sameStreet(left: string, right: string): boolean {
  const a = normalizeLoose(left);
  const b = normalizeLoose(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function digits(value: string): string { return value.replace(/\D/g, ""); }

function comparablePhone(value: string): string {
  let number = digits(value);
  if (number.startsWith("55") && (number.length === 12 || number.length === 13)) number = number.slice(2);
  return number;
}

function phonesMatch(left: string, right: string): boolean {
  const a = comparablePhone(left);
  const b = comparablePhone(right);
  return Boolean(a && b && (a === b || (a.length >= 10 && b.endsWith(a.slice(-10))) || (b.length >= 10 && a.endsWith(b.slice(-10)))));
}

function phoneNumbersInText(value: string): string[] {
  const matches = value.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9?\d{4})[-.\s]?\d{4}/g) ?? [];
  return matches.filter((item) => digits(item).length >= 10 && digits(item).length <= 13);
}

function compareWebsiteToProfile(pages: WebsitePage[], place: PlaceSnapshot): Record<string, unknown> {
  const nameFound = websiteNameMatches(place.title, place, pages);
  const profileAddress = place.address ? addressReferences(place.address)[0] : undefined;
  const unitPage = (profileAddress
    ? pages.find((page) => addressReferences(page.visibleText ?? "").some((item) => sameStreet(item.street, profileAddress.street)))
    : undefined) ?? pages[0];
  const siteAddresses = unitPage ? addressReferences(unitPage.visibleText ?? "") : [];
  const addressFound = siteAddresses.length > 0;
  const matchedAddress = profileAddress
    ? siteAddresses.find((item) => sameStreet(item.street, profileAddress.street) && item.number === profileAddress.number)
    : undefined;
  const sameStreetDifferentNumber = profileAddress
    ? siteAddresses.find((item) => sameStreet(item.street, profileAddress.street) && item.number !== profileAddress.number)
    : undefined;
  const addressMatchesProfile = !profileAddress ? undefined : matchedAddress ? true : (sameStreetDifferentNumber || addressFound) ? false : undefined;

  const actions = unitPage?.contactActions ?? [];
  const whatsappActions = actions.filter((action) => action.kind === "whatsapp");
  const phoneActions = whatsappActions.length ? whatsappActions : actions.filter((action) => action.kind === "phone");
  const linkedPhoneNumbers = phoneActions.flatMap((action) => action.target ? [digits(action.target)] : []).filter((item) => item.length >= 10 && item.length <= 13);
  const visiblePhoneNumbers = phoneNumbersInText(unitPage?.visibleText ?? "");
  const phoneFound = linkedPhoneNumbers.length > 0 || visiblePhoneNumbers.length > 0;
  const phoneMatchesProfile = place.phone && linkedPhoneNumbers.length
    ? linkedPhoneNumbers.some((number) => phonesMatch(number, place.phone!))
    : undefined;
  const preferredKinds = whatsappActions.length ? ["whatsapp", "booking"] : ["booking", "phone", "contact"];
  const preferredActions = preferredKinds
    .map((kind) => actions.find((action) => action.kind === kind))
    .filter((action): action is WebsiteContactAction => Boolean(action))
    .slice(0, 3);
  const contactActions = preferredActions.map((action) => ({
    kind: action.kind,
    label: action.kind === "whatsapp" && /^\+?[\d\s().-]+$/.test(action.label) ? "WhatsApp da unidade" : action.label,
    element: action.element,
  }));

  return {
    nameFound: nameFound ? true : undefined,
    nameMatchesProfile: nameFound ? true : undefined,
    addressFound: addressFound ? true : undefined,
    addressMatchesProfile,
    ...(siteAddresses[0] ? { siteAddress: siteAddresses[0].snippet } : {}),
    phoneFound: phoneFound ? true : undefined,
    phoneMatchesProfile,
    contactActions: contactActions.slice(0, 12),
    pagesCaptured: pages.length,
    pagesRendered: pages.filter((page) => page.rendered).length,
    collectionNote: "Os resultados descrevem os elementos identificados nas páginas capturadas. Um item não identificado pela coleta não confirma que ele esteja ausente do site.",
  };
}

export class OperationBusyError extends Error {
  constructor() { super("Uma geração ou PDF está em andamento. Aguarde e tente novamente."); }
}
