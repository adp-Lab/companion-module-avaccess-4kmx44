const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')
const { TCPHelper, InstanceStatus } = require('@companion-module/base')
const UpdateActions = require('../src/actions')

function startFakeMatrix() {
  return new Promise((resolve) => {
    let received = ''
    const server = net.createServer((socket) => {
      server.lastSocket = socket
      socket.on('data', (chunk) => {
        received += chunk.toString('latin1')
        server.received = received
      })
    })
    server.received = received
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

async function makeFakeSelfConnectedTo(port, server) {
  const tcp = new TCPHelper('127.0.0.1', port)
  tcp.on('error', () => {
    // Real connection errors would fail the awaited promises below; this
    // handler just avoids TCPHelper's "missing error handler" console warning.
  })

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

  const actionDefs = {}
  const self = {
    sendCommand(cmd) {
      tcp.send(cmd)
    },
    log() {},
    setActionDefinitions(defs) {
      Object.assign(actionDefs, defs)
    },
  }
  UpdateActions(self)
  return { actionDefs, tcp }
}

test('every action sends the exact documented bytes over a real TCP socket', async () => {
  const server = await startFakeMatrix()
  const port = server.address().port
  const { actionDefs, tcp } = await makeFakeSelfConnectedTo(port, server)

  try {
    await actionDefs.switch_input_to_output.callback({ options: { input: 1, output: 1 } })
    await actionDefs.reboot_matrix.callback({ options: {} })
    await actionDefs.save_scene.callback({ options: { slot: 1 } })
    await actionDefs.recall_scene.callback({ options: { slot: 1 } })
    await actionDefs.set_audio_mute.callback({ options: { output: '1', state: 'on' } })
    await actionDefs.set_hdcp.callback({ options: { input: 1, state: 'off' } })
    await actionDefs.set_downscaler.callback({ options: { output: 'all', state: 'on' } })
    await actionDefs.set_cec_power.callback({ options: { output: '1', state: 'on' } })
    await actionDefs.set_edid.callback({ options: { input: 1, preset: 5 } })

    await new Promise((resolve) => setTimeout(resolve, 300))

    // TCP is a byte stream with no per-send message boundaries: nine
    // back-to-back sends can coalesce into fewer 'data' events on the
    // server side. Asserting against the full concatenated byte stream
    // (rather than an array of per-send chunks) proves the same thing —
    // every action's exact bytes arrived, in order — while staying robust
    // to however the kernel/Node decides to chunk them.
    const expected =
      'SET SW hdmiin1 hdmiout1\r\n' +
      'REBOOT\r\n' +
      'SAVE PRESET 1\r\n' +
      'RESTORE PRESET 1\r\n' +
      'SET MUTE audioout1 on\r\n' +
      'SET HDCP_S hdmiin1 off\r\n' +
      'SET SCALER all on\r\n' +
      'SET CEC_PWR hdmiout1 on\r\n' +
      'SET EDID hdmiin1 05\r\n'

    assert.equal(server.received, expected)
  } finally {
    tcp.destroy()
    server.close()
  }
})
