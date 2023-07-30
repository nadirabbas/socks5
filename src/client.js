const dgram = require('dgram')
const socket = dgram.createSocket('udp4')

socket.on('message', (msg, info) => {
  console.log(`Server got: ${msg} from ${info.address}: ${info.port}`)
})

socket.bind(8082)

socket.send('A message from the Vizier', 9000, '0.0.0.0')