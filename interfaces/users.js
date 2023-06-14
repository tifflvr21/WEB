const sha256 = require('sha256');
const { v4 } = require('uuid');

const User = require('../classes/User');
// const events = require('../interfaces/events');
const database = require('./database');
const { now } = require('../helpers');
const config = require('../config');

const userManager = {
  list: [],
  loaded: false,

  async init() {
    const users = await database.get('users');

    users.forEach(user => {
      this.list = [...this.list, new User(user)];
    });

    console.log(`[Users] Loaded a total of ${this.list.length} users from database`);

    this.loaded = true;
  },

  async new(data) {
    const uuid = v4();
    const token = sha256(`${uuid}-${now()}`).toString('hex');

    const userData = {
      name: data.name,
      avatar: data.avatar,
      steamid: data.steamid || null,
      joinDate: now(),
      lastLogin: now(),
      ip: data.ip ? [data.ip] : [],
      id: uuid,
      token: token,
      xp: 0,
      tradelink: '',
      balance: 0,
      rank: data.steamid === config.steam.defaultAdmin ? 4 : 0
    };

    await database.insert('users', userData);

    // events.emit('signup', user);
    this.list.push(new User(userData));

    return this.list[ this.list.length - 1 ];
  },

  getOnline() {
    return this.list.filter(user => user.isOnline());
  },

  getBySid(sid) {
    return this.list.filter(user => user.getSids().includes(sid))[0];
  },

  find(id, identifier = 'token') {
    return this.list.filter(user => user.get(identifier) == id)[0];
  },

  async login(data, identifier = 'steamid') {
    const user = this.find(data[identifier], identifier);
    // const user = this.list.filter(user => user.get(identifier) == data[identifier])[0]; // todo: use the find fn
    
    // todo: might be a good idea to invalidate the token and create a new one
    // todo: update steam data, last login, ip etc (maybe a separate table for login history)
    return user ? user : await this.new(data);
  }
}

userManager.init();

module.exports = userManager;