import { Request, Response } from 'express';
import { hashPassword, comparePassword, generateTokens, verifyRefreshToken, invalidateRefreshToken, invalidateToken } from '../utils/auth';
import prisma from '../utils/database';
import logger from '../utils/logger';

export class AuthController {
  async register(req: Request, res: Response) {
    try {
      const { name, email, password, companyName, plan = 'STARTER' } = req.body;

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        return res.status(400).json({ error: 'Email já está em uso' });
      }

      // Create company
      const company = await prisma.company.create({
        data: {
          name: companyName,
          slug: companyName.toLowerCase().replace(/\s+/g, '-'),
          plan,
          settings: {
            aiEnabled: true,
            voiceEnabled: true,
            language: 'pt-BR',
            aiTone: 'friendly',
            businessHours: {
              enabled: false,
              timezone: 'America/Sao_Paulo',
              schedule: {}
            }
          }
        }
      });

      // Create user
      const hashedPassword = await hashPassword(password);
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: 'ADMIN',
          companyId: company.id
        },
        include: { company: true }
      });

      // Generate tokens
      const tokens = generateTokens({
        userId: user.id,
        companyId: user.companyId,
        role: user.role
      });

      logger.info('Usuário registrado', { userId: user.id, companyId: company.id });

      res.status(201).json({
        message: 'Usuário criado com sucesso',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          company: {
            id: company.id,
            name: company.name,
            plan: company.plan
          }
        },
        tokens
      });
    } catch (error: any) {
      logger.error('Erro no registro', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      // Find user with company
      const user = await prisma.user.findUnique({
        where: { email },
        include: { company: true }
      });

      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      // Check password
      const isValidPassword = await comparePassword(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }
      });

      // Generate tokens
      const tokens = generateTokens({
        userId: user.id,
        companyId: user.companyId,
        role: user.role
      });

      logger.info('Login realizado', { userId: user.id });

      res.json({
        message: 'Login realizado com sucesso',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          company: {
            id: user.company.id,
            name: user.company.name,
            plan: user.company.plan
          }
        },
        tokens
      });
    } catch (error: any) {
      logger.error('Erro no login', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async refreshToken(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token requerido' });
      }

      // Verify refresh token
      const decoded = verifyRefreshToken(refreshToken);
      
      // Get user from database
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { company: true }
      });

      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Usuário não encontrado ou inativo' });
      }

      // Generate new tokens
      const tokens = generateTokens({
        userId: user.id,
        companyId: user.companyId,
        role: user.role
      });

      // Invalidate old refresh token
      invalidateRefreshToken(refreshToken);

      logger.info('Token renovado', { userId: user.id });

      res.json({
        message: 'Token renovado com sucesso',
        tokens
      });
    } catch (error: any) {
      logger.error('Erro no refresh token', { error: error.message });
      res.status(401).json({ error: 'Refresh token inválido' });
    }
  }

  async logout(req: Request, res: Response) {
    try {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      const { refreshToken } = req.body;

      if (token) {
        invalidateToken(token);
      }

      if (refreshToken) {
        invalidateRefreshToken(refreshToken);
      }

      logger.info('Logout realizado', { userId: (req as any).user?.id });
      res.json({ message: 'Logout realizado com sucesso' });
    } catch (error: any) {
      logger.error('Erro no logout', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async me(req: Request, res: Response) {
    try {
      // The user is already attached to req by the authenticate middleware
      const user = (req as any).user;
      
      if (!user) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          company: user.company ? {
            id: user.company.id,
            name: user.company.name,
            plan: user.company.plan
          } : null
        }
      });
    } catch (error: any) {
      logger.error('Erro ao obter dados do usuário', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

export default new AuthController();