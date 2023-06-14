const database = require('../interfaces/database');
const steamPrices = require('../interfaces/steam');

class UserSteam {
  /**
  * Loads user's Steam inventory from Steam
  */
   async steam_getInventory(appid = 730) {
    return new Promise(async (resolve, reject) => {
      appid = appid.toString();

      const steamid = this.get('steamid');
      const lastInvUpdate = this.get('lastInvUpdate') || -1;
      const now = Math.floor(+new Date() / 1000);
      const timeToWaitBetweenLoads = 6; // 1 minute, todo: move to config

      await this.set('lastInvUpdate', now);

      // load from database
      if(now - lastInvUpdate < timeToWaitBetweenLoads && lastInvUpdate !== -1) {
        const items = await database.get('steam_items', {
          filter: {owner: steamid, appid: appid.toString()},
        });

        // console.log('db');

        return resolve(await steamPrices.attachPrices(items) );
      }

      // console.log('steam');

      // load from steam
      steamPrices.getInventoryWithPrices(steamid, appid).then(resolve).catch(reject);
    });
  }
}

module.exports = UserSteam;