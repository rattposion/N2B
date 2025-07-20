import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { JWTPayload } from '../types';
import logger from './logger';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h'; // Aumentado para 24 horas
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// In-memory blacklist (em produção, usar Redis)
const tokenBlacklist = new Set<string>();

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 12);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const generateTokens = (payload: JWTPayload) => {
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN as any });
  
  return { accessToken, refreshToken };
};

export const verifyToken = (token: string): JWTPayload => {
  if (tokenBlacklist.has(token)) {
    throw new Error('Token invalidado');
  }
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
};

export const verifyRefreshToken = (token: string): JWTPayload => {
  if (tokenBlacklist.has(token)) {
    throw new Error('Refresh token invalidado');
  }
  return jwt.verify(token, JWT_REFRESH_SECRET) as JWTPayload;
};

export const invalidateToken = (token: string): void => {
  tokenBlacklist.add(token);
  logger.info('Token invalidado', { token: token.substring(0, 10) + '...' });
};

export const invalidateRefreshToken = (token: string): void => {
  tokenBlacklist.add(token);
  logger.info('Refresh token invalidado', { token: token.substring(0, 10) + '...' });
};

export const isTokenBlacklisted = (token: string): boolean => {
  return tokenBlacklist.has(token);
};

// Limpar blacklist periodicamente (em produção, usar Redis TTL)
setInterval(() => {
  const size = tokenBlacklist.size;
  if (size > 1000) {
    tokenBlacklist.clear();
    logger.info('Blacklist de tokens limpa');
  }
}, 24 * 60 * 60 * 1000); // 24 horas