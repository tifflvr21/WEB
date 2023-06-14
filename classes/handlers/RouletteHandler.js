const Chance = require('chance');
const crypto = require('crypto');
const sha256 = require('sha256');

const Handler = require('./Handler');
const events = require('../../interfaces/events');
const users = require('../../interfaces/users');
const randomorg = require('../../interfaces/randomorg');
const database = require('../../interfaces/database');

const { io, manager } = require('../IO_Manager')();
const config = require('../../config');
const { now } = require('../../helpers');

const getColor = num => num === 0 ? 'green' : (num >= 8 ? (num === 15 ? 'hook' : 'black') : 'red');
/*const getMultiplier = num => {
  if(num == 0) return 14;
  if(num >= 1 && num <= 7) {
    if(num == 4) return 7; // bait
    else return 2;
  }
  if(num >= 8) {
    if(num == 11) return 7;
    else return 2;
  }
}*/
const getMultiplier = num => num == 0 ? 14 : 2;

const SETTINGS = {
  time: 15 * 1000, // in miliseconds
  updateInterval: 100, // in miliseconds

  ORDER: [1, 14, 2, 13, 3, 12, 4, 0, 11, 5, 10, 6, 9, 7, 8],
  COLORS: ['red', 'green', 'black', 'hook'], // server(new)
  ANIM_LENGTH: 6500,
  ANIM_CORRECTION_LENGTH: 500,
  ANIM_CORRECTION_WAIT: 800,
  ROULETTE_TIME: 20,
  DISPLAY_RESULT_TIME: 2000,
}

const FULL_ANIM_TIME = SETTINGS.ANIM_LENGTH + SETTINGS.ANIM_CORRECTION_WAIT + SETTINGS.ANIM_CORRECTION_LENGTH + SETTINGS.DISPLAY_RESULT_TIME;


// todo: refactor all of this nonsense
// todo: generate server hash on round start and show a hashed version to client
class RouletteHandler extends Handler {
  constructor(props) {
    super(props);
    
    this.illegal = ['_startTimer', '_removeSid', 'init'];
    this.time = SETTINGS.time;
    this.bets = [];
    this.results = [];
    this.id = 0;
    this.sockets = [];

    this.init();

    this._removeSid = this._removeSid.bind(this);
    this._startTimer = this._startTimer.bind(this);
    this.leave = this.leave.bind(this);
    this.joinSession = this.joinSession.bind(this);

    events.on('user:disconnect', this._removeSid);
  }

  /**
   * Start-up function
  */
  async init() {
    return;
    
    const rounds = await database.get('roulette_rounds', {orderBy: ['round_id', 'desc'], limit: 100, reverse: true});
    const total = await database.get('roulette_rounds', {count: true});
    
    this.id = total;
    this.results = rounds.map(({ result, round_id, random, signature, time, serverHash, randomOrgResult }) => {
      return { result, round_id, random, signature, time, serverHash, randomOrgResult };
    });

    this._startTimer(true);
  }

  /**
   * Starts the roulette event loop. Should only be called once 
  */
  async _startTimer(getBetsFromDb = false) {
    clearInterval(this.timer);
    clearTimeout(this.waitAfterRoll);

    // reset settings
    this.bets = [];
    this.color = undefined;
    this.time = SETTINGS.time;
    this.rolledAt = -1;
    this.id += 1;

    if(getBetsFromDb) {
      this.bets = await database.get('roulette_bets', {filter: {round_id: this.id}});
      this.bets.forEach(bet => {
        const usr = users.find(bet.user, 'id');

        if(usr) bet.user = usr.getPublic();
      });
    }

    // emit to players
    const prevResult = {
      result: this.result,
      round_id: this.id,
      // random: this._randomValue,
      signature: this.signature,
      random: this._random,
      serverHash: this.serverHash,
      randomOrgResult: this.randomOrgResult,
    };

    this.serverHash = crypto.randomBytes(32).toString('hex');

    manager.emit('roulette:reset', {
      prevResult: prevResult,
      prevOffset: this.offset,
      hashedServerSecret: sha256(this.serverHash)
      // hashedServerSecret: `hashed-2-${this.serverHash}`
    }, this.sockets);

    // update recent results
    if(this.result !== undefined) {
      this.results.push(prevResult);
      
      if(this.results.length > 100) {
        this.results.splice(0, this.results.length - 100);
      }

      this.result = undefined;
    }

    // start timer
    this.timer = setInterval(async () => {
      this.time -= SETTINGS.updateInterval;
      
      // time over! finalize game
      if(this.time <= 0) {
        this.time = 0;
        this.offset = Math.random();
        this.rolledAt = now(false);
        
        clearInterval(this.timer);

        // request data from random.org
        randomorg.getSignedString().then(async randomData => {
          this._seed = `${this.serverHash}-${randomData.result}`; // seed
          this._randomValue = new Chance(this._seed).random();
          this.result = Math.floor(this._randomValue * (15 + 1));
          this.signature = randomData.signature;
          this._random = randomData.random;
          this.color = getColor(this.result);
          this.randomOrgResult = randomData.result;

          // console.log(`round #${this.id} rolled ${this.result}, seed: ${this._seed}`);

          await database.insert('roulette_rounds', {
            result: this.result,
            offset: this.offset,
            round_id: this.id,
            time: Math.round(this.rolledAt / 1000),
            random: JSON.stringify(randomData.random),
            signature: randomData.signature,
            serverHash: this.serverHash,
            randomValueFromChance: this._randomValue,
            randomOrgResult: randomData.result
          });
  
          manager.emit('roulette:result', {
            res: this.result,
            offset: this.offset
          }, this.sockets);
  
          // restart game
          this.waitAfterRoll = setTimeout(this._startTimer, FULL_ANIM_TIME);
  
          // give winning bets
          // todo: update bets with status -> win
          this.waitToPayout = setTimeout(() => {
            this.bets.forEach(bet => {
              let didWin = bet.color == this.color;
              let multiplier = getMultiplier(this.result);

              if(this.result == 4 || this.result == 11) { // bait
                if(bet.color == 'hook') {
                  didWin = true;
                  multiplier = 7;
                }
              }

              if(didWin) {
                const user = users.find(bet.user.steamid, 'steamid');
                if(user) user.updateBalance(bet.amount * multiplier, 'add');
              }

              // console.log(`Bet from ${users.find(bet.user.steamid, 'steamid').get('name')} on ${bet.color} for $${bet.amount}, did win: ${didWin.toString()}`);
              // if(didWin) {
              //   console.log(`Win amount: ${bet.amount * multiplier}`);
              // }
            });
          }, SETTINGS.ANIM_LENGTH + SETTINGS.ANIM_CORRECTION_WAIT);
        });
      }

      // emit
      manager.emit('roulette:time', {
        current: this.time,
        total: SETTINGS.time
      }, this.sockets);
    }, SETTINGS.updateInterval);
  }

  /**
   * Removes a given sid from list of subscribers
   * @param {*} sid 
  */
  _removeSid(sid) {
    this.sockets = this.sockets.filter(socket => socket !== sid);
  }

  /**
   * User event to unsubscribe
   * @param {*} data 
   * @param {*} user 
   * @param {*} socket 
  */
  leave(data, user, socket) {
    this._removeSid(socket.id);
  }

  /**
   * User event to subscribe
   * @param {*} data 
   * @param {*} user 
   * @param {*} socket 
  */
  joinSession(data, user, socket) {
    if(!this.sockets.includes(socket.id)) this.sockets.push(socket.id);

    manager.emit('roulette:start', {
      results: this.results,
      time: this.time,
      timeLeft: this.time == 0 ? SETTINGS.ANIM_LENGTH - (now(false) - this.rolledAt) : -1, // todo: remove the correction stuff from this
      result: this.time == 0 ? this.result : -1,
      bets: this.bets,
      // hashedServerSecret: `hashed-1-${this.serverHash}`
      hashedServerSecret: sha256(this.serverHash || '')
    }, socket.id);
  }

  /**
   * User event to place a bet
   * @param {*} data 
   * @param {*} user 
   * @param {*} socket 
  */
  async placeBet(data, user, socket) {
    try {
      if(typeof data !== 'object' || Array.isArray(data)) throw `Invalid data`;
      if(!SETTINGS.COLORS.includes(data?.color)) throw `Invalid color`;
      if(isNaN(data?.amount) || data?.amount < config.games.roulette.minBet || data?.amount > config.games.roulette.maxBet) throw `Invalid bet amount! Bets have to be between ${config.games.roulette.minBet} and ${config.games.roulette.maxBet}`;
      if(data?.amount > user.get('balance')) throw `Not enough balance`;
      if(this.time <= 0) throw `Round in progress`;

      // check bets
      let found = false;
      let currAmount = 0;
      let betData = {
        user: user.getPublic(),
        amount: data?.amount,
        color: data?.color,
        allIn: user.get('balance') == 0,
        round_id: this.id
      };
      
      // todo: dont allow betting on red & black in the same round
      // check if bet isnt too big
      const currBet = this.bets.filter(bet => bet.color == data?.color && bet.user?.steamid == betData.user.steamid)[0];
      if(currBet) {
        if(currBet.amount + data?.amount > config.games.roulette.maxBet) {
          throw `Invalid bet! You can bet up to ${config.games.roulette.maxBet}`; 
        }
      }

      await user.updateBalance(data?.amount, 'remove');
      
      // user somehow found a way to bet more than they have - return coins and cancel bet
      if(user.get('balance') < 0) {
        await user.updateBalance(data?.amount, 'add');
        throw `Not enough balance [2]`;
      }

      // update bet if already exists
      this.bets.forEach(async bet => {
        if(bet.color == data?.color && bet.user?.steamid == betData.user.steamid && !found) {
          bet.amount += data?.amount;
          currAmount = bet.amount;
          bet.allIn = user.get('balance') == 0;
          found = true;
        }
      });
      
      if(!found) { // new bet
        this.bets.push(betData);

        await database.insert('roulette_bets', {...betData, user: user.get('id')});
      } else { // update bet
        await database.update('roulette_bets', {filter: {color: data?.color, round_id: this.id}}, {amount: currAmount});
      }

      // todo: remove xp from here and emit event instead
      // xp will be added in subscribers based on which game it is
      await user.updateXp(data?.amount * 2, 'add');

      // send to users
      manager.emit('roulette:newBet', betData, this.sockets);
    } catch(e) {
      // todo: send a generic:error by default, Handler.js should accept a different this.errorEvent value if set
      return manager.emit('generic:error', e.message || e, socket.id);
    }
  }
}

module.exports = new RouletteHandler();