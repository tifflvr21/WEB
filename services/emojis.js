const fs = require('fs');
const express = require('express');
const router = express.Router();

const emojis = JSON.parse( fs.readFileSync('./.cache/emojis.json', 'utf-8') );
const gifs = JSON.parse( fs.readFileSync('./.cache/gifs.json', 'utf-8') );

// todo: add an option to refresh this
router.get('/all', async (req, res) => {
  return res.status(200).json({emojis, gifs});
});

module.exports = router;