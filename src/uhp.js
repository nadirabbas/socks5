const dgram = require('dgram')

const publicIp = '182.191.83.219'
const boundAddress = '0.0.0.0'





const send = () => {
  const A = dgram.createSocket('udp4')
  const B = dgram.createSocket('udp4')

  A.bind(boundAddress, () => {
    B.bind(boundAddress, () => {
      const addressA = A.address();
      const addressB = B.address();

      A.on('message', (msg, info) => console.log(`A got: ${msg} from ${info.address}: ${info.port}`))
      B.on('message', (msg, info) => console.log(`B got: ${msg} from ${info.address}: ${info.port}`))

      A.send('A message from A', addressB.port, publicIp, () => {
        console.log(`${addressA.port} -> ${addressB.port}`)
        setTimeout(() => {
          B.send('A message from B', addressA.port, publicIp, () => {
            console.log(`${addressB.port} -> ${addressA.port}`)

            setTimeout(() => {
              A.close()
              B.close()
              send();
            }, 250)
          })
        }, 250)
      })
    })
  })
}

send()
