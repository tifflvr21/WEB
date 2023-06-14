const express = require('express');
const database = require('../interfaces/database');
const router = express.Router();

router.post('/pastGames', async (req, res) => {
  try {
    const games = await database.get('tf2_jackpot_rounds', {
      filter: {status: 3},
      limit: 9,
      orderBy: ['roundId', 'desc']
    });

    games.map(game => {
      game.itemsCut = undefined;
      game.itemsCutAmount = undefined;
      game.itemsWin = undefined;
      game.itemsWinAmount = undefined;
      game.winOfferId = undefined;
      game.winOfferStatus = undefined;
      game.winOfferStatusText = undefined;

      return game;
    });

    return res.status(200).json(games);
  } catch(e) {
    return res.status(500).json([]);
  }
});

module.exports = router;