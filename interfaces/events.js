const events = {
  subs: {},

  on(name, fn) {
    if(!this.subs[name]) this.subs[name] = [];

    this.subs[name].push(fn);
  },

  emit(name, data) {
    if(!this.subs[name]) return;

    for(let i in this.subs[name]) {
      this.subs[name][i](data);
    }
  }
}

module.exports = events;