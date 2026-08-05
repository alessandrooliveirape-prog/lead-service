import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';

export async function loginHandler(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body || {};

    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    const jwtSecret = process.env.JWT_SECRET || 'super_secret_jwt_key_lead_service_2026';

    if (!username || !password) {
      res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
      return;
    }

    if (username !== adminUser || password !== adminPass) {
      res.status(401).json({ error: 'Usuário ou senha incorretos.' });
      return;
    }

    // Gera o token JWT com validade de 7 dias
    const token = jwt.sign(
      { username: adminUser, role: 'admin' },
      jwtSecret,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      message: 'Login realizado com sucesso!',
      token,
      user: {
        username: adminUser,
        role: 'admin',
      },
    });
  } catch (error: any) {
    console.error('Erro no loginHandler:', error);
    res.status(500).json({ error: 'Erro interno ao realizar autenticação.' });
  }
}

export async function getMeHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  res.status(200).json({
    user: req.user,
  });
}
