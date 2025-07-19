const winston = require('winston')
const DailyRotateFile = require('winston-daily-rotate-file')

// Configuração dos formatos
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
)

// Configuração dos transportes
const transports = [
  // Console para desenvolvimento
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  })
]

// Adicionar arquivo de log em produção
if (process.env.NODE_ENV === 'production') {
  transports.push(
    new DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d'
    })
  )
}

// Criar logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports,
  exitOnError: false
})

// Stream para Morgan
logger.stream = {
  write: (message) => {
    logger.info(message.trim())
  }
}

module.exports = { logger } 