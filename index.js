// index.js — Entry point MS-13 Bot
// Discord.js v14 + Node.js
// Hosting: Discloud | Token: TOKEN_MS13 no .env — NUNCA commitar

'use strict'

require('dotenv').config()

const { Client, GatewayIntentBits, Collection } = require('discord.js')
const fs   = require('fs')
const path = require('path')

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

const commandsPath = path.join(__dirname, 'src/commands')
if (fs.existsSync(commandsPath)) {
  for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
    const mod = require(path.join(commandsPath, file))
    // Suporta arquivo com array de commands ou command único
    if (Array.isArray(mod.commands)) {
      for (const cmd of mod.commands) {
        client.commands.set(cmd.data.name, cmd)
      }
    } else if (mod.data && mod.execute) {
      client.commands.set(mod.data.name, mod)
    }
  }
  console.log(`[index] ${client.commands.size} comando(s) carregado(s).`)
}

// ── Systems (handlers de componentes) ─────────────────────────────────────────
// Map<customId | prefixo, handlerFn>
const systemHandlers = new Map()

const systemsPath = path.join(__dirname, 'src/systems')
if (fs.existsSync(systemsPath)) {
  for (const file of fs.readdirSync(systemsPath).filter(f => f.endsWith('.js'))) {
    const mod = require(path.join(systemsPath, file))
    if (mod.handlers && typeof mod.handlers === 'object') {
      for (const [customId, fn] of Object.entries(mod.handlers)) {
        systemHandlers.set(customId, fn)
      }
    }
  }
  console.log(`[index] ${systemHandlers.size} handler(s) de sistema carregado(s).`)
}

// ── Eventos ────────────────────────────────────────────────────────────────────
const eventsPath = path.join(__dirname, 'src/events')
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file))

  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client, systemHandlers))
  } else {
    client.on(event.name, (...args) => event.execute(...args, client, systemHandlers))
  }
}
console.log('[index] Eventos carregados.')

// ── Init banco de dados ────────────────────────────────────────────────────────
try {
  const { recInitDb } = require('./src/database/manager')
  recInitDb()
  console.log('[index] Banco SQLite inicializado.')
} catch (err) {
  console.error('[index] Erro ao inicializar banco:', err)
}

// ── Login ──────────────────────────────────────────────────────────────────────
client.login(process.env.TOKEN_MS13)
  .then(() => console.log('[index] Login realizado com sucesso.'))
  .catch(err => {
    console.error('[index] Falha no login:', err)
    process.exit(1)
  })

// ── Handlers de erro global ────────────────────────────────────────────────────
process.on('unhandledRejection', err => console.error('[index] unhandledRejection:', err))
process.on('uncaughtException',  err => console.error('[index] uncaughtException:',  err))
