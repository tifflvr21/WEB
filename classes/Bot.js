const r = require('rethinkdb');
const SteamUser = require('steam-user');
const SteamCommunity = require('steamcommunity');
const SteamTotp = require('steam-totp');
const TradeOfferManager = require('steam-tradeoffer-manager');
const fs = require('fs');

const events = require('../interfaces/events');
const { isValidTradelink } = require('../helpers');
const config = require('../config');

class Bot {
  constructor(data) {
    if(global.disableBots) {
      this.isBanned = true;
      this.data = data;
      
      return;
    }
    
    this.data = data;
    this.client = new SteamUser();
    this.manager = new TradeOfferManager({steam: this.client, domain: config.http.backendUrl, language: 'en'});
    this.community = new SteamCommunity();

    if(fs.existsSync(`./.cache/polldata/polldata-${this.data.steamid}.json`)) {
      this.manager.pollData = JSON.parse(fs.readFileSync(`./.cache/polldata/polldata-${this.data.steamid}.json`).toString('utf8'));
    }

    this.signIn();

    this.client.on('loggedOn', this.onSignIn);
    this.client.on('webSession', this.onWebSession);
    this.client.on('friendRelationship', this.onFriendRelationship);
    this.client.on('vacBans', this.onVacBans);
    this.client.on('accountLimitations', this.onAccountLimitations);
    this.client.on('error', this.onError);

    this.community.on('sessionExpired', this.onSessionExpired);

    this.manager.on('sentOfferChanged', this.onSentOfferChanged);
    this.manager.on('newOffer', this.onNewOffer);
    this.manager.on('pollData', (pollData) => {
      // if(!fs.existsSync(`${__dirname}/../polldata`)) fs.mkdirSync(`${__dirname}/../polldata`);

      fs.writeFileSync(`./.cache/polldata/polldata-${this.data.steamid}.json`, JSON.stringify(pollData));
    });

    this.sendOffer = this.sendOffer.bind(this);

    // For the most part, if you just call webLogOn every 30 minutes, you should be fine ~ McKay
    // https://dev.doctormckay.com/topic/3999-sessionexpired-does-not-seem-to-be-fired/
    this.intrv = setInterval(() => {
      this.signIn();
    }, 30 * (60 * 1000));
  }

  onSignIn = () => {
    console.log(`Bot ${this.data.steamid} logged in`);

    this.client.webLogOn();
    this.client.setPersona(SteamUser.EPersonaState.Online);

    this.client.getPersonas([this.data.steamid], (err, personas) => {
      if(err) return;
      const persona = personas[this.data.steamid];

      this.data.name = persona.player_name;
      this.data.avatar = persona.avatar_url_full;
    });

    this.client.requestFreeLicense(730, () => {
      this.client.gamesPlayed(730);
    });
  }

  onWebSession = (sessionID, cookies) => {
    this.community.setCookies(cookies);
    this.manager.setCookies(cookies, err => {
      if(err) return console.log(`Bot ${this.data.steamid} failed to obtain API key`, err);

      console.log(`Bot ${this.data.steamid} obtained an API Key (${this.manager.apiKey})`);
    });
    // this.community.profileSettings({profile: 3, inventory: 3});
  }

  onSessionExpired = () => {
    this.signIn();
    console.log(`Bot ${this.data.steamid} is now offline (session expired)`);
  }

  onFriendRelationship = (steamID, relationship) => {
    if(steamID.getSteamID64() == config.steam.defaultAdmin) {
      this.client.addFriend(steamID);
    }
  }

  onError = err => {
    console.log(`Bot ${this.data.steamid} experienced an error`, err.message);
  }

  onSentOfferChanged = (offer, oldState) => {
    events.emit('steam:sentOfferChanged', {offer, oldState});
  }

  onNewOffer = offer => {
    if(offer.partner.getSteamID64() !== config.steam.defaultAdmin) {
      return offer.cancel();
    }

    console.log(`New offer from admin! We will send ${offer.itemsToGive.length} items and receive ${offer.itemsToReceive.length} items`);

    offer.accept((err, status) => {
      if(!err) this.community.acceptConfirmationForObject(this.data.identitySecret, offer.id);
    });
  }

  onVacBans = (numBams, appids) => {
    const appsToCheck = [730, 252490, 440]; // todo: get from config

    if(appids.filter(value => appsToCheck.includes(value)).length > 0) {
      this.isBanned = true;
      console.log(`Bot ${this.data.steamid} is vac-banned in one of the games we support :(`);
    }
  }

  onAccountLimitations = (limited, communityBanned, locked) => {
    if(limited || communityBanned || locked) {
      this.isBanned = true;
      console.log(`Bot ${this.data.steamid} is trade-banned :(`);
    }
  }

  isOnline = () => {
    return this.isBanned ? false : !isNaN(this.client.cellID);
  }

  signIn = () => {
    this.client.logOn({
      accountName: this.data.accountName,
      password: this.data.password,
      twoFactorCode: SteamTotp.getAuthCode(this.data.sharedSecret),
      logonID: 'TF2Double'
    });
  }

  signOut = () => {
    this.client.logOff();
  }

  getAllItems(appid) {
    return new Promise((resolve, reject) => {
      this.manager.getInventoryContents(appid || config.steam.defaultAppId, 2, false, (err, inventory) => {
        if(err) return reject(err);

        resolve(inventory);
      });
    });
  }

  sendOffer({ type, user, items = [], code, message }) {
    return new Promise((resolve, reject) => {
      const link = user.get('tradelink') || '';
      const steamid = user.get('steamid') || '';
      
      if(!isValidTradelink(link)) {
        // offer.cancel();
        return reject('Invalid tradelink');
      }

      if(!items || items.length == 0) {
        return reject('Cant send an empty trade offer');
      }

      
      this.manager.getOffers(1, (err, sent, received) => { // 1 = active only
        // sent.forEach(o => {
        //   if(o.partner.getSteamID64() == steamid) {
        //     return reject(`You already have an active trade with our bot. Please cancel it before proceeding.`);
        //   }
        // });
        // check for outstanding offers
        const outstanding = (sent || []).filter(o => o.partner.getSteamID64() == steamid);
        if(outstanding.length > 0 && type !== 'withdraw') return reject(`You already have an active trade with our bot. Please cancel it before proceeding.`);

        // we aight, send the offer
        const offer = this.manager.createOffer(link);
        if(type == 'deposit') offer.addTheirItems(items);
        else offer.addMyItems(items);

        if(code) offer.setMessage(message || `Security code: ${code}`);
        if(offer.partner.getSteamID64() !== steamid) {
          offer.cancel();
          return reject(`This tradelink isn't connected to your account. Please input a valid one.`);
        }

        console.log(`sendOffer type ${type} to ${user.get('name')} (id: ${user.get('id')})`, items);

        // todo: cancel that offer after 5 minutes
        offer.send((err, status) => {
          if(err) return reject(err);

          if(status == 'pending') {
            this.community.acceptConfirmationForObject(this.data.identitySecret, offer.id, (err) => {
              if(err) return reject(err);
              else resolve(offer.id);
            });
          } else {
            return resolve(offer.id);
          }
        });
      });
    });
  }
}

module.exports = Bot;