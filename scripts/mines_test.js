const sha256 = require('sha256');

const HASH = 'd92170ae5803963bc60cbe538824ee0d63a745eb605da65b0867177b31a0109c';
const TILES = 36;
const BOMBS = 6; 
let arr = [];

for(let i=0; i<1000; i++) {
  const mineHash = sha256(HASH + '-' + i);
  const res = parseInt(mineHash.substr(0, 8), 16) % TILES;

  if(!arr.includes(res)) {
    arr.push(res);
  }

  if(arr.length >= BOMBS) break;
}

console.log(arr);