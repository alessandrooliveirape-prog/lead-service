import { pool } from '../config/database';

export interface ScraperResult {
  totalFound: number;
  totalEligible: number;
  totalSaved: number;
  leadsSaved: Array<{
    id?: string;
    name: string;
    place_id: string;
    rating?: number;
    user_ratings_total?: number;
    phone?: string;
    address?: string;
  }>;
}

export class LeadScraperService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY || '';
  }

  /**
   * Busca estabelecimentos no Google Places e salva no banco os elegíveis
   */
  public async searchAndStoreLeads(nicho: string, cidade: string): Promise<ScraperResult> {
    if (!this.apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY não configurada no arquivo .env');
    }

    const queryText = encodeURIComponent(`${nicho} em ${cidade}`);
    const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${queryText}&key=${this.apiKey}&language=pt-BR`;

    const response = await fetch(textSearchUrl);
    if (!response.ok) {
      throw new Error(`Erro ao consultar Google Places API: ${response.statusText}`);
    }

    const searchData: any = await response.json();
    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
      throw new Error(`Google Places API retornou status: ${searchData.status} - ${searchData.error_message || ''}`);
    }

    const results: any[] = searchData.results || [];
    const totalFound = results.length;

    const leadsToSave: any[] = [];

    for (const item of results) {
      const placeId = item.place_id;

      // Consulta os detalhes do estabelecimento para obter site e telefone
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,formatted_phone_number,rating,user_ratings_total,website,place_id&key=${this.apiKey}&language=pt-BR`;
      
      let details: any = item;
      try {
        const detRes = await fetch(detailsUrl);
        if (detRes.ok) {
          const detJson: any = await detRes.json();
          if (detJson.status === 'OK' && detJson.result) {
            details = detJson.result;
          }
        }
      } catch (err) {
        console.warn(`Aviso: falha ao buscar detalhes do place_id ${placeId}`, err);
      }

      const rating = details.rating !== undefined ? Number(details.rating) : null;
      const userRatingsTotal = details.user_ratings_total !== undefined ? Number(details.user_ratings_total) : null;
      const website = details.website ? details.website.trim() : null;

      // Critérios de filtro (pelo menos um deve ser verdadeiro):
      // 1. Sem site cadastrado
      // 2. Rating médio menor que 4.3
      // 3. Total de avaliações menor que 20
      const hasNoWebsite = !website || website === '';
      const lowRating = rating !== null && rating < 4.3;
      const fewRatings = userRatingsTotal !== null && userRatingsTotal < 20;

      const isEligible = hasNoWebsite || lowRating || fewRatings;

      if (isEligible) {
        leadsToSave.push({
          name: details.name || item.name,
          address: details.formatted_address || item.formatted_address || null,
          phone: details.formatted_phone_number || null,
          rating,
          user_ratings_total: userRatingsTotal,
          place_id: placeId,
        });
      }
    }

    const totalEligible = leadsToSave.length;
    let totalSaved = 0;
    const savedLeadsInfo: any[] = [];

    // Inserção no banco com ON CONFLICT (place_id) DO NOTHING
    for (const lead of leadsToSave) {
      const query = `
        INSERT INTO leads (name, address, phone, rating, user_ratings_total, place_id, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'DISCOVERED')
        ON CONFLICT (place_id) DO NOTHING
        RETURNING id, name, place_id, rating, user_ratings_total, phone, address;
      `;
      const values = [
        lead.name,
        lead.address,
        lead.phone,
        lead.rating,
        lead.user_ratings_total,
        lead.place_id,
      ];

      const res = await pool.query(query, values);
      if (res.rowCount && res.rowCount > 0) {
        totalSaved++;
        savedLeadsInfo.push(res.rows[0]);
      }
    }

    return {
      totalFound,
      totalEligible,
      totalSaved,
      leadsSaved: savedLeadsInfo,
    };
  }
}
