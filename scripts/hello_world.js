/*const express = require('express')
const fs = require('fs')
const https = require('https')
const app = express()
const port = process.env.PORT || 80

const privateKey = fs.readFileSync( '.ssl/privatekey.pem', 'utf8' );
const certificate = fs.readFileSync( '.ssl/certificate.pem', 'utf8' );

const server = https.createServer({
  key: privateKey,
  cert: certificate
}, app).listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});


app.get('/', (req, res) => {
  res.send('Hello World!')
});


server.keepAliveTimeout = (60 * 1000) + 1000;
server.headersTimeout = (60 * 1000) + 2000;*/

const express = require('express')
const fs = require('fs')
const https = require('https')
const app = express()
const port = process.env.PORT || 80

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

app.get('/', (req, res) => {
  res.send('<style>body{overflow:hidden}</style><div style="font-size:100px;font-weight:600;display:flex;justify-content:center;align-items:center;height:100vh;width:100%">Hello World!</div>')
})


app.keepAliveTimeout = (60 * 1000) + 1000;
app.headersTimeout = (60 * 1000) + 2000;