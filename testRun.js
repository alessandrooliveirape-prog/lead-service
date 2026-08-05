const { pool } = require('./dist/config/database');
const { AuditService } = require('./dist/services/auditService');

async function runTest() {
  const insertQuery = `
    INSERT INTO leads (name, address, phone, rating, user_ratings_total, place_id, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (place_id) DO UPDATE SET phone = $3
    RETURNING id;
  `;
  const res = await pool.query(insertQuery, [
    "MKN Log",
    "Recife, PE",
    "5581998372170",
    4.1,
    12,
    "ChIJ_MKN_LOG_TEST_ID",
    "DISCOVERED"
  ]);
  const leadId = res.rows[0].id;
  console.log("LEAD_ID:" + leadId);

  const auditService = new AuditService();
  console.log("Gerando auditoria via IA Gemini e PDF...");
  const auditedLead = await auditService.auditLeadById(leadId);
  console.log("AUDIT_SUCCESS");
  console.log("TEASER:" + JSON.stringify(auditedLead.audit_summary?.teaser));
  console.log("PDF_URL:" + auditedLead.pdf_url);
  console.log("LANDING_URL:http://144.33.22.54:3001/d/" + leadId);
}

runTest().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
