const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { body, validationResult } = require('express-validator')
const { PrismaClient } = require('@prisma/client')
const { logger } = require('../utils/logger')

const router = express.Router()
const prisma = new PrismaClient()

// Registro
router.post('/register', [
  body('name').notEmpty().withMessage('Nome é obrigatório'),
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres'),
  body('companyName').notEmpty().withMessage('Nome da empresa é obrigatório')
], async (req, res) => {
  try {
    // Validar dados
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Erro de validação',
        details: errors.array()
      })
    }

    const { name, email, password, companyName } = req.body

    // Verificar se email já existe
    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'Usuário já existe'
      })
    }

    // Criar empresa
    const company = await prisma.company.create({
      data: {
        name: companyName,
        plan: 'STARTER'
      }
    })

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 12)

    // Criar usuário
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'ADMIN',
        companyId: company.id
      },
      include: {
        company: true
      }
    })

    // Gerar tokens
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
    )

    const refreshToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    )

    // Remover senha da resposta
    const { password: _, ...userWithoutPassword } = user

    logger.info('User registered:', { userId: user.id, email: user.email })

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      token,
      refreshToken,
      user: userWithoutPassword
    })

  } catch (error) {
    logger.error('Register error:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: 'Erro interno do servidor'
    })
  }
})

// Login
router.post('/login', [
  body('email').isEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Senha é obrigatória')
], async (req, res) => {
  try {
    // Validar dados
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Erro de validação',
        details: errors.array()
      })
    }

    const { email, password } = req.body

    // Buscar usuário
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        company: true
      }
    })

    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email ou senha inválidos'
      })
    }

    // Verificar senha
    const isValidPassword = await bcrypt.compare(password, user.password)

    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email ou senha inválidos'
      })
    }

    // Verificar status do usuário
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        error: 'User inactive',
        message: 'Usuário inativo'
      })
    }

    // Atualizar último login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    })

    // Gerar tokens
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
    )

    const refreshToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    )

    // Remover senha da resposta
    const { password: _, ...userWithoutPassword } = user

    logger.info('User logged in:', { userId: user.id, email: user.email })

    res.json({
      message: 'Login realizado com sucesso',
      token,
      refreshToken,
      user: userWithoutPassword
    })

  } catch (error) {
    logger.error('Login error:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: 'Erro interno do servidor'
    })
  }
})

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Refresh token required',
        message: 'Refresh token é obrigatório'
      })
    }

    // Verificar refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)

    // Buscar usuário
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    })

    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({
        error: 'Invalid refresh token',
        message: 'Refresh token inválido'
      })
    }

    // Gerar novos tokens
    const newToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
    )

    const newRefreshToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    )

    res.json({
      token: newToken,
      refreshToken: newRefreshToken
    })

  } catch (error) {
    logger.error('Refresh token error:', error)
    res.status(401).json({
      error: 'Invalid refresh token',
      message: 'Refresh token inválido'
    })
  }
})

// Me (obter dados do usuário atual)
router.get('/me', async (req, res) => {
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

    // Remover senha da resposta
    const { password, ...userWithoutPassword } = user

    res.json({
      user: userWithoutPassword
    })

  } catch (error) {
    logger.error('Me endpoint error:', error)
    res.status(401).json({
      error: 'Invalid token',
      message: 'Token inválido'
    })
  }
})

module.exports = router 