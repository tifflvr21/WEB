const express = require('express');
const database = require('../interfaces/database');
const router = express.Router();

router.post('/all', async (req, res) => {
  try {
    // todo: need to somehow get in-progress games too, maybe some done too
    // const games = await database.get('coinflip_games', {
    //   filter: {status: 0},
    //   orderBy: ['timeCreated', 'desc']
    // });
    const games = await database.get('coinflip_games', {
      custom: (x, r) => x.filter(
        r.not( r.row("status").eq(3) )
      )
    });

    return res.status(200).json(games.map(x => {
      if(x.status !== 3) x.serverHash = undefined;

      return {...x};
    }));
  } catch(e) {
    return res.status(500).json([]);
  }
});

router.post('/game/:id', async (req, res) => {
  try {
    const games = await database.get('coinflip_games', {
      filter: {id: req.params.id},
    });

    if(games.length <= 0) throw 'Game with this id doesnt exist';

    // todo: hide sensitive data
    return res.status(200).json({...games[0], serverHash: games[0].status !== 3 ? undefined : games[0].serverHash});
  } catch(e) {
    return res.status(500).json({success: false, msg: e});
  }
});


module.exports = router;