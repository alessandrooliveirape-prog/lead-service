import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';
import { pool } from '../config/database';
import { LeadRecord } from './auditService';

export class PdfService {
  private reportsDir: string;
  private baseUrlDomain: string;

  constructor() {
    this.reportsDir = path.join(__dirname, '../../public/reports');
    this.baseUrlDomain = process.env.APP_BASE_URL || 'https://meusite.com';
    
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  /**
   * Gera o PDF completo do relatório e salva em public/reports/:leadId.pdf
   */
  public async generateLeadPdf(leadId: string): Promise<string> {
    const selectQuery = `SELECT * FROM leads WHERE id = $1;`;
    const res = await pool.query(selectQuery, [leadId]);

    if (res.rowCount === 0) {
      throw new Error(`Lead ${leadId} não encontrado para geração de PDF.`);
    }

    const lead: LeadRecord = res.rows[0];
    const fullReport = lead.audit_summary?.full_report;

    const doc = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;

    // Header / Branding
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(34, 197, 94); // emerald-500
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('AUDITORIA DIGITAL & PLANO DE AÇÃO', 14, 18);

    doc.setTextColor(248, 250, 252); // slate-50
    doc.setFontSize(14);
    doc.text(`Empresa: ${lead.name}`, 14, 28);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} | Avaliação Google: ${lead.rating || 'N/A'} (${lead.user_ratings_total || 0} avaliações)`, 14, 34);

    y = 50;

    // Teaser / Resumo Executivo
    if (lead.audit_summary?.teaser) {
      doc.setFillColor(241, 245, 249); // slate-100
      doc.roundedRect(14, y, pageWidth - 28, 25, 3, 3, 'F');

      doc.setTextColor(30, 41, 59); // slate-800
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMO DO DIAGNÓSTICO:', 18, y + 8);

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      const splitTeaser = doc.splitTextToSize(`"${lead.audit_summary.teaser}"`, pageWidth - 36);
      doc.text(splitTeaser, 18, y + 14);

      y += 32;
    }

    // Seção 1: Plano de Ação de 30 Dias
    if (fullReport?.action_plan_30_days && Array.isArray(fullReport.action_plan_30_days)) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('1. PLANO DE AÇÃO DE 30 DIAS', 14, y);
      y += 6;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);

      fullReport.action_plan_30_days.forEach((item: string, idx: number) => {
        const itemText = `${idx + 1}. ${item}`;
        const splitItem = doc.splitTextToSize(itemText, pageWidth - 28);
        doc.text(splitItem, 14, y);
        y += (splitItem.length * 5) + 2;
      });

      y += 6;
    }

    // Seção 2: Sugestões de Postagens
    if (fullReport?.post_suggestions && Array.isArray(fullReport.post_suggestions)) {
      if (y > 230) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('2. SUGESTÕES DE POSTAGENS LOCAIS', 14, y);
      y += 6;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);

      fullReport.post_suggestions.forEach((post: string, idx: number) => {
        const postText = `• Sugestão ${idx + 1}: ${post}`;
        const splitPost = doc.splitTextToSize(postText, pageWidth - 28);
        doc.text(splitPost, 14, y);
        y += (splitPost.length * 5) + 2;
      });

      y += 6;
    }

    // Seção 3: Respostas para Avaliações Negativas
    if (fullReport?.negative_review_replies && Array.isArray(fullReport.negative_review_replies)) {
      if (y > 220) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('3. SCRIPTS DE RESPOSTA A REVIEWS NEGATIVAS', 14, y);
      y += 6;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);

      fullReport.negative_review_replies.forEach((reply: string, idx: number) => {
        const replyText = `Modelo ${idx + 1}: "${reply}"`;
        const splitReply = doc.splitTextToSize(replyText, pageWidth - 28);
        doc.text(splitReply, 14, y);
        y += (splitReply.length * 5) + 3;
      });
    }

    // Salva o PDF fisicamente em public/reports/:leadId.pdf
    const fileName = `${leadId}.pdf`;
    const filePath = path.join(this.reportsDir, fileName);
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    fs.writeFileSync(filePath, pdfBuffer);

    const pdfUrl = `${this.baseUrlDomain.replace(/\/$/, '')}/reports/${fileName}`;

    // Atualiza a URL do PDF no banco de dados
    const updateQuery = `UPDATE leads SET pdf_url = $1, updated_at = NOW() WHERE id = $2;`;
    await pool.query(updateQuery, [pdfUrl, leadId]);

    return pdfUrl;
  }
}
