// ============================================================
//  MS-13 Bot — Etapa 6: Sistema de Metas
//  Arquivo: src/systems/metas.js
// ============================================================

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} = require('discord.js')

const moment = require('moment-timezone')

// ── Constantes críticas (copiadas de settings.js para isolamento) ──────────
const BR_TZ       = 'America/Sao_Paulo'
const META_VALOR  = 70_000

const ROLES = {
  isento: ['1469085061373628437','1471295287896178892','1469085227757605002',
           '1469085338046697572','1469085446108741780','1469131886533017671'],
  elite:  ['1471297185227346183','1471297000845742292','1477356816366047445'],
  membro: ['1471296434505646110','1471296807349911604','1471295722937647239','1469085564920795371'],
}

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

const MS13_ROLE_ID = '1469085564920795371'

const CANAIS_METAS_IDS = {
  painel:    '1487240067121549332',
  entregar:  '1487240068757323848',
  entregues: '1487240069705367642',
  relatorio: '1487240071760449596',
}

const ADV_CARGO_IDS = {
  1: '1503910937625890996',
  2: '1503911714318450698',
  3: '1503911868316647588',
}

const COLOR_MS13    = 0x0000FF
const COLOR_SUCCESS = 0x2ECC71
const COLOR_ERROR   = 0xE74C3C
const COLOR_WARNING = 0xF39C12
const COLOR_INFO    = 0x3498DB
const FOOTER_TEXT   = 'MS-13 Roleplay © Todos os direitos reservados'

const PRODUTOS_META_LISTA  = 'Pólvora (~220 un.), Ferro (~190 un.), Kevlar (~70 un.) e Tecido (~60 un.)\n*(meta padrão: 2 rotas completas)*'
const PRODUTOS_META_CURTO  = 'Pólvora | Ferro | Kevlar | Tecido'
const META_ROTAS_PRODUTO   = { isento: 0, gerencia: 0, elite: 2, membro: 2 }

// ── IDs de interação exportados ────────────────────────────────────────────
const customIds = [
  'painel_solicitar',
  'painel_lembrete',
  'painel_prazo',
  'painel_isentar',
  'painel_cancelar',
  'painel_relatorio',
  'painel_resetar',
  'painel_isentos',
  'painel_toggle_modo',
  'entregar_meta_btn',
  'modal_solicitar_meta',
  'modal_lembrete',
  'modal_alterar_prazo',
  'modal_entregar_comprovante',
]

// ── Estado em memória ──────────────────────────────────────────────────────
// metaAtiva: { prazo: Date, mensagemEntregarId: string, modo: 'normal'|'isentos', isentos: Set<userId>, aprovados: Set<userId> }
let metaAtiva = null
let advTimeout = null

// ── Helpers de categoria ───────────────────────────────────────────────────
function getCategoriaUsuario(member) {
  const ids = member.roles.cache.map(r => r.id)
  if (ids.some(id => ROLES.isento.includes(id))) return 'isento'
  if (ids.some(id => ROLES.elite.includes(id)))  return 'elite'
  if (ids.some(id => ROLES.membro.includes(id))) return 'membro'
  return null
}

function isStaff(member) {
  return member.roles.cache.some(r => ROLES.isento.includes(r.id))
}

function temCargoReconhecido(member) {
  return getCategoriaUsuario(member) !== null
}

// ── Embed do painel ────────────────────────────────────────────────────────
function buildEmbedPainel(modoLabel = 'Normal') {
  const embed = new EmbedBuilder()
    .setColor(COLOR_MS13)
    .setTitle('🎯  Painel de Metas — MS-13')
    .setDescription('Gerencie as metas semanais da facção.')
    .addFields(
      { name: 'Produtos da meta', value: PRODUTOS_META_LISTA, inline: false },
      { name: 'Valor da meta',    value: `$${META_VALOR.toLocaleString('pt-BR')}`, inline: true },
      { name: 'Modo atual',       value: modoLabel, inline: true },
      {
        name: 'Status',
        value: metaAtiva
          ? `✅ Meta ativa — prazo: **${moment(metaAtiva.prazo).tz(BR_TZ).format('DD/MM/YYYY HH:mm')}**`
          : '❌ Nenhuma meta ativa',
        inline: false,
      },
    )
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp()
  return embed
}

// ── Embed do canal #entregar (visível para membros) ─────────────────────────
function buildEmbedMetas(prazo, modo = 'normal') {
  const prazoFmt = prazo
    ? moment(prazo).tz(BR_TZ).format('DD/MM/YYYY [às] HH:mm')
    : 'Indefinido'

  const modoDesc = modo === 'isentos'
    ? '🔓 **Modo isentos** — isentos também devem entregar nesta rodada.'
    : '🔒 Modo normal — isentos não precisam entregar.'

  return new EmbedBuilder()
    .setColor(COLOR_MS13)
    .setTitle('📦  Meta Semanal Ativa')
    .setDescription(
      `Entregue os produtos abaixo para cumprir sua meta.\n\n**${PRODUTOS_META_CURTO}**\n\n${PRODUTOS_META_LISTA}`,
    )
    .addFields(
      { name: '⏰ Prazo',   value: prazoFmt, inline: true },
      { name: '⚙️ Modo',   value: modoDesc, inline: false },
      { name: '💰 Valor',  value: `$${META_VALOR.toLocaleString('pt-BR')}`, inline: true },
    )
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp()
}

// ── Componentes do PainelView ──────────────────────────────────────────────
function buildPainelComponents(modoLabel = 'Normal') {
  const row0 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('painel_solicitar').setLabel('📢 Solicitar Meta').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('painel_lembrete').setLabel('🔔 Lembrete').setStyle(ButtonStyle.Secondary),
  )
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('painel_prazo').setLabel('📅 Alterar Prazo').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('painel_isentar').setLabel('🛡️ Isentar Membro').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('painel_cancelar').setLabel('❌ Cancelar Meta').setStyle(ButtonStyle.Danger),
  )
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('painel_relatorio').setLabel('📊 Relatório').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('painel_resetar').setLabel('🔄 Resetar').setStyle(ButtonStyle.Danger),
  )
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('painel_isentos').setLabel('👥 Ver Isentos').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('painel_toggle_modo')
      .setLabel(modoLabel === 'Normal' ? '🔓 Ativar Modo Isentos' : '🔒 Modo Normal')
      .setStyle(ButtonStyle.Secondary),
  )
  return [row0, row1, row2, row3]
}

// ── Componente do canal #entregar ──────────────────────────────────────────
function buildEntregarComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('entregar_meta_btn')
        .setLabel('✅ Entregar Meta')
        .setStyle(ButtonStyle.Success),
    ),
  ]
}

// ── Componente Aprovar/Recusar ─────────────────────────────────────────────
function buildAprovarRecusarComponents(memberId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ap_${memberId}`)
        .setLabel('✅ Aprovar')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`re_${memberId}`)
        .setLabel('❌ Recusar')
        .setStyle(ButtonStyle.Danger),
    ),
  ]
}

// ── Aplicar advertência a um membro ────────────────────────────────────────
async function aplicarAdvertenciaMembro(guild, memberId) {
  // Import interno para evitar circular (metas→registros)
  const { registrarAdvertencia } = require('./registros.js')

  try {
    const member = await guild.members.fetch(memberId).catch(() => null)
    if (!member) return

    await registrarAdvertencia(guild, member, 'Sistema', 'Meta semanal não entregue no prazo.')
  } catch (err) {
    console.error(`[METAS] Erro ao aplicar adv para ${memberId}:`, err)
  }
}

// ── aguardarEAplicarAdv — exportada para o ready.js reagendar ───────────────
async function aguardarEAplicarAdv(guild, prazoDt) {
  if (advTimeout) clearTimeout(advTimeout)

  const agora = Date.now()
  const prazoMs = new Date(prazoDt).getTime()
  const delay = Math.max(prazoMs - agora, 0)

  advTimeout = setTimeout(async () => {
    if (!metaAtiva) return

    console.log('[METAS] Prazo encerrado — verificando membros...')

    let membros
    try {
      membros = await guild.members.fetch()
    } catch (err) {
      console.error('[METAS] Falha ao buscar membros:', err)
      return
    }

    for (const [id, member] of membros) {
      const categoria = getCategoriaUsuario(member)
      if (!categoria) continue                           // sem cargo reconhecido
      if (categoria === 'isento' && metaAtiva.modo !== 'isentos') continue  // isento em modo normal
      if (metaAtiva.isentos && metaAtiva.isentos.has(id)) continue          // manualmente isento
      if (metaAtiva.aprovados && metaAtiva.aprovados.has(id)) continue      // já entregou

      await aplicarAdvertenciaMembro(guild, id)
    }

    metaAtiva = null
    console.log('[METAS] Advertências aplicadas — meta encerrada.')
  }, delay)
}

// ── Handler principal ──────────────────────────────────────────────────────
async function execute(interaction) {
  const { customId, guild, member, channel } = interaction

  // ─── PainelView — verificar permissão ────────────────────────────────
  const painelIds = [
    'painel_solicitar','painel_lembrete','painel_prazo','painel_isentar',
    'painel_cancelar','painel_relatorio','painel_resetar','painel_isentos',
    'painel_toggle_modo',
  ]
  if (painelIds.includes(customId)) {
    if (!isStaff(member)) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    }
  }

  // ─── Botões do PainelView ─────────────────────────────────────────────

  // painel_solicitar → abre modal
  if (customId === 'painel_solicitar') {
    const modal = new ModalBuilder()
      .setCustomId('modal_solicitar_meta')
      .setTitle('Solicitar Nova Meta')
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('prazo_input')
          .setLabel('Prazo (DD/MM/YYYY HH:mm)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: 20/06/2025 23:59'),
      ),
    )
    return interaction.showModal(modal)
  }

  // painel_lembrete → abre modal
  if (customId === 'painel_lembrete') {
    if (!metaAtiva) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Nenhuma meta ativa.', ephemeral: true })
    }
    const modal = new ModalBuilder()
      .setCustomId('modal_lembrete')
      .setTitle('Enviar Lembrete')
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('lembrete_texto')
          .setLabel('Mensagem do lembrete (opcional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setPlaceholder('Deixe em branco para usar mensagem padrão.'),
      ),
    )
    return interaction.showModal(modal)
  }

  // painel_prazo → abre modal
  if (customId === 'painel_prazo') {
    if (!metaAtiva) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Nenhuma meta ativa.', ephemeral: true })
    }
    const modal = new ModalBuilder()
      .setCustomId('modal_alterar_prazo')
      .setTitle('Alterar Prazo')
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('novo_prazo')
          .setLabel('Novo prazo (DD/MM/YYYY HH:mm)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: 22/06/2025 23:59'),
      ),
    )
    return interaction.showModal(modal)
  }

  // painel_isentar
  if (customId === 'painel_isentar') {
    if (!metaAtiva) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Nenhuma meta ativa.', ephemeral: true })
    }
    const modal = new ModalBuilder()
      .setCustomId('modal_isentar_membro')
      .setTitle('Isentar Membro')
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('membro_id')
          .setLabel('ID ou @menção do membro')
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
    )
    return interaction.showModal(modal)
  }

  // painel_cancelar
  if (customId === 'painel_cancelar') {
    if (!metaAtiva) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Nenhuma meta ativa para cancelar.', ephemeral: true })
    }

    // Deletar mensagem do canal #entregar
    try {
      const canalEntregar = await guild.channels.fetch(CANAIS_METAS_IDS.entregar).catch(() => null)
      if (canalEntregar && metaAtiva.mensagemEntregarId) {
        const msg = await canalEntregar.messages.fetch(metaAtiva.mensagemEntregarId).catch(() => null)
        if (msg) await msg.delete().catch(() => {})
      }
    } catch (err) {
      console.error('[METAS] Erro ao deletar mensagem do canal entregar:', err)
    }

    if (advTimeout) { clearTimeout(advTimeout); advTimeout = null }
    metaAtiva = null

    if (interaction.replied || interaction.deferred) return
    return interaction.reply({ content: '✅ Meta cancelada com sucesso.', ephemeral: true })
  }

  // painel_relatorio
  if (customId === 'painel_relatorio') {
    if (!metaAtiva) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Nenhuma meta ativa.', ephemeral: true })
    }
    const aprovList = metaAtiva.aprovados && metaAtiva.aprovados.size > 0
      ? [...metaAtiva.aprovados].map(id => `<@${id}>`).join(', ')
      : 'Nenhum ainda.'
    const embed = new EmbedBuilder()
      .setColor(COLOR_INFO)
      .setTitle('📊 Relatório da Meta Atual')
      .addFields(
        { name: 'Prazo',     value: moment(metaAtiva.prazo).tz(BR_TZ).format('DD/MM/YYYY HH:mm'), inline: true },
        { name: 'Modo',      value: metaAtiva.modo === 'isentos' ? 'Isentos' : 'Normal',          inline: true },
        { name: 'Aprovados', value: aprovList, inline: false },
      )
      .setFooter({ text: FOOTER_TEXT })
      .setTimestamp()

    if (interaction.replied || interaction.deferred) return
    return interaction.reply({ embeds: [embed], ephemeral: true })
  }

  // painel_resetar
  if (customId === 'painel_resetar') {
    if (advTimeout) { clearTimeout(advTimeout); advTimeout = null }
    metaAtiva = null
    if (interaction.replied || interaction.deferred) return
    return interaction.reply({ content: '🔄 Estado de metas resetado.', ephemeral: true })
  }

  // painel_isentos
  if (customId === 'painel_isentos') {
    const lista = metaAtiva && metaAtiva.isentos && metaAtiva.isentos.size > 0
      ? [...metaAtiva.isentos].map(id => `<@${id}>`).join(', ')
      : 'Nenhum membro isento manualmente.'
    if (interaction.replied || interaction.deferred) return
    return interaction.reply({ content: `**Isentos manuais:**\n${lista}`, ephemeral: true })
  }

  // painel_toggle_modo
  if (customId === 'painel_toggle_modo') {
    if (!metaAtiva) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Nenhuma meta ativa.', ephemeral: true })
    }

    metaAtiva.modo = metaAtiva.modo === 'isentos' ? 'normal' : 'isentos'
    const novoModoLabel = metaAtiva.modo === 'isentos' ? 'Isentos' : 'Normal'

    // Atualizar embed do painel
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.update({
          embeds: [buildEmbedPainel(novoModoLabel)],
          components: buildPainelComponents(novoModoLabel),
        })
      }
    } catch (err) {
      console.error('[METAS] Erro ao atualizar painel (toggle):', err)
    }

    // Atualizar embed do canal #entregar (se meta ativa)
    try {
      const canalEntregar = await guild.channels.fetch(CANAIS_METAS_IDS.entregar).catch(() => null)
      if (canalEntregar && metaAtiva.mensagemEntregarId) {
        const msg = await canalEntregar.messages.fetch(metaAtiva.mensagemEntregarId).catch(() => null)
        if (msg) {
          await msg.edit({
            embeds: [buildEmbedMetas(metaAtiva.prazo, metaAtiva.modo)],
            components: buildEntregarComponents(),
          })
        }
      }
    } catch (err) {
      console.error('[METAS] Erro ao atualizar canal entregar (toggle):', err)
    }
    return
  }

  // ─── Botão do canal #entregar ─────────────────────────────────────────

  if (customId === 'entregar_meta_btn') {
    if (!temCargoReconhecido(member)) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Você não possui cargo reconhecido.', ephemeral: true })
    }
    if (!metaAtiva) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Não há meta ativa no momento.', ephemeral: true })
    }
    if (metaAtiva.aprovados && metaAtiva.aprovados.has(member.id)) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '✅ Você já entregou sua meta!', ephemeral: true })
    }

    const modal = new ModalBuilder()
      .setCustomId('modal_entregar_comprovante')
      .setTitle('Entregar Meta')
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('comprovante_link')
          .setLabel('Link do comprovante (print/video)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('obs_entrega')
          .setLabel('Observações (opcional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false),
      ),
    )
    return interaction.showModal(modal)
  }

  // ─── Aprovar/Recusar (customId dinâmico) ──────────────────────────────

  if (customId.startsWith('ap_')) {
    if (!isStaff(member)) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    }
    const targetId = customId.slice(3)
    if (!metaAtiva) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Nenhuma meta ativa.', ephemeral: true })
    }
    if (!metaAtiva.aprovados) metaAtiva.aprovados = new Set()
    metaAtiva.aprovados.add(targetId)

    // Logar no canal de entregues
    try {
      const canalEntregues = await guild.channels.fetch(CANAIS_METAS_IDS.entregues).catch(() => null)
      if (canalEntregues) {
        await canalEntregues.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLOR_SUCCESS)
              .setTitle('✅ Meta Aprovada')
              .setDescription(`<@${targetId}> teve a meta aprovada por <@${member.id}>.`)
              .setFooter({ text: FOOTER_TEXT })
              .setTimestamp(),
          ],
        })
      }
    } catch (err) {
      console.error('[METAS] Erro ao logar aprovação:', err)
    }

    if (interaction.replied || interaction.deferred) return
    return interaction.update({
      content: `✅ Meta de <@${targetId}> aprovada.`,
      components: [],
    })
  }

  if (customId.startsWith('re_')) {
    if (!isStaff(member)) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    }
    const targetId = customId.slice(3)

    if (interaction.replied || interaction.deferred) return
    return interaction.update({
      content: `❌ Meta de <@${targetId}> recusada.`,
      components: [],
    })
  }

  // ─── Modais ───────────────────────────────────────────────────────────

  if (customId === 'modal_solicitar_meta') {
    const prazoRaw = interaction.fields.getTextInputValue('prazo_input')
    const prazoDt  = moment.tz(prazoRaw, 'DD/MM/YYYY HH:mm', BR_TZ).toDate()

    if (isNaN(prazoDt.getTime())) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Data inválida. Use o formato DD/MM/YYYY HH:mm.', ephemeral: true })
    }

    metaAtiva = {
      prazo:              prazoDt,
      mensagemEntregarId: null,
      modo:               'normal',
      isentos:            new Set(),
      aprovados:          new Set(),
    }

    // Publicar no canal #entregar
    try {
      const canalEntregar = await guild.channels.fetch(CANAIS_METAS_IDS.entregar).catch(() => null)
      if (canalEntregar) {
        const msg = await canalEntregar.send({
          embeds:     [buildEmbedMetas(prazoDt, 'normal')],
          components: buildEntregarComponents(),
        })
        metaAtiva.mensagemEntregarId = msg.id
      }
    } catch (err) {
      console.error('[METAS] Erro ao publicar no canal entregar:', err)
    }

    // Agendar advertências
    await aguardarEAplicarAdv(guild, prazoDt)

    if (interaction.replied || interaction.deferred) return
    return interaction.reply({
      content: `✅ Meta criada com prazo para **${moment(prazoDt).tz(BR_TZ).format('DD/MM/YYYY [às] HH:mm')}**.`,
      ephemeral: true,
    })
  }

  if (customId === 'modal_lembrete') {
    const textoCustom = interaction.fields.getTextInputValue('lembrete_texto')
    const texto = textoCustom.trim() ||
      `⏰ **Lembrete:** A meta encerra em **${moment(metaAtiva.prazo).tz(BR_TZ).format('DD/MM/YYYY [às] HH:mm')}**. Não esqueça de entregar!`

    try {
      const canalEntregar = await guild.channels.fetch(CANAIS_METAS_IDS.entregar).catch(() => null)
      if (canalEntregar) await canalEntregar.send({ content: texto })
    } catch (err) {
      console.error('[METAS] Erro ao enviar lembrete:', err)
    }

    if (interaction.replied || interaction.deferred) return
    return interaction.reply({ content: '✅ Lembrete enviado.', ephemeral: true })
  }

  if (customId === 'modal_alterar_prazo') {
    const novoPrazoRaw = interaction.fields.getTextInputValue('novo_prazo')
    const novoPrazoDt  = moment.tz(novoPrazoRaw, 'DD/MM/YYYY HH:mm', BR_TZ).toDate()

    if (isNaN(novoPrazoDt.getTime())) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Data inválida. Use DD/MM/YYYY HH:mm.', ephemeral: true })
    }

    metaAtiva.prazo = novoPrazoDt
    await aguardarEAplicarAdv(guild, novoPrazoDt)

    // Atualizar embed do canal #entregar
    try {
      const canalEntregar = await guild.channels.fetch(CANAIS_METAS_IDS.entregar).catch(() => null)
      if (canalEntregar && metaAtiva.mensagemEntregarId) {
        const msg = await canalEntregar.messages.fetch(metaAtiva.mensagemEntregarId).catch(() => null)
        if (msg) {
          await msg.edit({
            embeds:     [buildEmbedMetas(novoPrazoDt, metaAtiva.modo)],
            components: buildEntregarComponents(),
          })
        }
      }
    } catch (err) {
      console.error('[METAS] Erro ao atualizar embed após alterar prazo:', err)
    }

    if (interaction.replied || interaction.deferred) return
    return interaction.reply({
      content: `✅ Prazo alterado para **${moment(novoPrazoDt).tz(BR_TZ).format('DD/MM/YYYY [às] HH:mm')}**.`,
      ephemeral: true,
    })
  }

  if (customId === 'modal_entregar_comprovante') {
    const link = interaction.fields.getTextInputValue('comprovante_link')
    const obs  = interaction.fields.getTextInputValue('obs_entrega') || 'Sem observações.'

    // Enviar para canal #relatorio com botões aprovar/recusar
    try {
      const canalRelatorio = await guild.channels.fetch(CANAIS_METAS_IDS.relatorio).catch(() => null)
      if (canalRelatorio) {
        await canalRelatorio.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLOR_WARNING)
              .setTitle('📬 Nova entrega de meta')
              .setDescription(`<@${member.id}> enviou comprovante para aprovação.`)
              .addFields(
                { name: 'Comprovante', value: link,  inline: false },
                { name: 'Obs',        value: obs,   inline: false },
              )
              .setFooter({ text: FOOTER_TEXT })
              .setTimestamp(),
          ],
          components: buildAprovarRecusarComponents(member.id),
        })
      }
    } catch (err) {
      console.error('[METAS] Erro ao enviar comprovante:', err)
    }

    if (interaction.replied || interaction.deferred) return
    return interaction.reply({
      content: '✅ Comprovante enviado! Aguarde aprovação da gerência.',
      ephemeral: true,
    })
  }
}

// ── Exports ────────────────────────────────────────────────────────────────
module.exports = {
  customIds,
  execute,
  aguardarEAplicarAdv,
  buildEmbedMetas,
}
