const express = require('express')
const router = express.Router()

router.get('/', async (req, res) => {
  res.json({ message: 'Conversas listadas', data: [] })
})

router.post('/', async (req, res) => {
  res.status(201).json({ message: 'Conversa criada', data: {} })
})

module.exports = router 