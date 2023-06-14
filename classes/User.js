const fetch = require('node-fetch');
const InventoryAPI = require('steam-inventory-api-ng');
const events = require('../interfaces/events');
const database = require('../interfaces/database');
const UserSteam = require('./UserSteam');

const { now, sum } = require('../helpers');

class User extends UserSteam {
  constructor(props) {
    super(props);
    this.props = props;
    this.sids = [];

    this.checkBanExpiration();

    // todo: move to userHandler?
    events.on(`user:handshake:${props.token}`, this.onHandshake);
    events.on(`user:disconnect:${props.token}`, this.onDisconnect);

    // console.log(`[User] New user initiated with name ${props.name} and token ${props.token}`);
  }

  isOnline = () => {
    return this.sids.length > 0;
  }

  isAdmin = () => {
    return this.get('rank') >= 2;
  }

  getSids = () => {
    return this.sids;
  }

  emit = (event, data) => {
    events.emit('emit_to_sid', {
      event, data, sids: this.sids
    });
  }

  onHandshake = data => {
    this.sids.push(data.sid);
  }

  onDisconnect = sid => {
    if(!this.sids.includes(sid)) return;

    this.sids = this.sids.filter(x => x !== sid);
  }

  updateBalance = (amount, action) => {
    if(!['set', 'remove', 'add'].includes(action)) throw 'Invalid action';

    amount = parseFloat(amount || 0);

    if(action == 'set') {
      this.set('balance', amount);
    } else if(action == 'add') {
      const balance = parseFloat(this.get('balance') || 0);
      this.set('balance', balance + amount);
    } else if(action == 'remove') {
      const balance = parseFloat(this.get('balance') || 0);
      this.set('balance', balance - amount);
    }
  }

  updateXp = (amount, action) => {
    if(!['set', 'remove', 'add'].includes(action)) throw 'Invalid action';

    amount = parseFloat(amount || 0);

    if(action == 'set') {
      this.set('xp', amount);
    } else if(action == 'add') {
      const xp = parseFloat(this.get('xp') || 0);
      this.set('xp', xp + amount);
    } else if(action == 'remove') {
      const xp = parseFloat(this.get('xp') || 0);
      this.set('xp', xp - amount);
    }
  }

  calculateLevel = () => {
    const xp = this.get('xp');
    const level = Math.floor((25 + Math.sqrt(625 + 100 * xp)) / 50);
    const expForCurrLevel = 25 * level * level - 25 * level;
    const expForNextLevel = 25 * (level + 1) * (level + 1) - 25 * (level + 1);

    return {
      level: level,
      exp: xp,
      expForCurrLevel: expForCurrLevel,
      expForNextLevel: expForNextLevel,
      levelCompletion: ((xp - expForCurrLevel) / (expForNextLevel - expForCurrLevel)) * 100
    }
  }

  checkBanExpiration = () => {
    if(!!this.get('banned')) return;

    if(this.get('ban_expires_at') >= now()) {
      this.set('banned', false);
      this.set('ban_expires_at', 0);
      this.set('ban_expires_at_readable', '');
      this.set('ban_length', 0);
      this.set('ban_reason', '');
    }
  }

  set = (key, value) => {
    this.props[key] = value;

    this.emit(`user:updateValue-${key}`, value);
    events.emit('user:updateValue', {id: this.get('id'), key, value});

    // todo: make better architecture
    if(key == 'xp') {
      this.emit(`user:levelProgress`, this.calculateLevel());
    }
  }

  get = key => {
    return key ? this.props[key] : {...this.props, ...this.calculateLevel()};
  }

  getBanMsg = () => {
    if(!this.get('banned')) return '';

    return `Your account has been banned${parseInt(this.get('ban_length')) == 0 ? ' forever' : ' until ' + this.get('ban_expires_at_readable')}`;
  }

  getPublic = () => {
    this.checkBanExpiration();

    return {
      avatar: this.get('avatar'),
      name: this.get('name'),
      id: this.get('id'),
      steamid: parseInt(this.get('rank')) == 4 ? '0' : this.get('steamid'),
      badge: this.get('badge'),
      badge_color: this.get('badge_color'),
      badge_text_color: this.get('badge_text_color'),
      rank: this.get('rank') || 0,
      exp: this.get('exp') || 0,
      joinDate: this.get('joinDate') || 0,
      banned: !!this.get('banned'),
      ...this.calculateLevel()
    }
  }

  getStats = () => {
    return new Promise(async (resolve, reject) => {
      const txns = await database.get('transactions', {
        filter: {user: this.get('id'), status: 3} // todo: change status to 2
      });

      let stats = {
        depo: 0,
        win: 0,
        profit: 0
      };

      txns.forEach(txn => {
        const total = sum(txn?.data?.items || [], 'price') || sum(txn?.extra_data?.items || [], 'price') || txn?.extra_data?.value;

        if(txn.type == 'deposit-steam' && !isNaN(total)) {
          stats.depo += total;
        } else if(txn.type == 'winnings-steam') {
          stats.win += total;
        }
      });

      stats.profit = stats.win - stats.depo;

      return resolve(stats);
    });
  }
}


module.exports = User;