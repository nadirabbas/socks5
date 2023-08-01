
const ip = require('ip')

function readUdpDatagram(buffer) {

  // Step 1: Read the fixed-length fields directly from the buffer.
  const rsv = buffer.readUInt16BE(0); // Read 2 bytes at offset 0 as an unsigned 16-bit integer (big-endian).
  const frag = buffer.readUInt8(2); // Read 1 byte at offset 2 as an unsigned 8-bit integer.
  const atyp = buffer.readUInt8(3); // Read 1 byte at offset 3 as an unsigned 8-bit integer.

  // Step 2: Determine the lengths of the variable-length fields based on the values from Step 1.
  let dstAddrLength, dataLength;

  if (atyp === 1) {
    // IPv4 address (assuming DST.ADDR is 4 bytes long in this case).
    dstAddrLength = 4;
  } else if (atyp === 4) {
    // IPv6 address (assuming DST.ADDR is 16 bytes long in this case).
    dstAddrLength = 16;
  } else {
    // Handle other address types, if needed.
    console.error('Unsupported address type');
    return null;
  }

  // Assuming DST.PORT is always 2 bytes long.
  const dstPortLength = 2;

  // Step 3: Extract the variable-length fields from the buffer.
  const dstAddr = buffer.slice(4, 4 + dstAddrLength); // Extract the DST.ADDR bytes.
  const dstPort = buffer.readUInt16BE(4 + dstAddrLength); // Read 2 bytes after DST.ADDR as an unsigned 16-bit integer (big-endian).

  // The DATA length is the remaining bytes in the buffer after the fixed and variable-length fields.
  const data = buffer.slice(4 + dstAddrLength + dstPortLength);

  // Construct the extracted data as an object and return it.
  return {
    address: ip.toString(dstAddr),
    port: dstPort,
    data
  };
}

function createUdpRequestBuffer(ip, port, data) {
  const RSV = 0; // Reserved X'0000'
  const FRAG = 0; // Current fragment number
  const ATYP = 1; // Address type (IPv4 address: X'01')

  // Convert the destination address string to binary representation
  const DST_ADDR_BIN = Buffer.from(ip.split('.').map((num) => parseInt(num, 10)));

  // Create the buffer
  const bufferSize = 2 + 1 + 1 + DST_ADDR_BIN.length + 2 + data.length;
  const buffer = Buffer.alloc(bufferSize);

  // Write the individual components into the buffer
  let offset = 0;
  buffer.writeUInt16BE(RSV, offset);
  offset += 2;

  buffer.writeUInt8(FRAG, offset);
  offset += 1;

  buffer.writeUInt8(ATYP, offset);
  offset += 1;

  DST_ADDR_BIN.copy(buffer, offset);
  offset += DST_ADDR_BIN.length;

  buffer.writeUInt16BE(port, offset);
  offset += 2;

  data.copy(buffer, offset);

  return buffer;
}


module.exports = { readUdpDatagram, createUdpRequestBuffer }