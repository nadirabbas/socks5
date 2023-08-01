const socks5 = require('./socks5')

const PORT = 6801
const HOST = '0.0.0.0'

fetch('https://api.ipify.org/').then(res => res.text()).then((ip) => {
  socks5.createServer({ ip: ip.replace('\\n', '') }).listen(PORT, HOST);
})