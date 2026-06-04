// src/commands/recrutamento.js
'use strict'
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, PermissionsBitField } = require('discord.js')
const moment = require('moment-timezone')

const BR_TZ       = 'America/Sao_Paulo'
const COLOR_REC   = 0x9B59B6
const COLOR_ERROR = 0xE74C3C
const FOOTER_TEXT = 'MS-13 Roleplay © Todos os direitos reservados'

const REC_CHANNEL_IDS = {
  painel_formulario: '1488347348756332685', relatorio_rec: '1488347471230013510',
  recrutadores: '1488347411784007690', top_tickets: '1488347411784007690',
  blacklist: '1488347509599502356', logs_relatorios_rec: '1492865227908317324', categoria_rec: '0',
}
const _PERM_TICKET_ROLE_ID = '1478161626187432077'

const painelFormulario = {
  data: new SlashCommandBuilder().setName('painel-formulario').setDescription('Posta/atualiza o painel de formulário de recrutamento.').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      const { guild } = interaction
      const { buildPainelFormulario } = require('../systems/recrutamento')
      const channel = guild.channels.cache.get(REC_CHANNEL_IDS.painel_formulario)
      if (!channel) return interaction.editReply({ content: '❌ Canal não encontrado.' })
      const messages = await channel.messages.fetch({ limit: 20 })
      const botMsg   = messages.find(m => m.author.id === guild.client.user.id)
      const payload  = buildPainelFormulario()
      if (botMsg) await botMsg.edit(payload)
      else await channel.send(payload)
      await interaction.editReply({ content: '✅ Painel de formulário atualizado!' })
    } catch (err) {
      console.error('[/painel-formulario]', err)
      if (!interaction.replied && !interaction.deferred) return interaction.reply({ content: '❌ Erro.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

const enviarMsgsRec = {
  data: new SlashCommandBuilder().setName('enviar-msgs-rec').setDescription('Envia/atualiza todas as mensagens fixas do sistema de recrutamento.').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      const { guild } = interaction
      const { buildPainelFormulario, buildPainelRelatorio, buildPainelBlacklist } = require('../systems/recrutamento')
      const canais = [
        { id: REC_CHANNEL_IDS.painel_formulario, builder: buildPainelFormulario },
        { id: REC_CHANNEL_IDS.relatorio_rec,     builder: buildPainelRelatorio  },
        { id: REC_CHANNEL_IDS.blacklist,          builder: buildPainelBlacklist  },
      ]
      let enviados = 0
      for (const { id, builder } of canais) {
        const channel = guild.channels.cache.get(id)
        if (!channel) continue
        const messages = await channel.messages.fetch({ limit: 20 })
        const botMsg   = messages.find(m => m.author.id === guild.client.user.id)
        const payload  = builder()
        if (botMsg) await botMsg.edit(payload)
        else await channel.send(payload)
        enviados++
      }
      await interaction.editReply({ content: `✅ ${enviados} mensagem(s) enviada(s).` })
    } catch (err) {
      console.error('[/enviar-msgs-rec]', err)
      if (!interaction.replied && !interaction.deferred) return interaction.reply({ content: '❌ Erro.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

const sincronizarTopRec = {
  data: new SlashCommandBuilder().setName('sincronizar-top-rec').setDescription('Sincroniza e atualiza o painel de top recrutadores.').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      const { guild } = interaction
      const { buildTopRecrutadores } = require('../systems/recrutamento')
      const channel = guild.channels.cache.get(REC_CHANNEL_IDS.top_tickets)
      if (!channel) return interaction.editReply({ content: '❌ Canal não encontrado.' })
      const messages = await channel.messages.fetch({ limit: 20 })
      const botMsg   = messages.find(m => m.author.id === guild.client.user.id)
      const payload  = await buildTopRecrutadores(guild)
      if (botMsg) await botMsg.edit(payload)
      else await channel.send(payload)
      await interaction.editReply({ content: '✅ Top recrutadores sincronizado!' })
    } catch (err) {
      console.error('[/sincronizar-top-rec]', err)
      if (!interaction.replied && !interaction.deferred) return interaction.reply({ content: '❌ Erro.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

const resetarRecRank = {
  data: new SlashCommandBuilder().setName('resetar-rec-rank').setDescription('Reseta o ranking de recrutamento de TODOS os recrutadores.')
    .addStringOption(opt => opt.setName('confirmar').setDescription('Digite "CONFIRMAR" para prosseguir').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      if (interaction.options.getString('confirmar') !== 'CONFIRMAR') return interaction.editReply({ content: '❌ Digite exatamente **CONFIRMAR** para prosseguir.' })
      const db = require('../database/manager')
      // Reset via recrutamento db direto
      const Database = require('better-sqlite3')
      const _db = new Database('ms13_recrutamento.db')
      _db.prepare("UPDATE recrutamentos SET status = 'fechado' WHERE 1=1").run()
      const { guild } = interaction
      const { buildTopRecrutadoresVazio } = require('../systems/recrutamento')
      const channel = guild.channels.cache.get(REC_CHANNEL_IDS.top_tickets)
      if (channel) {
        const messages = await channel.messages.fetch({ limit: 20 })
        const botMsg   = messages.find(m => m.author.id === guild.client.user.id)
        const payload  = await buildTopRecrutadoresVazio()
        if (botMsg) await botMsg.edit(payload)
        else await channel.send(payload)
      }
      const agora = moment().tz(BR_TZ).format('DD/MM/YYYY HH:mm')
      await interaction.editReply({ content: `✅ Ranking resetado em **${agora}**!` })
    } catch (err) {
      console.error('[/resetar-rec-rank]', err)
      if (!interaction.replied && !interaction.deferred) return interaction.reply({ content: '❌ Erro.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

const resetarTopRec = {
  data: new SlashCommandBuilder().setName('resetar-top-rec').setDescription('Reseta APENAS o painel visual do top recrutadores.').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      const { guild } = interaction
      const { buildTopRecrutadoresVazio } = require('../systems/recrutamento')
      const channel = guild.channels.cache.get(REC_CHANNEL_IDS.top_tickets)
      if (!channel) return interaction.editReply({ content: '❌ Canal não encontrado.' })
      const messages = await channel.messages.fetch({ limit: 20 })
      const botMsg   = messages.find(m => m.author.id === guild.client.user.id)
      const payload  = await buildTopRecrutadoresVazio()
      if (botMsg) await botMsg.edit(payload)
      else await channel.send(payload)
      await interaction.editReply({ content: '✅ Painel resetado visualmente.' })
    } catch (err) {
      console.error('[/resetar-top-rec]', err)
      if (!interaction.replied && !interaction.deferred) return interaction.reply({ content: '❌ Erro.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

const criarCanalTicket = {
  data: new SlashCommandBuilder().setName('criar-canal-ticket').setDescription('Cria manualmente um canal de ticket de recrutamento.')
    .addUserOption(opt => opt.setName('candidato').setDescription('Usuário candidato').setRequired(true))
    .addStringOption(opt => opt.setName('nome-personagem').setDescription('Nome do personagem no MTA').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      const { guild }       = interaction
      const candidatoUser   = interaction.options.getUser('candidato')
      const nomePersonagem  = interaction.options.getString('nome-personagem')
      const candidatoMember = await guild.members.fetch(candidatoUser.id).catch(() => null)
      if (!candidatoMember) return interaction.editReply({ content: '❌ Candidato não encontrado.' })
      const categoriaId = REC_CHANNEL_IDS.categoria_rec
      const categoria   = categoriaId !== '0' ? guild.channels.cache.get(categoriaId) : null
      const nomeSanitizado = nomePersonagem.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
      const nomeCanal      = `ticket-${nomeSanitizado}-${candidatoUser.id.slice(-4)}`
      const canal = await guild.channels.create({
        name: nomeCanal, type: ChannelType.GuildText, parent: categoria ?? undefined,
        permissionOverwrites: [
          { id: guild.id,             deny:  [PermissionsBitField.Flags.ViewChannel] },
          { id: candidatoUser.id,     allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: _PERM_TICKET_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages] },
        ],
      })
      await canal.send({ embeds: [new EmbedBuilder().setTitle('🎟️ Ticket de Recrutamento — MS-13').setDescription(`Olá ${candidatoMember}! Seu ticket foi criado.\n\n**Personagem:** \`${nomePersonagem}\`\nAguarde um recrutador.`).setColor(COLOR_REC).setFooter({ text: FOOTER_TEXT }).setTimestamp()] })
      await interaction.editReply({ content: `✅ Canal criado: ${canal} para **${candidatoUser.tag}**.` })
    } catch (err) {
      console.error('[/criar-canal-ticket]', err)
      if (!interaction.replied && !interaction.deferred) return interaction.reply({ content: '❌ Erro.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

module.exports = [painelFormulario, enviarMsgsRec, sincronizarTopRec, resetarRecRank, resetarTopRec, criarCanalTicket]
