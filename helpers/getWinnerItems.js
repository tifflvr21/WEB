// const { sum } = require('./index');
const sum = (arr, key) => arr.reduce((a, b) => +a + +b[key], 0);

const OUR_CUT = 0.10; // 0.10 = 10%
// const ACCEPTABLE_STEAL_CUT = 1.5; // 1.50 = 150%. this means that we are fine with taking an item thats worth 50% more than our cut
// const AGGRESIVE_CUT_TAKE = true; // take items even if they are too expensive for us to take

/**
 * Calculate which items to keep and which items to send to user
*/
const getWinnerItems = items => {
    const totalValue = sum(items, 'price');
    const idealCutValue = totalValue * OUR_CUT;
    const itemsUnderOurFullCutValue = items.filter(item => item.price <= idealCutValue).sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
    const sumOfItemsUnderOurFullCutValue = sum(itemsUnderOurFullCutValue, 'price');
  
    // scenario 1 - there is 2 or less items so we dont keep anything
    if(items.length <= 2) {
      console.log('scenario 1');
      return {
        cut: [],
        win: items,
        cutAmount: 0,
        winAmount: totalValue,
        idealCutAmount: idealCutValue
      };
    }
  
    // scenario 2 - there are items that are worth less than our cut value but together they are worth more  - we will try to take the most expensive items from here
    if(itemsUnderOurFullCutValue.length > 0 && sumOfItemsUnderOurFullCutValue > idealCutValue) {
      console.log('scenario 2');
      let cut = [];
  
      const retry = (index = 0) => {
        if(!itemsUnderOurFullCutValue[index]) {
          return 'ok';
        }
  
        // we will keep adding items until we meet our cut amount
        cut.push(itemsUnderOurFullCutValue[index]);
  
        if(sum(cut, 'price') < idealCutValue) {
          retry(index + 1);
        } else {
          return 'ok';
        }
      }
  
      retry();
  
      cut = [...new Set(cut)];
  
      return {
        cut: cut,
        win: items.filter(item => !cut.map(it => it.assetid).includes(item.assetid)),
        cutAmount: sum(cut, 'price'),
        winAmount: sum(items.filter(item => !cut.map(it => it.assetid).includes(item.assetid)), 'price'),
        idealCutAmount: idealCutValue
      }
    }
  
    // scenario 3 - there is no items worth less than our cut value - we will take the cheapest item from the list 
    if(itemsUnderOurFullCutValue.length == 0 || sumOfItemsUnderOurFullCutValue < idealCutValue) {
      const itemToTake = items.sort((a, b) => parseFloat(a.price) - parseFloat(b.price))[0];
  
      // scenario 4 - the item we chose is too cheap, we will try to take an item that is the closest in value to our ideal cut
      if(itemToTake.price < (idealCutValue / 2)) {
        console.log('scenario 4');
        
        const itemToTake2 = items.filter(it => it.price == items.map(item => item.price).reduce(function(prev, curr) {
          return (Math.abs(curr - idealCutValue) < Math.abs(prev - idealCutValue) ? curr : prev);
        }))[0];
  
        return {
          cut: [itemToTake2],
          win: items.filter(item => item.assetid !== itemToTake2.assetid),
          cutAmount: itemToTake2.price,
          winAmount: sum(items.filter(item => item.assetid !== itemToTake2.assetid), 'price'),
          idealCutAmount: idealCutValue
        }
      }
  
      // scenario 3
      console.log('scenario 3');
      
      return {
        cut: [itemToTake],
        win: items.filter(item => item.assetid !== itemToTake.assetid),
        cutAmount: itemToTake.price,
        winAmount: sum(items.filter(item => item.assetid !== itemToTake.assetid), 'price'),
        idealCutAmount: idealCutValue
      }
    }
  
    // fail-safe
    console.log('fail-safe');
  
    return {
      cut: [],
      win: items,
      cutAmount: 0,
      winAmount: totalValue,
      idealCutAmount: idealCutValue
    }
  }

  

module.exports = getWinnerItems;