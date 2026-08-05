import { pool } from '../config/database';
import { LeadRecord } from './auditService';

export interface SendMessageResult {
  success: boolean;
  leadId: string;
  phone: string;
  whatsappResponse?: any;
  error?: string;
}

export class MessagingService {
  private apiUrl: string;
  private apiKey: string;
  private baseUrlDomain: string;

  constructor() {
    this.apiUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
    this.apiKey = process.env.EVOLUTION_API_KEY || '';
    this.baseUrlDomain = process.env.APP_BASE_URL || 'https://meusite.com';
  }

  /**
   * Formata e valida o número de telefone para o padrão internacional (E.164 sem +)
   */
  public formatPhoneNumber(phone: string | null | undefined): string {
    if (!phone) {
      throw new Error('Telefone não fornecido para o lead.');
    }

    let cleaned = phone.replace(/\D/g, '');

    if (!cleaned) {
      throw new Error('Número de telefone inválido após limpeza de caracteres.');
    }

    if ((cleaned.length === 10 || cleaned.length === 11) && !cleaned.startsWith('55')) {
      cleaned = `55${cleaned}`;
    }

    if (cleaned.length < 10 || cleaned.length > 15) {
      throw new Error(`Número de telefone ${phone} formatado (${cleaned}) possui tamanho inválido.`);
    }

    return cleaned;
  }

  /**
   * Envia a mensagem de prospecção via WhatsApp para um lead auditado
   */
  public async sendProspectMessage(leadId: string): Promise<SendMessageResult> {
    const querySelect = `SELECT * FROM leads WHERE id = $1;`;
    const resSelect = await pool.query(querySelect, [leadId]);

    if (resSelect.rowCount === 0) {
      throw new Error(`Lead com ID ${leadId} não encontrado no banco de dados.`);
    }

    const lead: LeadRecord = resSelect.rows[0];

    if (lead.status !== 'AUDITED') {
      throw new Error(`Lead ${leadId} está com status '${lead.status}'. O envio só é permitido para status 'AUDITED'.`);
    }

    if (!lead.audit_summary || !lead.audit_summary.teaser) {
      throw new Error(`Lead ${leadId} não possui o teaser gerado na auditoria em 'audit_summary'.`);
    }

    const formattedPhone = this.formatPhoneNumber(lead.phone);
    const landingPageUrl = `${this.baseUrlDomain.replace(/\/$/, '')}/d/${lead.id}`;
    const teaserText = lead.audit_summary.teaser;

    const messageText = `Olá! Vi o perfil do *${lead.name}* no Google Meu Negócio e identifiquei algumas oportunidades importantes para a sua empresa.\n\n` +
      `💡 *Diagnóstico Rápido:*\n"${teaserText}"\n\n` +
      `📌 Preparei uma análise detalhada e um plano de ação gratuito no link a seguir:\n${landingPageUrl}\n\n` +
      `Fico à disposição se quiser conversar sobre como aplicar essas melhorias!`;

    const apiResponse = await this.dispatchWhatsAppText(formattedPhone, messageText);

    const updateQuery = `
      UPDATE leads
      SET status = 'CONTACTED',
          updated_at = NOW()
      WHERE id = $1;
    `;
    await pool.query(updateQuery, [leadId]);

    return {
      success: true,
      leadId,
      phone: formattedPhone,
      whatsappResponse: apiResponse,
    };
  }

  /**
   * Envia o relatório completo (full_report) via WhatsApp após confirmação do pagamento
   */
  public async sendFullReportMessage(leadId: string): Promise<SendMessageResult> {
    const querySelect = `SELECT * FROM leads WHERE id = $1;`;
    const resSelect = await pool.query(querySelect, [leadId]);

    if (resSelect.rowCount === 0) {
      throw new Error(`Lead com ID ${leadId} não encontrado no banco de dados.`);
    }

    const lead: LeadRecord = resSelect.rows[0];
    const formattedPhone = this.formatPhoneNumber(lead.phone);

    const fullReport = lead.audit_summary?.full_report;
    const pdfUrl = lead.pdf_url;

    let fullReportText = `🎉 *Pagamento Confirmado com Sucesso!*\n\n` +
      `Aqui está o seu *Relatório Completo de Auditoria Digital* para *${lead.name}*:\n\n`;

    if (pdfUrl) {
      fullReportText += `📄 *Download do PDF Completo:* ${pdfUrl}\n\n`;
    }

    if (fullReport) {
      if (fullReport.action_plan_30_days && Array.isArray(fullReport.action_plan_30_days)) {
        fullReportText += `🚀 *Plano de Ação de 30 Dias:*\n` +
          fullReport.action_plan_30_days.map((step: string, idx: number) => `• ${step}`).join('\n') + `\n\n`;
      }

      if (fullReport.post_suggestions && Array.isArray(fullReport.post_suggestions)) {
        fullReportText += `📱 *Sugestões de Postagens para Redes Sociais:*\n` +
          fullReport.post_suggestions.map((post: string, idx: number) => `${idx + 1}. ${post}`).join('\n') + `\n\n`;
      }

      if (fullReport.negative_review_replies && Array.isArray(fullReport.negative_review_replies)) {
        fullReportText += `💬 *Respostas Prontas para Avaliações Negativas:*\n` +
          fullReport.negative_review_replies.map((reply: string, idx: number) => `${idx + 1}. "${reply}"`).join('\n\n') + `\n\n`;
      }
    } else {
      fullReportText += `Seu diagnóstico foi liberado com sucesso. Qualquer dúvida, estamos à disposição!`;
    }

    const apiResponse = await this.dispatchWhatsAppText(formattedPhone, fullReportText);

    return {
      success: true,
      leadId,
      phone: formattedPhone,
      whatsappResponse: apiResponse,
    };
  }

  /**
   * Envia mensagens em lote com delay anti-spam
   */
  public async sendBatchProspectMessages(targetLeadIds?: string[]): Promise<{
    processed: number;
    successful: number;
    failed: number;
    results: SendMessageResult[];
  }> {
    let leadIds = targetLeadIds;

    if (!leadIds || leadIds.length === 0) {
      const selectAudited = `SELECT id FROM leads WHERE status = 'AUDITED' ORDER BY created_at ASC;`;
      const resAudited = await pool.query(selectAudited);
      leadIds = resAudited.rows.map((row: any) => row.id);
    }

    const results: SendMessageResult[] = [];
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < leadIds.length; i++) {
      const currentLeadId = leadIds[i];

      try {
        const res = await this.sendProspectMessage(currentLeadId);
        results.push(res);
        successful++;
      } catch (err: any) {
        console.error(`Falha ao enviar mensagem para o lead ${currentLeadId}:`, err);
        results.push({
          success: false,
          leadId: currentLeadId,
          phone: '',
          error: err?.message || String(err),
        });
        failed++;
      }

      if (i < leadIds.length - 1) {
        const randomDelayMs = Math.floor(Math.random() * (45000 - 15000 + 1)) + 15000;
        console.log(`[Anti-Spam Delay] Aguardando ${(randomDelayMs / 1000).toFixed(1)}s antes do próximo envio...`);
        await this.sleep(randomDelayMs);
      }
    }

    return {
      processed: leadIds.length,
      successful,
      failed,
      results,
    };
  }

  private async dispatchWhatsAppText(phone: string, text: string): Promise<any> {
    if (!this.apiUrl || !this.apiKey) {
      console.warn('Aviso: EVOLUTION_API_URL ou EVOLUTION_API_KEY não configuradas. Simulando envio.');
      return { status: 'SIMULATED', message: 'Envio de mensagem simulado.' };
    }

    const endpoint = `${this.apiUrl}/message/sendText/default`;
    const resApi = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.apiKey,
      },
      body: JSON.stringify({
        number: phone,
        text,
      }),
    });

    if (!resApi.ok) {
      const errText = await resApi.text();
      throw new Error(`Erro ao enviar mensagem via Evolution API: ${resApi.status} - ${errText}`);
    }

    return await resApi.json();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
