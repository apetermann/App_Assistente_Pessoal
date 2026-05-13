# 🧠 Meeting Intel — Assistente Estratégico de Reuniões

Assistente executivo pessoal com IA que analisa sua agenda, busca histórico de reuniões (Read AI) e e-mails (Gmail) para gerar briefings estratégicos antes de cada reunião.

---

## ✨ Funcionalidades

- **📅 Google Calendar** — Agenda do dia, amanhã e semana sincronizada em tempo real
- **✉️ Gmail** — Busca automática de e-mails relevantes dos participantes (últimos 90 dias)
- **◈ Read AI** — Histórico de reuniões passadas, resumos, action items e insights
- **🤖 Claude AI** — Briefing estratégico com visão de empreendedor, executor e estrategista

### O briefing inclui:
| Seção | Descrição |
|-------|-----------|
| 💡 Insight Estratégico | Visão não-óbvia sobre a reunião ou relação |
| ◎ Contexto | Onde está o relacionamento/negócio |
| ◉ Objetivo | O que fechar ou avançar nesta reunião |
| ○ Pendências | Loops abertos de interações anteriores |
| ▶ Pontos de Discussão | Tópicos com ângulo estratégico |
| ? Perguntas a Fazer | Perguntas que avançam sua agenda |
| ⚠ Atenção | Riscos e dinâmicas a observar |
| ► Próximo Passo | Ação concreta para fechar ao final |

---

## 🚀 Como rodar localmente

### Pré-requisitos
- Node.js 18+
- npm ou yarn
- Conta Anthropic com acesso ao Claude API
- Google Calendar e Gmail conectados via Claude.ai (MCP)

### Instalação

```bash
# 1. Clone o repositório
git clone https://github.com/apetermann/App_Assistente_Pessoal.git
cd App_Assistente_Pessoal

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com sua Anthropic API Key

# 4. Inicie o app
npm start
```

O app abre em `http://localhost:3000`.

---

## ⚙️ Configuração

### Anthropic API (obrigatório)
Obtenha sua key em [console.anthropic.com](https://console.anthropic.com) e adicione ao `.env`:
```
REACT_APP_ANTHROPIC_API_KEY=sk-ant-...
```

### Google Calendar & Gmail (automático)
Conectados automaticamente via Claude.ai MCP — nenhuma configuração adicional necessária.

### Read AI (opcional)
Para habilitar histórico de reuniões, clique em **⚙ Configurar** no app e cole sua API Key do Read AI (`app.read.ai → Settings → API`).

> **Nota CORS:** A API do Read AI pode não aceitar requisições diretas do browser. Nesse caso, o app funciona normalmente com Gmail + Calendar e Claude gera briefings igualmente ricos.

---

## 🏗️ Arquitetura

```
src/
└── App.jsx          # App completo (React + todas as integrações)

public/
└── index.html       # Entry point HTML
```

### Stack
- **Frontend:** React 18
- **IA:** Claude claude-sonnet-4-20250514 (Anthropic API)
- **Integrações MCP:** Google Calendar, Gmail
- **API externa:** Read AI REST API

### Fluxo de dados por reunião
```
Clique na reunião
       │
       ├─── Read AI API ──────┐
       │    (reuniões passadas) │
       │                       ├──► Claude gera Briefing Estratégico
       └─── Gmail MCP ─────────┘
            (e-mails relevantes)
```

---

## 📝 Licença

Uso pessoal. Todos os direitos reservados.
