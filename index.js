// index.js — Entry point MS-13 Bot
// Discord.js v14 + Node.js
// Hosting: Discloud | Token: TOKEN_MS13 no .env — NUNCA commitar

'use strict'

require('dotenv').config()

const { Client, GatewayIntentBits, Collection } = require('discord.js')
const fs   = require('fs')
const path = require('path')
const { logger } = require('./src/utils/logger')

// ── Header visual ──────────────────────────────────────────────────────────────
logger.header()

// ── Inicializa o client ────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
  ],
})

// ── Slash commands ─────────────────────────────────────────────────────────────
client.commands = new Collection()
const commandNames = []

const commandsPath = path.join(__dirname, 'src/commands')
if (fs.existsSync(commandsPath)) {
  for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
    const mod = require(path.join(commandsPath, file))
    const list = Array.isArray(mod) ? mod : (mod.commands ?? [mod])
    for (const cmd of list) {
      if (cmd.data && cmd.execute) {
        client.commands.set(cmd.data.name, cmd)
        commandNames.push(cmd.data.name)
      }
    }
  }
}
logger.commands(commandNames)

// ── Systems (handlers de componentes) ─────────────────────────────────────────
const systemHandlers = new Map()
const systemNames = []

const systemsPath = path.join(__dirname, 'src/systems')
if (fs.existsSync(systemsPath)) {
  const files = fs.readdirSync(systemsPath).filter(f => f.endsWith('.js'))
  for (const file of files) {
    const mod = require(path.join(systemsPath, file))

    if (Array.isArray(mod.customIds) && typeof mod.execute === 'function') {
      for (const id of mod.customIds) systemHandlers.set(id, mod.execute)
    }
    if (mod.handlers && typeof mod.handlers === 'object') {
      for (const [customId, fn] of Object.entries(mod.handlers)) systemHandlers.set(customId, fn)
    }

    // Nome do arquivo sem .js como label da seção
    systemNames.push(file.replace('.js', ''))
  }
}
logger.systems(systemNames)

// ── Eventos ────────────────────────────────────────────────────────────────────
let eventCount = 0
const eventsPath = path.join(__dirname, 'src/events')
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file))
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client, systemHandlers))
  } else {
    client.on(event.name, (...args) => event.execute(...args, client, systemHandlers))
  }
  eventCount++
}
logger.events(eventCount)

// ── Init banco de dados ────────────────────────────────────────────────────────
try {
  const { recInitDb } = require('./src/database/manager')
  recInitDb()
  logger.db(true)
} catch (err) {
  logger.db(false, err)
}

// ── Login ──────────────────────────────────────────────────────────────────────
client.login(process.env.TOKEN_MS13)
  .catch(err => {
    logger.error('Falha no login', err)
    process.exit(1)
  })

// ── ready.js deve chamar logger.online() ──────────────────────────────────────
// Exporte o logger para o evento ready usar:
// const { logger } = require('../utils/logger')
// logger.online({ tag, id, guilds, slashOk, slashErr, loopOk, advOk })
client._logger = logger  // disponível em qualquer evento via client._logger

// ── Handlers de erro global ────────────────────────────────────────────────────
process.on('unhandledRejection', err => logger.error('unhandledRejection', err))
process.on('uncaughtException',  err => logger.error('uncaughtException', err))