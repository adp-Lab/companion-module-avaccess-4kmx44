const { InstanceBase, Regex, InstanceStatus, TCPHelper } = require('@companion-module/base')
const {
  LineBuffer,
  parseDeviceReply,
  parseVersionReply,
  createInitialState,
  applyReplyToState,
  buildPollCommands,
  buildStaticInfoCommands,
} = require('./commands')
const UpdateActions = require('./actions')
const UpdatePresets = require('./presets')
const UpdateFeedbacks = require('./feedbacks')
const { FEEDBACK_IDS } = require('./feedbacks')
const UpdateVariables = require('./variables')
const { buildVariableValues } = require('./variables')

// The matrix doesn't push unsolicited updates, so we poll. It also drops GET queries
// that arrive back-to-back (confirmed on hardware: a tight burst of 4 only answered the
// first 2), so we send ONE command per tick. On connect, 3 one-shot static queries
// (GET VER, GET IPADDR, GET IP Mode) are sent first; then 5 poll commands round-robin
// forever. Initial full cycle (one-shots + poll): ~8 ticks (~2.4 s). Subsequent cycles:
// ~5 ticks (~1.5 s) — fast enough for routing feedback.
const POLL_STAGGER_MS = 300

class ModuleInstance extends InstanceBase {
  async init(config) {
    this.config = config
    this.state = createInitialState()

    this.updateActions()
    this.updateFeedbacks()
    this.updatePresets()
    this.updateVariables()

    this.initTcp()
  }

  async destroy() {
    this.stopPolling()
    if (this.socket) {
      this.socket.destroy()
      delete this.socket
    }
  }

  async configUpdated(config) {
    this.config = config
    this.initTcp()
  }

  getConfigFields() {
    return [
      { type: 'textinput', id: 'host', label: 'Target IP', width: 8, regex: Regex.IP },
      { type: 'textinput', id: 'port', label: 'Target Port', width: 4, default: '23', regex: Regex.PORT },
    ]
  }

  initTcp() {
    this.stopPolling()
    if (this.socket) {
      this.socket.destroy()
      delete this.socket
    }

    this.updateStatus(InstanceStatus.Connecting)

    if (!this.config.host) {
      this.updateStatus(InstanceStatus.BadConfig)
      return
    }

    this.lineBuffer = new LineBuffer()
    this.socket = new TCPHelper(this.config.host, this.config.port || 23)

    this.socket.on('status_change', (status, message) => {
      this.updateStatus(status, message)
    })

    this.socket.on('error', (err) => {
      this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
      this.log('error', `Network error: ${err.message}`)
    })

    // Poll once connected; restart cleanly on auto-reconnect, stop when the link drops.
    this.socket.on('connect', () => this.startPolling())
    this.socket.on('end', () => this.stopPolling())

    this.socket.on('data', (chunk) => {
      const lines = this.lineBuffer.push(chunk.toString('latin1'))
      let changed = false
      let routingChanged = false
      for (const line of lines) {
        const reply = parseDeviceReply(line)
        if (reply) {
          applyReplyToState(this.state, reply)
          changed = true
          if (reply.keyword === 'SW' || reply.keyword === 'MP') routingChanged = true
        } else {
          // GET VER's reply is a free-form sentence ("4KMX44-H2 VER 3.1, ARM VER 2.6"),
          // not the generic KEYWORD/target/value shape parseDeviceReply expects.
          const version = parseVersionReply(line)
          if (version) {
            Object.assign(this.state.deviceInfo, version)
            changed = true
          }
        }
      }
      this.maybeLearnScene(routingChanged)
      if (changed) {
        this.checkFeedbacks(...FEEDBACK_IDS)
        this.setVariableValues(buildVariableValues(this.state))
      }
    })
  }

  // After a recall, the first poll that actually refreshes routing teaches us the
  // recalled slot's contents (the device can't report them directly).
  maybeLearnScene(routingChanged) {
    if (routingChanged && this.pendingSceneLearn != null) {
      this.state.scenes[this.pendingSceneLearn] = { ...this.state.routing }
      this.pendingSceneLearn = null
    }
  }

  startPolling() {
    this.stopPolling()
    const staticCommands = buildStaticInfoCommands()
    const pollCommands = buildPollCommands()
    let i = 0
    const tick = () => {
      if (i < staticCommands.length) {
        this.sendCommand(staticCommands[i])
      } else {
        this.sendCommand(pollCommands[(i - staticCommands.length) % pollCommands.length])
      }
      i++
    }
    tick() // prime the first command immediately, then one per tick
    this.pollTimer = setInterval(tick, POLL_STAGGER_MS)
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      delete this.pollTimer
    }
  }

  sendCommand(command) {
    if (this.socket) {
      this.socket.send(command)
    } else {
      this.log('warn', `Not connected, dropped command: ${command.trim()}`)
    }
  }

  updateActions() {
    UpdateActions(this)
  }

  updateFeedbacks() {
    UpdateFeedbacks(this)
  }

  updatePresets() {
    UpdatePresets(this)
  }

  updateVariables() {
    UpdateVariables(this)
  }
}

module.exports = ModuleInstance
