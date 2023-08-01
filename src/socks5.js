const {
	RFC_1928_ATYP,
	RFC_1928_COMMANDS,
	RFC_1928_METHODS,
	RFC_1928_REPLIES,
	RFC_1928_VERSION,
	RFC_1929_REPLIES,
	RFC_1929_VERSION,
} = require("./constants.js");
const binary = require("binary");
const domain = require("domain");
const net = require("net");
const dgram = require("dgram");
const ip = require('ip')
const moment = require('moment')

const EVENTS = {
	AUTHENTICATION: "authenticate",
	AUTHENTICATION_ERROR: "authenticateError",
	CONNECTION_FILTER: "connectionFilter",
	HANDSHAKE: "handshake",
	PROXY_CONNECT: "proxyConnect",
	PROXY_DATA: "proxyData",
	PROXY_DISCONNECT: "proxyDisconnect",
	PROXY_END: "proxyEnd",
	PROXY_ERROR: "proxyError",
};

let msgReceivedAt = moment()

const LENGTH_RFC_1928_ATYP = 4;

class SocksServer {
	constructor(options) {
		let self = this;

		self.ip = options.ip
		self.nat = {}
		self.activeSessions = [];
		self.options = options || {};
		self.server = net.createServer((socket) => {
			socket.on("error", (err) => {
				self.server.emit(EVENTS.PROXY_ERROR, err);
			});

			function authenticate(buffer) {
				let authDomain = domain.create();

				binary
					.stream(buffer)
					.word8("ver")
					.word8("ulen")
					.buffer("uname", "ulen")
					.word8("plen")
					.buffer("passwd", "plen")
					.tap((args) => {
						args.requestBuffer = buffer;

						if (args.ver !== RFC_1929_VERSION) {
							return end(RFC_1929_REPLIES.GENERAL_FAILURE, args);
						}

						authDomain.on("error", (err) => {
							self.server.emit(
								EVENTS.AUTHENTICATION_ERROR,
								args.uname.toString(),
								err
							);
							return end(RFC_1929_REPLIES.GENERAL_FAILURE, args);
						});

						self.options.authenticate(
							args.uname.toString(),
							args.passwd.toString(),
							socket,
							authDomain.intercept(() => {
								self.server.emit(EVENTS.AUTHENTICATION, args.uname.toString());
								let responseBuffer = Buffer.allocUnsafe(2);
								responseBuffer[0] = RFC_1929_VERSION;
								responseBuffer[1] = RFC_1929_REPLIES.SUCCEEDED;
								socket.write(responseBuffer, () => {
									socket.once("data", connect);
								});
							})
						);
					});
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
				} else if (atyp === 3) {
					dstAddrLength = buffer.readUInt8(4)
				} else {
					// Handle other address types, if needed.
					console.error('Unsupported address type');
					return null;
				}

				// Assuming DST.PORT is always 2 bytes long.
				const dstPortLength = 2;

				const isDomain = atyp === 3
				const offset = isDomain ? 5 : 4

				// Step 3: Extract the variable-length fields from the buffer.
				const dstAddr = buffer.slice(offset, offset + dstAddrLength); // Extract the DST.ADDR bytes.
				const dstPort = buffer.readUInt16BE(offset + dstAddrLength); // Read 2 bytes after DST.ADDR as an unsigned 16-bit integer (big-endian).

				// The DATA length is the remaining bytes in the buffer after the fixed and variable-length fields.
				const data = buffer.slice(offset + dstAddrLength + dstPortLength);

				// Construct the extracted data as an object and return it.
				return {
					address: isDomain ? dstAddr.toString() : ip.toString(dstAddr),
					port: dstPort,
					data
				};
			}


			function handleUdp(socket, args) {
				const udpServer = dgram.createSocket('udp4');

				udpServer.on('message', (msg, clientInfo) => {
					const message = msg.toString()
					if (message.includes('upnp')) return;
					const isClient = msg[0] === 0x00 && msg[1] === 0x00 && msg[2] === 0x00 && (msg[3] === 0x01 || msg[3] === 0x03)
					const udpRelayAddress = udpServer.address();
					let serverInfo;

					if (isClient) {
						serverInfo = readUdpDatagram(msg, clientInfo, socket)
						self.nat[udpRelayAddress.port] = clientInfo.port
					} else {
						serverInfo = {
							address: socket.remoteAddress,
							port: self.nat[udpRelayAddress.port],
							data: createUdpRequestBuffer(clientInfo.address, clientInfo.port, msg)
						}
					}

					if (!serverInfo || !udpRelayAddress) {
						return
					}

					if (moment().diff(msgReceivedAt, 'seconds') >= 15) {
						console.log('--------------------------------------------------------')
						msgReceivedAt = moment()
					}

					console.log(`${moment().format('hh:mm:ss A')} ${clientInfo.address}:${clientInfo.port} -> ${udpRelayAddress.address}:${udpRelayAddress.port} -> ${serverInfo.address}:${serverInfo.port}`)

					udpServer.send(serverInfo.data, serverInfo.port, serverInfo.address, (err) => {
						if (err) {
							console.log(err, serverInfo, clientInfo)
						}
					})
				});

				udpServer.on('error', (err) => {
					console.log('error', err)
					try {
						udpServer.close();
					} catch (err) {

					}
				});


				udpServer.bind(() => {
					const port = udpServer.address().port

					// IP
					const bndAddr = self.ip
					const bndAddrBuffer = Buffer.from(bndAddr.split('.').map(Number));


					let responseBuffer = Buffer.alloc(10 + bndAddrBuffer.length);
					responseBuffer[0] = RFC_1928_VERSION;
					responseBuffer[1] = RFC_1928_REPLIES.SUCCEEDED;
					responseBuffer[2] = 0x00;
					responseBuffer[3] = RFC_1928_ATYP.IPV4;


					bndAddrBuffer.copy(responseBuffer, 4);
					responseBuffer.writeUInt16BE(port, 4 + bndAddrBuffer.length)

					socket.write(responseBuffer.slice(0, -4));

					udpServer.on('close', () => {
						// console.log('Closed ' + port)
					})

					socket.once('close', () => {
						udpServer.close();
					});
				})
			}

			function connect(buffer) {

				console.log('connect', buffer)

				let binaryStream = binary.stream(buffer);

				binaryStream
					.word8("ver")
					.word8("cmd")
					.word8("rsv")
					.word8("atyp")
					.tap((args) => {
						args.requestBuffer = buffer;

						if (args.ver !== RFC_1928_VERSION) {
							return end(RFC_1928_REPLIES.GENERAL_FAILURE, args);
						}

						self.activeSessions.push(socket);
						args.dst = {};

						if (args.atyp === RFC_1928_ATYP.IPV4) {
							binaryStream
								.buffer("addr.buf", LENGTH_RFC_1928_ATYP)
								.tap((args) => {
									args.dst.addr = [...args.addr.buf].join(".");
								});
						} else if (args.atyp === RFC_1928_ATYP.DOMAINNAME) {
							binaryStream
								.word8("addr.size")
								.buffer("addr.buf", "addr.size")
								.tap((args) => {
									args.dst.addr = args.addr.buf.toString();
								});
						} else if (args.atyp === RFC_1928_ATYP.IPV6) {
							binaryStream
								.word32be("addr.a")
								.word32be("addr.b")
								.word32be("addr.c")
								.word32be("addr.d")
								.tap((args) => {
									args.dst.addr = ["a", "b", "c", "d"]
										.map(
											(x) =>
												(args.addr[x] >>> 16).toString(16) +
												(args.addr[x] & 0xffff).toString(16)
										)
										.join(":");
								});
						} else {
							return end(RFC_1928_REPLIES.ADDRESS_TYPE_NOT_SUPPORTED, args);
						}
					})
					.word16bu("dst.port")
					.tap((args) => {
						if (args.cmd === RFC_1928_COMMANDS.UDP_ASSOCIATE) {
							handleUdp(socket, args);
						}

						if (args.cmd === RFC_1928_COMMANDS.CONNECT) {
							let connectionFilter = self.options.connectionFilter;
							let connectionFilterDomain = domain.create();

							if (!connectionFilter || typeof connectionFilter !== "function") {
								connectionFilter = (destination, origin, callback) =>
									setImmediate(callback);
							}

							connectionFilterDomain.on("error", (err) => {
								self.server.emit(
									EVENTS.CONNECTION_FILTER,
									{ address: args.dst.addr, port: args.dst.port },
									{ address: socket.remoteAddress, port: socket.remotePort },
									err
								);
								return end(RFC_1928_REPLIES.CONNECTION_NOT_ALLOWED, args);
							});

							return connectionFilter(
								{ address: args.dst.addr, port: args.dst.port },
								{ address: socket.remoteAddress, port: socket.remotePort },
								connectionFilterDomain.intercept(() => {
									let destination = net.createConnection(
										args.dst.port,
										args.dst.addr,
										() => {
											let responseBuffer = Buffer.alloc(
												args.requestBuffer.length
											);
											args.requestBuffer.copy(responseBuffer);
											responseBuffer[1] = RFC_1928_REPLIES.SUCCEEDED;
											socket.write(responseBuffer, () => {
												destination.pipe(socket);
												socket.pipe(destination);
											});
										}
									);

									let destinationInfo = {
										address: args.dst.addr,
										port: args.dst.port,
									};
									let originInfo = {
										address: socket.remoteAddress,
										port: socket.remotePort,
									};

									destination.on("connect", () => {
										self.server.emit(
											EVENTS.PROXY_CONNECT,
											destinationInfo,
											destination
										);
										destination.on("data", (data) => {
											self.server.emit(EVENTS.PROXY_DATA, data);
										});
										destination.on("close", (hadError) => {
											self.server.emit(
												EVENTS.PROXY_DISCONNECT,
												originInfo,
												destinationInfo,
												hadError
											);
										});
										connectionFilterDomain.exit();
									});

									destination.on("error", (err) => {
										connectionFilterDomain.exit();
										err.addr = args.dst.addr;
										err.atyp = args.atyp;
										err.port = args.dst.port;
										self.server.emit(EVENTS.PROXY_ERROR, err);

										if (err.code && err.code === "EADDRNOTAVAIL") {
											return end(RFC_1928_REPLIES.HOST_UNREACHABLE, args);
										}
										if (err.code && err.code === "ECONNREFUSED") {
											return end(RFC_1928_REPLIES.CONNECTION_REFUSED, args);
										}
										return end(RFC_1928_REPLIES.NETWORK_UNREACHABLE, args);
									});
								})
							);
						} else {
							return end(RFC_1928_REPLIES.SUCCEEDED, args);
						}
					});
			}

			function end(response, args) {
				let responseBuffer = args.requestBuffer || Buffer.allocUnsafe(2);
				if (!args.requestBuffer) {
					responseBuffer[0] = RFC_1928_VERSION;
				}
				responseBuffer[1] = response;
				try {
					if (RFC_1928_REPLIES.GENERAL_FAILURE == response) socket.end(responseBuffer);
				} catch (ex) {
					socket.destroy();
				}
				self.server.emit(EVENTS.PROXY_END, response, args);
			}

			function handshake(buffer) {

				console.log('handshake', buffer)

				binary
					.stream(buffer)
					.word8("ver")
					.word8("nmethods")
					.buffer("methods", "nmethods")
					.tap((args) => {
						if (args.ver !== RFC_1928_VERSION) {
							try { socket.close() } catch (err) { }
							return end(RFC_1928_REPLIES.GENERAL_FAILURE, args);
						}

						let acceptedMethods = [...args.methods].reduce(
							(methods, method) => {
								methods[method] = true;
								return methods;
							},
							{}
						);

						let basicAuth = typeof self.options.authenticate === "function";
						let next = connect;


						let noAuth =
							!basicAuth &&
							typeof acceptedMethods[0] !== "undefined" &&
							acceptedMethods[0];
						let responseBuffer = Buffer.allocUnsafe(2);

						responseBuffer[0] = RFC_1928_VERSION;

						if (basicAuth) {
							responseBuffer[1] = RFC_1928_METHODS.BASIC_AUTHENTICATION;
							next = authenticate;
						} else if (!basicAuth && noAuth) {
							responseBuffer[1] = RFC_1928_METHODS.NO_AUTHENTICATION_REQUIRED;
							next = connect;
						} else {
							return end(RFC_1928_METHODS.NO_ACCEPTABLE_METHODS, args);
						}

						socket.write(responseBuffer, () => {
							self.server.emit(EVENTS.HANDSHAKE, socket);
							socket.once("data", next);
						});
					});
			}

			socket.once("data", handshake);

			socket.once("end", () => {
				self.activeSessions.splice(self.activeSessions.indexOf(socket), 1);
			});
		});
		self.server.on('listening', () => {
			console.log('proxy started')
		})
	}
}

module.exports = {
	SocksServer,
	createServer: (options) => {
		let socksServer = new SocksServer(options);
		return socksServer.server;
	},
	events: EVENTS,
};
