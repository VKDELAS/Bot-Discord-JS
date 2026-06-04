// src/events/ready.js
'use strict'

const { REST, Routes, Events } = require('discord.js')
const fs   = require('fs')
const path = require('path')
const { logger } = require('../utils/logger')

module.exports = {
  name: Events.ClientReady,  // 'clientReady' — corrige o DeprecationWarning do v14
  once: true,

  async execute(client) {

    // ── Coleta slash commands ────────────────────────────────────────────────
    const commands     = []
    const commandsPath = path.join(__dirname, '../commands')
    const files        = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))

    for (const file of files) {
      const mod = require(path.join(commandsPath, file))
      if (Array.isArray(mod.commands)) {
        for (const cmd of mod.commands) commands.push(cmd.data.toJSON())
      } else if (Array.isArray(mod)) {
        for (const cmd of mod) if (cmd.data) commands.push(cmd.data.toJSON())
      } else if (mod.data) {
        commands.push(mod.data.toJSON())
      }
    }

    // ── Registra slash commands ──────────────────────────────────────────────
    let slashOk  = false
    let slashErr = null

    const guildId = process.env.GUILD_ID
    if (!guildId) {
      slashErr = 'GUILD_ID não definido no .env'
    } else {
      try {
        const rest = new REST().setToken(process.env.TOKEN_MS13)
        await rest.put(
          Routes.applicationGuildCommands(client.user.id, guildId),
          { body: commands }
        )
        slashOk = true
      } catch (err) {
        slashErr = err.message?.split('\n')[0] ?? 'Erro desconhecido'
      }
    }

    // ── Loop de multas ───────────────────────────────────────────────────────
    let loopOk = false
    try {
      const { iniciarLoopMultas } = require('../systems/registros')
      iniciarLoopMultas(client)
      loopOk = true
    } catch (_) {}

    // ── Adv de meta ──────────────────────────────────────────────────────────
    let advOk = false
    try {
      const { aguardarEAplicarAdv } = require('../systems/metas')
      await aguardarEAplicarAdv(client)
      advOk = true
    } catch (_) {}

    // ── Painel final ─────────────────────────────────────────────────────────
    logger.online({
      tag:    client.user.tag,
      id:     client.user.id,
      guilds: client.guilds.cache.size,
      slashOk,
      slashErr,
      loopOk,
      advOk,
    })
  },
}