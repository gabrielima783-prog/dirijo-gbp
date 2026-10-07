import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  Analysis, AnalysisSummary, AnalysisInput, AnalysisStatus, Asset, CostEntry, Evidence, Finding,
  SlideSpec, SourceName, SourceStatus, SourceStatusValue,
} from "../shared/types.js";

const SOURCES: SourceName[] = ["maps", "reviews", "competitors", "website", "pagespeed", "instagram", "operator", "ai"];
const json = (value: unknown) => JSON.stringify(value);
const parse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

export class AnalysisRepository {
  constructor(readonly db: DatabaseSync) {}

  recoverInterrupted(): number {
    const now = new Date().toISOString();
    return this.transaction(() => {
      this.db.prepare("UPDATE source_runs SET status='failed', error=?, updated_at=? WHERE status='running'")
        .run("Execução interrompida por reinício. Revise e tente novamente manualmente.", now);
      return Number(this.db.prepare("UPDATE analyses SET status='failed', updated_at=? WHERE status='collecting'").run(now).changes);
    });
  }

  private transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  create(input: AnalysisInput, estimate = 0, cap = 1): Analysis {
    const id = randomUUID();
    const now = new Date().toISOString();
    const tx = () => this.transaction(() => {
      this.db.prepare(`INSERT INTO analyses
        (id,status,input_json,estimated_cost_usd,cost_limit_usd,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?)`).run(id, "draft", json(input), estimate, cap, now, now);
      const source = this.db.prepare(`INSERT INTO source_runs
        (analysis_id,source,status,updated_at) VALUES (?,?,?,?)`);
      for (const name of SOURCES) source.run(id, name, "pending", now);
    });
    tx();
    this.saveVersion(id, "created", { input, estimate, cap });
    return this.get(id)!;
  }

  list(): AnalysisSummary[] {
    // History deliberately excludes evidence, screenshots, slides and cost metadata.
    const rows = this.db.prepare(`SELECT a.id,a.status,
      COALESCE(a.company_name,json_extract(a.input_json,'$.companyName')) AS company_name,
      a.created_at,a.updated_at,a.estimated_cost_usd,COALESCE(c.actual_cost_usd,0) AS actual_cost_usd
      FROM analyses a LEFT JOIN (SELECT analysis_id,SUM(amount_usd) AS actual_cost_usd FROM costs GROUP BY analysis_id) c
      ON c.analysis_id=a.id ORDER BY a.created_at DESC`).all() as Record<string, unknown>[];
    const statuses = new Map<string, AnalysisSummary["sourceStatuses"]>();
    for (const row of rows) statuses.set(String(row.id),Object.fromEntries(SOURCES.map(source => [source,{status:"pending"}])) as AnalysisSummary["sourceStatuses"]);
    for (const run of this.db.prepare("SELECT analysis_id,source,status FROM source_runs").all() as Record<string, unknown>[]) {
      const analysisStatuses=statuses.get(String(run.analysis_id));
      if (analysisStatuses) analysisStatuses[String(run.source) as SourceName]={status:String(run.status) as SourceStatusValue};
    }
    return rows.map(row => ({
      id:String(row.id),status:String(row.status) as AnalysisStatus,
      companyName:row.company_name ? String(row.company_name) : undefined,
      createdAt:String(row.created_at),updatedAt:String(row.updated_at),
      estimatedCostUsd:Number(row.estimated_cost_usd),actualCostUsd:Number(row.actual_cost_usd),
      sourceStatuses:statuses.get(String(row.id))!,
    }));
  }

  get(id: string): Analysis | undefined {
    const row = this.db.prepare("SELECT * FROM analyses WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const statuses = Object.fromEntries(SOURCES.map((source) => [source, {
      status: "pending", updatedAt: String(row.updated_at),
    }])) as Record<SourceName, SourceStatus>;
    for (const run of this.db.prepare("SELECT * FROM source_runs WHERE analysis_id = ?").all(id) as Record<string, unknown>[]) {
      statuses[String(run.source) as SourceName] = {
        status: String(run.status) as SourceStatusValue,
        error: run.error ? String(run.error) : undefined,
        updatedAt: String(run.updated_at),
      };
    }
    statuses.competitors = { status: "skipped", updatedAt: String(row.updated_at) };
    const evidence = this.evidence(id);
    const retiredIds = new Set(evidence.filter(item => item.source === "competitors").map(item => item.id));
    const costs = this.costs(id);
    return {
      id,
      status: String(row.status) as AnalysisStatus,
      input: parse<AnalysisInput>(row.input_json, { mapsUrl: "" }),
      companyName: row.company_name ? String(row.company_name) : parse<AnalysisInput>(row.input_json, { mapsUrl: "" }).companyName,
      estimatedCostUsd: Number(row.estimated_cost_usd),
      actualCostUsd: costs.reduce((sum, item) => sum + item.amountUsd, 0),
      costLimitUsd: Number(row.cost_limit_usd),
      sourceStatuses: statuses,
      evidence: evidence.filter(item => item.source !== "competitors"),
      findings: this.findings(id).filter(item => item.category !== "comparison" && !item.evidenceIds.some(key => retiredIds.has(key))),
      slides: this.slides(id).filter(item => !item.evidenceIds.some(key => retiredIds.has(key))),
      assets: this.assets(id), costs,
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
      finalizedAt: row.finalized_at ? String(row.finalized_at) : undefined,
    };
  }

  duplicate(id: string): Analysis | undefined {
    const original = this.get(id);
    return original ? this.create(original.input, original.estimatedCostUsd, original.costLimitUsd) : undefined;
  }

  delete(id: string): boolean {
    return Number(this.db.prepare("DELETE FROM analyses WHERE id=?").run(id).changes) > 0;
  }

  setStatus(id: string, status: AnalysisStatus): void {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE analyses SET status=?, updated_at=?, finalized_at=? WHERE id=?")
      .run(status, now, status === "finalized" ? now : null, id);
  }

  setCompanyName(id: string, companyName: string): void {
    this.db.prepare("UPDATE analyses SET company_name=?, updated_at=? WHERE id=?")
      .run(companyName, new Date().toISOString(), id);
  }

  setSource(id: string, source: SourceName, status: SourceStatusValue, error?: string, metadata?: unknown, externalRunId?: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE source_runs SET status=?, error=?, metadata_json=?, external_run_id=?, updated_at=?
      WHERE analysis_id=? AND source=?`).run(status, error ?? null, metadata ? json(metadata) : null, externalRunId ?? null, now, id, source);
    this.db.prepare("UPDATE analyses SET updated_at=? WHERE id=?").run(now, id);
  }

  clearSourceData(id: string, source: SourceName): void {
    this.db.prepare("DELETE FROM evidence WHERE analysis_id=? AND source=?").run(id, source);
    if (source === "ai") {
      this.db.prepare("DELETE FROM findings WHERE analysis_id=?").run(id);
      this.db.prepare("DELETE FROM slides WHERE analysis_id=?").run(id);
    }
  }

  replaceEvidence(id: string, source: SourceName, items: Omit<Evidence, "id" | "analysisId">[]): Evidence[] {
    const tx = () => this.transaction(() => {
      this.db.prepare("DELETE FROM evidence WHERE analysis_id=? AND source=?").run(id, source);
      const statement = this.db.prepare(`INSERT INTO evidence
        (id,analysis_id,source,title,value_json,source_url,observed_at,screenshot_path,confidence,category,assessment,impact,recommendation)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const item of items) statement.run(randomUUID(), id, source, item.title, json(item.channelPresence && item.value && typeof item.value === "object" && !Array.isArray(item.value) ? { ...item.value as Record<string, unknown>, presence: item.channelPresence } : item.value), item.sourceUrl ?? null,
        item.observedAt, item.screenshotPath ?? null, item.confidence, item.category ?? null, item.assessment ?? null,
        item.impact ?? null, item.recommendation ?? null);
    });
    tx();
    return this.evidence(id).filter((item) => item.source === source);
  }

  replaceFindings(id: string, items: Array<Omit<Finding, "id" | "analysisId"> & { id?: string }>): Finding[] {
    const validEvidence = new Set(this.evidence(id).map((item) => item.id));
    for (const item of items) {
      if (!item.evidenceIds.length || item.evidenceIds.some((evidenceId) => !validEvidence.has(evidenceId))) {
        throw new Error("Todo achado precisa apontar para evidências existentes.");
      }
    }
    const tx = () => this.transaction(() => {
      this.db.prepare("DELETE FROM findings WHERE analysis_id=?").run(id);
      const statement = this.db.prepare(`INSERT INTO findings
        (id,analysis_id,evidence_ids_json,category,priority,observation,possible_impact,ideal_state,recommended_direction,approved,position)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      items.forEach((item, position) => statement.run(item.id ?? randomUUID(), id, json(item.evidenceIds), item.category, item.priority,
        item.observation, item.possibleImpact, item.idealState, item.recommendedDirection, item.approved ? 1 : 0, item.position ?? position));
    });
    tx();
    this.saveVersion(id, "findings", items);
    return this.findings(id);
  }

  replaceSlides(id: string, items: Array<Omit<SlideSpec, "id" | "analysisId"> & { id?: string }>): SlideSpec[] {
    if (items.length < 4 || items.length > 10) throw new Error("A apresentação precisa manter entre 4 e 10 slides.");
    const totalDuration = items.reduce((sum, item) => sum + item.durationSeconds, 0);
    if (totalDuration < Math.min(240, items.length * 30) || totalDuration > 360) throw new Error("O roteiro precisa durar entre 4 e 6 minutos.");
    const validEvidence = new Set(this.evidence(id).map((item) => item.id));
    for (const item of items) if (item.evidenceIds.some((evidenceId) => !validEvidence.has(evidenceId))) throw new Error("O slide aponta para uma evidência inexistente.");
    const tx = () => this.transaction(() => {
      this.db.prepare("DELETE FROM slides WHERE analysis_id=?").run(id);
      const statement = this.db.prepare(`INSERT INTO slides
        (id,analysis_id,layout,title,body,evidence_ids_json,visual_asset_ids_json,speaker_notes,duration_seconds,approved,position)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      items.forEach((item, position) => statement.run(item.id ?? randomUUID(), id, item.layout, item.title, item.body,
        json(item.evidenceIds), json(item.visualAssetIds), item.speakerNotes, item.durationSeconds, item.approved ? 1 : 0, item.position ?? position));
    });
    tx();
    this.saveVersion(id, "slides", items);
    return this.slides(id);
  }

  saveFinalVersion(id: string): void {
    const analysis = this.get(id);
    if (analysis) this.saveVersion(id, "finalized", { findings: analysis.findings, slides: analysis.slides });
  }

  versions(id: string): Array<{ id: string; kind: string; createdAt: string }> {
    return (this.db.prepare("SELECT id,kind,created_at FROM analysis_versions WHERE analysis_id=? ORDER BY created_at DESC").all(id) as Record<string, unknown>[])
      .map((row) => ({ id: String(row.id), kind: String(row.kind), createdAt: String(row.created_at) }));
  }

  private saveVersion(id: string, kind: "created" | "findings" | "slides" | "finalized", payload: unknown): void {
    this.db.prepare("INSERT INTO analysis_versions(id,analysis_id,kind,payload_json,created_at) VALUES (?,?,?,?,?)")
      .run(randomUUID(), id, kind, json(payload), new Date().toISOString());
  }

  addCost(id: string, source: SourceName, amountUsd: number, units?: number, metadata?: Record<string, unknown>): CostEntry {
    if (!Number.isFinite(amountUsd) || amountUsd < 0) throw new Error("Custo inválido.");
    const item: CostEntry = { id: randomUUID(), analysisId: id, source, amountUsd, units, metadata, createdAt: new Date().toISOString() };
    this.db.prepare("INSERT INTO costs(id,analysis_id,source,amount_usd,units,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)")
      .run(item.id, id, source, amountUsd, units ?? null, metadata ? json(metadata) : null, item.createdAt);
    return item;
  }

  private evidence(id: string): Evidence[] { return (this.db.prepare("SELECT * FROM evidence WHERE analysis_id=? ORDER BY observed_at,id").all(id) as Record<string, unknown>[]).map((r) => ({ id:String(r.id),analysisId:id,source:String(r.source) as SourceName,title:String(r.title),value:parse(r.value_json,null),channelPresence:(parse(r.value_json,null) as { presence?: Evidence["channelPresence"] } | null)?.presence,sourceUrl:r.source_url?String(r.source_url):undefined,observedAt:String(r.observed_at),screenshotPath:r.screenshot_path?String(r.screenshot_path):undefined,confidence:Number(r.confidence),category:r.category?String(r.category):undefined,assessment:r.assessment?String(r.assessment):undefined,impact:r.impact?String(r.impact):undefined,recommendation:r.recommendation?String(r.recommendation):undefined })); }
  private findings(id: string): Finding[] { return (this.db.prepare("SELECT * FROM findings WHERE analysis_id=? ORDER BY position").all(id) as Record<string, unknown>[]).map((r) => ({ id:String(r.id),analysisId:id,evidenceIds:parse<string[]>(r.evidence_ids_json,[]),category:String(r.category),priority:String(r.priority) as Finding["priority"],observation:String(r.observation),possibleImpact:String(r.possible_impact),idealState:String(r.ideal_state ?? ""),recommendedDirection:String(r.recommended_direction),approved:Boolean(r.approved),position:Number(r.position) })); }
  private slides(id: string): SlideSpec[] { return (this.db.prepare("SELECT * FROM slides WHERE analysis_id=? ORDER BY position").all(id) as Record<string, unknown>[]).map((r) => ({ id:String(r.id),analysisId:id,layout:String(r.layout) as SlideSpec["layout"],title:String(r.title),body:String(r.body),evidenceIds:parse<string[]>(r.evidence_ids_json,[]),visualAssetIds:parse<string[]>(r.visual_asset_ids_json,[]),speakerNotes:String(r.speaker_notes),durationSeconds:Number(r.duration_seconds),approved:Boolean(r.approved),position:Number(r.position) })); }
  private costs(id: string): CostEntry[] { return (this.db.prepare("SELECT * FROM costs WHERE analysis_id=? ORDER BY created_at").all(id) as Record<string, unknown>[]).map((r) => ({ id:String(r.id),analysisId:id,source:String(r.source) as SourceName,amountUsd:Number(r.amount_usd),units:r.units==null?undefined:Number(r.units),metadata:parse<Record<string,unknown>|undefined>(r.metadata_json,undefined),createdAt:String(r.created_at) })); }
  private assets(id: string): Asset[] { return (this.db.prepare("SELECT * FROM assets WHERE analysis_id=? ORDER BY created_at").all(id) as Record<string, unknown>[]).map((r) => ({ id:String(r.id),analysisId:id,kind:String(r.kind) as Asset["kind"],path:String(r.path),mimeType:String(r.mime_type),originalName:r.original_name?String(r.original_name):undefined,createdAt:String(r.created_at) })); }
}
