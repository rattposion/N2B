const express = require('express')
const router = express.Router()

router.get('/general', async (req, res) => {
  res.json({ message: 'Configurações gerais', data: {} })
})

module.exports = router 