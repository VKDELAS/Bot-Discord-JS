// src/commands/geral.js — /iniciar, /atualizar-paineis, /status-bot
'use strict'
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js')

const CHANNEL_IDS = {
  central_tickets:   '1488504060117123084',
  central_registros: '1487024883626938570',
  central_gerencia:  '1487025285340598322',
}
const COLOR_MS13  = 0x0000FF
const FOOTER_TEXT = 'MS-13 Roleplay © Todos os direitos reservados'

// Edita a última mensagem do bot no canal, ou envia uma nova
async function smartPost(channel, payload) {
  try {
    const messages = await channel.messages.fetch({ limit: 20 })
    const botMsg   = messages.find(m => m.author.id === channel.client.user.id)
    if (botMsg) { await botMsg.edit(payload); return botMsg }
  } catch (_) {}
  return channel.send(payload)
}

// ─── /iniciar ─────────────────────────────────────────────────────────────────
const iniciar = {
  data: new SlashCommandBuilder()
    .setName('iniciar')
    .setDescription('Posta (ou edita) os painéis centrais nos canais configurados.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      const { guild } = interaction

      // Tickets
      const ticketsChannel = guild.channels.cache.get(CHANNEL_IDS.central_tickets)
      if (ticketsChannel) {
        const { buildCentralTicketsView } = require('../systems/tickets')
        await smartPost(ticketsChannel, await buildCentralTicketsView(guild))
      }

      // Registros + Membros (mesmo canal)
      const registrosChannel = guild.channels.cache.get(CHANNEL_IDS.central_registros)
      if (registrosChannel) {
        const { buildRegistrosV2 } = require('../systems/registros')
        const { buildMembrosV2 }   = require('../systems/membros')
        await smartPost(registrosChannel, buildRegistrosV2())
        await smartPost(registrosChannel, buildMembrosV2())
      }

      // Gerência (Components V2 — usa buildCentralGerenciaView)
      const gerenciaChannel = guild.channels.cache.get(CHANNEL_IDS.central_gerencia)
      if (gerenciaChannel) {
        const { buildCentralGerenciaView } = require('../systems/gerencia')
        await smartPost(gerenciaChannel, await buildCentralGerenciaView(guild))
      }

      await interaction.editReply({ content: '✅ Painéis postados/atualizados com sucesso!' })
    } catch (err) {
      console.error('[/iniciar]', err)
      if (!interaction.replied && !interaction.deferred)
        return interaction.reply({ content: '❌ Erro ao iniciar painéis.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

// ─── /atualizar-paineis ───────────────────────────────────────────────────────
const atualizarPaineis = {
  data: new SlashCommandBuilder()
    .setName('atualizar-paineis')
    .setDescription('Apaga e recria todos os painéis.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      const { guild, client } = interaction

      // Tickets
      const ticketsChannel = guild.channels.cache.get(CHANNEL_IDS.central_tickets)
      if (ticketsChannel) {
        const msgs = await ticketsChannel.messages.fetch({ limit: 50 })
        for (const [, msg] of msgs.filter(m => m.author.id === client.user.id))
          await msg.delete().catch(() => {})
        const { buildCentralTicketsView } = require('../systems/tickets')
        await ticketsChannel.send(await buildCentralTicketsView(guild))
      }

      // Registros + Membros
      const registrosChannel = guild.channels.cache.get(CHANNEL_IDS.central_registros)
      if (registrosChannel) {
        const msgs = await registrosChannel.messages.fetch({ limit: 50 })
        for (const [, msg] of msgs.filter(m => m.author.id === client.user.id))
          await msg.delete().catch(() => {})
        const { buildRegistrosV2 } = require('../systems/registros')
        const { buildMembrosV2 }   = require('../systems/membros')
        await registrosChannel.send(buildRegistrosV2())
        await registrosChannel.send(buildMembrosV2())
      }

      // Gerência
      const gerenciaChannel = guild.channels.cache.get(CHANNEL_IDS.central_gerencia)
      if (gerenciaChannel) {
        const msgs = await gerenciaChannel.messages.fetch({ limit: 50 })
        for (const [, msg] of msgs.filter(m => m.author.id === client.user.id))
          await msg.delete().catch(() => {})
        const { buildCentralGerenciaView } = require('../systems/gerencia')
        await gerenciaChannel.send(await buildCentralGerenciaView(guild))
      }

      await interaction.editReply({ content: '✅ Todos os painéis foram recriados!' })
    } catch (err) {
      console.error('[/atualizar-paineis]', err)
      if (!interaction.replied && !interaction.deferred)
        return interaction.reply({ content: '❌ Erro.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

// ─── /status-bot ─────────────────────────────────────────────────────────────
const statusBot = {
  data: new SlashCommandBuilder()
    .setName('status-bot')
    .setDescription('Exibe informações de status e saúde do bot.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      const { client } = interaction
      const moment     = require('moment-timezone')
      const uptimeSec  = Math.floor((client.uptime ?? 0) / 1000)
      const hh = Math.floor(uptimeSec / 3600)
      const mm = Math.floor((uptimeSec % 3600) / 60)
      const ss = uptimeSec % 60
      const memUsed = process.memoryUsage()

      const embed = new EmbedBuilder()
        .setTitle('🤖 Status do Bot MS-13')
        .setColor(COLOR_MS13)
        .addFields(
          { name: '🟢 Uptime',         value: `${hh}h ${mm}m ${ss}s`,                              inline: true },
          { name: '📡 Ping WebSocket', value: `${client.ws.ping}ms`,                                inline: true },
          { name: '🏠 Servidores',     value: `${client.guilds.cache.size}`,                        inline: true },
          { name: '💾 Heap usado',     value: `${(memUsed.heapUsed / 1024 / 1024).toFixed(1)} MB`, inline: true },
          { name: '📦 Node.js',        value: process.version,                                      inline: true },
          { name: '🕒 Horário (BR)',   value: moment().tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm:ss'), inline: false },
        )
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp()

      await interaction.editReply({ embeds: [embed] })
    } catch (err) {
      console.error('[/status-bot]', err)
      if (!interaction.replied && !interaction.deferred)
        return interaction.reply({ content: '❌ Erro.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

module.exports = [iniciar, atualizarPaineis, statusBot]