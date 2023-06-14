const express = require('express');
const fs = require('fs');
const database = require('../interfaces/database');
const users = require('../interfaces/users');
const { now, sum } = require('../helpers');
const router = express.Router();

/*
  {
    startTime: 123345543,
    endTime: 43242,
    lastUpdated: 123,
    players: []
  }
*/
const LB_TIME = 86400 * 30; // 30 days

const updateLB = async () => {
  // console.log('Updating leaderboard...');
  let lb = {};
  let players = {};

  try {
    lb = JSON.parse(fs.readFileSync('./.cache/leaderboard.json'));
  } catch(e) {
    lb = {
      startTime: now(),
      endTime: now() + LB_TIME,
      lastUpdated: now(),
      players: []
    };
  }

  // lb.startTime = 0; // debug
  lb.players = []; // not debug

  const txns = await database.get('transactions', {
    custom: (x, r) => x.filter(
      r.row("last_updated").gt(lb.startTime).and(r.row("status").eq(2)).and(r.row("type").eq("deposit-steam"))
    )
  });

  // console.log(`Found ${txns.length} transactions`);

  // loop through all transactions
  txns.forEach(txn => {
    const value = txn.value || txn?.extra_data?.price || sum(txn?.extra_data?.items, 'price') || 0;
    const points = value * 2.137; // any arbitrary value will work

    if(!players[txn.user]) {
      players[txn.user] = 0;
    }

    players[txn.user] += points;

    // console.log(`Transaction #${txn.num_id} is worth $${parseFloat(value).toFixed(2)} and ${Math.ceil(points)} points`);
  });

  // console.log(players);

  // create final player array
  Object.keys(players).map(playerId => {
    if(lb.players.filter(x => x.player?.id == playerId).length > 0) return;
    const usr = users.find(playerId, 'id');

    lb.players.push({
      player: {...usr?.getPublic(), tradelink: usr?.get('tradelink')},
      points: Math.ceil(players[playerId])
    });
  });

  // console.log('lb.players 1', lb.players);

  // sort by points and return top 10
  lb.players = lb.players.sort((a,b) => b.points - a.points);
  if(lb.players.length > 10) lb.players.length = 10;

  // console.log('lb.players 1', lb.players);

  // save to file
  try {
    fs.writeFileSync( './.cache/leaderboard.json', JSON.stringify(lb) );
  } catch(e) {
    console.log(`Failed to save leaderboard to file!`, e.message);
  }

  // check if its time for a new leaderboard
  if(now() >= lb.endTime) {
    console.log('leaderboard expired', lb);
    resetLB(lb);
  }
}

const resetLB = (lb) => {
  const fileName = `leaderboard-winners-${lb.endTime}.json`;
  console.log(`Leaderboard is over! Saving winners to "${fileName}"`);

  try {
    fs.writeFileSync( './.cache/' + fileName, JSON.stringify(lb) );
    fs.unlinkSync('./.cache/leaderboard.json');

    updateLB();
  } catch(e) {
    console.log(`Failed to save leaderboard winners to file!`, e.message);
  }
}

updateLB();
setInterval(updateLB, 5 * (60 * 1000)); // 5 mins


router.post('/', async (req, res) => {
  try {
    const lb = JSON.parse(fs.readFileSync('./.cache/leaderboard.json'));

    return res.status(200).json(lb);
  } catch(e) {
    return res.status(500).json({});
  }
});

module.exports = router;