const crypto = require('crypto');
const RandomOrg = require('random-org');
const Chance = require('chance');
const config = require('../config');

var random = new RandomOrg({apiKey: config.randomorg.apiKey});

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const randomorg = {
  getSignedString: ({ n = 1, length = 32 } = {}) => {
    return new Promise((resolve, reject) => {
      const serverHash = crypto.randomBytes(length).toString('hex');

      random.generateSignedStrings({ n: n, length: length, characters: chars }).then(result => {
        resolve({
          result: result.random.data.length > 1 ? result.random.data : result.random.data[0],
          random: JSON.stringify(result.random),
          signature: result.signature,
          serverHash
        });
      }).catch(e => {
        let results = [];
        for(let i=0; i<n; i++) results.push( crypto.randomBytes(64).toString('hex') );
        console.log('failed to generate signed string from random.org! we will use our own');

        resolve({
          result: results.length > 1 ? results : results[0],
          random: '-',
          signature: '-',
          serverHash
        });
      });
    });
  }
}

module.exports = randomorg;