import { pool } from '../config/database';
import { MessagingService } from './messagingService';
import { LeadRecord } from './auditService';

export class FollowupWorkerService {
  private messagingService: MessagingService;
  private baseUrlDomain: string;

  constructor() {
    this.messagingService = new MessagingService();
    this.baseUrlDomain = process.env.APP_BASE_URL || 'https://meusite.com';
  }

  /**
   * Executa a sequência de acompanhamento (follow-up) para leads contatados há mais de 48h
   */
  public async runFollowupSequence(hoursThreshold: number = 48): Promise<{
    processed: number;
    successful: number;
    failed: number;
    details: any[];
  }> {
    console.log(`\n🔔 [FOLLOW-UP WORKER] Verificando leads com status CONTACTED há mais de ${hoursThreshold}h...`);

    // Busca leads com status 'CONTACTED' e atualização anterior a 48h (ou 0h em modo de teste manual)
    const selectQuery = `
      SELECT * FROM leads
      WHERE status = 'CONTACTED'
        AND updated_at <= NOW() - ($1 || ' hours')::INTERVAL
      ORDER BY updated_at ASC
      LIMIT 10;
    `;

    const resLeads = await pool.query(selectQuery, [hoursThreshold]);
    const leadsToFollowUp: LeadRecord[] = resLeads.rows;

    if (leadsToFollowUp.length === 0) {
      console.log(`ℹ️ Nenhum lead elegível para follow-up no momento.`);
      return { processed: 0, successful: 0, failed: 0, details: [] };
    }

    console.log(`Encontrados ${leadsToFollowUp.length} leads elegíveis para mensagem de lembrete.`);

    const details: any[] = [];
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < leadsToFollowUp.length; i++) {
      const lead = leadsToFollowUp[i];

      try {
        const formattedPhone = this.messagingService.formatPhoneNumber(lead.phone);
        const landingPageUrl = `${this.baseUrlDomain.replace(/\/$/, '')}/d/${lead.id}`;

        const messageText = `Olá! Passando rápido para te avisar que o relatório de diagnóstico digital do *${lead.name}* está disponível por tempo limitado.\n\n` +
          `📌 Você pode conferir o plano de 30 dias e as oportunidades da sua empresa aqui:\n${landingPageUrl}\n\n` +
          `Se tiver alguma dúvida sobre a aplicação das melhorias, fico à disposição! 😊`;

        console.log(`   └─ Enviando lembrete de follow-up para: ${lead.name} (${formattedPhone})...`);

        // Dispara a mensagem de WhatsApp via MessagingService (dispatch privado ou chamada HTTP)
        const sendRes = await (this.messagingService as any).dispatchWhatsAppText(formattedPhone, messageText);

        // Atualiza o status do lead no banco para 'FOLLOWED_UP'
        const updateQuery = `
          UPDATE leads
          SET status = 'FOLLOWED_UP',
              updated_at = NOW()
          WHERE id = $1;
        `;
        await pool.query(updateQuery, [lead.id]);

        successful++;
        details.push({ success: true, leadId: lead.id, name: lead.name, response: sendRes });

      } catch (err: any) {
        console.error(`   ⚠️ Falha no follow-up do lead ${lead.id}:`, err?.message || err);
        failed++;
        details.push({ success: false, leadId: lead.id, name: lead.name, error: err?.message || String(err) });
      }

      // Delay aleatório anti-spam entre 15 e 45 segundos
      if (i < leadsToFollowUp.length - 1) {
        const randomDelayMs = Math.floor(Math.random() * (45000 - 15000 + 1)) + 15000;
        console.log(`[Anti-Spam Follow-up Delay] Aguardando ${(randomDelayMs / 1000).toFixed(1)}s...`);
        await this.sleep(randomDelayMs);
      }
    }

    return {
      processed: leadsToFollowUp.length,
      successful,
      failed,
      details,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
