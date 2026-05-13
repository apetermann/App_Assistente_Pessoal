import { useState, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const CAL_MCP = "https://calendarmcp.googleapis.com/mcp/v1";
const GMAIL_MCP = "https://gmailmcp.googleapis.com/mcp/v1";
const READ_AI_BASE = "https://api.read.ai/api/v1";

const SYSTEM_PROMPT = `Você é o assistente de inteligência estratégica pessoal de Alex.

Perfil de Alex: empreendedor serial, desenvolvedor de negócios, executor e estrategista. Navega múltiplos setores e contextos — desde negociações comerciais e parcerias estratégicas até reuniões operacionais e apresentações a investidores. Tem visão de longo prazo, foco em resultado e sensibilidade para relacionamentos e dinâmicas de poder.

Sua missão: transformar dados brutos da agenda e histórico de reuniões em inteligência executiva afiada. Alex deve entrar em toda reunião preparado, estratégico e no controle.

Para cada Briefing de Reunião, retorne APENAS este JSON válido (sem markdown, sem texto extra):
{
  "contextRecap": "Onde está este relacionamento/negócio/projeto. Histórico relevante em 2-3 frases diretas.",
  "openLoops": ["pendência ou compromisso específico em aberto 1", "pendência 2"],
  "strategicObjective": "O que Alex deve conquistar, avançar ou fechar especificamente nesta reunião.",
  "talkingPoints": [
    {"point": "Tópico principal", "angle": "Como enquadrar estrategicamente — o ângulo certo para Alex"}
  ],
  "questionsToAsk": ["Pergunta estratégica e direta que avança a agenda de Alex 1", "Pergunta 2"],
  "watchOutFor": ["Risco, dinâmica ou sinal de alerta a observar"],
  "nextStepRecommendation": "Próximo passo concreto e específico para propor ou fechar ao final da reunião.",
  "strategicInsight": "Um insight não-óbvio e perspicaz sobre esta reunião, relação ou contexto — com olhar de empreendedor, estrategista e desenvolvedor de negócios experiente."
}

Seja direto, perspicaz e estratégico. Pense como um advisor sênior que já viu centenas de negócios e sabe ler pessoas, contextos e oportunidades. Zero fluff. Cada palavra tem que ganhar seu lugar.`;

// ─────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────
const fmtTime = (s) => {
  try { return new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
};
const fmtDay = (s) => {
  try { return new Date(s).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }); }
  catch { return ""; }
};
const fmtDuration = (start, end) => {
  try { return Math.round((new Date(end) - new Date(start)) / 60000) + "min"; }
  catch { return ""; }
};
const today = () => {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
};
function getRange(tab) {
  const t = today();
  if (tab === "today") { const e = new Date(t); e.setDate(e.getDate() + 1); return { start: t, end: e }; }
  if (tab === "tomorrow") { const s = new Date(t); s.setDate(s.getDate() + 1); const e = new Date(s); e.setDate(e.getDate() + 1); return { start: s, end: e }; }
  const e = new Date(t); const dow = e.getDay(); e.setDate(e.getDate() + (dow === 0 ? 6 : 6 - dow) + 1);
  return { start: t, end: e };
}
function mockMeetings(tab) {
  const base = new Date();
  if (tab === "tomorrow") base.setDate(base.getDate() + 1);
  if (tab === "week") base.setDate(base.getDate() + 0);
  const at = (h, m = 0) => { const d = new Date(base); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const extra = tab === "week" ? [
    { id: "4", title: "Revisão de Parceria — Escritório Jurídico", start: at(10), end: at(11, 30), attendees: [{ name: "Dra. Fernanda Lima", email: "f.lima@escritorio.com.br" }], description: "Revisão dos termos do acordo de parceria estratégica. Próximos passos e assinatura.", location: "Zoom" },
    { id: "5", title: "Apresentação a Investidores — Rodada Seed", start: at(14, 30), end: at(16), attendees: [{ name: "Ricardo Barros", email: "r.barros@venture.com.br" }, { name: "Mariana Teixeira", email: "m.teixeira@venture.com.br" }], description: "Apresentação do modelo de negócio, tração e estrutura da rodada. Alinhamento de valuation e condições.", location: "Escritório" },
  ] : [];
  return [
    { id: "1", title: "Alinhamento Estratégico — Parceiro A", start: at(9), end: at(10), attendees: [{ name: "Carlos Mendes", email: "c.mendes@parceiroa.com" }, { name: "Ana Souza", email: "a.souza@parceiroa.com" }], description: "Revisão do roadmap conjunto, status das iniciativas em andamento e definição de próximos passos estratégicos.", location: "Google Meet" },
    { id: "2", title: "Follow-up Proposta Comercial — Cliente B", start: at(11, 30), end: at(12, 15), attendees: [{ name: "Marco Ferreira", email: "m.ferreira@clienteb.com" }], description: "Retorno sobre proposta enviada. Negociação de escopo, condições e cronograma de contratação.", location: "MS Teams" },
    { id: "3", title: "Kick-off de Projeto — Equipe Interna", start: at(14), end: at(15), attendees: [{ name: "Equipe", email: "team@empresa.com.br" }, { name: "Rafael Costa", email: "r.costa@empresa.com.br" }], description: "Kick-off do novo projeto. Definição de roadmap, alocação de recursos e metas para o trimestre.", location: "Escritório" },
    ...extra
  ];
}

// ─────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────
export default function App() {
  const [readAiKey, setReadAiKey] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [tab, setTab] = useState("today");
  const [meetings, setMeetings] = useState([]);
  const [selected, setSelected] = useState(null);
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState({ cal: false, readai: false, gmail: false, brief: false });
  const [notice, setNotice] = useState({ cal: null, readai: null, gmail: null, brief: null });
  const [demoMode, setDemoMode] = useState(false);
  const [pastCount, setPastCount] = useState(0);
  const [gmailCount, setGmailCount] = useState(0);
  const [loadStep, setLoadStep] = useState("");

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  useEffect(() => { fetchCal(tab); }, [tab]);

  async function callClaude(system, messages, mcpServers = []) {
    const body = { model: MODEL, max_tokens: 1000, system, messages };
    if (mcpServers.length) body.mcp_servers = mcpServers;
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.content?.filter((b) => b.type === "text").map((b) => b.text).join("") || "";
  }

  async function fetchCal(t) {
    setLoading((l) => ({ ...l, cal: true }));
    setNotice((n) => ({ ...n, cal: null }));
    const { start, end } = getRange(t);
    try {
      const text = await callClaude(
        "Assistente de agenda. Use o Google Calendar para buscar eventos e retorne APENAS um JSON array, sem markdown, sem texto extra. Cada evento: { id, title, start (ISO8601), end (ISO8601), attendees ([{name, email}]), description, location }. Se não houver eventos, retorne [].",
        [{ role: "user", content: `Liste todos os eventos de ${start.toISOString()} até ${end.toISOString()}.` }],
        [{ type: "url", url: CAL_MCP, name: "google-calendar" }]
      );
      const m = text.match(/\[[\s\S]*?\]/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        setMeetings(parsed);
        setDemoMode(false);
      } else {
        setMeetings(mockMeetings(t));
        setDemoMode(true);
      }
    } catch {
      setMeetings(mockMeetings(t));
      setDemoMode(true);
      setNotice((n) => ({ ...n, cal: "Modo demo ativo — dados de exemplo para demonstração" }));
    }
    setLoading((l) => ({ ...l, cal: false }));
  }

  async function fetchReadAiMeetings(meeting) {
    if (!readAiKey) return [];
    setLoading((l) => ({ ...l, readai: true }));
    setNotice((n) => ({ ...n, readai: null }));
    try {
      // Try /reports first, then /meetings as fallback
      let res = await fetch(`${READ_AI_BASE}/reports?limit=30`, {
        headers: { Authorization: `Bearer ${readAiKey}`, "Content-Type": "application/json" },
      });
      if (!res.ok) res = await fetch(`${READ_AI_BASE}/meetings?limit=30&order_by=created_at&order=desc`, {
        headers: { Authorization: `Bearer ${readAiKey}`, "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`Read AI ${res.status}`);
      const data = await res.json();
      const all = data.results || data.reports || data.meetings || [];
      const emails = (meeting.attendees || []).map((a) => a.email?.toLowerCase()).filter(Boolean);
      const words = (meeting.title || "").toLowerCase().split(/\s+/).filter((w) => w.length > 4);
      const relevant = all.filter((m) => {
        const mAttendees = (m.attendees || m.speakers || []).map((a) => (a.email || a.name || "").toLowerCase());
        const titleMatch = words.some((w) => (m.title || m.name || "").toLowerCase().includes(w));
        const attendeeMatch = emails.some((e) => mAttendees.some(a => a.includes(e.split("@")[0])));
        return titleMatch || attendeeMatch;
      }).slice(0, 5);
      const details = await Promise.all(
        relevant.map(async (m) => {
          const rid = m.report_id || m.meeting_id || m.id;
          try {
            const r = await fetch(`${READ_AI_BASE}/reports/${rid}`, { headers: { Authorization: `Bearer ${readAiKey}` } });
            if (r.ok) return await r.json();
            const r2 = await fetch(`${READ_AI_BASE}/meetings/${rid}`, { headers: { Authorization: `Bearer ${readAiKey}` } });
            return r2.ok ? await r2.json() : m;
          } catch { return m; }
        })
      );
      setPastCount(details.length);
      return details;
    } catch (err) {
      const isCors = err.message.includes("Failed to fetch") || err.message.includes("NetworkError");
      setNotice((n) => ({ ...n, readai: isCors
        ? "Read AI: requisição bloqueada por CORS. Verifique se a key está correta ou use um proxy."
        : `Read AI: ${err.message}` }));
      return [];
    } finally {
      setLoading((l) => ({ ...l, readai: false }));
    }
  }

  async function fetchGmailContext(meeting) {
    setLoading((l) => ({ ...l, gmail: true }));
    setNotice((n) => ({ ...n, gmail: null }));
    const emails = (meeting.attendees || []).map((a) => a.email).filter(Boolean);
    const names  = (meeting.attendees || []).map((a) => a.name).filter(Boolean);
    try {
      const text = await callClaude(
        `Você é um assistente de Gmail. Busque e-mails relevantes para contexto de reunião e retorne APENAS um JSON array (sem markdown), com no máximo 8 itens:
[{ "subject": string, "from": string, "date": string, "snippet": string, "keyPoints": [string] }]
Foque em: propostas, negociações, follow-ups, pendências, decisões. Se não encontrar nada relevante, retorne [].`,
        [{ role: "user", content:
          `Busque no Gmail e-mails trocados nos últimos 90 dias com estes contatos:\nE-mails: ${emails.join(", ") || "N/A"}\nNomes: ${names.join(", ") || "N/A"}\nTítulo da reunião: ${meeting.title}\n\nBusque por: remetente/destinatário dos contatos acima E/OU assuntos relacionados ao título da reunião. Retorne os mais relevantes como JSON array.`
        }],
        [{ type: "url", url: GMAIL_MCP, name: "gmail" }]
      );
      const m = text.match(/\[[\s\S]*?\]/);
      const threads = m ? JSON.parse(m[0]) : [];
      setGmailCount(threads.length);
      return threads;
    } catch (err) {
      setNotice((n) => ({ ...n, gmail: `Gmail: ${err.message}` }));
      return [];
    } finally {
      setLoading((l) => ({ ...l, gmail: false }));
    }
  }

  async function generateBrief(meeting, pastReadAi, gmailThreads) {
    setLoading((l) => ({ ...l, brief: true }));
    setBrief(null);
    setNotice((n) => ({ ...n, brief: null }));
    try {
      const readAiSection = pastReadAi.length > 0
        ? `📋 HISTÓRICO DE REUNIÕES — Read AI (${pastReadAi.length} encontrada/s):
${JSON.stringify(pastReadAi.map((p) => ({
  titulo: p.title || p.name || p.meeting?.title,
  data: p.created_at || p.date || p.start_time,
  resumo: p.summary || p.overview || p.meeting?.summary,
  itens_de_acao: p.action_items || p.meeting?.action_items,
  perguntas_chave: p.key_questions,
  insights: p.insights || p.highlights,
  participantes: (p.attendees || p.speakers || []).map((a) => a.name || a.email),
})), null, 2)}`
        : "📋 Read AI: sem reuniões anteriores encontradas.";

      const gmailSection = gmailThreads.length > 0
        ? `📧 E-MAILS RELEVANTES — Gmail (${gmailThreads.length} encontrado/s):
${JSON.stringify(gmailThreads, null, 2)}`
        : "📧 Gmail: sem e-mails relevantes encontrados.";

      const content = `Gere o Briefing Estratégico para Alex para esta reunião:

🗓 PRÓXIMA REUNIÃO:
- Título: ${meeting.title}
- Data/Hora: ${fmtDay(meeting.start)} às ${fmtTime(meeting.start)} (duração: ${fmtDuration(meeting.start, meeting.end)})
- Participantes: ${meeting.attendees?.map((a) => `${a.name || ""} <${a.email}>`).join(", ") || "N/A"}
- Local/Plataforma: ${meeting.location || "N/A"}
- Pauta/Descrição: ${meeting.description || "Sem descrição — inferir pelo contexto"}

${readAiSection}

${gmailSection}

Use TODO o contexto acima (reuniões passadas + e-mails) para gerar um briefing rico, concreto e estratégico. Mencione fatos reais quando disponíveis.`;

      const text = await callClaude(SYSTEM_PROMPT, [{ role: "user", content }]);
      const m = text.match(/\{[\s\S]*\}/);
      if (m) setBrief(JSON.parse(m[0]));
      else throw new Error("JSON inválido na resposta");
    } catch (e) {
      setNotice((n) => ({ ...n, brief: `Erro ao gerar briefing: ${e.message}` }));
    }
    setLoading((l) => ({ ...l, brief: false }));
  }

  async function pickMeeting(m) {
    setSelected(m);
    setBrief(null);
    setPastCount(0);
    setGmailCount(0);
    setLoadStep("collecting");
    // Read AI + Gmail em paralelo
    const [past, gmailThreads] = await Promise.all([
      fetchReadAiMeetings(m),
      fetchGmailContext(m),
    ]);
    setLoadStep("brief");
    await generateBrief(m, past, gmailThreads);
    setLoadStep("");
  }

  const nowStr = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #F0EDE6; overflow: hidden; }
        @keyframes pulse { 0%,100%{opacity:.35} 50%{opacity:1} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer { 0%{background-position:-400% 0} 100%{background-position:400% 0} }
        @keyframes spin { to{transform:rotate(360deg)} }
        .mc { cursor:pointer; transition: background .18s, border-color .18s, box-shadow .18s; }
        .mc:hover { background: #EEF2F8 !important; border-color: rgba(28,53,87,.25) !important; box-shadow: 0 2px 8px rgba(28,53,87,.07) !important; }
        .mc.sel { background: #E8EFF8 !important; border-color: rgba(28,53,87,.4) !important; box-shadow: 0 2px 12px rgba(28,53,87,.1) !important; }
        .tb { cursor:pointer; transition: color .15s, border-color .15s; }
        .tb:hover { color: #1C3557 !important; }
        .tb.act { color: #1C3557 !important; border-bottom-color: #1C3557 !important; }
        .skel { background: linear-gradient(90deg,rgba(0,0,0,.05) 25%,rgba(0,0,0,.09) 50%,rgba(0,0,0,.05) 75%); background-size:400% 100%; animation: shimmer 1.8s infinite; border-radius:4px; }
        .fade { animation: fadeUp .35s ease forwards; opacity:0; }
        .fade:nth-child(1){animation-delay:.04s}.fade:nth-child(2){animation-delay:.09s}.fade:nth-child(3){animation-delay:.14s}.fade:nth-child(4){animation-delay:.19s}.fade:nth-child(5){animation-delay:.24s}.fade:nth-child(6){animation-delay:.29s}.fade:nth-child(7){animation-delay:.34s}.fade:nth-child(8){animation-delay:.39s}
        ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(28,53,87,.18);border-radius:2px}
        input:focus{outline:none;border-color:rgba(28,53,87,.4)!important}
        button:active{opacity:.8}
      `}</style>

      <div style={{ display:"flex", flexDirection:"column", height:"100vh", fontFamily:"'Instrument Sans',sans-serif", color:"#1A1F2E", background:"#F0EDE6", overflow:"hidden" }}>

        {/* ── HEADER ── */}
        <div style={{ flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 24px", borderBottom:"1px solid rgba(28,53,87,.1)", background:"#FFFFFF", boxShadow:"0 1px 4px rgba(0,0,0,.06)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:30, height:30, borderRadius:7, background:"linear-gradient(135deg,#1C3557,#2C5282)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, color:"#FFFFFF", fontWeight:700 }}>◈</div>
            <div>
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:17, fontWeight:600, letterSpacing:2, color:"#1C3557", textTransform:"uppercase", lineHeight:1.1 }}>Meeting Intel</div>
              <div style={{ fontSize:10.5, color:"rgba(26,31,46,.4)", marginTop:2, letterSpacing:.5 }}>{nowStr}</div>
            </div>
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:2 }}>
            {[["today","Hoje"],["tomorrow","Amanhã"],["week","Esta Semana"]].map(([t,l])=>(
              <button key={t} className={`tb${tab===t?" act":""}`} onClick={()=>setTab(t)} style={{ background:"none", border:"none", borderBottom:"1px solid transparent", padding:"6px 14px", fontSize:11, fontWeight:500, letterSpacing:1.2, textTransform:"uppercase", color:tab===t?"#1C3557":"rgba(26,31,46,.4)", fontFamily:"'Instrument Sans',sans-serif", cursor:"pointer" }}>
                {l}
              </button>
            ))}
            {demoMode && <span style={{ marginLeft:12, fontSize:10, padding:"3px 8px", border:"1px solid rgba(28,53,87,.2)", borderRadius:4, color:"rgba(28,53,87,.5)", letterSpacing:1 }}>DEMO</span>}
            <button onClick={()=>{setKeyDraft(readAiKey);setShowSetup(true)}} style={{ marginLeft:16, display:"flex", alignItems:"center", gap:6, padding:"7px 14px", background:"rgba(28,53,87,.05)", border:"1px solid rgba(28,53,87,.15)", borderRadius:7, color:"rgba(26,31,46,.55)", fontSize:12, cursor:"pointer", fontFamily:"'Instrument Sans',sans-serif" }}>
              <span style={{ fontSize:13 }}>⚙</span> Configurar
            </button>
          </div>
        </div>

        {/* ── BODY ── */}
        <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

          {/* LEFT — AGENDA */}
          <div style={{ width:300, flexShrink:0, borderRight:"1px solid rgba(28,53,87,.08)", overflowY:"auto", display:"flex", flexDirection:"column", background:"#FAFAF7" }}>
            <div style={{ padding:"16px 16px 10px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontSize:10, fontWeight:600, letterSpacing:2, textTransform:"uppercase", color:"rgba(28,53,87,.5)" }}>
                {loading.cal ? "Carregando..." : `${meetings.length} reunião${meetings.length!==1?"ões":""}`}
              </div>
              <button onClick={()=>fetchCal(tab)} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(28,53,87,.4)", fontSize:14, lineHeight:1, padding:4 }} title="Atualizar agenda">↻</button>
            </div>

            {notice.cal && <Notice msg={notice.cal} color="rgba(255,200,0,.7)" bg="rgba(255,200,0,.05)" border="rgba(255,200,0,.15)" />}

            {loading.cal
              ? <div style={{ padding:"0 12px 12px" }}>{[1,2,3].map(i=><div key={i} className="skel" style={{ height:86, marginBottom:8 }} />)}</div>
              : meetings.length===0
                ? <EmptyAgenda />
                : meetings.map(m=><MeetingCard key={m.id} meeting={m} isSelected={selected?.id===m.id} onClick={()=>pickMeeting(m)} />)
            }
          </div>

          {/* RIGHT — BRIEF */}
          <div style={{ flex:1, overflowY:"auto", padding:"28px 36px", background:"#F0EDE6" }}>
            {!selected
              ? <Splash />
              : (loading.readai || loading.gmail || loading.brief)
                ? <LoadingBrief meeting={selected} loading={loading} />
                : brief
                  ? <PrepBrief meeting={selected} brief={brief} pastCount={pastCount} gmailCount={gmailCount} readAiKey={readAiKey} readaiNotice={notice.readai} gmailNotice={notice.gmail} onRefresh={()=>pickMeeting(selected)} />
                  : <BriefError msg={notice.brief} onRetry={()=>pickMeeting(selected)} />
            }
          </div>
        </div>
      </div>

      {/* ── SETUP MODAL ── */}
      {showSetup && (
        <SetupModal
          keyDraft={keyDraft} setKeyDraft={setKeyDraft}
          currentKey={readAiKey}
          onSave={()=>{setReadAiKey(keyDraft);setShowSetup(false);}}
          onClose={()=>setShowSetup(false)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────

function Notice({ msg, color="rgba(255,200,0,.7)", bg="rgba(255,200,0,.05)", border="rgba(255,200,0,.15)" }) {
  return (
    <div style={{ margin:"0 12px 10px", padding:"8px 12px", background:bg, border:`1px solid ${border}`, borderRadius:6, fontSize:11, color, lineHeight:1.5 }}>
      {msg}
    </div>
  );
}

function MeetingCard({ meeting, isSelected, onClick }) {
  const dur = fmtDuration(meeting.start, meeting.end);
  const ppl = meeting.attendees || [];
  return (
    <div className={`mc${isSelected?" sel":""}`} onClick={onClick} style={{ margin:"0 10px 7px", padding:"13px 15px", borderRadius:8, border:`1px solid ${isSelected?"rgba(28,53,87,.35)":"rgba(28,53,87,.09)"}`, background:isSelected?"#E8EFF8":"#FFFFFF", boxShadow:isSelected?"0 2px 12px rgba(28,53,87,.1)":"0 1px 3px rgba(0,0,0,.04)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:7 }}>
        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:22, fontWeight:400, letterSpacing:-1, color:isSelected?"#1C3557":"rgba(28,53,87,.55)", lineHeight:1 }}>
          {fmtTime(meeting.start)}
        </span>
        <span style={{ fontSize:10, color:"rgba(26,31,46,.3)", marginTop:4, letterSpacing:.5 }}>{dur}</span>
      </div>
      <div style={{ fontSize:12.5, fontWeight:500, lineHeight:1.4, color:"#1A1F2E", marginBottom:6 }}>{meeting.title}</div>
      {ppl.length>0 && (
        <div style={{ fontSize:11, color:"rgba(26,31,46,.42)", display:"flex", alignItems:"center", gap:5 }}>
          <span style={{ fontSize:9 }}>●</span>
          {ppl.slice(0,2).map(a=>a.name||a.email?.split("@")[0]).join(", ")}{ppl.length>2?` +${ppl.length-2}`:""}
        </div>
      )}
      {meeting.location && <div style={{ fontSize:10, color:"rgba(26,31,46,.28)", marginTop:5 }}>⌖ {meeting.location}</div>}
    </div>
  );
}

function EmptyAgenda() {
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:32, textAlign:"center", opacity:.4 }}>
      <div style={{ fontSize:36, color:"rgba(28,53,87,.2)", marginBottom:10 }}>○</div>
      <div style={{ fontSize:13, color:"rgba(26,31,46,.4)" }}>Sem reuniões</div>
      <div style={{ fontSize:11, color:"rgba(26,31,46,.28)", marginTop:5 }}>neste período</div>
    </div>
  );
}

function Splash() {
  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", opacity:.35 }}>
      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:72, color:"rgba(28,53,87,.12)", lineHeight:1, marginBottom:18 }}>◈</div>
      <div style={{ fontSize:17, letterSpacing:1.5, color:"rgba(26,31,46,.35)", marginBottom:8 }}>Selecione uma reunião</div>
      <div style={{ fontSize:12, color:"rgba(26,31,46,.25)" }}>para gerar seu briefing estratégico com IA</div>
    </div>
  );
}

function LoadingBrief({ meeting, loading }) {
  const steps = [
    { key: "readai", icon: "◈", label: "Read AI — buscando reuniões anteriores", done: !loading.readai },
    { key: "gmail",  icon: "✉",  label: "Gmail — buscando e-mails relevantes",   done: !loading.gmail  },
    { key: "brief",  icon: "◉", label: "IA — gerando briefing estratégico",       done: !loading.brief  },
  ];
  const anyCollecting = loading.readai || loading.gmail;
  const onlyBrief = !anyCollecting && loading.brief;
  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:10, letterSpacing:2, textTransform:"uppercase", color:"rgba(28,53,87,.45)", marginBottom:8 }}>preparando briefing</div>
        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:26, color:"#1A1F2E", lineHeight:1.25 }}>{meeting.title}</div>
        <div style={{ fontSize:12, color:"rgba(26,31,46,.4)", marginTop:6 }}>{fmtDay(meeting.start)} · {fmtTime(meeting.start)}</div>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:28 }}>
        {steps.map((s) => {
          const active = loading[s.key];
          const done   = !active && (s.key !== "brief" ? true : !loading.readai && !loading.gmail);
          return (
            <div key={s.key} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 16px", borderRadius:8, border:`1px solid ${active?"rgba(28,53,87,.2)":"rgba(0,0,0,.06)"}`, background:active?"rgba(28,53,87,.04)":"rgba(255,255,255,.6)", transition:"all .3s" }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background: active?"#1C3557":"rgba(26,31,46,.18)", flexShrink:0, animation: active?"pulse 1.2s ease-in-out infinite":"none" }} />
              <div style={{ fontSize:12.5, color: active?"#1A1F2E":"rgba(26,31,46,.4)", flex:1 }}>{s.label}</div>
              {active && <div style={{ fontSize:11, color:"rgba(28,53,87,.5)" }}>buscando…</div>}
              {!active && loading.brief && s.key!=="brief" && <div style={{ fontSize:13, color:"rgba(21,128,61,.7)" }}>✓</div>}
            </div>
          );
        })}
      </div>
      {[75,55,85,60,70,50].map((w,i)=><div key={i} className="skel" style={{ height:14, width:`${w}%`, marginBottom:10, opacity:1-i*.12 }} />)}
    </div>
  );
}

function BriefError({ msg, onRetry }) {
  return (
    <div style={{ textAlign:"center", padding:60, color:"rgba(26,31,46,.4)" }}>
      <div style={{ fontSize:32, marginBottom:12 }}>⚠</div>
      <div style={{ fontSize:14, marginBottom:20 }}>{msg || "Erro ao gerar briefing"}</div>
      <button onClick={onRetry} style={{ padding:"9px 24px", background:"rgba(28,53,87,.07)", border:"1px solid rgba(28,53,87,.2)", borderRadius:7, color:"#1C3557", cursor:"pointer", fontSize:13 }}>
        Tentar novamente
      </button>
    </div>
  );
}

function PrepBrief({ meeting, brief, pastCount, gmailCount, readAiKey, readaiNotice, gmailNotice, onRefresh }) {
  const ppl = (meeting.attendees || []).map(a => a.name || a.email?.split("@")[0]).join(", ");
  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom:26 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
          <div style={{ fontSize:10, letterSpacing:2, textTransform:"uppercase", color:"rgba(28,53,87,.5)", fontWeight:600 }}>Briefing Estratégico</div>
          <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
            <span style={{ fontSize:10, padding:"3px 9px", borderRadius:4, letterSpacing:.5,
              border: gmailCount>0 ? "1px solid rgba(21,100,21,.25)" : "1px solid rgba(0,0,0,.1)",
              color: gmailCount>0 ? "rgba(21,100,21,.75)" : "rgba(26,31,46,.3)",
              background: gmailCount>0 ? "rgba(21,128,61,.05)" : "transparent" }}>
              ✉ Gmail {gmailCount>0 ? `· ${gmailCount} e-mail${gmailCount>1?"s":""}` : "· sem e-mails"}
            </span>
            {readAiKey && <span style={{ fontSize:10, padding:"3px 9px", borderRadius:4, letterSpacing:.5,
              border: pastCount>0 ? "1px solid rgba(28,53,87,.2)" : "1px solid rgba(0,0,0,.1)",
              color: pastCount>0 ? "rgba(28,53,87,.75)" : "rgba(26,31,46,.3)",
              background: pastCount>0 ? "rgba(28,53,87,.05)" : "transparent" }}>
              ◈ Read AI {pastCount>0 ? `· ${pastCount} reunião${pastCount>1?"ões":""}` : "· sem histórico"}
            </span>}
            <button onClick={onRefresh} style={{ background:"none", border:"1px solid rgba(28,53,87,.15)", borderRadius:6, padding:"4px 10px", color:"rgba(28,53,87,.5)", fontSize:11, cursor:"pointer" }}>↻</button>
          </div>
        </div>
        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:27, color:"#1A1F2E", lineHeight:1.2, marginBottom:8 }}>{meeting.title}</div>
        <div style={{ display:"flex", gap:18, fontSize:11.5, color:"rgba(26,31,46,.42)" }}>
          <span>⏱ {fmtDay(meeting.start)} · {fmtTime(meeting.start)}</span>
          {ppl && <span>◎ {ppl}</span>}
          {meeting.location && <span>⌖ {meeting.location}</span>}
        </div>
      </div>

      {readaiNotice && <Notice msg={`◈ ${readaiNotice}`} color="rgba(140,80,0,.75)" bg="rgba(255,200,0,.06)" border="rgba(200,150,0,.2)" />}
      {gmailNotice  && <Notice msg={`✉ ${gmailNotice}`}  color="rgba(180,60,60,.75)"  bg="rgba(255,80,0,.04)"   border="rgba(200,80,0,.15)"  />}

      {/* Strategic Insight — featured card */}
      {brief.strategicInsight && (
        <div className="fade" style={{ padding:"18px 22px", marginBottom:20, background:"linear-gradient(135deg,#EEF4FF,#F5F0FF)", border:"1px solid rgba(28,53,87,.15)", borderRadius:10 }}>
          <div style={{ fontSize:10, letterSpacing:2, color:"#1C3557", textTransform:"uppercase", fontWeight:600, marginBottom:10 }}>💡 Insight Estratégico</div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:17, lineHeight:1.65, color:"#1A1F2E", fontStyle:"italic" }}>
            "{brief.strategicInsight}"
          </div>
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {/* Context */}
        {brief.contextRecap && (
          <Section icon="◎" label="Contexto" accent="#6B9BD2" className="fade">
            <p style={{ fontSize:13.5, lineHeight:1.75, color:"rgba(26,31,46,.75)" }}>{brief.contextRecap}</p>
          </Section>
        )}

        {/* Objective */}
        {brief.strategicObjective && (
          <Section icon="◉" label="Objetivo desta Reunião" accent="#1C3557" className="fade">
            <p style={{ fontSize:13.5, lineHeight:1.7, color:"#1A1F2E", fontWeight:500 }}>{brief.strategicObjective}</p>
          </Section>
        )}

        {/* Open Loops */}
        {brief.openLoops?.length > 0 && (
          <Section icon="○" label="Pendências em Aberto" accent="#E8967A" className="fade">
            <ul style={{ listStyle:"none", display:"flex", flexDirection:"column", gap:7 }}>
              {brief.openLoops.map((item,i)=>(
                <li key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", fontSize:13, color:"rgba(26,31,46,.72)", lineHeight:1.55 }}>
                  <span style={{ color:"#C2410C", flexShrink:0, marginTop:2, fontSize:10 }}>→</span>{item}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Talking Points */}
        {brief.talkingPoints?.length > 0 && (
          <Section icon="▶" label="Pontos de Discussão" accent="#7BC47F" className="fade">
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {brief.talkingPoints.map((tp,i)=>(
                <div key={i} style={{ padding:"11px 14px", background:"rgba(21,128,61,.04)", borderRadius:7, borderLeft:"2px solid rgba(21,128,61,.3)" }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"#1A1F2E", marginBottom:4 }}>{tp.point}</div>
                  <div style={{ fontSize:12, color:"rgba(26,31,46,.55)", lineHeight:1.55 }}>{tp.angle}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Questions */}
        {brief.questionsToAsk?.length > 0 && (
          <Section icon="?" label="Perguntas a Fazer" accent="#A78BCA" className="fade">
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {brief.questionsToAsk.map((q,i)=>(
                <div key={i} style={{ fontSize:13, color:"rgba(26,31,46,.72)", padding:"9px 13px", background:"rgba(167,139,202,.06)", borderRadius:6, lineHeight:1.55, borderLeft:"1px solid rgba(167,139,202,.3)" }}>
                  "{q}"
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Watch Out */}
        {brief.watchOutFor?.length > 0 && (
          <Section icon="⚠" label="Atenção" accent="#E8A87C" className="fade">
            <ul style={{ listStyle:"none", display:"flex", flexDirection:"column", gap:7 }}>
              {brief.watchOutFor.map((w,i)=>(
                <li key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", fontSize:13, color:"rgba(26,31,46,.68)", lineHeight:1.55 }}>
                  <span style={{ color:"#B45309", flexShrink:0 }}>⚠</span>{w}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Next Step */}
        {brief.nextStepRecommendation && (
          <Section icon="►" label="Próximo Passo Recomendado" accent="#1C3557" className="fade">
            <div style={{ fontSize:14, lineHeight:1.7, color:"#1A1F2E", fontWeight:500 }}>{brief.nextStepRecommendation}</div>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ icon, label, accent, children, className="" }) {
  return (
    <div className={className} style={{ padding:"15px 17px", border:"1px solid rgba(0,0,0,.07)", borderRadius:9, background:"#FFFFFF", boxShadow:"0 1px 4px rgba(0,0,0,.04)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:11 }}>
        <span style={{ color:accent, fontSize:11 }}>{icon}</span>
        <span style={{ fontSize:10, fontWeight:600, letterSpacing:1.5, textTransform:"uppercase", color:accent, fontFamily:"'Instrument Sans',sans-serif" }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

function SetupModal({ keyDraft, setKeyDraft, currentKey, onSave, onClose }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(240,237,230,.85)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:500, padding:38, background:"#FFFFFF", border:"1px solid rgba(28,53,87,.12)", borderRadius:14, boxShadow:"0 24px 64px rgba(0,0,0,.12)" }}>
        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:24, color:"#1A1F2E", marginBottom:6 }}>Configuração</div>
        <div style={{ fontSize:12.5, color:"rgba(26,31,46,.5)", marginBottom:28, lineHeight:1.6 }}>
          O Gmail já está integrado automaticamente via sua conta Google. Configure abaixo sua API Key do Read AI para enriquecer os briefings com transcrições e resumos de reuniões passadas.
        </div>

        <div style={{ padding:"11px 15px", background:"rgba(21,128,61,.05)", border:"1px solid rgba(21,128,61,.15)", borderRadius:8, marginBottom:22, display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:16 }}>✉</span>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:"rgba(21,100,21,.8)" }}>Gmail conectado</div>
            <div style={{ fontSize:11, color:"rgba(26,31,46,.45)", marginTop:2 }}>E-mails relevantes dos participantes são buscados automaticamente.</div>
          </div>
        </div>

        <div style={{ marginBottom:22 }}>
          <label style={{ fontSize:10, letterSpacing:1.5, textTransform:"uppercase", color:"rgba(28,53,87,.6)", display:"block", marginBottom:8, fontWeight:600 }}>Read AI API Key</label>
          <input type="password" value={keyDraft} onChange={e=>setKeyDraft(e.target.value)} placeholder="read_ai_xxxxxxxxxxxxxxxx" style={{ width:"100%", padding:"11px 14px", background:"#F7F5F0", border:"1px solid rgba(28,53,87,.18)", borderRadius:7, color:"#1A1F2E", fontSize:13, fontFamily:"'JetBrains Mono',monospace" }} />
          <div style={{ fontSize:11, color:"rgba(26,31,46,.38)", marginTop:8, lineHeight:1.5 }}>
            Opcional. Sem a key, briefings são gerados apenas com dados da agenda via Google Calendar. Obtenha sua key em <span style={{ color:"#1C3557" }}>app.read.ai → Settings → API</span>.
          </div>
        </div>

        <div style={{ padding:"12px 16px", background:"#FEF9EC", border:"1px solid rgba(180,150,0,.2)", borderRadius:7, marginBottom:26, fontSize:11.5, color:"rgba(26,31,46,.55)", lineHeight:1.6 }}>
          <span style={{ color:"#92650A", fontWeight:600 }}>Nota sobre CORS:</span> A API do Read AI pode não estar acessível diretamente no browser por restrições CORS. Nesse caso, o app opera com os dados da agenda e Claude gera briefings com base no contexto das reuniões e no seu perfil de empreendedor e estrategista.
        </div>

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"10px 22px", background:"none", border:"1px solid rgba(0,0,0,.12)", borderRadius:7, color:"rgba(26,31,46,.55)", cursor:"pointer", fontSize:13 }}>Cancelar</button>
          <button onClick={onSave} style={{ padding:"10px 28px", background:"linear-gradient(135deg,#1C3557,#2C5282)", border:"none", borderRadius:7, color:"#FFFFFF", fontWeight:700, cursor:"pointer", fontSize:13 }}>Salvar</button>
        </div>
      </div>
    </div>
  );
}
