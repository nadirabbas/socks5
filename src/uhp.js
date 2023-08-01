const dgram = require('dgram')

const send = (publicIp) => {
  const A = dgram.createSocket('udp4')
  const B = dgram.createSocket('udp4')
  const C = dgram.createSocket('udp4')

  const time = () => new Date().toLocaleTimeString('en-US', { hour12: false })

  A.on('message', (msg, info) => console.log(`${time()}: A got: ${msg} from ${info.address}: ${info.port}`))
  B.on('message', (msg, info) => {
    console.log(`${time()}: B got: ${msg} from ${info.address}: ${info.port}`)
  })

  A.bind(() => {
    B.bind(() => {
      C.bind(() => {
        const addressA = A.address();
        const addressB = B.address();

        console.log(addressA.port, addressB.port)

        A.send('hello world from A', addressB.port, publicIp, () => {
          B.send('hello world from B', addressA.port, publicIp)
        })
        // C.send('hello world from C', addressA.port, publicIp)
      })
    })
  })
}

fetch('https://api.ipify.org/').then(res => res.text()).then((ip) => {
  send(ip)
})
