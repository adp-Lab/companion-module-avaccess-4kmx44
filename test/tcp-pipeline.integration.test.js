const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')
const { TCPHelper, InstanceStatus } = require('@companion-module/base')
const { LineBuffer, parseDeviceReply, createInitialState, applyReplyToState } = require('../src/commands')

function startFakeMatrix() {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      server.lastSocket = socket
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

// Waits for the fake matrix to have actually accepted a connection
// (server.lastSocket assigned). Plain net sockets can fire the client-side
// 'ready'/'connect' event in the same or an earlier tick than the
// server-side 'connection' event completes on loopback, so relying on the
// client-side event alone races with server.lastSocket being set.
function waitForServerConnection(server) {
  return new Promise((resolve) => {
    if (server.lastSocket) {
      resolve()
      return
    }
    const check = setInterval(() => {
      if (server.lastSocket) {
        clearInterval(check)
        resolve()
      }
    }, 5)
  })
}

test('TCPHelper connects to a real socket and delivers data to our parsing pipeline', async () => {
  const server = await startFakeMatrix()
  const port = server.address().port

  const state = createInitialState()
  const lineBuffer = new LineBuffer()
  const tcp = new TCPHelper('127.0.0.1', port)
  tcp.on('error', () => {
    // Real connection errors would fail the awaited promises below; this
    // handler just avoids TCPHelper's "missing error handler" console warning.
  })

  try {
    await Promise.all([
      new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out waiting for TCPHelper to connect')), 3000)
        tcp.on('status_change', (status) => {
          if (status === InstanceStatus.Ok) {
            clearTimeout(timeout)
            resolve()
          }
        })
      }),
      waitForServerConnection(server),
    ])

    tcp.on('data', (chunk) => {
      const lines = lineBuffer.push(chunk.toString('latin1'))
      for (const line of lines) {
        applyReplyToState(state, parseDeviceReply(line))
      }
    })

    server.lastSocket.write('MP hdmiin1 hdmiout1\r\n')

    await new Promise((resolve) => setTimeout(resolve, 300))

    assert.equal(state.routing[1], 1)
  } finally {
    tcp.destroy()
    server.close()
  }
})
