import { createServer } from '@nadir2k/pk-proxy'

const server = createServer({
  logging: true
}, (socket) => {
  return socket.remoteAddress.includes('127.0.0.1')
}).listen(8081, '0.0.0.0')
