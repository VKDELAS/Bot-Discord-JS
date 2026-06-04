// src/commands/geral.js — /iniciar, /atualizar-paineis, /status-bot
'use strict'
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js')

const CHANNEL_IDS = { central_tickets: '1488504060117123084', central_registros: '1487024883626938570', central_gerencia: '1487025285340598322' }
const COLOR_MS13  = 0x0000FF
const FOOTER_TEXT = 'MS-13 Roleplay © Todos os direitos reservados'

async function smartPost(channel, payload) {
  try {
    const messages = await channel.messages.fetch({ limit: 20 })
    const botMsg   = messages.find(m => m.author.id === channel.client.user.id)
    if (botMsg) { await botMsg.edit(payload); return botMsg }
  } catch (_) {}
  return channel.send(payload)
}

const iniciar = {
  data: new SlashCommandBuilder().setName('iniciar').setDescription('Posta (ou edita) os painéis centrais nos canais configurados.').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      const { guild } = interaction
      const ticketsChannel = guild.channels.cache.get(CHANNEL_IDS.central_tickets)
      if (ticketsChannel) {
        const { buildCentralTicketsView } = require('../systems/tickets')
        const ticketsPayload = await buildCentralTicketsView(guild)
        await smartPost(ticketsChannel, ticketsPayload)
      }
      const registrosChannel = guild.channels.cache.get(CHANNEL_IDS.central_registros)
      if (registrosChannel) {
        const { buildEmbedRegistros, buildCentralRegistrosRow } = require('../systems/registros')
        await smartPost(registrosChannel, { embeds: [buildEmbedRegistros()], components: [buildCentralRegistrosRow()] })
      }
      const gerenciaChannel = guild.channels.cache.get(CHANNEL_IDS.central_gerencia)
      if (gerenciaChannel) {
        const { buildCentralGerenciaView } = require('../systems/gerencia')
        const gerenciaPayload = await buildCentralGerenciaView(guild)
        await smartPost(gerenciaChannel, gerenciaPayload)
      }
      await interaction.editReply({ content: '✅ Painéis postados/atualizados com sucesso!' })
    } catch (err) {
      console.error('[/iniciar]', err)
      if (!interaction.replied && !interaction.deferred) return interaction.reply({ content: '❌ Erro ao iniciar painéis.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

const atualizarPaineis = {
  data: new SlashCommandBuilder().setName('atualizar-paineis').setDescription('Apaga e recria todos os painéis.').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      const { guild, client } = interaction
      const channelEntries = [
        { id: CHANNEL_IDS.central_tickets,   builder: 'buildCentralTicketsView',   system: 'tickets',   useV2: false },
        { id: CHANNEL_IDS.central_registros, builder: null,                        system: 'registros', useV2: false },
        { id: CHANNEL_IDS.central_gerencia,  builder: 'buildCentralGerenciaView',  system: 'gerencia',  useV2: false },
      ]
      for (const entry of channelEntries) {
        const channel = guild.channels.cache.get(entry.id)
        if (!channel) continue
        const messages = await channel.messages.fetch({ limit: 50 })
        const botMsgs  = messages.filter(m => m.author.id === client.user.id)
        for (const [, msg] of botMsgs) await msg.delete().catch(() => {})
        const sys = require(`../systems/${entry.system}`)
        let payload
        if (entry.system === 'registros') {
          payload = { embeds: [sys.buildEmbedRegistros()], components: [sys.buildCentralRegistrosRow()] }
        } else {
          payload = await sys[entry.builder](guild)
        }
        await channel.send(payload)
      }
      await interaction.editReply({ content: '✅ Todos os painéis foram recriados!' })
    } catch (err) {
      console.error('[/atualizar-paineis]', err)
      if (!interaction.replied && !interaction.deferred) return interaction.reply({ content: '❌ Erro.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

const statusBot = {
  data: new SlashCommandBuilder().setName('status-bot').setDescription('Exibe informações de status e saúde do bot.').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      const { client } = interaction
      const moment     = require('moment-timezone')
      const uptimeSec  = Math.floor((client.uptime ?? 0) / 1000)
      const hh = Math.floor(uptimeSec / 3600), mm = Math.floor((uptimeSec % 3600) / 60), ss = uptimeSec % 60
      const memUsed = process.memoryUsage()
      const embed   = new EmbedBuilder()
        .setTitle('🤖 Status do Bot MS-13')
        .setColor(COLOR_MS13)
        .addFields(
          { name: '🟢 Uptime',          value: `${hh}h ${mm}m ${ss}s`,                         inline: true },
          { name: '📡 Ping WebSocket',  value: `${client.ws.ping}ms`,                           inline: true },
          { name: '🏠 Servidores',      value: `${client.guilds.cache.size}`,                   inline: true },
          { name: '💾 Heap usado',      value: `${(memUsed.heapUsed / 1024 / 1024).toFixed(1)} MB`, inline: true },
          { name: '📦 Node.js',         value: process.version,                                 inline: true },
          { name: '🕒 Horário (BR)',    value: moment().tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm:ss'), inline: false },
        )
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp()
      await interaction.editReply({ embeds: [embed] })
    } catch (err) {
      console.error('[/status-bot]', err)
      if (!interaction.replied && !interaction.deferred) return interaction.reply({ content: '❌ Erro.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

module.exports = [iniciar, atualizarPaineis, statusBot]