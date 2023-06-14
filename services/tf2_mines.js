const express = require('express');
const database = require('../interfaces/database');
const router = express.Router();

const hideSensitiveInfo = game => {
  if(game.status === 4) return game;

  game.serverHash = undefined;
  game.mines = undefined;
  game.randomOrgResult = undefined;
  game.minesRaw = undefined;

  return game;
}

router.post('/all', async (req, res) => {
  try {
    // todo: need to somehow get in-progress games too, maybe some done too
    // const games = await database.get('mines_games', {
    //   filter: {status: 0},
    //   orderBy: ['timeCreated', 'desc']
    // });
    const games = await database.get('mines_games', {
      custom: (x, r) => x.filter(
        r.not( r.row("status").eq(4) ) // todo: check again with status map
      )
    });

    // todo: dont emit `mines` and `serverHash` if game is in progress

    return res.status(200).json(games.map(x => hideSensitiveInfo(x)));
  } catch(e) {
    return res.status(500).json([]);
  }
});

router.post('/game/:id', async (req, res) => {
  try {
    const games = await database.get('mines_games', {
      filter: {id: req.params.id},
    });

    if(games.length <= 0) throw 'Game with this id doesnt exist';

    // todo: hide sensitive data
    // todo: dont emit `mines` and `serverHash` if game is in progress
    return res.status(200).json(hideSensitiveInfo(games[0]));
  } catch(e) {
    return res.status(500).json({success: false, msg: e});
  }
});


module.exports = router;