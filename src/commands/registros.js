// src/commands/registros.js — /ver-registros
'use strict'
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js')
const moment = require('moment-timezone')
const fs     = require('fs')
const path   = require('path')

const BR_TZ       = 'America/Sao_Paulo'
const COLOR_MS13  = 0x0000FF
const COLOR_INFO  = 0x3498DB
const FOOTER_TEXT = 'MS-13 Roleplay © Todos os direitos reservados'
const REGISTROS_ACOES_FILE     = 'registros.json'
const CANAL_REGISTROS_ACOES_ID = '1504162046206410793'

function lerRegistros() {
  try {
    const filePath = path.join(process.cwd(), REGISTROS_ACOES_FILE)
    if (!fs.existsSync(filePath)) return []
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) ?? []
  } catch (_) { return [] }
}

function emojiTipo(tipo) {
  return ({ kill:'💀', atm:'🏧', loja:'🛒', craco:'💊', afk:'💤', corrida:'🏃', ausencia:'📅', meta:'📊', geral:'📋' })[tipo] ?? '📌'
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ver-registros')
    .setDescription('Visualiza registros de ações da facção.')
    .addStringOption(opt => opt.setName('tipo').setDescription('Filtrar por tipo').setRequired(false)
      .addChoices(
        { name: '📋 Todos', value: 'todos' }, { name: '💀 Kill', value: 'kill' }, { name: '🏧 ATM', value: 'atm' },
        { name: '🛒 Loja', value: 'loja' }, { name: '💊 Craco', value: 'craco' }, { name: '💤 AFK', value: 'afk' },
        { name: '🏃 Corrida', value: 'corrida' }, { name: '📅 Ausência', value: 'ausencia' }, { name: '📊 Meta', value: 'meta' },
      ))
    .addUserOption(opt => opt.setName('membro').setDescription('Filtrar de um membro específico').setRequired(false))
    .addIntegerOption(opt => opt.setName('limite').setDescription('Quantos exibir (padrão 10, máx 25)').setRequired(false).setMinValue(1).setMaxValue(25))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      const tipo       = interaction.options.getString('tipo')  ?? 'todos'
      const membroUser = interaction.options.getUser('membro')
      const limite     = interaction.options.getInteger('limite') ?? 10
      let registros    = lerRegistros()
      if (tipo !== 'todos') registros = registros.filter(r => r.tipo?.toLowerCase() === tipo)
      if (membroUser) registros = registros.filter(r => r.user_id === membroUser.id)

      if (registros.length === 0) {
        return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('📋 Registros de Ações').setDescription('Nenhum registro encontrado.').setColor(COLOR_INFO).setFooter({ text: FOOTER_TEXT }).setTimestamp()] })
      }

      registros.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      const recentes = registros.slice(0, limite)
      const linhas   = recentes.map(reg => {
        const emoji   = emojiTipo(reg.tipo)
        const data    = reg.timestamp ? moment(reg.timestamp).tz(BR_TZ).format('DD/MM HH:mm') : '??/??'
        const autorTag = reg.user_id ? `<@${reg.user_id}>` : (reg.autor ?? 'Desconhecido')
        const descricao = reg.descricao ?? reg.acao ?? '—'
        return `${emoji} \`${data}\` **${autorTag}** — ${descricao}`
      })
      const desc = linhas.join('\n')
      const embed = new EmbedBuilder()
        .setTitle(`📋 Registros de Ações${tipo !== 'todos' ? ` (${tipo})` : ''}${membroUser ? ` · ${membroUser.tag}` : ''}`)
        .setDescription(desc.length > 4096 ? desc.slice(0, 4093) + '...' : desc)
        .setColor(COLOR_MS13)
        .addFields(
          { name: '🔢 Exibindo', value: `${recentes.length} de ${registros.length}`, inline: true },
          { name: '🗂️ Filtro',   value: tipo,                                       inline: true },
        )
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp()
      const { guild } = interaction
      const canalReg = guild.channels.cache.get(CANAL_REGISTROS_ACOES_ID)
      if (canalReg) embed.addFields({ name: '📌 Canal de registros', value: `${canalReg}`, inline: false })
      await interaction.editReply({ embeds: [embed] })
    } catch (err) {
      console.error('[/ver-registros]', err)
      if (!interaction.replied && !interaction.deferred) return interaction.reply({ content: '❌ Erro.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}
