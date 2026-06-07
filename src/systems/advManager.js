// src/systems/advManager.js
// Sistema central de advertências com prazo automático.
// REGRAS:
//   - better-sqlite3 é SÍNCRONO — NUNCA usar await em queries
//   - Importar gerencia.js DENTRO das funções para evitar import circular
//   - Todos os timeouts ativos ficam em memória; persistência via SQLite

'use strict'

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags,
} = require('discord.js')

const {
  ADV_CARGO_IDS, CHANNEL_IDS, ROLES, ROLE_IDS,
  MS13_ROLE_ID, CIDADAO_LOW_ID, FOOTER_TEXT,
  COLOR_ERROR, COLOR_WARNING,
} = require('../config/settings.js')

// ─── Mapa de timeouts ativos (userId → TimeoutId) ─────────────────────────────
const _advTimeouts = new Map()

// ─────────────────────────────────────────────────────────────────────────────
// PARSE DE PRAZO
// Aceita: "3 dias", "72h", "72 horas", "1 semana", "30min", "10m", etc.
// Retorna ms ou null se não encontrar nada.
// ─────────────────────────────────────────────────────────────────────────────
function parsePrazoMs(texto) {
  if (!texto || typeof texto !== 'string') return null
  const t = texto.toLowerCase().trim()

  // semanas
  const semMatch = t.match(/(\d+(?:[.,]\d+)?)\s*(?:semana|semanas|sem\b|week|weeks)/)
  if (semMatch) return parseFloat(semMatch[1].replace(',', '.')) * 7 * 24 * 60 * 60 * 1000

  // dias
  const diaMatch = t.match(/(\d+(?:[.,]\d+)?)\s*(?:dia|dias|d\b|day|days)/)
  if (diaMatch) return parseFloat(diaMatch[1].replace(',', '.')) * 24 * 60 * 60 * 1000

  // horas
  const hMatch = t.match(/(\d+(?:[.,]\d+)?)\s*(?:hora|horas|h\b|hr|hrs|hour|hours)/)
  if (hMatch) return parseFloat(hMatch[1].replace(',', '.')) * 60 * 60 * 1000

  // minutos
  const mMatch = t.match(/(\d+(?:[.,]\d+)?)\s*(?:minuto|minutos|min\b|m\b|minute|minutes)/)
  if (mMatch) return parseFloat(mMatch[1].replace(',', '.')) * 60 * 1000

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE CARGO
// ─────────────────────────────────────────────────────────────────────────────
function getAdvAtual(member) {
  if (member.roles.cache.has(ADV_CARGO_IDS[3])) return 3
  if (member.roles.cache.has(ADV_CARGO_IDS[2])) return 2
  if (member.roles.cache.has(ADV_CARGO_IDS[1])) return 1
  return 0
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILDERS V2 (interno) — log de prazo vencido
// ─────────────────────────────────────────────────────────────────────────────
function _logPrazoVencido(proxAdv, targetId, targetTag, motivo) {
  const cor    = proxAdv >= 3 ? COLOR_ERROR : COLOR_WARNING
  const titulo = proxAdv >= 3
    ? '🚨 ADV Vencida — Expulsão Automática'
    : `⏰ ADV Vencida — Avançou para ADV ${proxAdv}`

  return new ContainerBuilder()
    .setAccentColor(cor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${titulo}\n\n` +
        `> 👤 **Membro:** <@${targetId}> \`${targetTag}\`\n` +
        `> 🔢 **Nova ADV:** ADV ${proxAdv}\n` +
        `> 📝 **Motivo original:** ${motivo}\n` +
        `> 🤖 **Executado por:** Sistema (prazo vencido)`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ⏰ ADV Automática • Prazo Vencido • ${FOOTER_TEXT}`)
    )
}

function _dmPrazoVencido(proxAdv, motivo) {
  const titulo = proxAdv >= 3
    ? '🚨 Você foi expulso(a) da MS-13 — Prazo de ADV Vencido'
    : `⏰ Sua ADV avançou para ADV ${proxAdv} — MS-13`

  const desc = proxAdv >= 3
    ? `O prazo da sua advertência **venceu** sem resolução.\nVocê acumulou **3 advertências** e foi **expulso(a) automaticamente**.\n\n**Motivo original:** ${motivo}`
    : `O prazo da sua advertência **venceu** sem resolução.\nVocê avançou para a **${proxAdv}ª advertência**.\n\n**Motivo original:** ${motivo}` +
      (proxAdv === 2 ? '\n\n> ‼️ Na próxima advertência você será **expulso(a) automaticamente**.' : '')

  return new ContainerBuilder()
    .setAccentColor(proxAdv >= 3 ? COLOR_ERROR : COLOR_WARNING)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${titulo}\n\n${desc}`)
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# MS-13 Roleplay • Notificação Oficial`)
    )
}

/** DM enviada ao membro quando a adv é aplicada manualmente ou via sistema. */
function _dmAdvAplicada(proxAdv, motivo, valorFmt, prazoRaw) {
  // ADV 3: prazo de graca de 72h antes da expulsao automatica
  if (proxAdv >= 3) {
    return new ContainerBuilder()
      .setAccentColor(COLOR_ERROR)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## 🚨 Última Advertência — ADV 3 — MS-13\n\n` +
          `Você acumulou **3 advertências** na MS-13.\n\n` +
          `> 📝 **Motivo:** ${motivo}\n` +
          (valorFmt ? `> 💰 **Multa:** ${valorFmt}\n` : '') +
          `> ⏰ **Prazo para quitar:** **${prazoRaw ?? '72h'}**\n\n` +
          `⚠️ **Se você não quitar dentro do prazo, será expulso(a) automaticamente da facção.**\n` +
          `Entre em contato com a gerência para resolver sua situação.`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# MS-13 Roleplay • Notificação Oficial`)
      )
  }

  // ADV 1 e 2 - comportamento original
  let desc = `Você recebeu a **${proxAdv}ª advertência** na MS-13.\n\n**Motivo:** ${motivo}`
  if (valorFmt) desc += `\n> 💰 **Multa:** ${valorFmt}`
  if (prazoRaw) desc += `\n> ⏰ **Prazo para resolução:** ${prazoRaw}`
  if (!prazoRaw) desc += `\n> ℹ️ Sem prazo definido — resolva com a gerência.`
  if (proxAdv === 2) desc += `\n\n> ‼️ Na próxima advertência você terá **72h** para quitar ou será **expulso(a) automaticamente**.`

  return new ContainerBuilder()
    .setAccentColor(COLOR_WARNING)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ⚠️ Você recebeu ADV ${proxAdv} — MS-13\n\n${desc}`)
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# MS-13 Roleplay • Notificação Oficial`)
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILDER DO BOTÃO "✅ ADV PAGA" (ActionRow)
// ─────────────────────────────────────────────────────────────────────────────

/** Retorna o ActionRow com o botão de pagar adv. Sempre incluído em logs de adv 1 e 2. */
function _buildBotaoPaga(userId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`adv_paga_${userId}`)
      .setLabel('✅ Marcar como Paga')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled)
  )
}

/** DM enviada ao membro quando a adv é quitada manualmente. */
function _dmAdvQuitada(advNumero, executorTag) {
  return new ContainerBuilder()
    .setAccentColor(0x57F287) // verde
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ✅ Sua advertência foi quitada — MS-13\n\n` +
        `Sua **ADV ${advNumero}** foi marcada como paga por **${executorTag}**.\n` +
        `Você está quite com a facção.`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# MS-13 Roleplay • Notificação Oficial`)
    )
}


// ─────────────────────────────────────────────────────────────────────────────

/**
 * Garante que a tabela "advertencias" existe no banco.
 * Chame uma vez no startup (manager.js ou advInitDb()).
 */
function advInitDb() {
  const { getDb } = require('../database/manager.js')
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS advertencias (
      user_id             TEXT    NOT NULL,
      adv_numero          INTEGER NOT NULL,
      motivo              TEXT    NOT NULL,
      aplicada_por        TEXT    NOT NULL,
      timestamp_aplicacao TEXT    NOT NULL,
      prazo_iso           TEXT,
      log_msg_id          TEXT,
      PRIMARY KEY (user_id)
    );
  `)
  // Migração silenciosa — adiciona coluna se ainda não existir (banco legado)
  try { getDb().exec(`ALTER TABLE advertencias ADD COLUMN log_msg_id TEXT`) } catch {}
}

/** Salva ou atualiza o registro de adv ativa de um membro. SÍNCRONO. */
function advSalvar(userId, advNumero, motivo, aplicadaPor, prazoIso = null, logMsgId = null) {
  const { getDb } = require('../database/manager.js')
  getDb().prepare(`
    INSERT OR REPLACE INTO advertencias
      (user_id, adv_numero, motivo, aplicada_por, timestamp_aplicacao, prazo_iso, log_msg_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, advNumero, motivo, aplicadaPor, new Date().toISOString(), prazoIso, logMsgId)
}

/** Retorna o registro de adv ativa de um userId ou undefined. SÍNCRONO. */
function advGetAtiva(userId) {
  const { getDb } = require('../database/manager.js')
  return getDb().prepare('SELECT * FROM advertencias WHERE user_id = ?').get(userId)
}

/** Retorna todas as advs ativas. SÍNCRONO. */
function advGetTodas() {
  const { getDb } = require('../database/manager.js')
  return getDb().prepare('SELECT * FROM advertencias').all()
}

/** Remove o registro de adv de um userId. SÍNCRONO. */
function advRemover(userId) {
  const { getDb } = require('../database/manager.js')
  getDb().prepare('DELETE FROM advertencias WHERE user_id = ?').run(userId)
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENDADOR DE TIMEOUT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Agenda o timeout que avança a adv quando o prazo vence.
 * Só agenda se prazoIso for um Date futuro.
 * Se o prazo já passou, chama _aplicarProximaAdv imediatamente.
 */
function _agendarTimeout(client, guild, userId, prazoIso, motivo) {
  // Cancela timeout anterior deste membro se existir
  if (_advTimeouts.has(userId)) {
    clearTimeout(_advTimeouts.get(userId))
    _advTimeouts.delete(userId)
  }

  const delay = new Date(prazoIso).getTime() - Date.now()

  if (delay <= 0) {
    // Prazo já venceu — aplica imediatamente
    setImmediate(() => _aplicarProximaAdv(client, guild, userId, motivo))
    return
  }

  const tid = setTimeout(() => {
    _advTimeouts.delete(userId)
    _aplicarProximaAdv(client, guild, userId, motivo)
  }, delay)

  _advTimeouts.set(userId, tid)
}

/**
 * Lógica de avanço de adv quando o prazo vence.
 * Verifica o SQLite — se o registro não existir mais, a adv foi paga via botão → ignora.
 */
async function _aplicarProximaAdv(client, guild, userId, motivoOriginal) {
  try {
    // ── 1. Verifica se a adv ainda existe no banco (pode ter sido paga via botão) ──
    const registro = advGetAtiva(userId)
    if (!registro) return // Pago via botão — ignora silenciosamente

    // ── 2. Busca o membro ──────────────────────────────────────────────────────
    const member = await guild.members.fetch(userId).catch(() => null)
    if (!member) {
      advRemover(userId)
      return
    }

    const advAtualNo = registro.adv_numero

    // ── 3. Verifica se o membro ainda tem o cargo da adv (fallback extra) ──────
    const cargoAtual = ADV_CARGO_IDS[advAtualNo]
    if (cargoAtual && !member.roles.cache.has(cargoAtual)) {
      advRemover(userId)
      return
    }

    const proxAdv  = advAtualNo + 1
    const targetTag = member.user.tag

    // ── 4. Edita a mensagem de log original desabilitando o botão ─────────────
    if (registro.log_msg_id) {
      try {
        const logCh = guild.channels.cache.get(CHANNEL_IDS.logs_adv_gerencia)
        if (logCh) {
          const logMsg = await logCh.messages.fetch(registro.log_msg_id).catch(() => null)
          if (logMsg) {
            // Reconstrói o container original com linha de status — sem botão
            const { logAdv } = require('./gerencia.js')
            const statusText = proxAdv >= 3
              ? `⏰ Prazo vencido — avançando para **Expulsão**`
              : `⏰ Prazo vencido — avançando para **ADV ${proxAdv}**`

            const novoContainer = logAdv(
              advAtualNo,
              userId,
              targetTag,
              registro.aplicada_por,
              registro.motivo,
              '*(log original)*',
              null,
              registro.prazo_iso,
              statusText,
            )

            await logMsg.edit({
              components: [novoContainer],
              flags: MessageFlags.IsComponentsV2,
            }).catch(() => {})
          }
        }
      } catch (editErr) {
        console.warn('[advManager] Não foi possível editar mensagem de log:', editErr.message)
      }
    }

    // ── 5. Remove cargo atual ─────────────────────────────────────────────────
    if (cargoAtual) await member.roles.remove(cargoAtual).catch(() => {})

    if (proxAdv >= 3) {
      // ── Expulsão automática total (igual gerencia.js mas sem humano) ──────────
      const todosCargos = [
        MS13_ROLE_ID,
        ...ROLES.isento, ...(ROLES.elite || []), ...ROLES.membro,
        ROLE_IDS.meta_paga, ROLE_IDS.etapa2,
        ADV_CARGO_IDS[1], ADV_CARGO_IDS[2], ADV_CARGO_IDS[3],
      ].filter(id => id && member.roles.cache.has(id))
      for (const id of todosCargos) await member.roles.remove(id).catch(() => {})
      if (CIDADAO_LOW_ID) await member.roles.add(CIDADAO_LOW_ID).catch(() => {})
      await member.setNickname(null).catch(() => {})

      advRemover(userId)

      // DM de expulsão
      try {
        await member.user.send({
          components: [
            new ContainerBuilder()
              .setAccentColor(COLOR_ERROR)
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  `## 🚨 Você foi expulso(a) da MS-13\n\n` +
                  `O prazo da sua **ADV 3** venceu sem pagamento.\n` +
                  `Você foi **expulso(a) automaticamente** da facção.\n\n` +
                  `**Motivo original:** ${motivoOriginal}`
                )
              )
              .addSeparatorComponents(new SeparatorBuilder())
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# MS-13 Roleplay • Notificação Oficial`)
              )
          ],
          flags: MessageFlags.IsComponentsV2,
        })
      } catch {}

      // Log PD (mesmo canal que gerencia.js usa para exonerações)
      const { LOG_PD_CHANNEL_ID } = require('../config/settings.js')
      const logPdCh = guild.channels.cache.get(LOG_PD_CHANNEL_ID)
      if (logPdCh) await logPdCh.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(COLOR_ERROR)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## 🚨 Expulsão Automática — ADV 3 Vencida\n\n` +
                `> 👤 **Membro:** <@${userId}> \`${targetTag}\`\n` +
                `> ⚙️ **Executado por:** 🤖 Sistema (prazo ADV 3 vencido)\n` +
                `> 📝 **Motivo original:** ${motivoOriginal}`
              )
            )
            .addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`-# 🚨 Expulsão Automática • ${FOOTER_TEXT}`)
            )
        ],
        flags: MessageFlags.IsComponentsV2,
      }).catch(console.error)

      // Log adv + pub_adv
      const logCh = guild.channels.cache.get(CHANNEL_IDS.logs_adv_gerencia)
      const pubCh = guild.channels.cache.get(CHANNEL_IDS.pub_adv)

      if (logCh) await logCh.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(COLOR_ERROR)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## 🚨 Expulsão Automática — Prazo ADV 3 Vencido\n\n` +
                `> 👤 **Membro:** <@${userId}> \`${targetTag}\`\n` +
                `> 🔢 **ADV:** ADV 3 (prazo esgotado)\n` +
                `> 📝 **Motivo original:** ${motivoOriginal}\n` +
                `> 🤖 **Executado por:** Sistema (sem pagamento em 72h)`
              )
            )
            .addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`-# 🚨 Expulsão Automática • ${FOOTER_TEXT}`)
            )
        ],
        flags: MessageFlags.IsComponentsV2,
      }).catch(console.error)

      if (pubCh) await pubCh.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(COLOR_ERROR)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## 📢 Expulsão Automática — MS-13\n\n` +
                `> **${targetTag}** foi expulso(a) automaticamente após o prazo da **ADV 3** vencer sem pagamento.\n` +
                `> 📝 **Motivo original:** ${motivoOriginal}`
              )
            )
        ],
        flags: MessageFlags.IsComponentsV2,
      }).catch(console.error)

    } else {
      // ── ADV 1 ou 2 → aplica novo cargo, DM e log ──────────────────────────────
      await member.roles.add(ADV_CARGO_IDS[proxAdv]).catch(() => {})

      // Persiste no banco (sem novo prazo — prazo venceu, sem log_msg_id ainda)
      advSalvar(userId, proxAdv, motivoOriginal, 'Sistema (prazo vencido)', null, null)

      // DM pro membro
      try {
        await member.user.send({
          components: [
            new ContainerBuilder()
              .setAccentColor(COLOR_WARNING)
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  `## ⏰ Prazo de ADV vencido — MS-13\n\n` +
                  `O prazo da sua **ADV ${advAtualNo}** venceu sem pagamento.\n` +
                  `Você recebeu automaticamente a **ADV ${proxAdv}**.\n\n` +
                  `**Motivo original:** ${motivoOriginal}` +
                  (proxAdv === 2
                    ? '\n\n> ‼️ Na próxima advertência você terá **72h** para quitar ou será **expulso(a) automaticamente**.'
                    : '')
                )
              )
              .addSeparatorComponents(new SeparatorBuilder())
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# MS-13 Roleplay • Notificação Oficial`)
              )
          ],
          flags: MessageFlags.IsComponentsV2,
        })
      } catch {}

      // Log nos canais
      const logCh = guild.channels.cache.get(CHANNEL_IDS.logs_adv_gerencia)
      const pubCh = guild.channels.cache.get(CHANNEL_IDS.pub_adv)

      if (logCh) await logCh.send({
        components: [_logPrazoVencido(proxAdv, userId, targetTag, motivoOriginal)],
        flags: MessageFlags.IsComponentsV2,
      }).catch(console.error)

      if (pubCh) await pubCh.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(COLOR_WARNING)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## 📢 ADV ${proxAdv} — Prazo Vencido\n\n` +
                `> **${targetTag}** avançou para **ADV ${proxAdv}** após o prazo vencer.\n` +
                `> 📝 **Motivo original:** ${motivoOriginal}`
              )
            )
        ],
        flags: MessageFlags.IsComponentsV2,
      }).catch(console.error)
    }

  } catch (err) {
    console.error(`[advManager] Erro ao aplicar próxima adv para ${userId}:`, err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNÇÃO CENTRAL — aplicarAdvertencia
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aplica uma advertência a um membro.
 *
 * @param {import('discord.js').Guild}      guild
 * @param {import('discord.js').GuildMember} targetMember
 * @param {string}  motivo        Texto do motivo
 * @param {string}  prova         Link ou "Não informado"
 * @param {string}  executorTag   Tag do executor ou 'Sistema'
 * @param {number|null} prazoMs   Duração em ms até a próxima adv (null = sem prazo)
 *
 * @returns {{ proxAdv: number, exonerado: boolean }}
 */
async function aplicarAdvertencia(guild, targetMember, motivo, prova, executorTag, prazoMs = null, valorFmt = null) {
  // Importa os builders de log/dm do gerencia.js AQUI (evita import circular no topo)
  const { logAdv, dmAdv } = require('./gerencia.js')

  const advAtual = getAdvAtual(targetMember)
  const proxAdv  = advAtual + 1

  // Remove cargo da adv anterior
  if (advAtual >= 1 && ADV_CARGO_IDS[advAtual]) {
    await targetMember.roles.remove(ADV_CARGO_IDS[advAtual]).catch(() => {})
  }

  // Cancela timeout anterior se existir
  if (_advTimeouts.has(targetMember.id)) {
    clearTimeout(_advTimeouts.get(targetMember.id))
    _advTimeouts.delete(targetMember.id)
  }

  // ── ADV 3 → prazo de graça de 72h antes da expulsão automática ────────────
  if (proxAdv >= 3) {
    const ADV3_PRAZO_MS = 72 * 60 * 60 * 1000 // 72h fixo
    if (ADV_CARGO_IDS[3]) await targetMember.roles.add(ADV_CARGO_IDS[3]).catch(() => {})

    const prazoIso3 = new Date(Date.now() + ADV3_PRAZO_MS).toISOString()

    // Persiste — sem log_msg_id ainda, atualiza depois
    advSalvar(targetMember.id, 3, motivo, executorTag, prazoIso3, null)

    // Agenda expulsão automática no vencimento
    _agendarTimeout(guild.client, guild, targetMember.id, prazoIso3, motivo)

    // DM de última advertência com prazo
    try {
      await targetMember.user.send({
        components: [_dmAdvAplicada(3, motivo, valorFmt, '72h')],
        flags: MessageFlags.IsComponentsV2,
      })
    } catch {}

    // Log nos canais com botão "✅ Marcar como Paga"
    const logCh3 = guild.channels.cache.get(CHANNEL_IDS.logs_adv_gerencia)
    const pubCh3 = guild.channels.cache.get(CHANNEL_IDS.pub_adv)

    if (logCh3) {
      const logMsg3 = await logCh3.send({
        components: [
          logAdv(3, targetMember.id, targetMember.user.tag, executorTag, motivo, prova, valorFmt, prazoIso3),
          _buildBotaoPaga(targetMember.id),
        ],
        flags: MessageFlags.IsComponentsV2,
      }).catch(err => { console.error(err); return null })

      if (logMsg3) {
        advSalvar(targetMember.id, 3, motivo, executorTag, prazoIso3, logMsg3.id)
      }
    }

    if (pubCh3) await pubCh3.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(COLOR_ERROR)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## 🚨 ADV 3 — Última Advertência — MS-13\n\n` +
              `> **${targetMember.user.tag}** recebeu a **ADV 3** (última advertência).\n` +
              `> 📝 **Motivo:** ${motivo}\n` +
              (valorFmt ? `> 💰 **Multa:** ${valorFmt}\n` : '') +
              `> ⏰ **Prazo para quitar:** <t:${Math.floor(new Date(prazoIso3).getTime() / 1000)}:R>\n` +
              `> ⚠️ Sem pagamento dentro do prazo → **expulsão automática**.`
            )
          )
      ],
      flags: MessageFlags.IsComponentsV2,
    }).catch(console.error)

    return { proxAdv: 3, exonerado: false }
  }

  // ── ADV 1 ou 2 → aplica cargo + persiste + agenda ──────────────────────
  await targetMember.roles.add(ADV_CARGO_IDS[proxAdv]).catch(() => {})

  const prazoIso = prazoMs != null ? new Date(Date.now() + prazoMs).toISOString() : null

  // Salva sem log_msg_id por enquanto — será atualizado após enviar o log
  advSalvar(targetMember.id, proxAdv, motivo, executorTag, prazoIso, null)

  // Agenda timeout se tiver prazo
  if (prazoIso) {
    _agendarTimeout(guild.client, guild, targetMember.id, prazoIso, motivo)
  }

  // DM com motivo, valor e prazo
  const prazoRawDisplay = prazoMs
    ? (() => {
        const h = Math.round(prazoMs / 3600000)
        if (h >= 168) return `${Math.round(h/168)} semana(s)`
        if (h >= 24)  return `${Math.round(h/24)} dia(s)`
        return `${h}h`
      })()
    : null

  try {
    await targetMember.user.send({
      components: [_dmAdvAplicada(proxAdv, motivo, valorFmt, prazoRawDisplay)],
      flags: MessageFlags.IsComponentsV2,
    })
  } catch {}

  // Logs — ADV 1 e 2 sempre têm botão "✅ Marcar como Paga"
  const logCh = guild.channels.cache.get(CHANNEL_IDS.logs_adv_gerencia)
  const pubCh = guild.channels.cache.get(CHANNEL_IDS.pub_adv)

  if (logCh) {
    const logMsg = await logCh.send({
      components: [
        logAdv(proxAdv, targetMember.id, targetMember.user.tag, executorTag, motivo, prova, valorFmt, prazoIso),
        _buildBotaoPaga(targetMember.id),
      ],
      flags: MessageFlags.IsComponentsV2,
    }).catch(err => { console.error(err); return null })

    // Persiste o ID da mensagem de log para edição futura
    if (logMsg) {
      advSalvar(targetMember.id, proxAdv, motivo, executorTag, prazoIso, logMsg.id)
    }
  }

  if (pubCh) await pubCh.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(COLOR_WARNING)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## 📢 Advertência ${proxAdv} — MS-13\n\n` +
            `> **${targetMember.user.tag}** recebeu a **ADV ${proxAdv}**.\n` +
            `> 📝 **Motivo:** ${motivo}` +
            (valorFmt ? `\n> 💰 **Multa:** ${valorFmt}` : '') +
            (prazoIso ? `\n> ⏰ **Prazo:** <t:${Math.floor(new Date(prazoIso).getTime() / 1000)}:R>` : '')
          )
        )
    ],
    flags: MessageFlags.IsComponentsV2,
  }).catch(console.error)

  return { proxAdv, exonerado: false }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESTORE DE TIMEOUTS NO RESTART
// Chamado no ready.js após o bot iniciar.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lê todas as advs ativas do SQLite e recria os timeouts.
 * Advs com prazo já vencido são aplicadas imediatamente.
 *
 * @param {import('discord.js').Client} client
 */
async function restaurarTimeouts(client) {
  try {
    advInitDb() // garante que a tabela existe
    const todas = advGetTodas()
    if (!todas.length) return

    const guild = client.guilds.cache.first()
    if (!guild) return

    console.log(`[advManager] Restaurando ${todas.length} adv(s) ativas...`)

    for (const row of todas) {
      if (!row.prazo_iso) continue // sem prazo = adv permanente, nada a agendar

      _agendarTimeout(client, guild, row.user_id, row.prazo_iso, row.motivo)
    }

    console.log('[advManager] Timeouts restaurados.')
  } catch (err) {
    console.error('[advManager] Erro ao restaurar timeouts:', err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER DO BOTÃO "✅ ADV PAGA"
// customId: adv_paga_{userId}
// ─────────────────────────────────────────────────────────────────────────────

/** customIds registrados neste sistema (prefixo dinâmico). */
const customIds = ['adv_paga_']

/**
 * Handler chamado pelo interactionCreate quando alguém clica em "✅ Marcar como Paga".
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleAdvPaga(interaction, client) {
  if (interaction.replied || interaction.deferred) return
  await interaction.deferReply({ ephemeral: true })

  const { guild, user: executor } = interaction
  const userId = interaction.customId.slice('adv_paga_'.length)

  // ── 1. Busca adv ativa no SQLite ────────────────────────────────────────────
  const registro = advGetAtiva(userId)
  if (!registro) {
    return interaction.editReply({ content: '❌ Nenhuma advertência ativa encontrada para esse membro.' })
  }

  // ── 2. Busca o membro ────────────────────────────────────────────────────────
  const member = await guild.members.fetch(userId).catch(() => null)

  // ── 3. Cancela timeout ativo ─────────────────────────────────────────────────
  if (_advTimeouts.has(userId)) {
    clearTimeout(_advTimeouts.get(userId))
    _advTimeouts.delete(userId)
  }

  // ── 4. Remove cargo de adv ───────────────────────────────────────────────────
  if (member && ADV_CARGO_IDS[registro.adv_numero]) {
    await member.roles.remove(ADV_CARGO_IDS[registro.adv_numero]).catch(() => {})
  }

  // ── 5. Remove do SQLite ──────────────────────────────────────────────────────
  advRemover(userId)

  // ── 6. Edita mensagem de log original ────────────────────────────────────────
  if (registro.log_msg_id) {
    try {
      const logCh = guild.channels.cache.get(CHANNEL_IDS.logs_adv_gerencia)
      if (logCh) {
        const logMsg = await logCh.messages.fetch(registro.log_msg_id).catch(() => null)
        if (logMsg) {
          const { logAdv } = require('./gerencia.js')
          const resolvidaEm = Math.floor(Date.now() / 1000)

          const novoContainer = logAdv(
            registro.adv_numero,
            userId,
            member?.user.tag ?? userId,
            registro.aplicada_por,
            registro.motivo,
            '*(log original)*',
            null,
            registro.prazo_iso,
            `✅ Resolvida por <@${executor.id}> em <t:${resolvidaEm}:R>`,
          )

          await logMsg.edit({
            components: [novoContainer],
            flags: MessageFlags.IsComponentsV2,
          }).catch(() => {})
        }
      }
    } catch (editErr) {
      console.warn('[advManager] Erro ao editar log de adv paga:', editErr.message)
    }
  }

  // ── 7. DM pro membro ──────────────────────────────────────────────────────────
  if (member) {
    try {
      await member.user.send({
        components: [_dmAdvQuitada(registro.adv_numero, executor.tag)],
        flags: MessageFlags.IsComponentsV2,
      })
    } catch {}
  }

  const advNum = registro.adv_numero
  const replyMsg = advNum >= 3
    ? `✅ **ADV 3** de <@${userId}> marcada como paga — cargo removido. Cargos MS-13 mantidos.`
    : `✅ ADV ${advNum} de <@${userId}> marcada como paga e cargo removido.`

  return interaction.editReply({ content: replyMsg })
}

module.exports = {
  customIds,
  parsePrazoMs,
  getAdvAtual,
  aplicarAdvertencia,
  restaurarTimeouts,
  handleAdvPaga,
  advInitDb,
  advSalvar,
  advGetAtiva,
  advGetTodas,
  advRemover,
}