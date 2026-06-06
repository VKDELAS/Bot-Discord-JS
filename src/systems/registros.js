/**
 * ETAPA 4 — Sistema de Registros
 * Arquivo: src/systems/registros.js
 */

const {
  ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
} = require('discord.js')

const fs   = require('fs')
const path = require('path')

const {
  CHANNEL_IDS, COLOR_MS13, COLOR_SUCCESS, COLOR_ERROR,
  FOOTER_TEXT, CIDADAO_LOW_ID, LOG_PD_CHANNEL_ID,
  CANAL_REGISTROS_ACOES_ID, REGISTROS_ACOES_FILE,
} = require('../config/settings.js')

const MULTAS_FILE = path.resolve('multas_processadas.json')

function carregarMultasProcessadas() {
  if (!fs.existsSync(MULTAS_FILE)) return new Set()
  try { return new Set(JSON.parse(fs.readFileSync(MULTAS_FILE, 'utf8'))) }
  catch { return new Set() }
}

function salvarMultasProcessadas(set) {
  fs.writeFileSync(MULTAS_FILE, JSON.stringify([...set], null, 2), 'utf8')
}

function carregarRegistros() {
  if (!fs.existsSync(REGISTROS_ACOES_FILE)) return {}
  try { return JSON.parse(fs.readFileSync(REGISTROS_ACOES_FILE, 'utf8')) }
  catch { return {} }
}

function salvarRegistros(data) {
  fs.writeFileSync(REGISTROS_ACOES_FILE, JSON.stringify(data, null, 2), 'utf8')
}

const customIds = ['conf_advertencias_v13', 'conf_metas_v13']

// ─── Legado (mantidos por compatibilidade) ────────────────────────────────────
function buildEmbedRegistros() { return null }
function buildCentralRegistrosRow() { return [] }

// ─── V2: Painel de Registros ──────────────────────────────────────────────────
function buildRegistrosV2() {
  const container = new ContainerBuilder()

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('# 📋 Central de Registros — MS-13')
  )
  container.addSeparatorComponents(new SeparatorBuilder())
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '> Use os botões abaixo para confirmar as advertências ou metas do dia.\n' +
      '> Após a confirmação os registros do dia são limpos do arquivo.'
    )
  )
  container.addSeparatorComponents(new SeparatorBuilder())
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('conf_advertencias_v13').setLabel('✅ Confirmar Advs').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('conf_metas_v13').setLabel('✅ Confirmar Metas').setStyle(ButtonStyle.Primary),
    )
  )

  return { components: [container], flags: (1 << 15) }
}

// ─── V2: Painel de Membros ────────────────────────────────────────────────────
function buildMembrosV2() {
  const container = new ContainerBuilder()

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('# 🔫 Painel de Membros — MS-13')
  )
  container.addSeparatorComponents(new SeparatorBuilder())
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '> *"A lealdade é a base de tudo."*\n\n' +
      '**📌 Registro de Ações**\n' +
      '- 💀 **Kill** — Registrar eliminação\n' +
      '- 🏧 **ATM** — Registrar saque no caixa\n' +
      '- 🛒 **Loja** — Registrar compra em loja\n' +
      '- 💊 **Cracolândia** — Registrar ponto de venda\n' +
      '- 💤 **AFK** — Registrar ausência temporária\n' +
      '- 🏃 **Corrida** — Registrar rota concluída\n\n' +
      '**📅 Gestão Pessoal**\n' +
      '- 📅 **Ausência** — Comunicar ausência\n' +
      '- 📊 **Meta** — Verificar/registrar meta\n' +
      '- 📋 **Geral** — Registro livre'
    )
  )
  container.addSeparatorComponents(new SeparatorBuilder())

  // Fileira 1 — ações de campo
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('reg_kill_v13').setLabel('💀 Kill').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('reg_atm_v13').setLabel('🏧 ATM').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('reg_loja_v13').setLabel('🛒 Loja').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('reg_craco_v13').setLabel('💊 Cracolândia').setStyle(ButtonStyle.Secondary),
    )
  )

  // Fileira 2 — atividades
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('reg_afk_v13').setLabel('💤 AFK').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('reg_corrida_v13').setLabel('🏃 Corrida').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('reg_ausencia_v13').setLabel('📅 Ausência').setStyle(ButtonStyle.Secondary),
    )
  )

  // Fileira 3 — gestão
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('reg_meta_v13').setLabel('📊 Meta').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('reg_geral_v13').setLabel('📋 Geral').setStyle(ButtonStyle.Secondary),
    )
  )

  return { components: [container], flags: (1 << 15) }
}

// ─── Execute ──────────────────────────────────────────────────────────────────
async function execute(interaction) {
  const { customId, guild, member } = interaction
  if (interaction.replied || interaction.deferred) return

  if (customId === 'conf_advertencias_v13') {
    await interaction.deferReply({ ephemeral: true })
    await confirmarTipo(interaction, guild, member, 'advertencias')
    return
  }

  if (customId === 'conf_metas_v13') {
    await interaction.deferReply({ ephemeral: true })
    await confirmarTipo(interaction, guild, member, 'metas')
    return
  }
}

async function confirmarTipo(interaction, guild, member, tipo) {
  const registros    = carregarRegistros()
  const hoje         = new Date().toLocaleDateString('pt-BR')
  const chave        = tipo === 'advertencias' ? 'advs' : 'metas'
  const registrosDia = (registros[hoje] && registros[hoje][chave]) || []
  const quantidade   = registrosDia.length

  if (registros[hoje]) {
    registros[hoje][chave] = []
    salvarRegistros(registros)
  }

  const canalLog = guild.channels.cache.get(CHANNEL_IDS.logs_registros)
  if (canalLog) {
    const embed = new EmbedBuilder()
      .setTitle(`✅ Confirmação de ${tipo === 'advertencias' ? 'Advertências' : 'Metas'}`)
      .setDescription(
        `> **Confirmado por:** <@${member.id}>\n` +
        `> **Data:** ${hoje}\n` +
        `> **Registros confirmados:** ${quantidade}`
      )
      .setColor(COLOR_SUCCESS)
      .setFooter({ text: FOOTER_TEXT })
      .setTimestamp()
    await canalLog.send({ embeds: [embed] }).catch(console.error)
  }

  await interaction.editReply({
    content: `✅ **${quantidade} registro(s) de ${tipo === 'advertencias' ? 'advertências' : 'metas'}** do dia **${hoje}** confirmados e limpos.`,
  })
}

function iniciarLoopMultas(client) {
  const REGEX_MULTA = /Valor:\s*R\$\s*([\d.]+).+Infrator:\s*<@!?(\d+)>/s

  const tick = async () => {
    try {
      const guild = client.guilds.cache.first()
      if (!guild) return
      const canal = guild.channels.cache.get(LOG_PD_CHANNEL_ID)
      if (!canal) return

      const processadas = carregarMultasProcessadas()
      const mensagens   = await canal.messages.fetch({ limit: 50 }).catch(() => null)
      if (!mensagens) return

      for (const [msgId, msg] of mensagens) {
        if (processadas.has(msgId)) continue
        const match = REGEX_MULTA.exec(msg.content)
        if (!match) continue

        const valorStr = match[1].replace(/\./g, '')
        const valor    = parseInt(valorStr, 10)
        const userId   = match[2]
        processadas.add(msgId)

        if (valor > 1_000_000) {
          const membro = await guild.members.fetch(userId).catch(() => null)
          if (membro) await membro.roles.add(CIDADAO_LOW_ID).catch(console.error)

          const canalLog = guild.channels.cache.get(CHANNEL_IDS.logs_geral)
          if (canalLog) {
            const embed = new EmbedBuilder()
              .setTitle('🚨 Multa Alta Detectada')
              .setDescription(
                `> **Infrator:** <@${userId}>\n` +
                `> **Valor:** R$ ${match[1]}\n` +
                `> **Cargo aplicado:** <@&${CIDADAO_LOW_ID}>\n` +
                `> **Mensagem original:** [ir](${msg.url})`
              )
              .setColor(COLOR_ERROR)
              .setFooter({ text: FOOTER_TEXT })
              .setTimestamp()
            await canalLog.send({ embeds: [embed] }).catch(console.error)
          }
        }
      }
      salvarMultasProcessadas(processadas)
    } catch (err) {
      console.error('[registros] Erro no loop de multas:', err)
    }
  }

  tick()
  setInterval(tick, 5 * 60 * 1000)
}

module.exports = {
  customIds,
  execute,
  iniciarLoopMultas,
  // Legado
  buildEmbedRegistros,
  buildCentralRegistrosRow,
  // V2
  buildRegistrosV2,
  buildMembrosV2,
}