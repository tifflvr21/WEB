const SKU = require('tf2-sku');

// Mann Co. Supply Crate Key
const item = {
    defindex: 30786,
    quality: 5,
    craftable: true,
    killstreak: 0,
    australium: false,
    // festive: false,
    effect: 13,
    // paintkit: 5,
    // wear: null,
    // quality2: null,
    // target: null,
    // craftnumber: null
};

// Converts the item object into an sku string
const sku = SKU.fromObject(item);

console.log(sku);