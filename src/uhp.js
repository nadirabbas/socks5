const dgram = require('dgram')

const publicIp = '182.191.83.219'

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const send = () => {
  const A = dgram.createSocket('udp4')
  const B = dgram.createSocket('udp4')

  const time = () => new Date().toLocaleTimeString('en-US', { hour12: false })

  A.on('message', (msg, info) => console.log(`${time()}: A got: ${msg} from ${info.address}: ${info.port}`))
  B.on('message', (msg, info) => {
    console.log(`${time()}: B got: ${msg} from ${info.address}: ${info.port}`)
  })

  A.bind(() => {
    B.bind(8001, async () => {
      const addressA = A.address();
      const addressB = B.address();

      A.send('hello world from A', addressB.port, publicIp)
      B.send('hello world from B', addressA.port, publicIp)
      B.send('hello world from B', addressA.port, publicIp)
      B.send('hello world from B', addressA.port, publicIp)
    })
  })
}

send()
