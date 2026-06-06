// src/systems/rankingEngine.js
// ─────────────────────────────────────────────────────────────────────────────
// Motor de ranking compartilhado entre recrutamento.js e tickets.js
// Garante que apenas UMA atualização rode por vez (mutex por tipo)
// e que o canal seja encontrado e editado de forma confiável.
// ─────────────────────────────────────────────────────────────────────────────
'use strict'

const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags,
} = require('discord.js')
const Database = require('better-sqlite3')
const moment   = require('moment-timezone')

const {
  BR_TZ, COLOR_REC, COLOR_INFO, COLOR_MS13,
  FOOTER_TEXT, REC_DB, REC_CHANNEL_IDS,
} = require('../config/settings.js')

const BANNER_REC     = 'https://cdn.discordapp.com/attachments/1489797401039474808/1512449213932503130/banner_rec.png?ex=6a242198&is=6a22d018&hm=cc997879c7a773d6dc2aa147c5b01c9f6bd0a9e68d59b7772f068733f6cb4e2b&'
const BANNER_TICKETS = 'https://cdn.discordapp.com/attachments/1489797401039474808/1512449212594520257/banner_tickets.png?ex=6a242198&is=6a22d018&hm=99391c2d19ee698b5ec61e59f15db5147bb360a6d8a033e0b4ea66bd013d5ad2&'

function agora() { return moment().tz(BR_TZ).format('DD/MM/YYYY HH:mm') }

// ── Singleton DB ──────────────────────────────────────────────────────────────
let _db = null
function getDb() {
  if (_db) return _db
  _db = new Database(REC_DB)
  // Garante que as tabelas existam (idempotente)
  _db.exec(`
    CREATE TABLE IF NOT EXISTS recrutamentos (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      candidato_id  TEXT NOT NULL,
      recrutador_id TEXT,
      ticket_id     TEXT UNIQUE,
      status        TEXT DEFAULT 'aberto',
      criado_em     TEXT DEFAULT (datetime('now','localtime')),
      fechado_em    TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_candidato_aberto
      ON recrutamentos(candidato_id) WHERE status = 'aberto';

    CREATE TABLE IF NOT EXISTS atendimentos (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      canal_id        TEXT UNIQUE NOT NULL,
      atendente_id    TEXT,
      usuario_id      TEXT NOT NULL,
      tipo            TEXT NOT NULL DEFAULT 'suporte',
      status          TEXT NOT NULL DEFAULT 'aberto',
      criado_em       TEXT DEFAULT (datetime('now','localtime')),
      assumido_em     TEXT,
      fechado_em      TEXT
    );

    CREATE TABLE IF NOT EXISTS blacklist (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        TEXT NOT NULL UNIQUE,
      motivo         TEXT,
      adicionado_por TEXT,
      adicionado_em  TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS perguntas (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      texto       TEXT NOT NULL,
      obrigatoria INTEGER DEFAULT 1,
      max_chars   INTEGER DEFAULT 500,
      ordem       INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS respostas_entrevista (
      canal_id  TEXT PRIMARY KEY,
      nome_ic   TEXT,
      id_mta    TEXT
    );
  `)
  return _db
}

// ── Mutex por tipo de ranking ─────────────────────────────────────────────────
const _em_andamento = { recrutadores: false, atendentes: false }

// ─────────────────────────────────────────────────────────────────────────────
// BUILDER — Ranking de Recrutadores (aprovações)
// ─────────────────────────────────────────────────────────────────────────────
function buildPayloadRankingRecrutadores(guild) {
  const db   = getDb()
  const sep  = new SeparatorBuilder()

  // COUNT(DISTINCT candidato_id) — mesmo candidato não conta 2x
  const dados = db.prepare(`
    SELECT recrutador_id,
           COUNT(DISTINCT candidato_id) AS total
    FROM   recrutamentos
    WHERE  recrutador_id IS NOT NULL
      AND  status = 'aprovado'
    GROUP  BY recrutador_id
    ORDER  BY total DESC
    LIMIT  10
  `).all()

  const container = new ContainerBuilder()
    .setAccentColor(COLOR_REC)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(BANNER_REC)
      )
    )
    .addSeparatorComponents(sep)

  if (dados.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '# 🏆 RANKING DE RECRUTADORES\n\n' +
        '> Nenhum recrutamento aprovado ainda.\n' +
        '> As posições serão preenchidas conforme membros forem aprovados.'
      )
    )
  } else {
    const medalhas = ['🥇', '🥈', '🥉']
    const nums     = ['4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟']
    const top3     = dados.slice(0, 3)
    const resto    = dados.slice(3)

    let podio = '# 🏆 RANKING DE RECRUTADORES\n\n'
    for (let i = 0; i < top3.length; i++) {
      const d      = top3[i]
      const m      = guild.members.cache.get(d.recrutador_id)
      const nome   = m ? m.displayName : `<@${d.recrutador_id}>`
      const plural = d.total === 1 ? 'aprovação' : 'aprovações'

      if (i === 0) {
        podio +=
          `${medalhas[0]} **${nome}**\n` +
          `> ✨ **LÍDER DA COMPETIÇÃO**\n` +
          `> 📊 **${d.total} ${plural}**\n\n`
      } else {
        podio +=
          `${medalhas[i]} **${nome}**\n` +
          `> 📊 ${d.total} ${plural}\n\n`
      }
    }

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(podio.trim())
    )

    if (resto.length > 0) {
      let restoText = '\n## 📋 Demais Recrutadores\n\n'
      for (let i = 0; i < resto.length; i++) {
        const d      = resto[i]
        const m      = guild.members.cache.get(d.recrutador_id)
        const nome   = m ? m.displayName : `<@${d.recrutador_id}>`
        const plural = d.total === 1 ? 'aprovação' : 'aprovações'
        restoText += `> ${nums[i] ?? `**${i + 4}.**`} ${nome} — ${d.total} ${plural}\n`
      }
      container
        .addSeparatorComponents(sep)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(restoText.trim()))
    }
  }

  container
    .addSeparatorComponents(sep)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> 🕐 Atualizado em: **${agora()}**\n` +
        `-# RANK_REC — ${FOOTER_TEXT}`
      )
    )

  return { components: [container], flags: MessageFlags.IsComponentsV2 }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILDER — Ranking de Atendentes (tickets fechados)
// ─────────────────────────────────────────────────────────────────────────────
function buildPayloadRankingAtendentes(guild) {
  const db  = getDb()
  const sep = new SeparatorBuilder()

  const dados = db.prepare(`
    SELECT atendente_id,
           COUNT(DISTINCT canal_id) AS total
    FROM   atendimentos
    WHERE  atendente_id IS NOT NULL
      AND  status = 'fechado'
    GROUP  BY atendente_id
    ORDER  BY total DESC
    LIMIT  10
  `).all()

  const container = new ContainerBuilder()
    .setAccentColor(COLOR_MS13)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(BANNER_TICKETS)
      )
    )
    .addSeparatorComponents(sep)

  if (dados.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '# 🎖️ RANKING DE ATENDENTES\n\n' +
        '> Nenhum atendimento encerrado ainda.\n' +
        '> As posições serão preenchidas conforme tickets forem fechados.'
      )
    )
  } else {
    const medalhas = ['🥇', '🥈', '🥉']
    const nums     = ['4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟']
    const top3     = dados.slice(0, 3)
    const resto    = dados.slice(3)

    let podio = '# 🎖️ RANKING DE ATENDENTES\n\n'
    for (let i = 0; i < top3.length; i++) {
      const d      = top3[i]
      const m      = guild.members.cache.get(d.atendente_id)
      const nome   = m ? m.displayName : `<@${d.atendente_id}>`
      const plural = d.total === 1 ? 'atendimento' : 'atendimentos'

      if (i === 0) {
        podio +=
          `${medalhas[0]} **${nome}**\n` +
          `> ✨ **MAIS ATIVO DA EQUIPE**\n` +
          `> 📊 **${d.total} ${plural} fechados**\n\n`
      } else {
        podio +=
          `${medalhas[i]} **${nome}**\n` +
          `> 📊 ${d.total} ${plural} fechados\n\n`
      }
    }

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(podio.trim())
    )

    if (resto.length > 0) {
      let restoText = '\n## 📋 Demais Atendentes\n\n'
      for (let i = 0; i < resto.length; i++) {
        const d      = resto[i]
        const m      = guild.members.cache.get(d.atendente_id)
        const nome   = m ? m.displayName : `<@${d.atendente_id}>`
        const plural = d.total === 1 ? 'atendimento' : 'atendimentos'
        restoText += `> ${nums[i] ?? `**${i + 4}.**`} ${nome} — ${d.total} ${plural}\n`
      }
      container
        .addSeparatorComponents(sep)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(restoText.trim()))
    }
  }

  container
    .addSeparatorComponents(sep)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> 🕐 Atualizado em: **${agora()}**\n` +
        `-# RANK_ATD — ${FOOTER_TEXT}`
      )
    )

  return { components: [container], flags: MessageFlags.IsComponentsV2 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Payloads de reset (visuais)
// ─────────────────────────────────────────────────────────────────────────────
function buildPayloadRankingRecrutadoresVazio() {
  const sep       = new SeparatorBuilder()
  const container = new ContainerBuilder()
    .setAccentColor(COLOR_REC)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_REC))
    )
    .addSeparatorComponents(sep)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '# 🏆 RANKING DE RECRUTADORES\n\n' +
        '> ♻️ **Ranking resetado.**\n> A competição recomeça agora!'
      )
    )
    .addSeparatorComponents(sep)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# RANK_REC — ${FOOTER_TEXT}`)
    )
  return { components: [container], flags: MessageFlags.IsComponentsV2 }
}

function buildPayloadRankingAtendentesVazio() {
  const sep       = new SeparatorBuilder()
  const container = new ContainerBuilder()
    .setAccentColor(COLOR_MS13)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_TICKETS))
    )
    .addSeparatorComponents(sep)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '# 🎖️ RANKING DE ATENDENTES\n\n' +
        '> ♻️ **Ranking resetado.**\n> A competição recomeça agora!'
      )
    )
    .addSeparatorComponents(sep)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# RANK_ATD — ${FOOTER_TEXT}`)
    )
  return { components: [container], flags: MessageFlags.IsComponentsV2 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Encontrar mensagem do bot pelo identificador no JSON dos components
// ─────────────────────────────────────────────────────────────────────────────
async function _findBotMsg(channel, clientId, identifier) {
  try {
    const msgs = await channel.messages.fetch({ limit: 50 })
    return msgs.find(m =>
      m.author.id === clientId &&
      JSON.stringify(m.components).includes(identifier)
    ) ?? null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPATCHER — atualiza um ranking específico no canal correto
//   tipo: 'recrutadores' | 'atendentes'
//   guild: Guild do Discord.js
// ─────────────────────────────────────────────────────────────────────────────
async function atualizarRanking(tipo, guild) {
  if (_em_andamento[tipo]) return       // mutex: evita edições paralelas
  _em_andamento[tipo] = true

  try {
    // Seleciona canal e builder com base no tipo
    let canalId, payload, identifier

    if (tipo === 'recrutadores') {
      canalId    = REC_CHANNEL_IDS.recrutadores   // '1488347411784007690'
      payload    = buildPayloadRankingRecrutadores(guild)
      identifier = 'RANK_REC'
    } else {
      // atendentes — usa o mesmo canal de recrutadores (top_tickets)
      // Você pode separar criando REC_CHANNEL_IDS.top_atendentes no settings.js
      canalId    = REC_CHANNEL_IDS.top_tickets    // '1488347411784007690'
      payload    = buildPayloadRankingAtendentes(guild)
      identifier = 'RANK_ATD'
    }

    const channel = guild.channels.cache.get(canalId)
    if (!channel) {
      console.warn(`[RANK] Canal para "${tipo}" não encontrado: ${canalId}`)
      return
    }

    const existing = await _findBotMsg(channel, guild.client.user.id, identifier)

    if (existing) {
      await existing.edit(payload)
    } else {
      await channel.send(payload)
    }
  } catch (err) {
    console.error(`[RANK] Erro ao atualizar ranking "${tipo}":`, err)
  } finally {
    _em_andamento[tipo] = false
  }
}

module.exports = {
  getDb,
  agora,
  atualizarRanking,
  buildPayloadRankingRecrutadores,
  buildPayloadRankingAtendentes,
  buildPayloadRankingRecrutadoresVazio,
  buildPayloadRankingAtendentesVazio,
}