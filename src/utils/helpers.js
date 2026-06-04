// src/utils/helpers.js
'use strict'

const moment = require('moment-timezone')
const { EmbedBuilder } = require('discord.js')
const {
  BR_TZ, META_VALOR, ROLES, ROLE_NAMES,
  META_ROTAS_PRODUTO, PRODUTOS_META_LISTA, PRODUTOS_META_CURTO,
  COLOR_MS13, COLOR_INFO, FOOTER_TEXT, CANAIS_METAS_IDS,
} = require('../config/settings')

function fmtBr(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDataPt(date) {
  return moment(date).tz(BR_TZ).format('DD/MM/YYYY HH:mm')
}

function discordTs(date, style = 'f') {
  const unix = Math.floor(new Date(date).getTime() / 1000)
  return `<t:${unix}:${style}>`
}

function getRoleCategory(member) {
  for (const [cat, ids] of Object.entries(ROLES)) {
    if (ids.some(id => member.roles.cache.has(id))) return cat
  }
  return null
}

function getCargoNome(member) {
  for (const [id, nome] of Object.entries(ROLE_NAMES)) {
    if (member.roles.cache.has(id)) return nome
  }
  return 'Sem cargo'
}

function getNomeMta(member) {
  const nick = member.displayName || member.user.username
  if (nick.includes('|')) return nick.split('|')[0].trim()
  return nick
}

function valorMetaParaCargo(cat) {
  if (!cat || cat === 'isento') return 0
  return META_VALOR
}

function getRotasParaCargo(cat) {
  return META_ROTAS_PRODUTO[cat] ?? 0
}

async function garantirCanais(guild) {
  const result = {}
  for (const [key, id] of Object.entries(CANAIS_METAS_IDS)) {
    const ch = guild.channels.cache.get(id)
    if (!ch) console.warn(`[helpers] Canal "${key}" (${id}) não encontrado na guild.`)
    result[key] = ch ?? null
  }
  return result
}

function buildEntregarEmbed(prazoDt, solicitadoPor, modo = 'normal') {
  const prazoFmt = discordTs(prazoDt, 'F')
  const prazoRel = discordTs(prazoDt, 'R')
  const embed = new EmbedBuilder()
    .setColor(COLOR_MS13)
    .setTitle('📦 Entrega de Meta — MS-13')
    .setDescription(
      `> Use este canal para registrar a entrega da sua meta semanal.\n\n**Produtos aceitos:**\n${PRODUTOS_META_LISTA}`
    )
    .addFields(
      { name: '⏰ Prazo',    value: `${prazoFmt} (${prazoRel})`, inline: false },
      { name: '💰 Valor',   value: fmtBr(META_VALOR),             inline: true },
      { name: '📋 Resumo',  value: PRODUTOS_META_CURTO,           inline: true },
    )
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp()
  if (modo === 'novo_ciclo') {
    embed.addFields({ name: '🔄 Novo ciclo', value: 'Meta resetada. Boa sorte!', inline: false })
  }
  return embed
}

function buildPainelEmbed(modo = 'normal') {
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO)
    .setTitle('📊 Painel de Metas — MS-13')
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp()
  if (modo === 'vazio') {
    embed.setDescription('Nenhuma meta ativa no momento.')
  } else {
    embed.setDescription(
      `> Acompanhe o status das metas semanais da facção.\n\nUse o botão abaixo para marcar sua meta como entregue.`
    )
  }
  return embed
}

module.exports = {
  fmtBr, fmtDataPt, discordTs,
  getRoleCategory, getCargoNome, getNomeMta,
  valorMetaParaCargo, getRotasParaCargo,
  garantirCanais, buildEntregarEmbed, buildPainelEmbed,
}
