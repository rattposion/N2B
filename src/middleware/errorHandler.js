const { logger } = require('../utils/logger')

const errorHandler = (err, req, res, next) => {
  // Log do erro
  logger.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  })

  // Erros de validação
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Erro de validação',
      details: err.message
    })
  }

  // Erros do Prisma
  if (err.code === 'P2002') {
    return res.status(409).json({
      error: 'Duplicate Entry',
      message: 'Registro já existe'
    })
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      error: 'Record Not Found',
      message: 'Registro não encontrado'
    })
  }

  // Erros de JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid Token',
      message: 'Token inválido'
    })
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token Expired',
      message: 'Token expirado'
    })
  }

  // Erros de rate limiting
  if (err.status === 429) {
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Muitas requisições. Tente novamente em alguns minutos.'
    })
  }

  // Erro padrão
  const statusCode = err.statusCode || 500
  const message = err.message || 'Internal Server Error'

  res.status(statusCode).json({
    error: 'Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Erro interno do servidor' 
      : message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  })
}

module.exports = { errorHandler } 