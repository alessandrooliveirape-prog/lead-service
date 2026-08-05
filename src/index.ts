import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { checkDatabaseConnection } from './config/database';
import { runScraperHandler } from './controllers/leadScraperController';
import { auditLeadHandler } from './controllers/auditController';
import { sendMessageHandler, sendBatchHandler } from './controllers/messagingController';
import { createPixHandler, webHookHandler } from './controllers/paymentController';
import { getLeadsHandler, getStatsHandler } from './controllers/leadController';
import { getPublicLeadHandler, checkPublicPaymentStatusHandler } from './controllers/publicLeadController';
import { 
  getAutomationStatusHandler, 
  startAutomationHandler, 
  stopAutomationHandler, 
  runAutopilotNowHandler 
} from './controllers/automationController';
import { loginHandler, getMeHandler } from './controllers/authController';
import { requireAdminAuth } from './middlewares/authMiddleware';
import { AutomationPipelineService } from './services/automationPipelineService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Servir arquivos estáticos (Dashboard e relatórios PDF)
app.use(express.static(path.join(__dirname, '../public')));
app.use('/reports', express.static(path.join(__dirname, '../public/reports')));

// Rota para a Tela de Login do Administrador
app.get('/login', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Rota dinâmica para a Landing Page do Cliente (/d/:leadId)
app.get('/d/:leadId', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/landing.html'));
});

// Endpoints PÚBLICOS (Sem autenticação)
app.post('/api/auth/login', loginHandler);
app.get('/api/public/lead/:leadId', getPublicLeadHandler);
app.get('/api/public/payment-status/:leadId', checkPublicPaymentStatusHandler);
app.post('/api/payment/create-pix', createPixHandler);
app.post('/api/webhooks/mercadopago', webHookHandler);

// Endpoint de Healthcheck
app.get('/health', async (_req: Request, res: Response) => {
  const dbHealth = await checkDatabaseConnection();

  const status = dbHealth.connected ? 'ok' : 'degraded';
  const statusCode = dbHealth.connected ? 200 : 503;

  res.status(statusCode).json({
    status,
    timestamp: new Date().toISOString(),
    service: 'lead-service',
    database: {
      connected: dbHealth.connected,
      error: dbHealth.message || null,
    },
  });
});

// ========================================================
// ROTAS PROTEGIDAS (Exigem autenticação via JWT Admin)
// ========================================================
app.use('/api/leads', requireAdminAuth);
app.use('/api/automation', requireAdminAuth);
app.use('/api/scraper', requireAdminAuth);
app.use('/api/audit', requireAdminAuth);
app.use('/api/messaging', requireAdminAuth);

app.get('/api/auth/me', requireAdminAuth, getMeHandler);

// Endpoints de Consulta de Leads e Métricas do Dashboard
app.get('/api/leads', getLeadsHandler);
app.get('/api/leads/stats', getStatsHandler);

// Endpoints do Piloto Automático 24/7
app.get('/api/automation/status', getAutomationStatusHandler);
app.post('/api/automation/start', startAutomationHandler);
app.post('/api/automation/stop', stopAutomationHandler);
app.post('/api/automation/run-now', runAutopilotNowHandler);

// Endpoint para disparar raspagem no Google Places
app.get('/api/scraper/run', runScraperHandler);

// Endpoint para gerar auditoria de um Lead via LLM
app.post('/api/audit/:leadId', auditLeadHandler);

// Endpoints para disparo de prospecção via WhatsApp (Evolution API)
app.post('/api/messaging/send/:leadId', sendMessageHandler);
app.post('/api/messaging/send-batch', sendBatchHandler);

// Inicialização opcional do Piloto Automático se AUTOPILOT_AUTOSTART=true no .env
if (process.env.AUTOPILOT_AUTOSTART === 'true') {
  AutomationPipelineService.getInstance().startScheduler();
}








app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando com sucesso na porta ${PORT}`);
  console.log(`📍 Endpoint de saúde: http://localhost:${PORT}/health`);
});
