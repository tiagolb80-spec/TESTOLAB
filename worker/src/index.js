const MODEL = "gemini-3.5-flash-lite";
const ALLOWED_ORIGINS = new Set([
  "https://tiagolb80-spec.github.io",
  "https://localhost",
  "http://localhost"
]);
const recent = new Map();

function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "vary": "Origin"
    }
  });
}

function allowedOrigin(request) {
  const origin = request.headers.get("Origin") || "";
  return ALLOWED_ORIGINS.has(origin) ? origin : "";
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100000000 ? n : null;
}

function normalizePayload(body) {
  const fields = ["total", "free", "shbg", "e2", "dht", "since"];
  const ranges = ["refTotal", "refFree", "refShbg", "refE2", "refDht"];
  const values = {};
  for (const key of fields) values[key] = numberOrNull(body?.values?.[key]);
  for (const key of ranges) {
    const r = body?.ranges?.[key];
    if (Array.isArray(r) && r.length === 2) {
      const low = numberOrNull(r[0]), high = numberOrNull(r[1]);
      values[key] = low !== null && high !== null && low <= high ? [low, high] : null;
    } else values[key] = null;
  }
  const units = {};
  for (const key of ["free", "e2", "dht"]) {
    const allowed = { free: ["pg/mL", "ng/dL", "pmol/L", "ng/L"], e2: ["pg/mL", "pmol/L"], dht: ["pg/mL", "ng/dL", "nmol/L"] }[key];
    const raw = String(body?.units?.[key] || "").trim();
    units[key] = allowed.includes(raw) ? raw : "unidade não informada";
  }
  return { values, units };
}

async function pubmedEvidence() {
  const term = '("testosterone" AND "monitoring" AND (estradiol OR SHBG OR pharmacokinetics))';
  const searchUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=5&sort=date&term=" + encodeURIComponent(term);
  const search = await fetch(searchUrl, { headers: { "User-Agent": "TestoLab/1.0 contact: repository owner" } });
  if (!search.ok) throw new Error("PubMed indisponível no momento.");
  const result = await search.json();
  const ids = result?.esearchresult?.idlist || [];
  if (!ids.length) return [];
  const summaryUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=" + ids.join(",");
  const summaryResponse = await fetch(summaryUrl, { headers: { "User-Agent": "TestoLab/1.0" } });
  if (!summaryResponse.ok) throw new Error("Não foi possível obter referências do PubMed.");
  const summary = await summaryResponse.json();
  const abstractUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&retmode=xml&id=" + ids.join(",");
  const abstractResponse = await fetch(abstractUrl, { headers: { "User-Agent": "TestoLab/1.0" } });
  const xml = abstractResponse.ok ? await abstractResponse.text() : "";
  const decode = value => value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
  const articles = [...xml.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g)].map(m => m[1]);
  return ids.map((id, index) => {
    const item = summary?.result?.[id] || {};
    const article = articles[index] || "";
    const abstractParts = [...article.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)].map(m => decode(m[1]));
    return {
      title: String(item.title || "Artigo no PubMed").slice(0, 350),
      journal: String(item.fulljournalname || item.source || "").slice(0, 150),
      year: String(item.pubdate || "").slice(0, 4),
      abstract: abstractParts.join(" ").slice(0, 1800),
      url: "https://pubmed.ncbi.nlm.nih.gov/" + encodeURIComponent(id) + "/",
      pmid: id
    };
  });
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request);
    if (request.method === "OPTIONS") {
      if (!origin) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "POST, GET, OPTIONS",
        "access-control-allow-headers": "Content-Type",
        "access-control-max-age": "86400",
        "vary": "Origin"
      }});
    }
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      if (!origin) return json({ error: "Origem não autorizada." }, 403);
      return json({ ok: true, service: "TestoLab AI", model: MODEL }, 200, origin);
    }
    if (url.pathname !== "/interpret" || request.method !== "POST" || !origin) {
      return json({ error: "Requisição não autorizada." }, 403, origin);
    }
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const now = Date.now();
    const prior = recent.get(ip) || [];
    const recentCalls = prior.filter(t => now - t < 60_000);
    if (recentCalls.length >= 5) return json({ error: "Limite temporário atingido. Aguarde um minuto." }, 429, origin);
    recentCalls.push(now);
    recent.set(ip, recentCalls);
    try {
      const raw = await request.json();
      const payload = normalizePayload(raw);
      if (payload.values.total === null && payload.values.free === null &&
          payload.values.shbg === null && payload.values.e2 === null && payload.values.dht === null) {
        return json({ error: "Informe ao menos um resultado numérico." }, 400, origin);
      }
      if (!env.GEMINI_API_KEY) return json({ error: "O servidor ainda não recebeu a chave do Gemini." }, 503, origin);
      const evidence = await pubmedEvidence();
      const prompt = `Você é um assistente educativo de interpretação laboratorial. Responda em português brasileiro, com cautela clínica. Não diagnostique, não prescreva, não recomende iniciar, interromper ou alterar hormônios/medicamentos. Não estime dose nem concentração sanguínea a partir de dose aplicada. Não invente artigos ou dados.
Os únicos dados do paciente são os valores abaixo. Valores null significam não informados. As faixas são as informadas pelo usuário e podem estar ausentes. Compare somente quando unidade e faixa forem compatíveis; destaque quando a unidade não foi informada ou não permite comparação. Não trate valores de referência como limites diagnósticos universais. Considere que horário da coleta e tempo desde aplicação podem influenciar resultados, mas não conclua sem dados.
DADOS NUMÉRICOS ANÔNIMOS (sem nome, data, laboratório ou observações):
${JSON.stringify(payload)}
REFERÊNCIAS RECUPERADAS DO PUBMED (use apenas as que forem pertinentes; se título não permitir confirmar conclusão, diga isso):
${JSON.stringify(evidence)}
Estruture: 1) resumo objetivo; 2) análise por marcador; 3) limitações/unidades e contexto; 4) perguntas úteis para discutir com médico; 5) fontes com título, ano e link. Deixe claro que isto não substitui avaliação médica e que a busca bibliográfica é limitada aos resultados apresentados.`;
      const model = env.GEMINI_MODEL || MODEL;
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(env.GEMINI_API_KEY), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1800 }
        })
      });
      const result = await response.json();
      if (!response.ok) {
        const message = result?.error?.message || "Falha na API Gemini.";
        return json({ error: "Gemini: " + String(message).slice(0, 300) }, response.status === 429 ? 429 : 502, origin);
      }
      const text = (result?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("\n").trim();
      if (!text) return json({ error: "A IA não retornou uma interpretação. Tente novamente." }, 502, origin);
      return json({ interpretation: text, sources: evidence, model, privacy: "Somente valores numéricos, unidades e faixas de referência foram enviados. Nenhum identificador ou observação livre foi incluído." }, 200, origin);
    } catch (error) {
      return json({ error: String(error?.message || "Erro inesperado.").slice(0, 300) }, 502, origin);
    }
  }
};
