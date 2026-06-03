// src/events/ready.js

'use strict'

const { REST, Routes } = require('discord.js')
const fs   = require('fs')
const path = require('path')

module.exports = {
  name: 'ready',
  once: true,

  async execute(client) {
    console.log(`[ready] Bot online como ${client.user.tag}`)

    // ── Deploy dos slash commands via REST ─────────────────────────────────
    const commands     = []
    const commandsPath = path.join(__dirname, '../commands')
    const files        = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))

    for (const file of files) {
      const mod = require(path.join(commandsPath, file))
      // Cada arquivo de commands exporta array ou objeto com .data
      if (Array.isArray(mod.commands)) {
        for (const cmd of mod.commands) {
          commands.push(cmd.data.toJSON())
        }
      } else if (mod.data) {
        commands.push(mod.data.toJSON())
      }
    }

    try {
      const rest    = new REST().setToken(process.env.TOKEN_MS13)
      const guildId = process.env.GUILD_ID

      if (!guildId) {
        console.warn('[ready] GUILD_ID não definido — slash commands não foram registrados.')
      } else {
        await rest.put(
          Routes.applicationGuildCommands(client.user.id, guildId),
          { body: commands }
        )
        console.log(`[ready] ${commands.length} slash command(s) registrado(s) na guild ${guildId}`)
      }
    } catch (err) {
      console.error('[ready] Erro ao registrar slash commands:', err)
    }

    // ── Inicia loop de multas ──────────────────────────────────────────────
    try {
      // Import dentro da função para evitar circular (registros → manager → ...)
      const { iniciarLoopMultas } = require('../systems/registros')
      iniciarLoopMultas(client)
      console.log('[ready] Loop de multas iniciado.')
    } catch (err) {
      console.warn('[ready] sistemas/registros não disponível ainda:', err.message)
    }

    // ── Reagenda advertência de meta pendente ──────────────────────────────
    try {
      const { aguardarEAplicarAdv } = require('../systems/metas')
      await aguardarEAplicarAdv(client)
      console.log('[ready] Adv de meta pendente reagendada.')
    } catch (err) {
      console.warn('[ready] sistemas/metas não disponível ainda:', err.message)
    }
  },
}
