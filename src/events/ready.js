// src/events/ready.js
'use strict'

const { REST, Routes, Events } = require('discord.js')
const { logger } = require('../utils/logger')

module.exports = {
  name: Events.ClientReady,
  once: true,

  async execute(client) {

    // ── Registra slash commands (usa o que já está em memória) ───────────────
    let slashOk  = false
    let slashErr = null

    const guildId = process.env.GUILD_ID
    if (!guildId || guildId === 'id_da_sua_guild_aqui') {
      slashErr = 'GUILD_ID não definido no .env'
    } else {
      try {
        const commands = [...client.commands.values()].map(c => c.data.toJSON())
        const rest     = new REST().setToken(process.env.TOKEN_MS13)
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

    // ── Restaurar timeouts de advs com prazo (persiste entre restarts) ────────
    let advRestoreOk = false
    try {
      const { advInitDb }         = require('../database/manager')
      const { restaurarTimeouts } = require('../systems/advManager')
      advInitDb()                       // garante tabela SQLite
      await restaurarTimeouts(client)   // recria timeouts ou dispara imediatamente
      advRestoreOk = true
    } catch (err) {
      console.error('[ready] Erro ao restaurar timeouts de adv:', err)
    }

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