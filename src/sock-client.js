const net = require('net')
const ip = require('ip')
const { readUdpDatagram, createUdpRequestBuffer } = require('./util')
const dgram = require('dgram')

const socket = net.createConnection({
  port: 6801,
  host: '182.191.83.219'
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

socket.on('data', msg => {
  if (msg.length !== 10) return

  const { address, port } = readUdpDatagram(msg)

  const udp = dgram.createSocket('udp4')
  udp.on('message', msg => {
    const { data } = readUdpDatagram(msg)

    console.log(data.toString())
  })
  udp.bind(() => {
    const msg = createUdpRequestBuffer(address, port, Buffer.from('sent to you!'))
    udp.send(msg, port, address)
  })

})