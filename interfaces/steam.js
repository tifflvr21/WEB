const fs = require('fs');
// const InventoryAPI = require('steam-inventory-api-ng');
const SKU = require('tf2-sku');
const tf2_effects = require('../resources/tf2_effects');
// const { getTF2PlayerItems } = require('tf2-get-player-items');
const fetch = require("node-fetch");

const database = require('./database');
const { now } = require('../helpers');
const { steam, steamApis, steamTrades } = require('../config');

const STEAM_INV_FAIL_RETRIES = 4; // todo: move to config

// const inventoryApi = new InventoryAPI({
//   // proxy: [],
// });
let pricesCached = {};
let pricesCachedTF2 = {};
let pricesCachedTF2_overwrite = {};
let pricesCachedExpiry = {};


const steamInventories = {
  /**
   * This function will fetch new price data from steamapis.com and update it in our database
   * @param {String} appid 
   * @returns void
   */
  updatePrices: async (appid = 730, value = 'safe') => {
    appid = appid.toString();

    console.log(`[Steam] Updating prices for appid ${appid}...`);
    fetch(`https://api.steamapis.com/market/items/${appid}?api_key=${steamApis.apiKey}&format=compact&compact_value=${value}`).then(res => res.json()).then(res => {
      // abort if the request failed
      if(res.status && res.status !== 200) {
        return console.log(`[Steam] Failed to get prices for appid ${appid}! (HTTP ${res.status})`);
      }

      // save prices to a cache file
      const expiry = now() + (steam.priceUpdateInterval * 60 * 60);

      try {
        fs.writeFileSync(`./.cache/prices_steam_${appid}_expiry`, `${expiry}`, 'utf8');
        fs.writeFileSync(`./.cache/prices_steam_${appid}.json`, JSON.stringify(res), 'utf8');

        console.log(`[Steam] Updated prices for ${Object.keys(res).length} items (appid: ${appid})`);
      } catch(e) {
        console.log(`[Steam] Failed to save prices for appid ${appid} to a file. They will be cached in memory until next restart`);
      } finally {
        pricesCachedExpiry[appid] = expiry;
        pricesCached[appid] = res;
      }
    }).catch(e => {
      console.log(`[Steam] Failed to get prices for appid ${appid}!`, e);
    });
  },

  /**
   * Adds prices from our database to a list of items
   * @param {Array} inv - Array of items, each object needs a "name" attribute to be able to find
   * @returns Array
   */
  attachPrices: async (inv) => {
    let its = [];
    const prices = pricesCached[inv[0]?.appid?.toString()];

    // console.log(`TF2 SKU Items: ${Object.keys(pricesCachedTF2).length}`);

    inv.forEach(item => {
      item.price = prices ? prices[item.name] : 0;
      
      if(item.tf2_itemSKU) {
        if(pricesCachedTF2[item.tf2_itemSKU] || pricesCachedTF2_overwrite[item.tf2_itemSKU]) {
          item.price = pricesCachedTF2_overwrite[item.tf2_itemSKU] || pricesCachedTF2[item.tf2_itemSKU];
        }
        // console.log(`Found SKU-based price for "${item.name}" (${item.tf2_itemSKU}), it's $${parseFloat(item.price).toFixed(2)}, the regular would be $${parseFloat(prices[item.name] || 0).toFixed(2)}`);
      } 

      item.accept = item.price > steamTrades.minDepositValue;
      if(item.price > 0) {
        its.push(item);
      }
    });

    return its;
  },

  /**
   * Formats inventory for a more db-friendly look 
   * @param {*} steamid 
   * @param {*} appid 
   * @returns 
   */
   formatInventory: (inv, appid = 730, owner = '') => {
    let items = [];

    inv.forEach(item => {
      let color = '';
      let nametag = item.fraudwarnings ? (item.fraudwarnings.length >= 1 ? item.fraudwarnings[0].split(`'`)[2] : '') : ''; // csgo nametag
      let stickers = []; // csgo stickers
  
      // try to get stickers
      for(let i in item.descriptions) {
        const val = item.descriptions[i].value;

        if(val.split('Sticker: ').length > 1) {
          const sticker_names = val.split('Sticker: ')[1].split('<')[0].split(', ');
          const sticker_imgs = val.split('src="').slice(1);

          for(let i=0; i<sticker_imgs.length; i++) {
            stickers.push({
              name: sticker_names[i],
              img: sticker_imgs[i].split('">')[0]
            });
          }
        }
      }
      
      // get color
      color = item.tags.filter(tag => tag.category == 'Rarity')[0]?.color || (item.name_color || '');
      // if(item.name_color) color = item.name_color;
      
      // todo: why?
        // if(item.cache_expiration && !item.tradable) {
        //   item.tradable = 1;
        // }
      // end todo
      
      // check if tradable 
      if(item.tradable == 1 && item.marketable == 1) {
        let finalItem = {
          appid: appid.toString(),
          name: item.market_hash_name,
          assetid: item.assetid,
          classid: item.classid,
          instanceid: item.instanceid,
          contextid: item.contextid,
          amount: item.amount,
          image: `https://community.cloudflare.steamstatic.com/economy/image/${item.icon_url}`,
          color: color,
          nametag: nametag,
          stickers: stickers,
          tradableAfter: item.cache_expiration ? Math.round(+new Date(item.cache_expiration) / 1000) : 0,
          owner,
          price: 0,
          accept: item.accept
        };

        items.push(finalItem);
      }
    });
  
    return items;
  },

  /**
   * 
   * @param {*} steamid 
   * @param {*} appid 
   * @returns 
   */
  formatInventorySteamApis: (inv, appid = 730, owner = '') => {
    return inv.assets.map(item => {
      const matched = inv.descriptions.filter(x => x.classid == item.classid)[0];

      const itemFinal = {
        ...item,
        name: matched?.market_hash_name || '?',
        image: `https://community.cloudflare.steamstatic.com/economy/image/${matched?.icon_url}`,
        color: matched.tags.filter(tag => tag.category == 'Rarity')[0]?.color || (matched.name_color || ''),
        nametag: '',
        stickers: [],
        tradableAfter: 0,
        owner,
        price: 0,
        appid: appid.toString(),
        amount: parseInt(item.amount)
      };

      if(appid.toString() !== '440') { // tf2
        return itemFinal;
      }

      // todo: this is redundant, use parseEconItem from tf2-item-format (i cri)
      // todo: move to /resources/
      const QUALITIES = [
          "Normal", // 0
          "Genuine", // 1
          "rarity2", // 2
          "Vintage", // 3
          "rarity3", // 4
          "Unusual", // 5
          "Unique", // 6
          "Community", // 7
          "Valve", // 8
          "Self-Made", // 9
          "Customized", // 10
          "Strange", // 11
          "Completed", // 12
          "Haunted", // 13
          "Collector's", // 14
          "Decorated" // 15
      ];

      const KILLSTREAKS = [
        '',
        'Basic Killstreak', // 1
        'Specialized Killstreak', // 2
        'Professional Killstreak', // 3
      ];

      const WEARS = [
        '',
        '(Factory New)',
        '(Minimal Wear)',
        '(Field-Tested)',
        '(Well-Worn)',
        '(Battle Scarred)',
      ];

    //  if(!matched.descriptions) {
    //   console.log(matched);
    //  }

      // tf2 specific
      const quality = (matched.tags || []).filter(x => x.category == 'Quality')[0];
      const defIndexLink = ( (matched.actions || []).filter(x => x.name.toLowerCase().includes('item wiki'))[0] || {link: 'http://wiki.teamfortress.com/scripts/itemredirect.php?id=0&lang=en_US'} ).link;
      const defIndex = parseInt(defIndexLink.split('?id=')[1].split('&')[0]);
      const festive = (matched.descriptions || []).map(x => x.value).includes('Festivized');
      const australium = (matched.market_name || '').includes('Australium');
      // const uncraftable = (matched.descriptions || []).map(x => x.value.toLowerCase()).includes('Not Usable in Crafting') || (matched.descriptions || []).map(x => x.value).includes('Not Tradable, Marketable, or Usable in Crafting') || (matched.descriptions || []).map(x => x.value).includes('Usable in Crafting');
      // const killstreak = item.market_name.includes('Basic Killstreak') ? 1
      let killstreak = 0;
      KILLSTREAKS.forEach((x, key) => {
        if( (matched.market_name || '' ).includes(x)) killstreak = key;
      });

      // wear
      let wear = null;
      WEARS.forEach((x, key) => {
        if( (matched.market_name || '' ).includes(x)) killstreak = key;
      });

      // effect
      let effect = null;
      let effect_name = null;
      (matched.descriptions || []).forEach(x => {
        const name = (matched?.market_name || '').split(' ');
        if(!x.value.includes('Unusual Effect:') || effect !== null || name[name.length - 1] === ' Case') return;

        const eff = x.value.split(': ')[1];
        if(tf2_effects[eff]) {
          effect = tf2_effects[eff];
          effect_name = eff;
        }

      });

      // craftable
      let craftable = true;
      let descs = (matched.descriptions || []).map(x => x.value.toLowerCase());
      descs.forEach(x => {
        if(x.includes('not tradable, marketable, or usable in crafting') || x.includes('not usable in crafting')) {
          craftable = false;
        }
      })
      // if(descs.includes('not usable in crafting')) {
      //   craftable = false;
      //   console.log('yes1');
      // }

      // if(descs.includes('not tradable, marketable, or usable in crafting')) {
      //   craftable = false;
      //   console.log('yes2');
      // }

      const itemFinalTF2 = {
        defindex: defIndex,
        quality: QUALITIES.indexOf( quality?.localized_tag_name || 'Normal' ),
        craftable: craftable, 
        killstreak: killstreak,
        australium: australium,
        festive: festive,
        effect: Array.isArray(effect) ? effect[0] : effect,
        effect_name: effect_name,
        // paintkit: null, // Mann Co. Orange
        // https://wiki.teamfortress.com/wiki/Decorated
        // https://marketplace.tf/items/tf2/15012;15;u702;w3;pk4
        wear: wear,
        quality2: QUALITIES.indexOf( quality?.localized_tag_name || 'Normal' ),
        // target: null,
        // craftnumber: null
      }

      const itemExtra = {
        nametag: matched?.market_name !== matched?.name ? matched?.name : undefined
      };

      
      const itemSKU = SKU.fromObject(itemFinalTF2);

      // todo: we dont really to send all this, just the effect and sku is enough
      return {...itemFinal, ...itemFinalTF2, ...itemExtra, tf2_itemSKU: itemSKU};
    });
  },

  /**
   * Requests a new inventory from Steam with proxies
   * @param {String} steamid 
   * @param {String} appid
   * @returns Array 
  */
  getInventoryWithPrices: (steamid, appid = 730) => {
    return new Promise((resolve, reject) => {
      fetch(`https://api.steamapis.com/steam/inventory/${steamid}/${appid}/2?api_key=${steamApis.apiKey}`).then(res => res.json()).then(async res => {
        
      if(!res?.assets) {
          return reject(`Looks like your inventory is empty. If you think this is an error please try again in a few minutes.`);
        }

        if((res.status && res.status !== 200) || res.error) {
          return reject(`Failed to get your inventory - it would appear that Steam is currently down. Please try again in a few minutes. (3)`);
          // return console.log(`[Steam] Failed to get prices for appid ${appid}! (HTTP ${res.status})`);
        }

        let items = steamInventories.formatInventorySteamApis(res, appid, steamid);
        let itemsWithPrices = await steamInventories.attachPrices(items);

        await database.remove('steam_items', {filter: {owner: steamid, appid: appid.toString()}});
        await database.insert('steam_items', itemsWithPrices);

        resolve(itemsWithPrices);
      }).catch(e => {
        return reject(`Failed to get your inventory - it would appear that Steam is currently down. Please try again in a few minutes. (2)`);
      });
    });
  },

  /**
   * Check if cache has expired 
  */
  checkCacheExpiration: () => {
    const time = now();

    pricesCachedTF2 = JSON.parse(fs.readFileSync(`./.cache/prices_tf.json`, 'utf8'));
    pricesCachedTF2_overwrite = JSON.parse(fs.readFileSync(`./.cache/prices_tf_overwrite.json`, 'utf8'));

    Object.keys(pricesCachedExpiry).filter(x => time > pricesCachedExpiry[x]).forEach(appid => {
      steamInventories.updatePrices(appid);
    });
  },

  /**
   * Load cached price files and update them if needed. This should only be called
   * once as it will create a timer to check if price update is needed. 
  */
  loadCachedPrices: () => {
    const updateIntrv = setInterval(steamInventories.checkCacheExpiration, 30 * (60 * 1000)); // every 30 minutes

    steam.appIdsToLoadPrices.forEach(appid => {
      try {
        // we load the cached pricing regardless of expiration date to avoid downtime
        pricesCachedExpiry[appid] = parseInt(fs.readFileSync(`./.cache/prices_steam_${appid}_expiry`, 'utf8'));
        pricesCached[appid] = JSON.parse(fs.readFileSync(`./.cache/prices_steam_${appid}.json`, 'utf8'));
        pricesCachedTF2 = JSON.parse(fs.readFileSync(`./.cache/prices_tf.json`, 'utf8'));
        pricesCachedTF2_overwrite = JSON.parse(fs.readFileSync(`./.cache/prices_tf_overwrite.json`, 'utf8'));

        // todo: move this logic to checkCacheExpiration
        if(now() > pricesCachedExpiry[appid]) {
          console.log(`[Steam] Pricing cache for appid ${appid} has expired`);
          throw 'cache expired';
        }

        console.log(`[Steam] Loaded prices of ${Object.keys(pricesCached[appid]).length} items from cache for appid ${appid} (${Math.floor((pricesCachedExpiry[appid] - now()) / 3600)} hours left on cache)`);
      } catch(e) {
        steamInventories.updatePrices(appid);
      }
    });
  }
}

steamInventories.loadCachedPrices();

module.exports = steamInventories;