/**
 * ETAPA 4 — Sistema de Registros
 * Arquivo: src/systems/registros.js
 *
 * Exports:
 *  - customIds
 *  - execute(interaction)
 *  - iniciarLoopMultas(client)
 *  - buildEmbedRegistros()
 */

const {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js')

const fs   = require('fs')
const path = require('path')

// ── Importação lazy para evitar circulares ────────────────────────────────────
// gerencia → registros e metas → registros: importar DENTRO da função, nunca no topo

// ── Constantes (copiadas de settings.js para comodidade interna) ─────────────
const {
  CHANNEL_IDS,
  COLOR_MS13,
  COLOR_SUCCESS,
  COLOR_ERROR,
  COLOR_WARNING,
  COLOR_INFO,
  FOOTER_TEXT,
  CIDADAO_LOW_ID,
  LOG_PD_CHANNEL_ID,
  CANAL_REGISTROS_ACOES_ID,
  REGISTROS_ACOES_FILE,
} = require('../config/settings.js')

// ── Arquivos de persistência ──────────────────────────────────────────────────
const MULTAS_FILE = path.resolve('multas_processadas.json')

function carregarMultasProcessadas() {
  if (!fs.existsSync(MULTAS_FILE)) return new Set()
  try {
    return new Set(JSON.parse(fs.readFileSync(MULTAS_FILE, 'utf8')))
  } catch {
    return new Set()
  }
}

function salvarMultasProcessadas(set) {
  fs.writeFileSync(MULTAS_FILE, JSON.stringify([...set], null, 2), 'utf8')
}

function carregarRegistros() {
  if (!fs.existsSync(REGISTROS_ACOES_FILE)) return {}
  try {
    return JSON.parse(fs.readFileSync(REGISTROS_ACOES_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function salvarRegistros(data) {
  fs.writeFileSync(REGISTROS_ACOES_FILE, JSON.stringify(data, null, 2), 'utf8')
}

// ── IDs registrados ───────────────────────────────────────────────────────────
const customIds = ['conf_advertencias_v13', 'conf_metas_v13']

// ── Embed principal do painel de registros ────────────────────────────────────
function buildEmbedRegistros() {
  return new EmbedBuilder()
    .setTitle('# Central de Registros — MS-13')
    .setDescription(
      '> Use os botões abaixo para confirmar as advertências ou metas do dia.\n' +
      '> Após a confirmação os registros do dia são limpos do arquivo.'
    )
    .setColor(COLOR_MS13)
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp()
}

// ── Componentes da CentralRegistrosView ──────────────────────────────────────
function buildCentralRegistrosRow() {
  const btnAdvs = new ButtonBuilder()
    .setCustomId('conf_advertencias_v13')
    .setLabel('✅ Confirmar Advs')
    .setStyle(ButtonStyle.Success)

  const btnMetas = new ButtonBuilder()
    .setCustomId('conf_metas_v13')
    .setLabel('✅ Confirmar Metas')
    .setStyle(ButtonStyle.Primary)

  return new ActionRowBuilder().addComponents(btnAdvs, btnMetas)
}

// ── Handler principal de interações ──────────────────────────────────────────
async function execute(interaction) {
  const { customId, guild, member } = interaction

  // Proteção contra double-reply
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

// ── Lógica de confirmação ─────────────────────────────────────────────────────
async function confirmarTipo(interaction, guild, member, tipo) {
  const registros = carregarRegistros()
  const hoje      = new Date().toLocaleDateString('pt-BR')

  const chave     = tipo === 'advertencias' ? 'advs' : 'metas'
  const registrosDia = (registros[hoje] && registros[hoje][chave]) || []
  const quantidade   = registrosDia.length

  // Limpa registros do dia para o tipo confirmado
  if (registros[hoje]) {
    registros[hoje][chave] = []
    salvarRegistros(registros)
  }

  // Log no canal logs_registros
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

// ── Loop de Multas ────────────────────────────────────────────────────────────
/**
 * Intervalo: 5 minutos
 * Lê o canal LOG_PD_CHANNEL_ID procurando mensagens com padrão:
 *   Valor: R$ 1.500.000   Infrator: <@123456789>
 * Se valor > 1.000.000 → aplica cargo CIDADAO_LOW_ID + loga em logs_geral
 * Usa multas_processadas.json para não reprocessar
 */
function iniciarLoopMultas(client) {
  const REGEX_MULTA = /Valor:\s*R\$\s*([\d.]+).+Infrator:\s*<@!?(\d+)>/s

  const tick = async () => {
    try {
      const guild = client.guilds.cache.first()
      if (!guild) return

      const canal = guild.channels.cache.get(LOG_PD_CHANNEL_ID)
      if (!canal) return

      const processadas = carregarMultasProcessadas()

      // Busca últimas 50 mensagens do canal de log PD
      const mensagens = await canal.messages.fetch({ limit: 50 }).catch(() => null)
      if (!mensagens) return

      for (const [msgId, msg] of mensagens) {
        if (processadas.has(msgId)) continue

        const match = REGEX_MULTA.exec(msg.content)
        if (!match) continue

        // Remove pontos de separador de milhar antes de parsear
        const valorStr = match[1].replace(/\./g, '')
        const valor    = parseInt(valorStr, 10)
        const userId   = match[2]

        processadas.add(msgId)

        if (valor > 1_000_000) {
          // Aplica cargo CIDADAO_LOW_ID ao infrator
          const membro = await guild.members.fetch(userId).catch(() => null)
          if (membro) {
            await membro.roles.add(CIDADAO_LOW_ID).catch(console.error)
          }

          // Log em logs_geral
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

  // Executa imediatamente e depois a cada 5 minutos
  tick()
  setInterval(tick, 5 * 60 * 1000)
}

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
  customIds,
  execute,
  iniciarLoopMultas,
  buildEmbedRegistros,
  buildCentralRegistrosRow,
}
