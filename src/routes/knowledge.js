const express = require('express')
const router = express.Router()

router.get('/', async (req, res) => {
  res.json({ message: 'Base de conhecimento', data: [] })
})

module.exports = router 