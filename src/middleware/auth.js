const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')
const { logger } = require('../utils/logger')

const prisma = new PrismaClient()

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        message: 'Token de acesso é obrigatório'
      })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    
    // Buscar usuário no banco
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        company: true
      }
    })

    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'Token inválido'
      })
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ 
        error: 'User inactive',
        message: 'Usuário inativo'
      })
    }

    // Adicionar usuário e empresa ao request
    req.user = user
    req.company = user.company

    next()
  } catch (error) {
    logger.error('Auth middleware error:', error)
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        message: 'Token expirado'
      })
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'Token inválido'
      })
    }

    return res.status(500).json({ 
      error: 'Internal server error',
      message: 'Erro interno do servidor'
    })
  }
}

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Autenticação necessária'
      })
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'Permissões insuficientes'
      })
    }

    next()
  }
}

const requireCompany = (req, res, next) => {
  if (!req.company) {
    return res.status(403).json({ 
      error: 'Company required',
      message: 'Empresa é obrigatória'
    })
  }

  next()
}

module.exports = {
  authenticateToken,
  requireRole,
  requireCompany
} 