// src/commands/metas.js — /meta-status, /enviar-painel-metas
'use strict'

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js')
const moment = require('moment-timezone')

const {
  BR_TZ, META_VALOR, MS13_ROLE_ID,
  ROLES, ROLE_NAMES, ROLE_IDS,
  PRODUTOS_META_LISTA, CANAIS_METAS_IDS,
  COLOR_MS13, COLOR_INFO, FOOTER_TEXT,
} = require('../config/settings.js')

// ─────────────────────────────────────────────
// Helpers locais
// ─────────────────────────────────────────────
function categoriaMembro(member) {
  for (const [cat, ids] of Object.entries(ROLES))
    if (ids.some(id => member.roles.cache.has(id))) return cat
  return null
}

function cargoNome(member) {
  for (const [id, nome] of Object.entries(ROLE_NAMES))
    if (member.roles.cache.has(id)) return nome
  return 'Sem cargo reconhecido'
}

// ─────────────────────────────────────────────
// /meta-status
// ─────────────────────────────────────────────
const metaStatus = {
  data: new SlashCommandBuilder()
    .setName('meta-status')
    .setDescription('Exibe o status da meta semanal — geral ou de um membro específico.')
    .addUserOption(opt =>
      opt.setName('membro')
        .setDescription('Membro para consultar (deixe em branco para ver o geral)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })

    try {
      const { guild } = interaction
      const db         = require('../database/manager')
      const targetUser = interaction.options.getUser('membro')

      // ── Status individual
      if (targetUser) {
        const member = await guild.members.fetch(targetUser.id).catch(() => null)
        if (!member) return interaction.editReply({ content: '❌ Membro não encontrado.' })

        const cat    = categoriaMembro(member)
        const cargo  = cargoNome(member)
        const isPago = member.roles.cache.has(ROLE_IDS.meta_paga)

        const valorEntregue = db.loadData()[targetUser.id]?.valor_entregue ?? 0
        const progresso     = Math.min((valorEntregue / META_VALOR) * 100, 100).toFixed(1)
        const filled        = Math.round((parseFloat(progresso) / 100) * 20)
        const bar           = '█'.repeat(filled) + '░'.repeat(20 - filled)

        let statusEmoji = '⏳', statusTexto = 'Em andamento'
        if (cat === 'isento')                 { statusEmoji = '🔓'; statusTexto = 'Isento' }
        else if (isPago)                      { statusEmoji = '✅'; statusTexto = 'Paga' }
        else if (valorEntregue >= META_VALOR) { statusEmoji = '✅'; statusTexto = 'Concluída' }

        const embed = new EmbedBuilder()
          .setColor(isPago || cat === 'isento' ? COLOR_MS13 : COLOR_INFO)
          .setTitle(`📊 Meta — ${member.displayName}`)
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: '👤 Cargo',            value: cargo,                                                                                 inline: true  },
            { name: '📂 Categoria',        value: cat ?? 'Desconhecida',                                                                inline: true  },
            { name: '📌 Status',           value: `${statusEmoji} ${statusTexto}`,                                                      inline: true  },
            { name: '💰 Valor entregue',   value: `$${valorEntregue.toLocaleString('pt-BR')} / $${META_VALOR.toLocaleString('pt-BR')}`, inline: false },
            { name: '📈 Progresso',        value: `\`[${bar}] ${progresso}%\``,                                                         inline: false },
            { name: '📦 Produtos aceitos', value: PRODUTOS_META_LISTA,                                                                  inline: false },
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp()

        return interaction.editReply({ embeds: [embed] })
      }

      // ── Status geral
      const semanaAtual = moment().tz(BR_TZ).isoWeek()
      const anoAtual    = moment().tz(BR_TZ).year()

      await guild.members.fetch()
      const ms13Members = guild.members.cache.filter(m => !m.user.bot && m.roles.cache.has(MS13_ROLE_ID))

      let totalMembros = 0, pagos = 0, emAndamento = 0, isentos = 0, pendentes = 0

      for (const [, member] of ms13Members) {
        totalMembros++
        const cat = categoriaMembro(member)
        if (cat === 'isento') { isentos++; continue }
        if (member.roles.cache.has(ROLE_IDS.meta_paga)) { pagos++; continue }
        const dadosMembro = db.loadData()[member.id]
        if (dadosMembro?.valor_entregue > 0) emAndamento++
        else pendentes++
      }

      const elegíveis = Math.max(totalMembros - isentos, 1)
      const pct       = totalMembros > 0 ? ((pagos / elegíveis) * 100).toFixed(1) : '0.0'

      const embed = new EmbedBuilder()
        .setColor(COLOR_MS13)
        .setTitle(`📊 Status Geral das Metas — Semana ${semanaAtual}/${anoAtual}`)
        .addFields(
          { name: '👥 Total MS-13',    value: `${totalMembros}`, inline: true },
          { name: '✅ Metas pagas',    value: `${pagos}`,         inline: true },
          { name: '⏳ Em andamento',   value: `${emAndamento}`,   inline: true },
          { name: '❌ Pendentes',      value: `${pendentes}`,     inline: true },
          { name: '🔓 Isentos',        value: `${isentos}`,       inline: true },
          { name: '📈 Taxa conclusão', value: `${pct}%`,          inline: true },
          { name: '💰 Valor da meta',  value: `$${META_VALOR.toLocaleString('pt-BR')}`, inline: false },
          { name: '📦 Produtos',       value: PRODUTOS_META_LISTA,                      inline: false },
        )
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp()

      return interaction.editReply({ embeds: [embed] })

    } catch (err) {
      console.error('[/meta-status]', err)
      return interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

// ─────────────────────────────────────────────
// /enviar-painel-metas
// ─────────────────────────────────────────────
const enviarPainelMetas = {
  data: new SlashCommandBuilder()
    .setName('enviar-painel-metas')
    .setDescription('Envia o painel de metas no canal configurado.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    // reply antes de qualquer await pesado — evita 10062
    await interaction.reply({ content: '⏳ Enviando painel...', ephemeral: true })

    try {
      const { guild } = interaction
      const { buildPainelV2 } = require('../systems/metas')

      const canal = guild.channels.cache.get(CANAIS_METAS_IDS.painel)
      if (!canal) {
        return interaction.editReply({ content: '❌ Canal de metas não encontrado. Verifique `CANAIS_METAS_IDS.painel` no settings.' })
      }

      const { container, flags } = buildPainelV2('dinheiro')
      await canal.send({ components: [container], flags })

      return interaction.editReply({ content: `✅ Painel de metas enviado em <#${canal.id}>!` })

    } catch (err) {
      console.error('[/enviar-painel-metas]', err)
      return interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

module.exports = [metaStatus, enviarPainelMetas]