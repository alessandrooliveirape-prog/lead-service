# ⚡ Lead Service - Funil Autônomo de Vendas & Diagnóstico Digital via IA

> Sistema 100% autônomo para **Prospecção de Estabelecimentos Locais**, **Auditoria Consultiva via Inteligência Artificial**, **Disparo de Abordagens no WhatsApp**, **Venda de Relatórios Estratégicos via PIX** e **Monitoramento em Tempo Real via Dashboard Admin**.

---

## 📌 Arquitetura do Sistema

```mermaid
flowchart TD
    A[Agendador Autônomo / Cron Job 24/7] -->|Execução Automática| B[Google Places API]
    B -->|1. Scraper & Filtros| C[(Database PostgreSQL/Supabase)]
    C -->|Status: DISCOVERED| D[LLM Service - Gemini / OpenAI]
    D -->|2. Diagnóstico & PDF| C
    C -->|Status: AUDITED| E[WhatsApp Service - Evolution API]
    E -->|3. Abordagem com Teaser & Link| F[Cliente / Proprietário do Negócio]
    
    C -->|Status: CONTACTED há +48h| G[Follow-up Worker Service]
    G -->|4. Lembrete no WhatsApp| F
    
    F -->|5. Acessa /d/:leadId & Paga R$ 47 PIX| H[Mercado Pago API]
    H -->|6. Webhook Approved| C
    C -->|Status: PAID| E
    E -->|7. Relatório PDF enviado| F
    
    SubGraphAuth[Login Gestor JWT] -->|Autenticado| I[Dashboard SPA React + Tailwind]
    I -->|Requer Bearer Token| C
```

---

## 🚀 Principais Recursos

- 📍 **Google Places Scraper**: Busca de empresas locais por cidade e nicho com filtro de oportunidade (sem site, rating < 4.3 ou poucas avaliações).
- 🧠 **Auditoria Consultiva via IA**: Geração de teasers de alta conversão e relatórios completos por LLM (Gemini 2.5 Flash / OpenAI gpt-4o-mini).
- 📄 **Gerador de PDF Profissional**: Criação automatizada de PDFs visuais (`public/reports/:leadId.pdf`) utilizando `jsPDF`.
- 📲 **Automação no WhatsApp**: Integração com a Evolution API contendo trava de segurança anti-spam (delays aleatórios de 15 a 45s por envio).
- 🔔 **Follow-up Automático 48h**: Re-engajamento automatizado de leads contatados que ainda não efetuaram a compra.
- 💳 **Checkout PIX em Tempo Real**: Geração de PIX (Mercado Pago R$ 47,00) com QR Code Base64, código "Copia e Cola" e polling de status a cada 3s na Landing Page.
- 🤖 **Piloto Automático 24/7**: Execução autônoma em 4 etapas cruzando matriz de cidades de Pernambuco x nichos de alta demanda via Cron Jobs.
- 📊 **Dashboard Administrativo SPA**: Interface Dark Mode responsiva em React + Tailwind CSS com 6 cards de KPI, gráficos de faturamento e tabela interativa de leads.
- 🔒 **Segurança JWT**: Proteção de rotas administrativas com autenticação Bearer Token e isolamento 100% aberto para as páginas públicas dos clientes.

---

## 🛠️ Tecnologias Utilizadas

- **Backend**: Node.js, TypeScript, Express, PostgreSQL / Supabase, `pg` Pool, Prisma ORM, `node-cron`.
- **Inteligência Artificial**: API do Google Gemini / OpenAI.
- **Mensageria & Integrações**: Evolution API (WhatsApp), Mercado Pago API (PIX Webhook).
- **Geração de Documentos**: `jsPDF`.
- **Frontend / Dashboard**: React 18, Tailwind CSS, FontAwesome, SPA com polling em tempo real.
- **DevOps**: PM2 Process Manager (`ecosystem.config.js`).

---

## 📋 Variáveis de Ambiente (`.env`)

Crie um arquivo `.env` na raiz do diretório `lead-service` com as credenciais abaixo:

```env
PORT=3000

# Google Places API
GOOGLE_PLACES_API_KEY=sua_chave_google_places

# LLM Keys (Gemini ou OpenAI)
GEMINI_API_KEY=sua_chave_gemini
OPENAI_API_KEY=sua_chave_openai

# WhatsApp Evolution API
EVOLUTION_API_URL=https://sua-evolution-api.com
EVOLUTION_API_KEY=sua_chave_evolution

# Mercado Pago PIX
MERCADOPAGO_ACCESS_TOKEN=seu_access_token_mercadopago

# Banco de Dados (PostgreSQL / Supabase)
DATABASE_URL=postgresql://postgres:senha@localhost:5432/leads_db

# Domínio Base da Aplicação
APP_BASE_URL=https://seudominio.com.br

# Autenticação Administrativa
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
JWT_SECRET=super_secret_jwt_key_lead_service_2026

# Iniciar Piloto Automático no boot (opcional)
AUTOPILOT_AUTOSTART=true
```

---

## ⚡ Instalação e Execução Local

```bash
# 1. Entre no diretório do microsserviço
cd lead-service

# 2. Instale as dependências
npm install

# 3. Crie a estrutura de tabelas no PostgreSQL/Supabase (schema.sql)
psql $DATABASE_URL -f schema.sql

# 4. Inicie o servidor em modo de desenvolvimento (watch mode)
npm run dev
```

---

## 🌐 Endpoints da API

### Rotas Públicas (Clientes & Integradores)

| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `GET` | `/health` | Teste de saúde e ping no banco de dados. |
| `GET` | `/login` | Tela de Login do Administrador. |
| `POST` | `/api/auth/login` | Autenticação do gestor (retorna JWT). |
| `GET` | `/d/:leadId` | Landing Page de Vendas do Cliente. |
| `GET` | `/reports/:file.pdf` | Download dos relatórios em PDF. |
| `GET` | `/api/public/lead/:leadId` | Dados públicos do lead e teaser para a Landing Page. |
| `GET` | `/api/public/payment-status/:leadId` | Polling em tempo real do status do pagamento. |
| `POST` | `/api/payment/create-pix` | Geração de cobrança PIX no Mercado Pago (R$ 47,00). |
| `POST` | `/api/webhooks/mercadopago` | Webhook de confirmação de pagamento. |

### Rotas Protegidas (Requer Header `Authorization: Bearer <token>`)

| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `GET` | `/` | Dashboard Administrativo SPA. |
| `GET` | `/api/auth/me` | Dados do usuário autenticado. |
| `GET` | `/api/leads/stats` | Métricas agregadas de KPIs, conversão e faturamento. |
| `GET` | `/api/leads` | Consulta paginada com filtros e busca. |
| `GET` | `/api/automation/status` | Status do Piloto Automático (Ativo/Inativo/Processando). |
| `POST` | `/api/automation/start` | Ativa o agendamento Cron 24/7. |
| `POST` | `/api/automation/stop` | Pausa o agendamento Cron 24/7. |
| `POST` | `/api/automation/run-now` | Executa um ciclo completo do robô imediatamente. |
| `GET` | `/api/scraper/run` | Dispara raspagem manual por `nicho` e `cidade`. |
| `POST` | `/api/audit/:leadId` | Executa auditoria consultiva via IA e gera o PDF. |
| `POST` | `/api/messaging/send/:leadId` | Disparo individual no WhatsApp. |
| `POST` | `/api/messaging/send-batch` | Disparo em lote no WhatsApp com delay anti-spam. |

---

## 🖥️ Implantação em Produção na VPS (PM2)

```bash
# 1. Gere o build do TypeScript
npm run build

# 2. Inicie a aplicação via PM2 Process Manager
pm2 start ecosystem.config.js

# 3. Salva o estado do PM2 para inicialização automática no reboot do servidor
pm2 save
```

---

## 📜 Licença

Propriedade exclusiva - **Emprega PE / Lead Service 2026**.
