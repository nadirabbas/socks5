const net = require('net')
const ip = require('ip')

const socket = net.createConnection({
  port: 6801,
  host: '0.0.0.0'
})

socket.on('connect', () => {

  socket.write(Buffer.from([
    0x05,
    0x01,
    0x00,
    0x01,

    ...[...ip.toBuffer('182.191.83.219')],
    ...[80]
  ]))


  const dataSent = socket.write(Buffer.from([
    0x05,
    0x03,
    0x00,
    0x01,

    // ip
    0x00, 0x00, 0x00, 0x00,

    // port
    0x00, 0x00
  ]))
})

socket.on('data', data => {
  console.log(data)
})