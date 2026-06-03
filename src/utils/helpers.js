// src/utils/helpers.js

'use strict'

const moment = require('moment-timezone')
const { EmbedBuilder } = require('discord.js')
const {
  BR_TZ,
  META_VALOR,
  ROLES,
  ROLE_NAMES,
  META_ROTAS_PRODUTO,
  PRODUTOS_META_LISTA,
  PRODUTOS_META_CURTO,
  COLOR_MS13,
  COLOR_INFO,
  FOOTER_TEXT,
  CANAIS_METAS_IDS,
} = require('../config/settings')

// ─── Formatação ───────────────────────────────────────────────────────────────

/**
 * Formata número como moeda brasileira. Ex: 70000 → "R$ 70.000,00"
 */
function fmtBr(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Formata Date/moment em data PT-BR. Ex: "03/06/2026 14:30"
 */
function fmtDataPt(date) {
  return moment(date).tz(BR_TZ).format('DD/MM/YYYY HH:mm')
}

/**
 * Retorna timestamp Discord formatado.
 * style: 't' hora curta | 'T' hora longa | 'd' data curta | 'D' data longa
 *        'f' data+hora  | 'F' data+hora longa | 'R' relativo
 */
function discordTs(date, style = 'f') {
  const unix = Math.floor(new Date(date).getTime() / 1000)
  return `<t:${unix}:${style}>`
}

// ─── Roles ────────────────────────────────────────────────────────────────────

/**
 * Retorna a categoria do membro: 'isento' | 'elite' | 'membro' | null
 */
function getRoleCategory(member) {
  for (const [cat, ids] of Object.entries(ROLES)) {
    if (ids.some(id => member.roles.cache.has(id))) return cat
  }
  return null
}

/**
 * Retorna o nome do cargo principal do membro (primeiro match em ROLE_NAMES)
 */
function getCargoNome(member) {
  for (const [id, nome] of Object.entries(ROLE_NAMES)) {
    if (member.roles.cache.has(id)) return nome
  }
  return 'Sem cargo'
}

/**
 * Tenta extrair o nome MTA do nickname do Discord.
 * Padrão esperado: "Nome MTA | Nick Discord" ou apenas o displayName.
 */
function getNomeMta(member) {
  const nick = member.displayName || member.user.username
  if (nick.includes('|')) return nick.split('|')[0].trim()
  return nick
}

/**
 * Retorna o valor da meta para o cargo do membro.
 */
function valorMetaParaCargo(cat) {
  if (!cat || cat === 'isento') return 0
  return META_VALOR
}

/**
 * Retorna o número de rotas necessárias para o cargo.
 */
function getRotasParaCargo(cat) {
  return META_ROTAS_PRODUTO[cat] ?? 0
}

// ─── Canais ───────────────────────────────────────────────────────────────────

/**
 * Garante que os canais de metas existam na guild.
 * Retorna objeto { painel, entregar, entregues, relatorio } com os channels.
 */
async function garantirCanais(guild) {
  const result = {}
  for (const [key, id] of Object.entries(CANAIS_METAS_IDS)) {
    const ch = guild.channels.cache.get(id)
    if (!ch) console.warn(`[helpers] Canal "${key}" (${id}) não encontrado na guild.`)
    result[key] = ch ?? null
  }
  return result
}

// ─── Embeds de Meta ───────────────────────────────────────────────────────────

/**
 * Constrói o embed do canal #entregar-meta.
 * @param {Date|string} prazoDt  - prazo da meta atual
 * @param {string}      solicitadoPor - ID ou menção do solicitante
 * @param {string}      modo     - 'normal' | 'novo_ciclo'
 */
function buildEntregarEmbed(prazoDt, solicitadoPor, modo = 'normal') {
  const prazoFmt  = discordTs(prazoDt, 'F')
  const prazoRel  = discordTs(prazoDt, 'R')

  const embed = new EmbedBuilder()
    .setColor(COLOR_MS13)
    .setTitle('📦 Entrega de Meta — MS-13')
    .setDescription(
      `> Use este canal para registrar a entrega da sua meta semanal.\n\n` +
      `**Produtos aceitos:**\n${PRODUTOS_META_LISTA}`
    )
    .addFields(
      { name: '⏰ Prazo', value: `${prazoFmt} (${prazoRel})`, inline: false },
      { name: '💰 Valor', value: fmtBr(META_VALOR), inline: true },
      { name: '📋 Resumo', value: PRODUTOS_META_CURTO, inline: true },
    )
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp()

  if (modo === 'novo_ciclo') {
    embed.addFields({ name: '🔄 Novo ciclo', value: 'Meta resetada. Boa sorte!', inline: false })
  }

  return embed
}

/**
 * Constrói o embed do painel principal de metas.
 * @param {string} modo - 'normal' | 'vazio'
 */
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
      `> Acompanhe o status das metas semanais da facção.\n\n` +
      `Use o botão abaixo para marcar sua meta como entregue.`
    )
  }

  return embed
}

module.exports = {
  fmtBr,
  fmtDataPt,
  discordTs,
  getRoleCategory,
  getCargoNome,
  getNomeMta,
  valorMetaParaCargo,
  getRotasParaCargo,
  garantirCanais,
  buildEntregarEmbed,
  buildPainelEmbed,
}
