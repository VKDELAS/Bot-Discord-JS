// src/commands/metas.js — /meta-status, /enviar-painel-metas
'use strict'

const {
  SlashCommandBuilder, PermissionFlagsBits,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags,
} = require('discord.js')
const moment = require('moment-timezone')

const {
  BR_TZ, META_VALOR, MS13_ROLE_ID,
  ROLES, ROLE_NAMES,
  CANAIS_METAS_IDS,
  COLOR_MS13, COLOR_SUCCESS, COLOR_ERROR, COLOR_INFO, FOOTER_TEXT,
} = require('../config/settings.js')

const { loadData } = require('../database/manager.js')

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

function fmtBRL(n) {
  return `R$ ${n.toLocaleString('pt-BR')}`
}

function buildRespostaV2(accentColor, linhas) {
  const container = new ContainerBuilder().setAccentColor(accentColor)
  for (const linha of linhas)
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(linha))
  return { components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }
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
        .setDescription('Membro para consultar (vazio = status geral)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })

    try {
      const { guild } = interaction
      const data       = loadData()
      const targetUser = interaction.options.getUser('membro')

      // ── Status individual
      if (targetUser) {
        const member = await guild.members.fetch(targetUser.id).catch(() => null)
        if (!member) {
          return interaction.editReply(buildRespostaV2(COLOR_ERROR, ['❌ Membro não encontrado.']))
        }

        const cat    = categoriaMembro(member)
        const cargo  = cargoNome(member)
        const entrega = data.entregas?.[targetUser.id]

        let statusEmoji = '❌', statusTexto = 'Pendente'
        if (cat === 'isento') {
          statusEmoji = '🔓'; statusTexto = 'Isento (cargo)'
        } else if (data.isentos_manuais?.[targetUser.id]) {
          statusEmoji = '🛡️'; statusTexto = 'Isento (manual)'
        } else if (entrega?.status === 'aprovado') {
          statusEmoji = '✅'; statusTexto = 'Aprovada'
        } else if (entrega?.status === 'aguardando') {
          statusEmoji = '⏳'; statusTexto = 'Aguardando aprovação'
        } else if (entrega?.status === 'recusado') {
          statusEmoji = '🔄'; statusTexto = 'Recusada — pode reenviar'
        }

        const modo  = data.modo_pagamento || 'dinheiro'
        const linhasValor = modo === 'produto'
          ? `> 📦 **Modo:** Produto\n> 🔢 **Rotas entregues:** ${entrega?.rotas_produto ?? '—'}`
          : `> 💰 **Valor da meta:** ${fmtBRL(META_VALOR)}\n> 💵 **Valor pago:** ${entrega?.valor_pago ? fmtBRL(entrega.valor_pago) : '—'}`

        const container = new ContainerBuilder()
          .setAccentColor(statusEmoji === '✅' ? COLOR_SUCCESS : statusEmoji === '❌' ? COLOR_ERROR : COLOR_INFO)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📊 Meta — ${member.displayName}`))
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `> 🎖️ **Cargo:** ${cargo}\n> 📂 **Categoria:** ${cat ?? 'Desconhecida'}\n> 📌 **Status:** ${statusEmoji} ${statusTexto}`
          ))
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(linhasValor))

        if (entrega?.comprovante) {
          container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `> 📎 **Comprovante:** [Ver](${entrega.comprovante})`
          ))
        }

        if (entrega?.aprovado_por) {
          container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `> ✅ **Aprovado por:** ${entrega.aprovado_por}`
          ))
        }

        container
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${FOOTER_TEXT}`))

        return interaction.editReply({
          components: [container],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        })
      }

      // ── Status geral
      const semana = moment().tz(BR_TZ).isoWeek()
      const ano    = moment().tz(BR_TZ).year()
      const modo   = data.modo_pagamento || 'dinheiro'

      await guild.members.fetch()
      const ms13Members = guild.members.cache.filter(m => !m.user.bot && m.roles.cache.has(MS13_ROLE_ID))

      let totalMembros = 0, aprovados = 0, aguardando = 0, isentos = 0, pendentes = 0

      for (const [, m] of ms13Members) {
        totalMembros++
        const cat = categoriaMembro(m)
        if (cat === 'isento' || data.isentos_manuais?.[m.id]) { isentos++; continue }
        const entrega = data.entregas?.[m.id]
        if (entrega?.status === 'aprovado')    { aprovados++;  continue }
        if (entrega?.status === 'aguardando')  { aguardando++; continue }
        pendentes++
      }

      const elegiveis = Math.max(totalMembros - isentos, 1)
      const taxa      = ((aprovados / elegiveis) * 100).toFixed(1)
      const metaAtiva = data.meta_ativa
      const prazoStr  = metaAtiva
        ? `<t:${Math.floor(new Date(metaAtiva.prazo_iso).getTime() / 1000)}:R>`
        : 'Sem meta ativa'

      const container = new ContainerBuilder()
        .setAccentColor(COLOR_MS13)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `## 📊 Status Geral — Semana ${semana}/${ano}`
        ))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `> 🏷️ **Modo:** ${modo === 'produto' ? '📦 Produto' : '💵 Dinheiro'}\n` +
          `> ⏰ **Prazo:** ${prazoStr}\n` +
          `> 💰 **Valor da meta:** ${fmtBRL(META_VALOR)}`
        ))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `> 👥 **Total MS-13:** ${totalMembros}\n` +
          `> ✅ **Aprovados:** ${aprovados}\n` +
          `> ⏳ **Aguardando:** ${aguardando}\n` +
          `> ❌ **Pendentes:** ${pendentes}\n` +
          `> 🛡️ **Isentos:** ${isentos}\n` +
          `> 📈 **Taxa:** ${taxa}%`
        ))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${FOOTER_TEXT}`))

      return interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      })

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
    .setDescription('Envia o painel de metas e o painel de relatório nos canais configurados.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.reply({ content: '⏳ Enviando painéis...', ephemeral: true })

    try {
      const { guild } = interaction
      const data      = loadData()
      const { buildPainelV2, buildRelatorioPanel } = require('../systems/metas')

      // ── Painel principal (canal painel)
      const canalPainel = guild.channels.cache.get(CANAIS_METAS_IDS.painel)
      if (!canalPainel) {
        return interaction.editReply({
          content: '❌ Canal de painel não encontrado. Verifique `CANAIS_METAS_IDS.painel` no settings.',
        })
      }

      const modo = data.modo_pagamento || 'dinheiro'
      const { container: containerPainel, flags } = buildPainelV2(modo)
      await canalPainel.send({ components: [containerPainel], flags })

      // ── Painel de relatório (canal relatorio)
      const canalRelatorio = guild.channels.cache.get(CANAIS_METAS_IDS.relatorio)
      if (canalRelatorio) {
        const { container: containerRel, flags: flagsRel } = buildRelatorioPanel()
        await canalRelatorio.send({ components: [containerRel], flags: flagsRel })
      }

      return interaction.editReply({
        content:
          `✅ Painel enviado em <#${canalPainel.id}>!` +
          (canalRelatorio ? `\n✅ Painel de relatório enviado em <#${canalRelatorio.id}>!` : '\n⚠️ Canal de relatório não encontrado.'),
      })

    } catch (err) {
      console.error('[/enviar-painel-metas]', err)
      return interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

module.exports = [metaStatus, enviarPainelMetas]