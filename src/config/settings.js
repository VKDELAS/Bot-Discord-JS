// src/config/settings.js
// Todas as constantes críticas do MS-13 Bot
// NUNCA alterar custom_ids — mensagens antigas no Discord têm esses IDs gravados

'use strict'

const BR_TZ     = 'America/Sao_Paulo'
const META_VALOR = 70_000

const ROLES = {
  isento: [
    '1469085061373628437',
    '1471295287896178892',
    '1469085227757605002',
    '1469085338046697572',
    '1469085446108741780',
    '1469131886533017671',
  ],
  elite: [
    '1471297185227346183',
    '1471297000845742292',
    '1477356816366047445',
  ],
  membro: [
    '1471296434505646110',
    '1471296807349911604',
    '1471295722937647239',
    '1469085564920795371',
  ],
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

const CHANNEL_IDS = {
  central_tickets:   '1488504060117123084',
  central_registros: '1487024883626938570',
  central_gerencia:  '1487025285340598322',
  logs_recrutamento: '1483674983887667250',
  logs_geral:        '1483674982281383987',
  logs_kill:         '1486079782360977449',
  logs_atm:          '1486079791160492193',
  logs_loja:         '1486079792863383833',
  logs_craco:        '1486079794268602542',
  logs_afk:          '1486079795686015198',
  logs_corrida:      '1486079796982059148',
  logs_ausencia:     '1486079806587015259',
  logs_meta:         '1483674988795138179',
  logs_registros:    '1486086098869555200',
  logs_adv_gerencia: '1487601111354445844',
  pub_adv:           '1487547728358543530',
  pub_ausentes:      '1469093874029826261',
  pub_atm:           '1487612607732125877',
  pub_kill:          '1487612854306603098',
}

const ROLE_IDS = {
  lider:      '1469085061373628437',
  sub_lider:  '1471295287896178892',
  recrutador: '1469085227757605002',
  membro:     '1471295722937647239',
  meta_paga:  '1486403263657152674',
  etapa2:     '1469086279613288741',
}

const ALL_STAFF_IDS = [...ROLES.isento]

const ADV_CARGO_IDS = {
  1: '1503910937625890996',
  2: '1503911714318450698',
  3: '1503911868316647588',
}

const CIDADAO_LOW_ID            = '1469087056235073669'
const LOG_PD_CHANNEL_ID         = '1504183029965520996'
const CANAL_REGISTROS_ACOES_ID  = '1504162046206410793'
const REGISTROS_ACOES_FILE      = 'registros.json'

const PRODUTOS_META_LISTA  = 'Pólvora (~220 un.), Ferro (~190 un.), Kevlar (~70 un.) e Tecido (~60 un.)\n*(meta padrão: 2 rotas completas)*'
const PRODUTOS_META_CURTO  = 'Pólvora | Ferro | Kevlar | Tecido'
const META_ROTAS_PRODUTO   = { isento: 0, gerencia: 0, elite: 2, membro: 2 }

const COLOR_MS13    = 0x0000FF
const COLOR_SUCCESS = 0x2ECC71
const COLOR_ERROR   = 0xE74C3C
const COLOR_WARNING = 0xF39C12
const COLOR_INFO    = 0x3498DB
const COLOR_REC     = 0x9B59B6
const FOOTER_TEXT   = 'MS-13 Roleplay © Todos os direitos reservados'

const REC_DB          = 'ms13_recrutamento.db'
const REC_CONFIG_FILE = 'rec_config.json'
const REC_CHANNEL_IDS = {
  painel_formulario:   '1488347348756332685',
  relatorio_rec:       '1488347471230013510',
  recrutadores:        '1488347411784007690',
  top_tickets:         '1488347411784007690',
  blacklist:           '1488347509599502356',
  logs_relatorios_rec: '1492865227908317324',
  categoria_rec:       '0',
}
const _PERM_TICKET_ROLE_ID = '1478161626187432077'

module.exports = {
  BR_TZ,
  META_VALOR,
  ROLES,
  ROLE_NAMES,
  MS13_ROLE_ID,
  CANAIS_METAS_IDS,
  CHANNEL_IDS,
  ROLE_IDS,
  ALL_STAFF_IDS,
  ADV_CARGO_IDS,
  CIDADAO_LOW_ID,
  LOG_PD_CHANNEL_ID,
  CANAL_REGISTROS_ACOES_ID,
  REGISTROS_ACOES_FILE,
  PRODUTOS_META_LISTA,
  PRODUTOS_META_CURTO,
  META_ROTAS_PRODUTO,
  COLOR_MS13,
  COLOR_SUCCESS,
  COLOR_ERROR,
  COLOR_WARNING,
  COLOR_INFO,
  COLOR_REC,
  FOOTER_TEXT,
  REC_DB,
  REC_CONFIG_FILE,
  REC_CHANNEL_IDS,
  _PERM_TICKET_ROLE_ID,
}
