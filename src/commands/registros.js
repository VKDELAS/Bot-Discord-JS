const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js')
const moment = require('moment-timezone')
const fs     = require('fs')
const path   = require('path')

// ─── Constantes ───────────────────────────────────────────────────────────────
const BR_TZ       = 'America/Sao_Paulo'
const COLOR_MS13  = 0x0000FF
const COLOR_INFO  = 0x3498DB
const COLOR_ERROR = 0xE74C3C
const FOOTER_TEXT = 'MS-13 Roleplay © Todos os direitos reservados'

const REGISTROS_ACOES_FILE      = 'registros.json'
const CANAL_REGISTROS_ACOES_ID  = '1504162046206410793'

const ROLE_NAMES = {
  '1469085061373628437': 'Diretoria',
  '1471295287896178892': 'Gerente Geral',
  '1469085227757605002': 'Resp. Recrutamentos',
  '1469085338046697572': 'Resp. Farm',
  '1469085446108741780': 'Resp. Elite',
  '1469131886533017671': 'Elite',
  '1477356816366047445': 'Corredor',
  '1471297185227346183': 'Linha de Frente',
  '1471297000845742292': 'Conselheiro',
  '1471296434505646110': 'Soldado',
  '1471296807349911604': 'Associado',
  '1471295722937647239': 'Morador',
  '1469085564920795371': 'MS-13',
}

/** Tipos de registro aceitos como filtro */
const TIPOS_REGISTRO = [
  'kill', 'atm', 'loja', 'craco', 'afk',
  'corrida', 'ausencia', 'meta', 'geral', 'todos',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Lê o arquivo registros.json de forma segura */
function lerRegistros() {
  try {
    const filePath = path.join(process.cwd(), REGISTROS_ACOES_FILE)
    if (!fs.existsSync(filePath)) return []
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) ?? []
  } catch (_) {
    return []
  }
}

/** Retorna emoji do tipo de registro */
function emojiTipo(tipo) {
  const mapa = {
    kill:     '💀',
    atm:      '🏧',
    loja:     '🛒',
    craco:    '💊',
    afk:      '💤',
    corrida:  '🏃',
    ausencia: '📅',
    meta:     '📊',
    geral:    '📋',
  }
  return mapa[tipo] ?? '📌'
}

/** Trunca string para evitar overflow no embed */
function truncar(str, max = 1024) {
  return str.length > max ? str.slice(0, max - 3) + '...' : str
}

// ─── Comando: /ver-registros ──────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('ver-registros')
    .setDescription('Visualiza registros de ações da facção.')
    .addStringOption(opt =>
      opt.setName('tipo')
        .setDescription('Filtrar por tipo de registro')
        .setRequired(false)
        .addChoices(
          { name: '📋 Todos',      value: 'todos'    },
          { name: '💀 Kill',       value: 'kill'     },
          { name: '🏧 ATM',        value: 'atm'      },
          { name: '🛒 Loja',       value: 'loja'     },
          { name: '💊 Craco',      value: 'craco'    },
          { name: '💤 AFK',        value: 'afk'      },
          { name: '🏃 Corrida',    value: 'corrida'  },
          { name: '📅 Ausência',   value: 'ausencia' },
          { name: '📊 Meta',       value: 'meta'     },
          { name: '📋 Geral',      value: 'geral'    },
        )
    )
    .addUserOption(opt =>
      opt.setName('membro')
        .setDescription('Filtrar registros de um membro específico')
        .setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('limite')
        .setDescription('Quantos registros exibir (padrão: 10, máximo: 25)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(25)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })

    try {
      const tipo       = interaction.options.getString('tipo')  ?? 'todos'
      const membroUser = interaction.options.getUser('membro')
      const limite     = interaction.options.getInteger('limite') ?? 10

      // Import dentro da função → evita circular (registros é importado por gerencia e metas)
      let registros = lerRegistros()

      // ── Filtro por tipo ──────────────────────────────────────────────────────
      if (tipo !== 'todos') {
        registros = registros.filter(r => r.tipo?.toLowerCase() === tipo)
      }

      // ── Filtro por membro ────────────────────────────────────────────────────
      if (membroUser) {
        registros = registros.filter(r => r.user_id === membroUser.id)
      }

      if (registros.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('📋 Registros de Ações')
          .setDescription('Nenhum registro encontrado com os filtros aplicados.')
          .setColor(COLOR_INFO)
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp()

        return interaction.editReply({ embeds: [embed] })
      }

      // Mais recentes primeiro
      registros.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      const recentes = registros.slice(0, limite)

      // ── Monta embed ──────────────────────────────────────────────────────────
      const { guild } = interaction
      const linhas = []

      for (const reg of recentes) {
        const emoji   = emojiTipo(reg.tipo)
        const data    = reg.timestamp
          ? moment(reg.timestamp).tz(BR_TZ).format('DD/MM HH:mm')
          : '??/??'

        const autorTag = reg.user_id ? `<@${reg.user_id}>` : (reg.autor ?? 'Desconhecido')
        const descricao = reg.descricao ?? reg.acao ?? '—'

        linhas.push(`${emoji} \`${data}\` **${autorTag}** — ${descricao}`)
      }

      const tituloFiltro = tipo !== 'todos' ? ` (${tipo})` : ''
      const tituloMembro = membroUser ? ` · ${membroUser.tag}` : ''

      const embed = new EmbedBuilder()
        .setTitle(`📋 Registros de Ações${tituloFiltro}${tituloMembro}`)
        .setDescription(truncar(linhas.join('\n')))
        .setColor(COLOR_MS13)
        .addFields(
          { name: '🔢 Exibindo',      value: `${recentes.length} de ${registros.length} registro(s)`, inline: true },
          { name: '🗂️ Filtro tipo',  value: tipo,                                                     inline: true },
          { name: '📁 Arquivo',       value: `\`${REGISTROS_ACOES_FILE}\``,                           inline: true },
        )
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp()

      // Botão para ir ao canal de registros (somente se existir)
      const canalRegistros = guild.channels.cache.get(CANAL_REGISTROS_ACOES_ID)
      if (canalRegistros) {
        embed.addFields({
          name:  '📌 Canal de registros',
          value: `${canalRegistros}`,
          inline: false,
        })
      }

      await interaction.editReply({ embeds: [embed] })
    } catch (err) {
      console.error('[/ver-registros]', err)
      if (!interaction.replied && !interaction.deferred)
        return interaction.reply({ content: '❌ Erro ao buscar registros.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}
