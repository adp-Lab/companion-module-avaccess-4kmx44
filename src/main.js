const { InstanceBase, Regex, InstanceStatus, TCPHelper } = require('@companion-module/base')
const { LineBuffer, parseDeviceReply, createInitialState, applyReplyToState } = require('./commands')
const UpdateActions = require('./actions')
const UpdatePresets = require('./presets')
const UpdateFeedbacks = require('./feedbacks')

class ModuleInstance extends InstanceBase {
  async init(config) {
    this.config = config
    this.state = createInitialState()

    this.updateActions()
    this.updateFeedbacks()
    this.updatePresets()

    this.initTcp()
  }

  async destroy() {
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

    this.socket.on('data', (chunk) => {
      const lines = this.lineBuffer.push(chunk.toString('latin1'))
      for (const line of lines) {
        const reply = parseDeviceReply(line)
        applyReplyToState(this.state, reply)
      }
    })
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
}

module.exports = ModuleInstance
