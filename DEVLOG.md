# Meeting Intel — Log de Desenvolvimento
**Projeto:** App_Assistente_Pessoal  
**Repositório:** https://github.com/apetermann/App_Assistente_Pessoal  
**URL de Produção:** https://app-assistente-pessoal-ik8w.vercel.app  
**Data:** 13 de maio de 2026  
**Desenvolvido com:** Claude Sonnet 4.6 (Anthropic)

---

## Resumo Executivo

Desenvolvimento completo de um webapp de assistente executivo pessoal, do conceito ao deploy em produção, em uma única sessão. O app integra Google Calendar, Gmail e Read AI para gerar briefings estratégicos antes de cada reunião de negócios, com análise orientada ao perfil de empreendedor, desenvolvedor de negócios, executor e estrategista.

---

## Iterações de Desenvolvimento

---

### v0.1 — Concepção e Arquitetura

**Pedido:** Criar um webapp que analise a agenda do dia, do dia seguinte e do resto da semana, com integração ao Read AI para buscar informações de reuniões passadas e gerar briefings inteligentes.

**Decisões de arquitetura:**
- Stack: React 18 + Anthropic API (Claude Sonnet) + MCPs
- Google Calendar via MCP (`https://calendarmcp.googleapis.com/mcp/v1`)
- Read AI via REST API direta (`https://api.read.ai/api/v1`)
- Claude API como motor de inteligência e análise
- Tema visual: escuro (dark executive) com acento dourado

**System Prompt definido:** Alex como empreendedor, executor, estrategista. Briefing estruturado em 8 seções JSON: `contextRecap`, `openLoops`, `strategicObjective`, `talkingPoints`, `questionsToAsk`, `watchOutFor`, `nextStepRecommendation`, `strategicInsight`.

**Arquivo criado:**
- `src/App.jsx` — componente React completo (~500 linhas)

---

### v0.2 — Remoção de Contexto Específico

**Pedido:** Remover todas as referências à DeCarbonMine, carbono, CBAM, SBCE, NextFuel, mineração, siderurgia — tornar o app agnóstico de indústria.

**Alterações:**
- `SYSTEM_PROMPT`: Alex descrito apenas como empreendedor serial, desenvolvedor de negócios, executor e estrategista — sem setor, empresa ou contexto específico
- Header: `"DeCarbonMine Intel"` → `"Meeting Intel"`
- Dados de demo: reuniões genéricas (Parceiro A, Cliente B, Investidores)
- Modal de configuração: texto genérico sem referência à empresa
- Nota CORS: removida referência ao contexto da empresa

**Verificação:** `grep` confirmou zero ocorrências de palavras relacionadas a carbono/empresa no arquivo final.

---

### v0.3 — Migração para Tema Claro

**Pedido:** Substituir o tema escuro (preto) por cores mais claras.

**Nova paleta:**
| Elemento | Antes (dark) | Depois (light) |
|----------|-------------|----------------|
| Background | `#060A11` | `#F0EDE6` (creme) |
| Painel esquerdo | `rgba(255,255,255,.02)` | `#FAFAF7` (branco quente) |
| Header | dark gold | `#FFFFFF` com sombra |
| Acento principal | `#D4AF37` (dourado) | `#1C3557` (azul naval) |
| Cards de seção | dark rgba | `#FFFFFF` com sombra suave |
| Texto | `#E8E4D9` | `#1A1F2E` |
| Insight card | gradiente dourado | gradiente azul-lavanda `#EEF4FF → #F5F0FF` |
| Modal | `#0D1320` | `#FFFFFF` |
| Botão salvar | gradiente dourado | gradiente naval `#1C3557 → #2C5282` |

**Processo:** ~15 substituições cirúrgicas via `str_replace` + script Python para substituições em bulk. Verificação final com `grep` confirmou zero remanescentes do tema escuro.

---

### v0.4 — Integração Gmail + Read AI Real

**Pedido:** Acessar Gmail real e Read AI API para buscar informações reais (não apenas agenda).

**Novas integrações:**

**Gmail (automático via MCP):**
- Constante adicionada: `GMAIL_MCP = "https://gmailmcp.googleapis.com/mcp/v1"`
- Função `fetchGmailContext(meeting)`: busca e-mails dos últimos 90 dias dos participantes da reunião
- Filtra por remetente/destinatário e assuntos relacionados ao título da reunião
- Retorna até 8 threads relevantes com subject, from, date, snippet e keyPoints
- Integrado ao Gmail MCP já conectado na conta do usuário — sem necessidade de API key

**Read AI (com API Key do usuário):**
- Endpoint duplo: tenta `/reports` primeiro, fallback para `/meetings`
- Match mais robusto: por nome parcial de participante além de email exato
- Busca detalhes de cada reunião relevante: summary, action_items, key_questions, insights, highlights
- Até 5 reuniões anteriores relevantes por meeting

**Execução paralela:**
```javascript
const [past, gmailThreads] = await Promise.all([
  fetchReadAiMeetings(m),
  fetchGmailContext(m),
]);
```

**Prompt de geração atualizado:** inclui seções `📋 HISTÓRICO Read AI` e `📧 E-MAILS Gmail` com dados reais.

**Loading com 3 etapas visíveis:**
- Read AI — buscando reuniões anteriores
- Gmail — buscando e-mails relevantes  
- IA — gerando briefing estratégico

**Badges no briefing:**
- `✉ Gmail · N e-mails`
- `◈ Read AI · N reuniões`

**States adicionados:** `gmailCount`, loading expandido com `gmail`, notice expandido com `gmail`.

**Modal de configuração atualizado:** seção "Gmail conectado" (automático) + campo Read AI API Key.

---

### v0.5 — Push para GitHub

**Pedido:** Criar repositório no GitHub e fazer push do webapp completo.

**Repositório:** `https://github.com/apetermann/App_Assistente_Pessoal` (já existia com apenas um README)

**Estrutura de arquivos criada:**
```
App_Assistente_Pessoal/
├── src/
│   ├── App.jsx        # App completo (React + todas as integrações) — 647 linhas
│   └── index.js       # Entry point React 18
├── public/
│   └── index.html     # HTML base com meta tags
├── package.json       # React 18, react-scripts 5.0.1
├── .env.example       # Template de variáveis de ambiente
├── .gitignore         # node_modules, .env, build/ ignorados
└── README.md          # Documentação completa com arquitetura e instruções
```

**Autenticação:** Personal Access Token GitHub fornecido pelo usuário (`ghp_...`).

**Commits realizados:**
```
0194a54  Initial commit (existia)
4168db3  feat: Meeting Intel — assistente estratégico de reuniões
ad804c2  fix: corrige erros de ESLint para build na Vercel
64c5fe9  fix: remove variável finished não utilizada
```

---

### v0.6 — Deploy na Vercel

**Pedido:** Deploy público via Vercel (Opção B).

**Processo:**
1. Usuário conectou GitHub na Vercel
2. Importou repositório `App_Assistente_Pessoal`
3. Deploy automático (Vercel detecta Create React App)

**Falhas e correções no build:**

**Build 1 — Falhou** (ESLint tratado como erro em CI):
```
Line 1:31:   'useCallback' defined but never used
Line 92:10:  'loadStep' assigned but never used
Line 101:39: useEffect missing dependency
Line 442:9:  'onlyBrief' assigned but never used
Line 454:17: 'done' assigned but never used
```
→ Correção: removidos imports e variáveis não utilizados, adicionado `eslint-disable`

**Build 2 — Falhou** (nova variável introduzida na correção):
```
Line 448:17: 'finished' assigned but never used
```
→ Correção: variável removida

**Build 3 — Sucesso ✅**

**Problema pós-deploy:** URL retornava 401 (Vercel Authentication ativa por padrão)  
→ Solução: desativar em Settings → Deployment Protection → Vercel Authentication

**URL final de produção:** https://app-assistente-pessoal-ik8w.vercel.app

---

## Arquitetura Final

```
┌─────────────────────────────────────────────────────────┐
│                    Meeting Intel                        │
│              app-assistente-pessoal-ik8w.vercel.app     │
└─────────────────┬───────────────────────────────────────┘
                  │
        ┌─────────▼──────────┐
        │   React 18 (SPA)   │
        │     App.jsx        │
        └──┬──────┬──────────┘
           │      │
    ┌──────▼──┐  ┌▼────────────────────────────┐
    │ Google  │  │      Anthropic API           │
    │Calendar │  │   claude-sonnet-4-20250514   │
    │  MCP    │  └──────┬──────────┬────────────┘
    └─────────┘         │          │
                  ┌─────▼───┐  ┌──▼──────┐
                  │  Gmail  │  │ Read AI │
                  │   MCP   │  │   API   │
                  └─────────┘  └─────────┘
```

**Fluxo por reunião:**
1. Seleção da reunião na agenda (Google Calendar MCP)
2. Busca paralela: Gmail MCP + Read AI API
3. Claude gera briefing estratégico com todo o contexto
4. Exibição com 8 seções + badges de fontes usadas

---

## Briefing — 8 Seções Geradas

| # | Seção | Descrição |
|---|-------|-----------|
| 1 | 💡 Insight Estratégico | Visão não-óbvia com olhar de empreendedor |
| 2 | ◎ Contexto | Histórico do relacionamento/negócio |
| 3 | ◉ Objetivo | O que fechar ou avançar nesta reunião |
| 4 | ○ Pendências em Aberto | Loops abertos de interações anteriores |
| 5 | ▶ Pontos de Discussão | Tópicos com ângulo estratégico |
| 6 | ? Perguntas a Fazer | Perguntas que avançam a agenda |
| 7 | ⚠ Atenção | Riscos e dinâmicas a observar |
| 8 | ► Próximo Passo | Ação concreta para propor ao final |

---

## Stack Técnica

| Componente | Tecnologia |
|-----------|-----------|
| Frontend | React 18 + Create React App |
| Linguagem | JavaScript (JSX) |
| Estilo | CSS-in-JS (inline styles) |
| Fontes | Google Fonts: Cormorant Garamond, Instrument Sans, JetBrains Mono |
| IA | Claude claude-sonnet-4-20250514 via Anthropic API |
| Calendário | Google Calendar MCP |
| E-mail | Gmail MCP |
| Reuniões | Read AI REST API v1 |
| Repositório | GitHub |
| Hospedagem | Vercel (plano gratuito) |

---

## Variáveis de Ambiente

```env
# Não necessário no frontend — a Anthropic API key é injetada pelo Claude.ai
# Read AI API Key (inserida pelo usuário na UI — não exposta no código)
```

---

## Próximas Evoluções Sugeridas

- [ ] Chat contextual com IA sobre reunião específica
- [ ] Exportar briefing como PDF
- [ ] Notificações push antes das reuniões
- [ ] Histórico de briefings gerados
- [ ] Integração com Notion/Obsidian para notas pós-reunião
- [ ] Modo mobile otimizado
- [ ] Suporte a múltiplos idiomas
