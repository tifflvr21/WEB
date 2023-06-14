const users = require('../../interfaces/users');
const { manager } = require('../IO_Manager')();

// todo: this architecture is horrible.
// need a better way of making this, maybe turn everything from a class to an object and store in a "handlers" folder
// or keep this main handler class and use events to move it to other files.

class Handler {
  /**
   * The default handler for all incoming socket chat requests.
   * It will look for a handler function inside this class and use it,
   * if not found it will return an error.
   * @param {Object} data 
   * @param {Object} socket 
   * @returns {function} - The function that will handle this request
   */
   delegate(data, socket) {
    // console.log('delegate', data);
    try {
      if(!this[data.action] || typeof this[data.action] !== 'function' || (this.illegal || []).includes(data.action)) {
        throw `No handler for action ${data.action}`;
      }
  
      // get user from token
      const user = users.find(data.token);

      // if(data.token && !user) throw `Invalid session token.`;
      if(user) {
        if(!!user.get('banned')) throw user.getBanMsg();
      }
  
      // convert {action: 'joinRoom', joinRoom: 1} -> 1
      const action = data.action;
      if(Object.keys(data).length == 3 || Object.keys(data).length == 2) {
        if(typeof data[action] !== 'undefined') data = data[action];
      }
  
      if(data.action) delete data.action;
      if(data.token) delete data.token;

      // todo: publish an event to subscribers here
      // todo: use subscribers for chat commands?

      this[action](data, user, socket);
    } catch(e) {
      return manager.emit(this.errorEvent || 'chat:error', e.message || e, socket.id);
    }
  }
}

module.exports = Handler;