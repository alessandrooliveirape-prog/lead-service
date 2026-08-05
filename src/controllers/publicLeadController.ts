import { Request, Response } from 'express';
import { pool } from '../config/database';

export async function getPublicLeadHandler(req: Request, res: Response): Promise<void> {
  try {
    const { leadId } = req.params;

    if (!leadId) {
      res.status(400).json({ error: 'leadId é obrigatório.' });
      return;
    }

    const query = `SELECT id, name, address, rating, user_ratings_total, status, audit_summary, pdf_url FROM leads WHERE id = $1;`;
    const result = await pool.query(query, [leadId]);

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Empresa não encontrada.' });
      return;
    }

    const lead = result.rows[0];

    // Se ainda não estiver pago, oculta o full_report para proteger o valor
    const isPaid = lead.status === 'PAID';
    const teaser = lead.audit_summary?.teaser || null;
    const fullReport = isPaid ? lead.audit_summary?.full_report : null;

    res.status(200).json({
      id: lead.id,
      name: lead.name,
      address: lead.address,
      rating: lead.rating,
      userRatingsTotal: lead.user_ratings_total,
      status: lead.status,
      teaser,
      fullReport,
      pdfUrl: isPaid ? lead.pdf_url : null,
      isPaid,
    });
  } catch (error: any) {
    console.error('Erro no getPublicLeadHandler:', error);
    res.status(500).json({ error: 'Erro interno ao buscar informações da empresa.' });
  }
}

export async function checkPublicPaymentStatusHandler(req: Request, res: Response): Promise<void> {
  try {
    const { leadId } = req.params;

    if (!leadId) {
      res.status(400).json({ error: 'leadId é obrigatório.' });
      return;
    }

    const query = `SELECT id, status, pdf_url, audit_summary FROM leads WHERE id = $1;`;
    const result = await pool.query(query, [leadId]);

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Empresa não encontrada.' });
      return;
    }

    const lead = result.rows[0];
    const isPaid = lead.status === 'PAID';

    res.status(200).json({
      leadId: lead.id,
      status: lead.status,
      isPaid,
      pdfUrl: isPaid ? lead.pdf_url : null,
      fullReport: isPaid ? lead.audit_summary?.full_report : null,
    });
  } catch (error: any) {
    console.error('Erro no checkPublicPaymentStatusHandler:', error);
    res.status(500).json({ error: 'Erro interno ao checar status do pagamento.' });
  }
}
