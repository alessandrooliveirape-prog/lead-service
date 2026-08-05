import cron, { ScheduledTask } from 'node-cron';
import { pool } from '../config/database';
import { LeadScraperService } from './leadScraperService';
import { AuditService } from './auditService';
import { MessagingService } from './messagingService';
import { FollowupWorkerService } from './followupWorkerService';

export interface AutopilotStatus {
  isActive: boolean;
  isProcessingNow: boolean;
  cronExpression: string;
  lastRunTimestamp: string | null;
  lastRunSummary: any | null;
  targetMatrix: {
    cities: string[];
    niches: string[];
  };
}

export class AutomationPipelineService {
  private static instance: AutomationPipelineService;
  private scraperService: LeadScraperService;
  private auditService: AuditService;
  private messagingService: MessagingService;
  private followupWorkerService: FollowupWorkerService;

  private cronTask: ScheduledTask | null = null;
  private isActive: boolean = false;
  private isProcessingNow: boolean = false;
  private cronExpression: string = '0 9,14 * * 1-5'; // 09:00 e 14:00 de segunda a sexta
  private lastRunTimestamp: string | null = null;
  private lastRunSummary: any | null = null;

  public readonly cities = [
    'Recife',
    'Olinda',
    'Caruaru',
    'Petrolina',
    'Jaboatão dos Guararapes',
    'Cabo de Santo Agostinho',
    'Paulista',
  ];

  public readonly niches = [
    'Oficina Mecânica',
    'Clínica Odontológica',
    'Salão de Beleza',
    'Barbearia',
    'Pet Shop',
    'Restaurante',
    'Pizzaria',
    'Academia',
  ];

  private constructor() {
    this.scraperService = new LeadScraperService();
    this.auditService = new AuditService();
    this.messagingService = new MessagingService();
    this.followupWorkerService = new FollowupWorkerService();
  }


  public static getInstance(): AutomationPipelineService {
    if (!AutomationPipelineService.instance) {
      AutomationPipelineService.instance = new AutomationPipelineService();
    }
    return AutomationPipelineService.instance;
  }

  /**
   * Executa um ciclo completo do Piloto Automático:
   * 1. Scrape no Google Places (Nicho x Cidade) -> Status DISCOVERED
   * 2. Auditoria IA + Geração de PDF para todos os leads DISCOVERED -> Status AUDITED
   * 3. Disparo no WhatsApp com delay anti-spam para todos os leads AUDITED -> Status CONTACTED
   */
  public async runFullAutopilotCycle(customNicho?: string, customCidade?: string): Promise<any> {
    if (this.isProcessingNow) {
      throw new Error('O robô já está executando um ciclo de prospecção no momento.');
    }

    this.isProcessingNow = true;
    const startTime = Date.now();

    // Seleciona nicho e cidade aleatórios se não forem especificados
    const nicho = customNicho || this.niches[Math.floor(Math.random() * this.niches.length)];
    const cidade = customCidade || this.cities[Math.floor(Math.random() * this.cities.length)];

    console.log(`\n======================================================`);
    console.log(`🤖 [PILOTO AUTOMÁTICO INICIADO] Nicho: "${nicho}" | Cidade: "${cidade}"`);
    console.log(`======================================================\n`);

    const summary: any = {
      nicho,
      cidade,
      startTime: new Date().toISOString(),
      scraping: null,
      auditsCompleted: 0,
      auditErrors: 0,
      whatsappBatch: null,
      durationSeconds: 0,
    };

    try {
      // ----------------------------------------------------
      // PASSO 1: Scraping e filtragem de Oportunidades
      // ----------------------------------------------------
      console.log(`📍 ETAPA 1/3: Buscando e filtrando empresas no Google Places...`);
      try {
        const scrapeRes = await this.scraperService.searchAndStoreLeads(nicho, cidade);
        summary.scraping = {
          totalEncontrados: scrapeRes.totalFound,
          totalElegiveis: scrapeRes.totalEligible,
          totalSalvos: scrapeRes.totalSaved,
        };
        console.log(`✅ ETAPA 1 CONCLUÍDA: ${scrapeRes.totalSaved} novos leads salvos com status DISCOVERED.`);
      } catch (err: any) {
        console.error('⚠️ Falha na etapa de Scraping:', err?.message || err);
        summary.scraping = { error: err?.message || String(err) };
      }

      // ----------------------------------------------------
      // PASSO 2: Auditoria em Lote por IA + PDF (Leads DISCOVERED)
      // ----------------------------------------------------
      console.log(`\n🧠 ETAPA 2/3: Processando auditorias por IA (Gemini/OpenAI) e relatórios PDF...`);
      const selectDiscovered = `SELECT id, name FROM leads WHERE status = 'DISCOVERED' ORDER BY created_at ASC LIMIT 10;`;
      const resDiscovered = await pool.query(selectDiscovered);
      const discoveredLeads = resDiscovered.rows;

      console.log(`Encontrados ${discoveredLeads.length} leads no banco aguardando auditoria.`);

      for (const lead of discoveredLeads) {
        try {
          console.log(`   └─ Auditando e gerando PDF para: ${lead.name} (${lead.id})...`);
          await this.auditService.auditLeadById(lead.id);
          summary.auditsCompleted++;
        } catch (err: any) {
          console.error(`   ⚠️ Erro ao auditar lead ${lead.id}:`, err?.message || err);
          summary.auditErrors++;
        }
      }
      console.log(`✅ ETAPA 2 CONCLUÍDA: ${summary.auditsCompleted} auditorias realizadas e com status AUDITED.`);

      // ----------------------------------------------------
      // PASSO 3: Disparo de Mensagens no WhatsApp (Leads AUDITED)
      // ----------------------------------------------------
      console.log(`\n📲 ETAPA 3/4: Enviando abordagens de prospecção via WhatsApp com delay anti-spam...`);
      const selectAudited = `SELECT id FROM leads WHERE status = 'AUDITED' ORDER BY created_at ASC LIMIT 5;`;
      const resAudited = await pool.query(selectAudited);
      const auditedLeadIds = resAudited.rows.map((r: any) => r.id);

      if (auditedLeadIds.length > 0) {
        const batchRes = await this.messagingService.sendBatchProspectMessages(auditedLeadIds);
        summary.whatsappBatch = {
          processados: batchRes.processed,
          sucessos: batchRes.successful,
          falhas: batchRes.failed,
        };
        console.log(`✅ ETAPA 3 CONCLUÍDA: ${batchRes.successful} mensagens enviadas e atualizadas para CONTACTED.`);
      } else {
        console.log(`ℹ️ Nenhum lead com status AUDITED disponível para envio imediato.`);
        summary.whatsappBatch = { processados: 0, sucessos: 0, falhas: 0 };
      }

      // ----------------------------------------------------
      // PASSO 4: Sequência de Follow-up de Lembrete (Leads CONTACTED há >48h)
      // ----------------------------------------------------
      console.log(`\n🔔 ETAPA 4/4: Executando sequência de follow-up (lembrete) para leads contatados...`);
      try {
        const followupRes = await this.followupWorkerService.runFollowupSequence(48);
        summary.followup = {
          processados: followupRes.processed,
          sucessos: followupRes.successful,
          falhas: followupRes.failed,
        };
        console.log(`✅ ETAPA 4 CONCLUÍDA: ${followupRes.successful} lembretes de follow-up enviados.`);
      } catch (errFollow: any) {
        console.error('⚠️ Falha na etapa de Follow-up:', errFollow?.message || errFollow);
        summary.followup = { error: errFollow?.message || String(errFollow) };
      }

    } catch (globalErr: any) {
      console.error('❌ Erro crítico na execução do Piloto Automático:', globalErr);
      summary.globalError = globalErr?.message || String(globalErr);
    }
 finally {
      summary.durationSeconds = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));
      this.lastRunTimestamp = new Date().toISOString();
      this.lastRunSummary = summary;
      this.isProcessingNow = false;

      console.log(`\n======================================================`);
      console.log(`🏁 [PILOTO AUTOMÁTICO CONCLUÍDO] Duração: ${summary.durationSeconds}s`);
      console.log(`======================================================\n`);
    }

    return summary;
  }

  /**
   * Inicia o agendamento por Cron
   */
  public startScheduler(cronExpr?: string): boolean {
    if (cronExpr) {
      this.cronExpression = cronExpr;
    }

    if (this.cronTask) {
      this.cronTask.stop();
    }

    this.cronTask = cron.schedule(this.cronExpression, async () => {
      console.log(`[Cron Trigger] Iniciando execução agendada do Piloto Automático (${this.cronExpression})...`);
      try {
        await this.runFullAutopilotCycle();
      } catch (err) {
        console.error('Erro na chamada do Cron do Piloto Automático:', err);
      }
    });

    this.isActive = true;
    console.log(`🤖 Agendador do Piloto Automático ATIVADO! Cron: "${this.cronExpression}"`);
    return true;
  }

  /**
   * Para o agendamento por Cron
   */
  public stopScheduler(): boolean {
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
    }
    this.isActive = false;
    console.log(`🛑 Agendador do Piloto Automático PAUSADO.`);
    return true;
  }

  /**
   * Retorna o status atual do serviço
   */
  public getStatus(): AutopilotStatus {
    return {
      isActive: this.isActive,
      isProcessingNow: this.isProcessingNow,
      cronExpression: this.cronExpression,
      lastRunTimestamp: this.lastRunTimestamp,
      lastRunSummary: this.lastRunSummary,
      targetMatrix: {
        cities: this.cities,
        niches: this.niches,
      },
    };
  }
}
