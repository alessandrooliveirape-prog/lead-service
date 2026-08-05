import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') || process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

export async function checkDatabaseConnection(): Promise<{ connected: boolean; message?: string }> {
  try {
    const client = await pool.connect();
    client.release();
    return { connected: true };
  } catch (error: any) {
    return { 
      connected: false, 
      message: error?.message || 'Falha ao conectar no banco de dados' 
    };
  }
}
