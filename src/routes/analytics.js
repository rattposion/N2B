const express = require('express')
const router = express.Router()

router.get('/dashboard', async (req, res) => {
  res.json({ message: 'Dados do dashboard', data: {} })
})

module.exports = router 