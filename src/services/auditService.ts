import { pool } from '../config/database';
import { PdfService } from './pdfService';

export interface AuditOutput {
  teaser: string;
  full_report: {
    action_plan_30_days: string[];
    post_suggestions: string[];
    negative_review_replies: string[];
  };
}

export interface LeadRecord {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  rating?: number;
  user_ratings_total?: number;
  place_id: string;
  status: string;
  audit_summary?: any;
  pdf_url?: string;
  created_at: Date;
  updated_at: Date;
}

export class AuditService {
  private geminiKey: string;
  private openaiKey: string;
  private pdfService: PdfService;

  constructor() {
    this.geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_PLACES_API_KEY || '';
    this.openaiKey = process.env.OPENAI_API_KEY || '';
    this.pdfService = new PdfService();
  }


  /**
   * Envia os dados do Lead para a LLM e gera o relatório estruturado em JSON
   */
  public async generateAudit(lead: LeadRecord): Promise<AuditOutput> {
    const promptSystem = `Você é um consultor especialista em Marketing Local, SEO para Google Meu Negócio (Google Business Profile) e Reputação Digital para empresas locais no Brasil.
Seu objetivo é analisar os dados de um estabelecimento e gerar um diagnóstico estritamente no formato JSON.

O JSON retornado DEVE ter EXATAMENTE a seguinte estrutura:
{
  "teaser": "Texto consultivo curto de no máximo 3 frases. Destaque 2 problemas visíveis na presença digital da empresa e explique brevemente como corrigi-los vai atrair mais clientes locais.",
  "full_report": {
    "action_plan_30_days": [
      "Ação para a Semana 1...",
      "Ação para a Semana 2...",
      "Ação para a Semana 3...",
      "Ação para a Semana 4..."
    ],
    "post_suggestions": [
      "Sugestão de Post 1...",
      "Sugestão de Post 2...",
      "Sugestão de Post 3...",
      "Sugestão de Post 4...",
      "Sugestão de Post 5..."
    ],
    "negative_review_replies": [
      "Resposta pronta 1 para avaliação negativa...",
      "Resposta pronta 2 para avaliação negativa...",
      "Resposta pronta 3 para avaliação negativa...",
      "Resposta pronta 4 para avaliação negativa...",
      "Resposta pronta 5 para avaliação negativa..."
    ]
  }
}

IMPORTANTE: Responda APENAS com o código JSON puro, sem markdown, sem explicações extras.`;

    const promptUser = `Dados do Estabelecimento Local:
- Nome da Empresa: ${lead.name}
- Endereço / Localização: ${lead.address || 'Não informado'}
- Telefone: ${lead.phone || 'Não cadastrado no perfil'}
- Nota Média (Rating): ${lead.rating !== null && lead.rating !== undefined ? lead.rating : 'Sem nota'}
- Total de Avaliações: ${lead.user_ratings_total !== null && lead.user_ratings_total !== undefined ? lead.user_ratings_total : 0}
- Presença de Site Oficial: ${lead.audit_summary?.has_website ? 'Sim' : 'Não possui site cadastrado'}`;

    let jsonResponseText = '';

    if (this.geminiKey) {
      jsonResponseText = await this.callGemini(promptSystem, promptUser);
    } else if (this.openaiKey) {
      jsonResponseText = await this.callOpenAI(promptSystem, promptUser);
    } else {
      throw new Error('Nenhuma chave de LLM (GEMINI_API_KEY ou OPENAI_API_KEY) foi encontrada no ambiente.');
    }

    // Limpeza de blocos markdown se existirem (ex: ```json ... ```)
    const cleanedJson = jsonResponseText.replace(/```json/gi, '').replace(/```/g, '').trim();

    try {
      const parsedAudit: AuditOutput = JSON.parse(cleanedJson);
      return parsedAudit;
    } catch (err) {
      console.error('Erro ao fazer parse do JSON retornado pela LLM:', cleanedJson);
      throw new Error(`Falha ao converter resposta da IA em JSON válido: ${err}`);
    }
  }

  /**
   * Executa a auditoria completa de um Lead pelo seu ID e salva no banco de dados
   */
  public async auditLeadById(leadId: string): Promise<LeadRecord> {
    // 1. Busca o Lead no banco
    const selectQuery = `SELECT * FROM leads WHERE id = $1;`;
    const selectRes = await pool.query(selectQuery, [leadId]);

    if (selectRes.rowCount === 0) {
      throw new Error(`Lead com ID ${leadId} não encontrado no banco de dados.`);
    }

    const lead: LeadRecord = selectRes.rows[0];

    // 2. Gera o relatório via LLM
    const auditSummary = await this.generateAudit(lead);

    // 3. Atualiza o banco com o audit_summary e altera o status para AUDITED
    const updateQuery = `
      UPDATE leads
      SET audit_summary = $1,
          status = 'AUDITED',
          updated_at = NOW()
      WHERE id = $2
      RETURNING *;
    `;

    const updateRes = await pool.query(updateQuery, [JSON.stringify(auditSummary), leadId]);

    // Gera o PDF oficial do relatório
    try {
      await this.pdfService.generateLeadPdf(leadId);
    } catch (pdfErr) {
      console.warn(`Aviso ao gerar PDF para o lead ${leadId}:`, pdfErr);
    }

    // Busca novamente o lead com a URL do PDF atualizada
    const finalRes = await pool.query(selectQuery, [leadId]);
    return finalRes.rows[0];
  }


  private async callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.geminiKey}`;

    
    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Erro na API do Gemini: ${res.status} - ${errText}`);
    }

    const data: any = await res.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('A API do Gemini retornou uma resposta sem texto.');
    }
    return candidateText;
  }

  private async callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
    const url = 'https://api.openai.com/v1/chat/completions';
    
    const body = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Erro na API da OpenAI: ${res.status} - ${errText}`);
    }

    const data: any = await res.json();
    const messageContent = data?.choices?.[0]?.message?.content;
    if (!messageContent) {
      throw new Error('A API da OpenAI retornou uma resposta vazia.');
    }
    return messageContent;
  }
}
