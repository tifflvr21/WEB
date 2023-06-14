const now = (divideBy1000 = true) => Math.round(+new Date() / (divideBy1000 ? 1000 : 1));
const isDefined = e => typeof e !== 'undefined';
const steamID64to32 = id => id.substr(3) - 61197960265728;
const steamID32to64 = id => '765' + (parseInt(id) + 61197960265728);
const generateId = (length = 32, numsOnly = false) => {
    let result = '';
    let characters = numsOnly ? '0123456789' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
 
    for(let i=0; i<length; i++) {
     result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
 
    return result;
}
const isValidTradelink = link => {
    const patt = new RegExp(/steamcommunity\.com\/tradeoffer\/new\/\?partner=[0-9]*&token=[a-zA-Z0-9_-]*/i);
    return !(!patt.test(link) || link == '');
}
const isProd = process.env.NODE_ENV == 'production';
const addZeros = num => num < 10 ? `0${num}` : num;
const sum = (arr, key) => arr.reduce((a, b) => +a + +b[key], 0);
const getWinnerItems = require('./getWinnerItems');

module.exports = {
    now,
    isDefined,
    steamID64to32,
    steamID32to64,
    generateId,
    isValidTradelink,
    isProd,
    addZeros,
    sum,
    getWinnerItems
}