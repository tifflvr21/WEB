const express = require('express');
const router = express.Router();
const manager = require('../interfaces/bots');

// router.get('/status', async (req, res) => {
//   return res.status(200).json(manager.getStatus());
// });

router.post('/items/:appid', async (req, res) => {
  return res.status(503).json({success: false, msg: `Service temporarily disabled`});
  
  manager.getAllItems(req.params.appid).then(items => {
    return res.status(200).json({success: true, inv: items});
  }).catch(e => {
    return res.status(500).json({success: false, msg: e.message || e});
  });
});

module.exports = router;