import { useState, useEffect, useRef } from "react";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL         = "claude-sonnet-4-20250514";
const READ_AI_BASE  = "https://api.read.ai/api/v1";
const GCAL          = "https://www.googleapis.com/calendar/v3";
const GMAIL         = "https://www.googleapis.com/gmail/v1";
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly";

const SYSTEM_PROMPT = `Você é o assistente de inteligência estratégica pessoal de Alex.

Perfil de Alex: empreendedor serial, desenvolvedor de negócios, executor e estrategista. Navega múltiplos setores — negociações comerciais, parcerias estratégicas, reuniões operacionais, apresentações a investidores. Visão de longo prazo, foco em resultado, sensibilidade para relacionamentos e dinâmicas de poder.

Sua missão: transformar dados brutos da agenda e histórico de reuniões em inteligência executiva afiada. Alex entra em toda reunião preparado, estratégico e no controle.

Retorne APENAS este JSON válido (sem markdown, sem texto extra):
{
  "contextRecap": "Onde está este relacionamento/negócio. Histórico em 2-3 frases diretas.",
  "openLoops": ["pendência específica 1", "pendência 2"],
  "strategicObjective": "O que Alex deve conquistar ou fechar nesta reunião.",
  "talkingPoints": [{"point": "Tópico", "angle": "Como enquadrar estrategicamente"}],
  "questionsToAsk": ["Pergunta estratégica 1", "Pergunta 2"],
  "watchOutFor": ["Risco ou dinâmica a observar"],
  "nextStepRecommendation": "Próximo passo concreto para propor ao final.",
  "strategicInsight": "Insight não-óbvio com olhar de empreendedor e estrategista."
}

Direto, perspicaz, sem fluff. Pense como advisor sênior que sabe ler pessoas e situações.`;

// ── Helpers ──
const fmtTime = s => { try { return new Date(s).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); } catch { return ""; } };
const fmtDay  = s => { try { return new Date(s).toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"}); } catch { return ""; } };
const fmtDur  = (s,e) => { try { return Math.round((new Date(e)-new Date(s))/60000)+"min"; } catch { return ""; } };
const todayD  = () => { const d=new Date(); d.setHours(0,0,0,0); return d; };

function getRange(tab) {
  const t = todayD();
  if (tab==="today")    { const e=new Date(t); e.setDate(e.getDate()+1); return {start:t,end:e}; }
  if (tab==="tomorrow") { const s=new Date(t); s.setDate(s.getDate()+1); const e=new Date(s); e.setDate(e.getDate()+1); return {start:s,end:e}; }
  const e=new Date(t); e.setDate(e.getDate()+(e.getDay()===0?6:6-e.getDay())+1);
  return {start:t,end:e};
}

function mockMeetings(tab) {
  const b=new Date(); if(tab==="tomorrow") b.setDate(b.getDate()+1);
  const at=(h,m=0)=>{const d=new Date(b);d.setHours(h,m,0,0);return d.toISOString();};
  const ex=tab==="week"?[
    {id:"4",title:"Revisão de Parceria — Escritório Jurídico",start:at(10),end:at(11,30),attendees:[{name:"Dra. Fernanda Lima",email:"f.lima@escritorio.com.br"}],description:"Revisão dos termos do acordo de parceria estratégica.",location:"Zoom"},
    {id:"5",title:"Apresentação a Investidores — Rodada Seed",start:at(14,30),end:at(16),attendees:[{name:"Ricardo Barros",email:"r.barros@venture.com.br"},{name:"Mariana Teixeira",email:"m.teixeira@venture.com.br"}],description:"Modelo de negócio, tração e estrutura da rodada.",location:"Escritório"},
  ]:[];
  return [
    {id:"1",title:"Alinhamento Estratégico — Parceiro A",start:at(9),end:at(10),attendees:[{name:"Carlos Mendes",email:"c.mendes@parceiroa.com"},{name:"Ana Souza",email:"a.souza@parceiroa.com"}],description:"Revisão do roadmap conjunto e próximos passos.",location:"Google Meet"},
    {id:"2",title:"Follow-up Proposta Comercial — Cliente B",start:at(11,30),end:at(12,15),attendees:[{name:"Marco Ferreira",email:"m.ferreira@clienteb.com"}],description:"Retorno sobre proposta. Negociação de escopo e condições.",location:"MS Teams"},
    {id:"3",title:"Kick-off de Projeto — Equipe Interna",start:at(14),end:at(15),attendees:[{name:"Equipe",email:"team@empresa.com.br"},{name:"Rafael Costa",email:"r.costa@empresa.com.br"}],description:"Kick-off do projeto. Roadmap, recursos e metas.",location:"Escritório"},
    ...ex
  ];
}

const ls    = (k,fb="") => { try { return localStorage.getItem(k)||fb; } catch { return fb; } };
const lsSet = (k,v)     => { try { localStorage.setItem(k,v); } catch {} };
const lsDel = k         => { try { localStorage.removeItem(k); } catch {} };

// ─────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────
export default function App() {
  const [anthropicKey,    setAnthropicKey]    = useState(()=>ls("mi_ak")||process.env.REACT_APP_ANTHROPIC_API_KEY||"");
  const [readAiKey,       setReadAiKey]       = useState(()=>ls("mi_rk"));
  const [googleToken,     setGoogleToken]     = useState(()=>ls("mi_gt"));
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleReady,     setGoogleReady]     = useState(false);
  const tokenClientRef = useRef(null);

  const [draftAk, setDraftAk] = useState("");
  const [draftRk, setDraftRk] = useState("");

  const [showSetup,       setShowSetup]       = useState(false);
  const [tab,             setTab]             = useState("today");
  const [meetings,        setMeetings]        = useState([]);
  const [selected,        setSelected]        = useState(null);
  const [brief,           setBrief]           = useState(null);
  const [loading,         setLoading]         = useState({cal:false,readai:false,gmail:false,brief:false});
  const [notice,          setNotice]          = useState({});
  const [demoMode,        setDemoMode]        = useState(false);
  const [pastCount,       setPastCount]       = useState(0);
  const [gmailCount,      setGmailCount]      = useState(0);
  const [showBriefMobile, setShowBriefMobile] = useState(false);
  const [isMobile,        setIsMobile]        = useState(window.innerWidth<768);

  useEffect(()=>{
    const h=()=>setIsMobile(window.innerWidth<768);
    window.addEventListener("resize",h);
    return ()=>window.removeEventListener("resize",h);
  },[]);

  useEffect(()=>{
    const l=document.createElement("link");
    l.href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";
    l.rel="stylesheet"; document.head.appendChild(l);
  },[]);

  useEffect(()=>{
    const clientId=process.env.REACT_APP_GOOGLE_CLIENT_ID;
    if(!clientId) return;
    const s=document.createElement("script");
    s.src="https://accounts.google.com/gsi/client"; s.async=true;
    s.onload=()=>{
      tokenClientRef.current=window.google.accounts.oauth2.initTokenClient({
        client_id:clientId, scope:GOOGLE_SCOPES,
        callback:(r)=>{ if(r.access_token){ setGoogleToken(r.access_token); lsSet("mi_gt",r.access_token); setGoogleConnected(true); } }
      });
      setGoogleReady(true);
      if(ls("mi_gt")) setGoogleConnected(true);
    };
    document.head.appendChild(s);
  },[]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{ fetchCal(tab); },[tab,googleConnected]);

  function openSetup()  { setDraftAk(anthropicKey); setDraftRk(readAiKey); setShowSetup(true); }
  function saveSettings(){ if(draftAk.trim()){setAnthropicKey(draftAk.trim());lsSet("mi_ak",draftAk.trim());} if(draftRk.trim()){setReadAiKey(draftRk.trim());lsSet("mi_rk",draftRk.trim());} setShowSetup(false); }
  function connectGoogle()   { if(tokenClientRef.current) tokenClientRef.current.requestAccessToken(); }
  function disconnectGoogle(){ setGoogleToken(""); setGoogleConnected(false); lsDel("mi_gt"); setMeetings(mockMeetings(tab)); setDemoMode(true); }

  async function callClaude(system, messages) {
    if(!anthropicKey) throw new Error("Configure sua Anthropic API Key em ⚙ Configurar");
    const res=await fetch(ANTHROPIC_API,{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":anthropicKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
      body:JSON.stringify({model:MODEL,max_tokens:1000,system,messages})
    });
    if(!res.ok){const e=await res.json().catch(()=>({})); throw new Error(e.error?.message||`Erro ${res.status}`);}
    const data=await res.json();
    return data.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"";
  }

  async function fetchCal(t) {
    setLoading(l=>({...l,cal:true})); setNotice(n=>({...n,cal:null}));
    if(!googleConnected||!googleToken){ setMeetings(mockMeetings(t)); setDemoMode(true); setLoading(l=>({...l,cal:false})); return; }
    const {start,end}=getRange(t);
    try {
      const res=await fetch(`${GCAL}/calendars/primary/events?timeMin=${start.toISOString()}&timeMax=${end.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=50`,{headers:{Authorization:`Bearer ${googleToken}`}});
      if(res.status===401){ lsDel("mi_gt"); setGoogleToken(""); setGoogleConnected(false); setMeetings(mockMeetings(t)); setDemoMode(true); setNotice(n=>({...n,cal:"Sessão Google expirada — reconecte em ⚙"})); return; }
      if(!res.ok) throw new Error(`Calendar ${res.status}`);
      const data=await res.json();
      const events=(data.items||[]).filter(e=>e.start?.dateTime&&e.status!=="cancelled").map(e=>({
        id:e.id, title:e.summary||"(Sem título)", start:e.start.dateTime, end:e.end?.dateTime||e.start.dateTime,
        attendees:(e.attendees||[]).filter(a=>!a.self).map(a=>({name:a.displayName||a.email?.split("@")[0]||"",email:a.email||""})),
        description:e.description||null, location:e.location||e.hangoutLink||null
      }));
      setMeetings(events); setDemoMode(false);
    } catch(err){ setMeetings(mockMeetings(t)); setDemoMode(true); setNotice(n=>({...n,cal:`Agenda: ${err.message}`})); }
    setLoading(l=>({...l,cal:false}));
  }

  async function fetchGmailContext(meeting) {
    if(!googleConnected||!googleToken) return [];
    setLoading(l=>({...l,gmail:true}));
    const emails=(meeting.attendees||[]).map(a=>a.email).filter(Boolean);
    if(!emails.length){ setLoading(l=>({...l,gmail:false})); return []; }
    try {
      const q=emails.map(e=>`from:${e} OR to:${e}`).join(" OR ");
      const res=await fetch(`${GMAIL}/users/me/threads?q=${encodeURIComponent(q)}&maxResults=10`,{headers:{Authorization:`Bearer ${googleToken}`}});
      if(res.status===401){ lsDel("mi_gt"); setGoogleConnected(false); return []; }
      if(!res.ok) throw new Error(`Gmail ${res.status}`);
      const data=await res.json();
      const details=await Promise.all((data.threads||[]).slice(0,6).map(async t=>{
        try{ const r=await fetch(`${GMAIL}/users/me/threads/${t.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,{headers:{Authorization:`Bearer ${googleToken}`}}); return r.ok?await r.json():null; }catch{ return null; }
      }));
      const result=details.filter(Boolean).map(t=>{
        const msg=t.messages?.[t.messages.length-1]||t.messages?.[0];
        const hdrs=msg?.payload?.headers||[];
        const get=n=>hdrs.find(h=>h.name===n)?.value||"";
        return {subject:get("Subject"),from:get("From"),date:get("Date"),snippet:msg?.snippet||""};
      }).filter(t=>t.subject);
      setGmailCount(result.length); return result;
    } catch(err){ setNotice(n=>({...n,gmail:`Gmail: ${err.message}`})); return []; }
    finally { setLoading(l=>({...l,gmail:false})); }
  }

  async function fetchReadAiMeetings(meeting) {
    if(!readAiKey) return [];
    setLoading(l=>({...l,readai:true}));
    try {
      let res=await fetch(`${READ_AI_BASE}/reports?limit=30`,{headers:{Authorization:`Bearer ${readAiKey}`}});
      if(!res.ok) res=await fetch(`${READ_AI_BASE}/meetings?limit=30`,{headers:{Authorization:`Bearer ${readAiKey}`}});
      if(!res.ok) throw new Error(`Status ${res.status}`);
      const data=await res.json();
      const all=data.results||data.reports||data.meetings||[];
      const emails=(meeting.attendees||[]).map(a=>a.email?.toLowerCase()).filter(Boolean);
      const words=(meeting.title||"").toLowerCase().split(/\s+/).filter(w=>w.length>4);
      const relevant=all.filter(m=>{
        const mE=(m.attendees||m.speakers||[]).map(a=>(a.email||"").toLowerCase());
        return emails.some(e=>mE.includes(e))||words.some(w=>(m.title||m.name||"").toLowerCase().includes(w));
      }).slice(0,5);
      const details=await Promise.all(relevant.map(async m=>{
        const rid=m.report_id||m.meeting_id||m.id;
        try{ const r=await fetch(`${READ_AI_BASE}/reports/${rid}`,{headers:{Authorization:`Bearer ${readAiKey}`}}); return r.ok?await r.json():m; }catch{ return m; }
      }));
      setPastCount(details.length); return details;
    } catch(err){ setNotice(n=>({...n,readai:err.message.includes("Failed to fetch")?"Read AI: CORS bloqueado. Verifique a API key.":`Read AI: ${err.message}`})); return []; }
    finally { setLoading(l=>({...l,readai:false})); }
  }

  async function generateBrief(meeting, past, gmail) {
    setLoading(l=>({...l,brief:true})); setBrief(null); setNotice(n=>({...n,brief:null}));
    try {
      const content=`Gere o Briefing Estratégico para Alex:

🗓 REUNIÃO:
- Título: ${meeting.title}
- Data: ${fmtDay(meeting.start)} às ${fmtTime(meeting.start)} (${fmtDur(meeting.start,meeting.end)})
- Participantes: ${meeting.attendees?.map(a=>`${a.name} <${a.email}>`).join(", ")||"N/A"}
- Local: ${meeting.location||"N/A"}
- Pauta: ${meeting.description||"Sem descrição — inferir pelo título e participantes"}

${past.length>0?`📋 REUNIÕES ANTERIORES — Read AI (${past.length}):\n${JSON.stringify(past.map(p=>({titulo:p.title||p.name,data:p.created_at||p.date,resumo:p.summary||p.overview,acoes:p.action_items,insights:p.insights||p.highlights})),null,2)}`:"📋 Read AI: sem histórico encontrado."}

${gmail.length>0?`📧 E-MAILS — Gmail (${gmail.length}):\n${JSON.stringify(gmail,null,2)}`:"📧 Gmail: sem e-mails relevantes."}`;

      const text=await callClaude(SYSTEM_PROMPT,[{role:"user",content}]);
      const m=text.match(/\{[\s\S]*\}/);
      if(m) setBrief(JSON.parse(m[0])); else throw new Error("Formato inesperado da IA");
    } catch(e){ setNotice(n=>({...n,brief:e.message})); }
    setLoading(l=>({...l,brief:false}));
  }

  async function pickMeeting(m) {
    setSelected(m); setBrief(null); setPastCount(0); setGmailCount(0);
    setNotice(n=>({...n,readai:null,gmail:null,brief:null}));
    if(isMobile) setShowBriefMobile(true);
    const [past,gmail]=await Promise.all([fetchReadAiMeetings(m),fetchGmailContext(m)]);
    await generateBrief(m,past,gmail);
  }

  const nowStr=new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  const anyLoading=loading.readai||loading.gmail||loading.brief;

  return (
    <>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body{background:#F0EDE6;overflow:hidden}
        @keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shimmer{0%{background-position:-400% 0}100%{background-position:400% 0}}
        .mc{cursor:pointer;transition:background .15s,border-color .15s,box-shadow .15s}
        .mc:hover{background:#EEF2F8!important;border-color:rgba(28,53,87,.25)!important}
        .mc.sel{background:#E8EFF8!important;border-color:rgba(28,53,87,.4)!important;box-shadow:0 2px 12px rgba(28,53,87,.1)!important}
        .tb{cursor:pointer;transition:color .15s,border-color .15s}
        .tb:hover{color:#1C3557!important}
        .tb.act{color:#1C3557!important;border-bottom-color:#1C3557!important}
        .skel{background:linear-gradient(90deg,rgba(0,0,0,.05) 25%,rgba(0,0,0,.09) 50%,rgba(0,0,0,.05) 75%);background-size:400% 100%;animation:shimmer 1.8s infinite;border-radius:4px}
        .fade{animation:fadeUp .35s ease forwards;opacity:0}
        .fade:nth-child(1){animation-delay:.04s}.fade:nth-child(2){animation-delay:.09s}.fade:nth-child(3){animation-delay:.14s}.fade:nth-child(4){animation-delay:.19s}.fade:nth-child(5){animation-delay:.24s}.fade:nth-child(6){animation-delay:.29s}.fade:nth-child(7){animation-delay:.34s}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:rgba(28,53,87,.18);border-radius:2px}
        input:focus{outline:none;border-color:rgba(28,53,87,.5)!important}
        a{color:#1C3557}
      `}</style>

      <div style={{display:"flex",flexDirection:"column",height:"100vh",fontFamily:"'Instrument Sans',sans-serif",color:"#1A1F2E",background:"#F0EDE6",overflow:"hidden"}}>

        {/* HEADER */}
        <div style={{flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 18px",borderBottom:"1px solid rgba(28,53,87,.1)",background:"#FFF",boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {isMobile&&showBriefMobile&&(
              <button onClick={()=>setShowBriefMobile(false)}
                style={{background:"none",border:"none",cursor:"pointer",color:"#1C3557",fontSize:13,padding:"4px 10px 4px 0",display:"flex",alignItems:"center",gap:4}}>
                ← Agenda
              </button>
            )}
            {(!isMobile||!showBriefMobile)&&(
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:27,height:27,borderRadius:6,background:"linear-gradient(135deg,#1C3557,#2C5282)",display:"flex",alignItems:"center",justifyContent:"center",color:"#FFF",fontWeight:700,fontSize:13}}>◈</div>
                <div>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:15,fontWeight:600,letterSpacing:2,color:"#1C3557",textTransform:"uppercase",lineHeight:1.1}}>Meeting Intel</div>
                  <div style={{fontSize:10,color:"rgba(26,31,46,.4)",marginTop:1}}>{nowStr}</div>
                </div>
              </div>
            )}
            {isMobile&&showBriefMobile&&selected&&(
              <div style={{fontSize:13,fontWeight:500,color:"#1A1F2E",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{selected.title}</div>
            )}
          </div>

          <div style={{display:"flex",alignItems:"center",gap:2}}>
            {(!isMobile||!showBriefMobile)&&[["today","Hoje"],["tomorrow","Amanhã"],["week","Semana"]].map(([t,l])=>(
              <button key={t} className={`tb${tab===t?" act":""}`} onClick={()=>setTab(t)}
                style={{background:"none",border:"none",borderBottom:"1px solid transparent",padding:"5px 10px",fontSize:11,fontWeight:500,letterSpacing:1,textTransform:"uppercase",color:tab===t?"#1C3557":"rgba(26,31,46,.4)",fontFamily:"'Instrument Sans',sans-serif",cursor:"pointer"}}>
                {l}
              </button>
            ))}
            {demoMode&&!showBriefMobile&&<span style={{marginLeft:8,fontSize:10,padding:"2px 7px",border:"1px solid rgba(28,53,87,.2)",borderRadius:4,color:"rgba(28,53,87,.5)",letterSpacing:.8}}>DEMO</span>}
            <button onClick={openSetup}
              style={{marginLeft:10,display:"flex",alignItems:"center",gap:5,padding:"6px 12px",background:"rgba(28,53,87,.05)",border:"1px solid rgba(28,53,87,.15)",borderRadius:7,color:"rgba(26,31,46,.55)",fontSize:12,cursor:"pointer"}}>
              ⚙{!isMobile&&" Configurar"}
            </button>
          </div>
        </div>

        {/* WARNING BANNER */}
        {!anthropicKey&&(
          <div style={{flexShrink:0,padding:"7px 18px",background:"#FEF9EC",borderBottom:"1px solid rgba(180,150,0,.2)",fontSize:12,color:"#92650A",display:"flex",alignItems:"center",gap:8}}>
            ⚠ <strong>Anthropic API Key não configurada.</strong>
            <button onClick={openSetup} style={{textDecoration:"underline",background:"none",border:"none",cursor:"pointer",color:"#92650A",fontSize:12}}>Configurar →</button>
          </div>
        )}

        {/* BODY */}
        <div style={{display:"flex",flex:1,overflow:"hidden"}}>

          {/* LEFT — AGENDA */}
          {(!isMobile||!showBriefMobile)&&(
            <div style={{width:isMobile?"100%":300,flexShrink:0,borderRight:isMobile?"none":"1px solid rgba(28,53,87,.08)",overflowY:"auto",background:"#FAFAF7",display:"flex",flexDirection:"column"}}>

              {!googleConnected&&(
                <div style={{margin:"12px 10px 0",padding:"12px 14px",background:"#EEF4FF",border:"1px solid rgba(28,53,87,.15)",borderRadius:8}}>
                  <div style={{fontSize:12,color:"rgba(26,31,46,.6)",marginBottom:9,lineHeight:1.5}}>Conecte sua conta Google para carregar sua agenda e e-mails reais.</div>
                  <button onClick={connectGoogle}
                    style={{width:"100%",padding:"8px",background:"linear-gradient(135deg,#1C3557,#2C5282)",border:"none",borderRadius:6,color:"#FFF",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                    🔗 Conectar Google
                  </button>
                  {!process.env.REACT_APP_GOOGLE_CLIENT_ID&&(
                    <div style={{fontSize:10,color:"#C2410C",marginTop:6,textAlign:"center"}}>Configure REACT_APP_GOOGLE_CLIENT_ID na Vercel</div>
                  )}
                </div>
              )}

              {googleConnected&&(
                <div style={{margin:"10px 10px 0",padding:"7px 12px",background:"rgba(21,128,61,.05)",border:"1px solid rgba(21,128,61,.15)",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:11,color:"rgba(21,100,21,.8)",display:"flex",alignItems:"center",gap:5}}><span>✓</span> Google conectado</span>
                  <button onClick={disconnectGoogle} style={{fontSize:10,background:"none",border:"none",cursor:"pointer",color:"rgba(26,31,46,.35)",textDecoration:"underline"}}>sair</button>
                </div>
              )}

              <div style={{padding:"12px 12px 8px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(28,53,87,.5)"}}>
                  {loading.cal?"Carregando...":`${meetings.length} reunião${meetings.length!==1?"ões":""}`}
                </div>
                <button onClick={()=>fetchCal(tab)} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(28,53,87,.4)",fontSize:15,padding:4}}>↻</button>
              </div>

              {notice.cal&&<Notice msg={notice.cal}/>}

              {loading.cal
                ?<div style={{padding:"0 10px"}}>{[1,2,3].map(i=><div key={i} className="skel" style={{height:84,marginBottom:8}}/>)}</div>
                :meetings.length===0
                  ?<div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,textAlign:"center"}}>
                    <div style={{fontSize:32,color:"rgba(28,53,87,.2)",marginBottom:10}}>○</div>
                    <div style={{fontSize:13,color:"rgba(26,31,46,.4)"}}>Sem reuniões neste período</div>
                  </div>
                  :meetings.map(m=><MeetingCard key={m.id} meeting={m} isSelected={selected?.id===m.id} onClick={()=>pickMeeting(m)}/>)
              }
            </div>
          )}

          {/* RIGHT — BRIEF */}
          {(!isMobile||showBriefMobile)&&(
            <div style={{flex:1,overflowY:"auto",padding:isMobile?"14px":"26px 34px",background:"#F0EDE6"}}>
              {!selected
                ?<Splash googleConnected={googleConnected} anthropicKey={anthropicKey} onSetup={openSetup} onConnect={connectGoogle} googleReady={googleReady}/>
                :anyLoading
                  ?<LoadingBrief meeting={selected} loading={loading}/>
                  :brief
                    ?<PrepBrief meeting={selected} brief={brief} pastCount={pastCount} gmailCount={gmailCount} readAiKey={readAiKey} readaiNotice={notice.readai} gmailNotice={notice.gmail} onRefresh={()=>pickMeeting(selected)}/>
                    :<BriefError msg={notice.brief} onRetry={()=>pickMeeting(selected)} onSetup={openSetup} anthropicKey={anthropicKey}/>
              }
            </div>
          )}
        </div>
      </div>

      {showSetup&&(
        <SetupModal
          draftAk={draftAk} setDraftAk={setDraftAk}
          draftRk={draftRk} setDraftRk={setDraftRk}
          anthropicKey={anthropicKey}
          googleConnected={googleConnected} googleReady={googleReady}
          onConnect={connectGoogle} onDisconnect={disconnectGoogle}
          onSave={saveSettings} onClose={()=>setShowSetup(false)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────

function Notice({msg,color="rgba(140,80,0,.75)",bg="rgba(255,200,0,.06)",border="rgba(200,150,0,.2)"}) {
  return <div style={{margin:"0 10px 8px",padding:"8px 12px",background:bg,border:`1px solid ${border}`,borderRadius:6,fontSize:11,color,lineHeight:1.5}}>{msg}</div>;
}

function MeetingCard({meeting,isSelected,onClick}) {
  const ppl=meeting.attendees||[];
  return (
    <div className={`mc${isSelected?" sel":""}`} onClick={onClick}
      style={{margin:"0 10px 7px",padding:"12px 14px",borderRadius:8,border:`1px solid ${isSelected?"rgba(28,53,87,.35)":"rgba(28,53,87,.09)"}`,background:isSelected?"#E8EFF8":"#FFF",boxShadow:isSelected?"0 2px 12px rgba(28,53,87,.1)":"0 1px 3px rgba(0,0,0,.04)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5}}>
        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:20,fontWeight:400,letterSpacing:-1,color:isSelected?"#1C3557":"rgba(28,53,87,.55)",lineHeight:1}}>{fmtTime(meeting.start)}</span>
        <span style={{fontSize:10,color:"rgba(26,31,46,.3)",marginTop:2}}>{fmtDur(meeting.start,meeting.end)}</span>
      </div>
      <div style={{fontSize:12.5,fontWeight:500,lineHeight:1.4,color:"#1A1F2E",marginBottom:5}}>{meeting.title}</div>
      {ppl.length>0&&<div style={{fontSize:11,color:"rgba(26,31,46,.42)",display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:8}}>●</span>{ppl.slice(0,2).map(a=>a.name||a.email?.split("@")[0]).join(", ")}{ppl.length>2?` +${ppl.length-2}`:""}</div>}
      {meeting.location&&<div style={{fontSize:10,color:"rgba(26,31,46,.28)",marginTop:4}}>⌖ {meeting.location}</div>}
    </div>
  );
}

function Splash({googleConnected,anthropicKey,onSetup,onConnect,googleReady}) {
  const allGood=googleConnected&&anthropicKey;
  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,padding:40,textAlign:"center"}}>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:60,color:"rgba(28,53,87,.1)",lineHeight:1}}>◈</div>
      <div style={{fontSize:15,color:"rgba(26,31,46,.35)",letterSpacing:.5}}>Selecione uma reunião para gerar o briefing</div>
      {!allGood&&(
        <div style={{marginTop:8,padding:"16px 20px",background:"#FFF",border:"1px solid rgba(28,53,87,.1)",borderRadius:10,maxWidth:320,width:"100%"}}>
          <div style={{fontSize:11,fontWeight:600,color:"#1C3557",marginBottom:12,letterSpacing:.5,textTransform:"uppercase"}}>Configuração necessária</div>
          <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:14}}>
            {!anthropicKey&&<div style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"rgba(26,31,46,.6)"}}><span style={{color:"#C2410C"}}>✗</span>Anthropic API Key</div>}
            {!googleConnected&&<div style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"rgba(26,31,46,.6)"}}><span style={{color:"#C2410C"}}>✗</span>Google Calendar & Gmail</div>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {!googleConnected&&<button onClick={onConnect} style={{padding:"8px",background:"linear-gradient(135deg,#1C3557,#2C5282)",border:"none",borderRadius:7,color:"#FFF",fontSize:12,fontWeight:600,cursor:"pointer"}}>🔗 Conectar Google</button>}
            <button onClick={onSetup} style={{padding:"8px",background:"rgba(28,53,87,.06)",border:"1px solid rgba(28,53,87,.15)",borderRadius:7,color:"#1C3557",fontSize:12,cursor:"pointer"}}>⚙ Configurar API Keys</button>
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingBrief({meeting,loading}) {
  const steps=[
    {key:"readai",label:"Read AI — reuniões anteriores"},
    {key:"gmail", label:"Gmail — e-mails relevantes"},
    {key:"brief", label:"IA — gerando briefing"},
  ];
  return (
    <div>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"rgba(28,53,87,.45)",marginBottom:6}}>preparando briefing</div>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:23,color:"#1A1F2E",lineHeight:1.25}}>{meeting.title}</div>
        <div style={{fontSize:11,color:"rgba(26,31,46,.4)",marginTop:4}}>{fmtDay(meeting.start)} · {fmtTime(meeting.start)}</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:22}}>
        {steps.map(s=>{
          const active=loading[s.key];
          return (
            <div key={s.key} style={{display:"flex",alignItems:"center",gap:11,padding:"10px 14px",borderRadius:7,border:`1px solid ${active?"rgba(28,53,87,.2)":"rgba(0,0,0,.06)"}`,background:active?"rgba(28,53,87,.04)":"rgba(255,255,255,.7)",transition:"all .25s"}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:active?"#1C3557":"rgba(26,31,46,.18)",flexShrink:0,animation:active?"pulse 1.2s ease-in-out infinite":"none"}}/>
              <div style={{fontSize:12,color:active?"#1A1F2E":"rgba(26,31,46,.4)",flex:1}}>{s.label}</div>
              {!active&&loading.brief&&s.key!=="brief"&&<span style={{fontSize:12,color:"rgba(21,128,61,.7)"}}>✓</span>}
            </div>
          );
        })}
      </div>
      {[70,50,80,55,65].map((w,i)=><div key={i} className="skel" style={{height:13,width:`${w}%`,marginBottom:9,opacity:1-i*.12}}/>)}
    </div>
  );
}

function BriefError({msg,onRetry,onSetup,anthropicKey}) {
  const isKeyErr=!anthropicKey||msg?.includes("API Key")||msg?.includes("401")||msg?.includes("403");
  return (
    <div style={{textAlign:"center",padding:"50px 20px",color:"rgba(26,31,46,.45)"}}>
      <div style={{fontSize:26,marginBottom:12}}>⚠</div>
      <div style={{fontSize:13,color:"rgba(26,31,46,.6)",maxWidth:300,margin:"0 auto 20px",lineHeight:1.6}}>{msg||"Erro ao gerar briefing"}</div>
      <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
        <button onClick={onRetry} style={{padding:"9px 20px",background:"rgba(28,53,87,.07)",border:"1px solid rgba(28,53,87,.2)",borderRadius:7,color:"#1C3557",cursor:"pointer",fontSize:13}}>↻ Tentar novamente</button>
        {isKeyErr&&<button onClick={onSetup} style={{padding:"9px 20px",background:"linear-gradient(135deg,#1C3557,#2C5282)",border:"none",borderRadius:7,color:"#FFF",cursor:"pointer",fontSize:13}}>⚙ Configurar</button>}
      </div>
    </div>
  );
}

function PrepBrief({meeting,brief,pastCount,gmailCount,readAiKey,readaiNotice,gmailNotice,onRefresh}) {
  const ppl=(meeting.attendees||[]).map(a=>a.name||a.email?.split("@")[0]).join(", ");
  return (
    <div>
      <div style={{marginBottom:22}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5,flexWrap:"wrap",gap:6}}>
          <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"rgba(28,53,87,.5)",fontWeight:600}}>Briefing Estratégico</div>
          <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:10,padding:"2px 8px",borderRadius:4,border:gmailCount>0?"1px solid rgba(21,100,21,.25)":"1px solid rgba(0,0,0,.1)",color:gmailCount>0?"rgba(21,100,21,.75)":"rgba(26,31,46,.3)",background:gmailCount>0?"rgba(21,128,61,.05)":"transparent"}}>
              ✉ Gmail {gmailCount>0?`· ${gmailCount} e-mail${gmailCount>1?"s":""}`:"· sem e-mails"}
            </span>
            {readAiKey&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:4,border:pastCount>0?"1px solid rgba(28,53,87,.2)":"1px solid rgba(0,0,0,.1)",color:pastCount>0?"rgba(28,53,87,.75)":"rgba(26,31,46,.3)",background:pastCount>0?"rgba(28,53,87,.05)":"transparent"}}>
              ◈ Read AI {pastCount>0?`· ${pastCount} reunião${pastCount>1?"ões":""}`:"· sem histórico"}
            </span>}
            <button onClick={onRefresh} style={{background:"none",border:"1px solid rgba(28,53,87,.15)",borderRadius:6,padding:"3px 9px",color:"rgba(28,53,87,.5)",fontSize:11,cursor:"pointer"}}>↻</button>
          </div>
        </div>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:25,color:"#1A1F2E",lineHeight:1.2,marginBottom:6}}>{meeting.title}</div>
        <div style={{display:"flex",gap:14,fontSize:11,color:"rgba(26,31,46,.42)",flexWrap:"wrap"}}>
          <span>⏱ {fmtDay(meeting.start)} · {fmtTime(meeting.start)}</span>
          {ppl&&<span>◎ {ppl}</span>}
          {meeting.location&&<span>⌖ {meeting.location}</span>}
        </div>
      </div>

      {readaiNotice&&<Notice msg={`◈ ${readaiNotice}`}/>}
      {gmailNotice&&<Notice msg={`✉ ${gmailNotice}`} color="rgba(180,60,60,.75)" bg="rgba(255,80,0,.04)" border="rgba(200,80,0,.15)"/>}

      {brief.strategicInsight&&(
        <div className="fade" style={{padding:"15px 18px",marginBottom:16,background:"linear-gradient(135deg,#EEF4FF,#F5F0FF)",border:"1px solid rgba(28,53,87,.15)",borderRadius:10}}>
          <div style={{fontSize:10,letterSpacing:2,color:"#1C3557",textTransform:"uppercase",fontWeight:600,marginBottom:7}}>💡 Insight Estratégico</div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:16,lineHeight:1.65,color:"#1A1F2E",fontStyle:"italic"}}>"{brief.strategicInsight}"</div>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {brief.contextRecap&&<Section icon="◎" label="Contexto" accent="#2563EB"><p style={{fontSize:13,lineHeight:1.75,color:"rgba(26,31,46,.75)"}}>{brief.contextRecap}</p></Section>}
        {brief.strategicObjective&&<Section icon="◉" label="Objetivo desta Reunião" accent="#1C3557"><p style={{fontSize:13,lineHeight:1.7,color:"#1A1F2E",fontWeight:500}}>{brief.strategicObjective}</p></Section>}
        {brief.openLoops?.length>0&&(
          <Section icon="○" label="Pendências em Aberto" accent="#C2410C">
            <ul style={{listStyle:"none",display:"flex",flexDirection:"column",gap:6}}>
              {brief.openLoops.map((item,i)=><li key={i} style={{display:"flex",gap:9,alignItems:"flex-start",fontSize:13,color:"rgba(26,31,46,.72)",lineHeight:1.55}}><span style={{color:"#C2410C",flexShrink:0,fontSize:10,marginTop:3}}>→</span>{item}</li>)}
            </ul>
          </Section>
        )}
        {brief.talkingPoints?.length>0&&(
          <Section icon="▶" label="Pontos de Discussão" accent="#15803D">
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {brief.talkingPoints.map((tp,i)=>(
                <div key={i} style={{padding:"9px 12px",background:"rgba(21,128,61,.04)",borderRadius:7,borderLeft:"2px solid rgba(21,128,61,.3)"}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#1A1F2E",marginBottom:3}}>{tp.point}</div>
                  <div style={{fontSize:12,color:"rgba(26,31,46,.55)",lineHeight:1.55}}>{tp.angle}</div>
                </div>
              ))}
            </div>
          </Section>
        )}
        {brief.questionsToAsk?.length>0&&(
          <Section icon="?" label="Perguntas a Fazer" accent="#7C3AED">
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {brief.questionsToAsk.map((q,i)=><div key={i} style={{fontSize:13,color:"rgba(26,31,46,.72)",padding:"8px 12px",background:"rgba(124,58,237,.04)",borderRadius:6,lineHeight:1.55,borderLeft:"1px solid rgba(124,58,237,.2)"}}>"{ q}"</div>)}
            </div>
          </Section>
        )}
        {brief.watchOutFor?.length>0&&(
          <Section icon="⚠" label="Atenção" accent="#B45309">
            <ul style={{listStyle:"none",display:"flex",flexDirection:"column",gap:6}}>
              {brief.watchOutFor.map((w,i)=><li key={i} style={{display:"flex",gap:9,alignItems:"flex-start",fontSize:13,color:"rgba(26,31,46,.68)",lineHeight:1.55}}><span style={{color:"#B45309",flexShrink:0}}>⚠</span>{w}</li>)}
            </ul>
          </Section>
        )}
        {brief.nextStepRecommendation&&<Section icon="►" label="Próximo Passo Recomendado" accent="#1C3557"><div style={{fontSize:13,lineHeight:1.7,color:"#1A1F2E",fontWeight:500}}>{brief.nextStepRecommendation}</div></Section>}
      </div>
    </div>
  );
}

function Section({icon,label,accent,children}) {
  return (
    <div className="fade" style={{padding:"13px 15px",border:"1px solid rgba(0,0,0,.07)",borderRadius:9,background:"#FFF",boxShadow:"0 1px 3px rgba(0,0,0,.04)"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:9}}>
        <span style={{color:accent,fontSize:11}}>{icon}</span>
        <span style={{fontSize:10,fontWeight:600,letterSpacing:1.5,textTransform:"uppercase",color:accent}}>{label}</span>
      </div>
      {children}
    </div>
  );
}

function SetupModal({draftAk,setDraftAk,draftRk,setDraftRk,anthropicKey,googleConnected,googleReady,onConnect,onDisconnect,onSave,onClose}) {
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(240,237,230,.9)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{width:"100%",maxWidth:460,padding:28,background:"#FFF",border:"1px solid rgba(28,53,87,.12)",borderRadius:14,boxShadow:"0 24px 64px rgba(0,0,0,.12)",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,color:"#1A1F2E",marginBottom:4}}>Configuração</div>
        <div style={{fontSize:12,color:"rgba(26,31,46,.45)",marginBottom:22,lineHeight:1.5}}>Configure as integrações do Meeting Intel.</div>

        {/* Google */}
        <div style={{marginBottom:18,padding:"13px 15px",border:"1px solid rgba(28,53,87,.12)",borderRadius:9}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:1.5,textTransform:"uppercase",color:"rgba(28,53,87,.6)",marginBottom:9}}>Google Calendar & Gmail</div>
          {googleConnected
            ?<div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:13,color:"rgba(21,100,21,.8)",display:"flex",alignItems:"center",gap:6}}><span>✓</span>Conta Google conectada</span>
              <button onClick={onDisconnect} style={{fontSize:11,background:"none",border:"1px solid rgba(0,0,0,.1)",borderRadius:5,padding:"3px 10px",cursor:"pointer",color:"rgba(26,31,46,.5)"}}>Desconectar</button>
            </div>
            :<div>
              <div style={{fontSize:12,color:"rgba(26,31,46,.55)",marginBottom:9,lineHeight:1.5}}>
                Acessa agenda real e e-mails para enriquecer os briefings.
                {!process.env.REACT_APP_GOOGLE_CLIENT_ID&&<div style={{color:"#C2410C",marginTop:4}}>⚠ Requer REACT_APP_GOOGLE_CLIENT_ID na Vercel (Google Cloud Console → OAuth 2.0).</div>}
              </div>
              <button onClick={onConnect}
                style={{width:"100%",padding:"9px",background:googleReady?"linear-gradient(135deg,#1C3557,#2C5282)":"rgba(0,0,0,.08)",border:"none",borderRadius:7,color:googleReady?"#FFF":"rgba(26,31,46,.4)",fontSize:13,fontWeight:600,cursor:googleReady?"pointer":"not-allowed"}}>
                🔗 {googleReady?"Conectar Google":"Google não configurado"}
              </button>
            </div>
          }
        </div>

        {/* Anthropic */}
        <div style={{marginBottom:18}}>
          <label style={{fontSize:10,letterSpacing:1.5,textTransform:"uppercase",color:"rgba(28,53,87,.6)",display:"block",marginBottom:6,fontWeight:600}}>
            Anthropic API Key {!anthropicKey&&<span style={{color:"#C2410C",textTransform:"none",fontSize:10,letterSpacing:0}}>· obrigatório</span>}
          </label>
          <input type="password" value={draftAk} onChange={e=>setDraftAk(e.target.value)}
            placeholder={anthropicKey?"●●●●●●●●●●●● (já configurada)":"sk-ant-..."}
            style={{width:"100%",padding:"10px 12px",background:"#F7F5F0",border:"1px solid rgba(28,53,87,.18)",borderRadius:7,color:"#1A1F2E",fontSize:13,fontFamily:"'JetBrains Mono',monospace"}}/>
          <div style={{fontSize:11,color:"rgba(26,31,46,.38)",marginTop:5}}>
            <a href="https://console.anthropic.com" target="_blank" rel="noreferrer">console.anthropic.com</a> → API Keys
          </div>
        </div>

        {/* Read AI */}
        <div style={{marginBottom:22}}>
          <label style={{fontSize:10,letterSpacing:1.5,textTransform:"uppercase",color:"rgba(28,53,87,.6)",display:"block",marginBottom:6,fontWeight:600}}>
            Read AI API Key <span style={{color:"rgba(26,31,46,.35)",textTransform:"none",fontSize:10,letterSpacing:0,fontWeight:400}}>(opcional)</span>
          </label>
          <input type="password" value={draftRk} onChange={e=>setDraftRk(e.target.value)}
            placeholder={draftRk?"●●●●●●●●●●●● (configurada)":"read_ai_..."}
            style={{width:"100%",padding:"10px 12px",background:"#F7F5F0",border:"1px solid rgba(28,53,87,.18)",borderRadius:7,color:"#1A1F2E",fontSize:13,fontFamily:"'JetBrains Mono',monospace"}}/>
          <div style={{fontSize:11,color:"rgba(26,31,46,.38)",marginTop:5}}>
            <a href="https://app.read.ai" target="_blank" rel="noreferrer">app.read.ai</a> → Settings → API
          </div>
        </div>

        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{padding:"10px 20px",background:"none",border:"1px solid rgba(0,0,0,.12)",borderRadius:7,color:"rgba(26,31,46,.55)",cursor:"pointer",fontSize:13}}>Fechar</button>
          <button onClick={onSave} style={{padding:"10px 26px",background:"linear-gradient(135deg,#1C3557,#2C5282)",border:"none",borderRadius:7,color:"#FFF",fontWeight:700,cursor:"pointer",fontSize:13}}>Salvar</button>
        </div>
      </div>
    </div>
  );
}
