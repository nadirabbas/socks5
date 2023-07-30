const socks5 = require('./socks5')
const udp = require('./udp')

const PORT = 6801
const HOST = '0.0.0.0'

socks5.createServer().listen(PORT, HOST);