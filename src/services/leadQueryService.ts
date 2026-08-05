import { pool } from '../config/database';
import { LeadRecord } from './auditService';

export interface LeadStats {
  totalLeads: number;
  auditedLeads: number;
  contactedLeads: number;
  paidLeads: number;
  conversionRate: number;
  totalRevenue: number;
}

export interface PaginatedLeads {
  leads: LeadRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class LeadQueryService {
  /**
   * Calcula as métricas agregadas do funil de vendas
   */
  public async getStats(): Promise<LeadStats> {
    const query = `
      SELECT 
        COUNT(*) AS total_leads,
        COUNT(*) FILTER (WHERE status = 'AUDITED') AS audited_leads,
        COUNT(*) FILTER (WHERE status = 'CONTACTED') AS contacted_leads,
        COUNT(*) FILTER (WHERE status = 'PAID') AS paid_leads
      FROM leads;
    `;

    const res = await pool.query(query);
    const row = res.rows[0];

    const totalLeads = parseInt(row.total_leads || '0', 10);
    const auditedLeads = parseInt(row.audited_leads || '0', 10);
    const contactedLeads = parseInt(row.contacted_leads || '0', 10);
    const paidLeads = parseInt(row.paid_leads || '0', 10);

    const conversionRate = contactedLeads > 0 ? (paidLeads / contactedLeads) * 100 : 0;
    const totalRevenue = paidLeads * 47.00;

    return {
      totalLeads,
      auditedLeads,
      contactedLeads,
      paidLeads,
      conversionRate: parseFloat(conversionRate.toFixed(2)),
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    };
  }

  /**
   * Busca lista paginada de leads com suporte a filtros
   */
  public async getLeads(params: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  }): Promise<PaginatedLeads> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 15));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (params.status && params.status !== 'ALL') {
      conditions.push(`status = $${paramIndex}`);
      values.push(params.status.toUpperCase());
      paramIndex++;
    }

    if (params.search && params.search.trim() !== '') {
      conditions.push(`(name ILIKE $${paramIndex} OR address ILIKE $${paramIndex} OR phone ILIKE $${paramIndex})`);
      values.push(`%${params.search.trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) FROM leads ${whereClause};`;
    const countRes = await pool.query(countQuery, values);
    const total = parseInt(countRes.rows[0].count || '0', 10);

    const dataQuery = `
      SELECT * FROM leads
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
    `;

    const dataValues = [...values, limit, offset];
    const dataRes = await pool.query(dataQuery, dataValues);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      leads: dataRes.rows,
      total,
      page,
      limit,
      totalPages,
    };
  }
}
