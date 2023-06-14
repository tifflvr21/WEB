const Bot = require('../classes/Bot');
const steamPrices = require('./steam');
const { steam } = require('../config');

const bots = steam.bots.map(bot => new Bot(bot));

if(global.disableBots) {
  console.log('[Bots] Warning: App is running with bots disabled. To enable, run the server without the --no-bot flag.');
}

const botManager = {
  getByIndex(i) {
    return bots[i] || bots[0];
  },

  getRandomBot() {
    return this.getByIndex(2);
  },

  getOnlineBots() {
    return bots.filter(bot => bot.isOnline());
  },

  getBySteamid(steamid) {
    return bots.filter(bot => bot.data.steamid == steamid && bot.isOnline())[0];
    // return bots.filter(bot => bot.data.steamid == steamid)[0];
  },

  getStatus() {
    return bots.map(bot => {
      return {
        avatar: bot.data.avatar,
        name: bot.data.name,
        steamid: bot.data.steamid,
        online: bot.isOnline()
      }
    });
  },

  getAllItems(appid = 730) {
    return new Promise((resolve, reject) => {
      const onlineBots = this.getOnlineBots();
      let items = [];

      if(onlineBots.length == 0) {
        return reject('No bots are currently online. Please try again later in a few minutes.');
      }
      
      onlineBots.forEach(async (bot, key) => {
        steamPrices.getInventoryWithPrices(bot.data.steamid, appid).then(inv => {
          items = [...items, ...inv];
        }).catch(e => reject(e)).finally(() => {
          if(key == onlineBots.length - 1) resolve(items);
        });
      });
    });
  }
}

module.exports = botManager;