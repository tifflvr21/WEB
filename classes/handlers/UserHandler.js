const events = require('../../interfaces/events');
const Handler = require('./Handler');
const users = require('../../interfaces/users');
const { io, manager } = require('../IO_Manager')();
const config = require('../../config');

class UserHandler extends Handler {
  constructor(props) {
    super(props);
    // todo: move events from User class here
  }

  // this might be useless because most actions wont be io
  // loadSteamInventory(data, user, socket) {
  //   console.log('loadSteamInventory', data);
  //   console.log(user.steam.test());
  // }
}

module.exports = new UserHandler();