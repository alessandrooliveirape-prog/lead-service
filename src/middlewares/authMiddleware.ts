import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  user?: {
    username: string;
    role: string;
  };
}

export function requireAdminAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const jwtSecret = process.env.JWT_SECRET || 'super_secret_jwt_key_lead_service_2026';

  // Aceita o token via header Authorization: Bearer <token> ou query string ?token=<token> ou cookie token
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    res.status(401).json({ error: 'Acesso negado. Token de autenticação não fornecido.' });
    return;
  }

  try {
    const decoded: any = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token inválido ou expirado. Faça login novamente.' });
  }
}
