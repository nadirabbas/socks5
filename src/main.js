const socks5 = require('./socks5')
const udp = require('./udp')

const PORT = 6801
const HOST = '0.0.0.0'

fetch('https://icanhazip.com/').then(res => res.text()).then((ip) => {
  socks5.createServer({ ip }).listen(PORT, HOST);
})