// src/utils/logger.js — Logger visual para o MS-13 Bot
// Zero dependências externas — ANSI puro

'use strict'

// ── Cores ANSI ────────────────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',

  // Texto
  white:   '\x1b[97m',
  gray:    '\x1b[90m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',

  // Fundo
  bgGreen: '\x1b[42m',
  bgRed:   '\x1b[41m',
}

// Atalhos
const bold   = s => `${C.bold}${s}${C.reset}`
const dim    = s => `${C.dim}${C.gray}${s}${C.reset}`
const green  = s => `${C.green}${s}${C.reset}`
const red    = s => `${C.red}${s}${C.reset}`
const yellow = s => `${C.yellow}${s}${C.reset}`
const cyan   = s => `${C.cyan}${s}${C.reset}`
const gray   = s => `${C.gray}${s}${C.reset}`
const white  = s => `${C.white}${s}${C.reset}`

// ── Ícones ─────────────────────────────────────────────────────────────────────
const ICON = {
  ok:      `${C.green}✔${C.reset}`,
  err:     `${C.red}✖${C.reset}`,
  warn:    `${C.yellow}⚠${C.reset}`,
  info:    `${C.cyan}◆${C.reset}`,
  bot:     `${C.white}🤖${C.reset}`,
  id:      `${C.blue}🪪${C.reset}`,
  globe:   `${C.cyan}🌐${C.reset}`,
  loop:    `${C.blue}🔄${C.reset}`,
  db:      `${C.magenta}🗄${C.reset}`,
  cmd:     `${C.cyan}⌘${C.reset}`,
  handler: `${C.yellow}⚡${C.reset}`,
  event:   `${C.blue}📡${C.reset}`,
}

// ── Box simples ───────────────────────────────────────────────────────────────
function box(title, lines, color = C.gray) {
  const W = 48
  const pad = s => {
    const clean = s.replace(/\x1b\[[0-9;]*m/g, '')  // strip ANSI para medir
    const visible = clean.length
    const spaces = Math.max(0, W - 2 - visible)
    return ` ${s}${' '.repeat(spaces)} `
  }

  const titleClean = title.replace(/\x1b\[[0-9;]*m/g, '')
  const titlePad   = Math.floor((W - titleClean.length - 2) / 2)
  const titleLine  = `${color}║${C.reset}${' '.repeat(titlePad)}${bold(white(title))}${' '.repeat(W - titleClean.length - 2 - titlePad)}${color}║${C.reset}`

  const top    = `${color}╔${'═'.repeat(W)}╗${C.reset}`
  const divider= `${color}╠${'═'.repeat(W)}╣${C.reset}`
  const bottom = `${color}╚${'═'.repeat(W)}╝${C.reset}`

  const rows = lines.map(l => `${color}║${C.reset}${pad(l)}${color}║${C.reset}`)

  return [top, titleLine, divider, ...rows, bottom].join('\n')
}

// ── Logger público ────────────────────────────────────────────────────────────
const logger = {

  // Linha de início: limpa + título grande
  header () {
    console.log('\n')
    console.log(cyan('  ███╗   ███╗███████╗      ██╗██████╗ '))
    console.log(cyan('  ████╗ ████║██╔════╝     ███║╚════██╗'))
    console.log(cyan('  ██╔████╔██║███████╗     ╚██║ █████╔╝'))
    console.log(cyan('  ██║╚██╔╝██║╚════██║      ██║ ╚═══██╗'))
    console.log(cyan('  ██║ ╚═╝ ██║███████║      ██║██████╔╝'))
    console.log(cyan('  ╚═╝     ╚═╝╚══════╝      ╚═╝╚═════╝ '))
    console.log(gray('  ' + '─'.repeat(38) + '  discord.js v14\n'))
  },

  // Seção de commands carregados
  commands (names) {
    const lines = names.map(n => `  ${ICON.ok}  ${white(n)}`)
    console.log(box('COMMANDS', lines, C.cyan))
    console.log()
  },

  // Seção de systems carregados
  systems (names) {
    const lines = names.map(n => `  ${ICON.ok}  ${white(n)}`)
    console.log(box('SYSTEMS', lines, C.cyan))
    console.log()
  },

  // Seção de eventos
  events (count) {
    const line = `  ${ICON.event}  ${white(count + ' evento(s) registrado(s)')}`
    console.log(box('EVENTS', [line], C.cyan))
    console.log()
  },

  // Banco de dados
  db (ok, err) {
    if (ok) {
      const line = `  ${ICON.ok}  ${white('SQLite inicializado')}`
      console.log(box('DATABASE', [line], C.cyan))
    } else {
      const line = `  ${ICON.err}  ${red('Falha ao inicializar SQLite')}`
      console.log(box('DATABASE', [line, `  ${gray(String(err)?.slice(0, 42))}`], C.red))
    }
    console.log()
  },

  // Bot online — painel final
  online ({ tag, id, guilds, slashOk, slashErr, loopOk, advOk }) {
    const lines = [
      `  ${ICON.bot}  ${white(tag)}`,
      `  ${ICON.id}  ${gray(id)}`,
      `  ${ICON.globe}  ${white(guilds + ' servidor(es)')}`,
      `  ${slashOk ? ICON.ok : ICON.err}  ${slashOk ? white('Slash commands sincronizados') : red('Slash commands: ' + (slashErr ?? 'erro'))}`,
      `  ${loopOk  ? ICON.ok : ICON.warn}  ${loopOk  ? white('Loop de multas iniciado')   : yellow('Loop de multas não iniciado')}`,
      `  ${advOk   ? ICON.ok : ICON.warn}  ${advOk   ? white('Adv de meta reagendada')    : yellow('Adv de meta não reagendada')}`,
    ]
    console.log(box('BOT ONLINE', lines, C.green))
    console.log()
  },

  // Erro genérico (para qualquer parte do código)
  error (label, err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`\n${ICON.err} ${red(bold(label))}\n${gray('   ' + msg)}\n`)
  },

  // Info genérico
  info (label, msg = '') {
    console.log(`${ICON.info} ${cyan(label)} ${msg ? gray(msg) : ''}`)
  },

  // Warn genérico
  warn (label, msg = '') {
    console.log(`${ICON.warn} ${yellow(label)} ${msg ? gray(msg) : ''}`)
  },
}

module.exports = { logger }