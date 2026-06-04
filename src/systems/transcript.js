// src/systems/transcript.js — MS-13
// USO: await gerarEEnviarTranscript(channel, fechadoPor)

'use strict'

const { AttachmentBuilder } = require('discord.js')
const path  = require('path')
const fs    = require('fs')

const TRANSCRIPT_DIR = path.join(process.cwd(), 'transcripts')

// ── utils ──────────────────────────────────────────────────────────────────────

function _escape(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function _getOwnerId(channel) {
  const m = /owner:(\d+)/.exec(channel.topic || '')
  return m ? m[1] : null
}

function _tipoTicket(name) {
  const map = {
    recrutamento: 'Recrutamento',
    suporte:      'Suporte Geral',
    elite:        'Ticket Elite',
    parceria:     'Parceria',
  }
  for (const [k, v] of Object.entries(map)) {
    if (name.startsWith(k)) return v
  }
  return 'Atendimento'
}

function _avatarUrl(user) {
  try {
    const av = user.displayAvatarURL({ size: 64, extension: 'png' })
    return av || ''
  } catch {
    return ''
  }
}

function _roleColor(member) {
  try {
    if (member?.roles) {
      const color = member.displayColor
      if (color && color !== 0) return `#${color.toString(16).padStart(6, '0')}`
    }
  } catch {}
  return '#ffffff'
}

function _fmtTs(date) {
  const now   = new Date()
  const today = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
  const dDate = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
  const hhmm  = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  if (today === dDate) return `Hoje às ${hhmm}`
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' ' + hhmm
}

function _fmtMd(t) {
  t = _escape(t)
  t = t.replace(/\*\*(.+?)\*\*/g,    '<strong>$1</strong>')
  t = t.replace(/\*(.+?)\*/g,         '<em>$1</em>')
  t = t.replace(/__(.+?)__/g,          '<u>$1</u>')
  t = t.replace(/~~(.+?)~~/g,          '<del>$1</del>')
  t = t.replace(/`([^`]+)`/g,          '<code>$1</code>')
  t = t.replace(/&lt;@!?(\d+)&gt;/g,  "<span class='m'>@usuário</span>")
  t = t.replace(/&lt;#(\d+)&gt;/g,    "<span class='m'>#canal</span>")
  t = t.replace(/&lt;@&amp;(\d+)&gt;/g, "<span class='m'>@cargo</span>")
  t = t.replace(/^-#\s*(.+)$/m,       "<span class='subtext'>$1</span>")
  return t
}

// ── build mensagens ────────────────────────────────────────────────────────────

function _buildMsgs(msgs) {
  const out  = []
  let prevId = null

  const PIN_TYPES = new Set(['CHANNEL_PINNED_MESSAGE', 'GUILD_MEMBER_JOIN', 'USER_PREMIUM_GUILD_SUBSCRIPTION'])

  for (const msg of msgs) {

    // mensagem de sistema
    if (PIN_TYPES.has(msg.type)) {
      if (prevId !== null) { out.push('</div></div>'); prevId = null }
      const sysMap = {
        CHANNEL_PINNED_MESSAGE:          `${msg.author.displayName} fixou uma mensagem.`,
        GUILD_MEMBER_JOIN:               `${msg.author.displayName} entrou no servidor.`,
        USER_PREMIUM_GUILD_SUBSCRIPTION: `${msg.author.displayName} impulsionou o servidor.`,
      }
      const sysTxt = sysMap[msg.type] || ''
      out.push(
        `<div class="sys"><div class="sline"></div>` +
        `<span class="stxt">${_escape(sysTxt)}</span>` +
        `<div class="sline"></div></div>`
      )
      continue
    }

    // novo grupo (autor diferente)
    if (msg.author.id !== prevId) {
      if (prevId !== null) out.push('</div></div>')
      const av  = _avatarUrl(msg.author)
      const cor = _roleColor(msg.member ?? msg.author)
      const ts  = _fmtTs(msg.createdAt)
      const bot = msg.author.bot ? `<span class="bot-tag">APP</span>` : ''
      const avTag = av
        ? `<img class="av" src="${_escape(av)}" alt="" onerror="this.style.display='none'">`
        : `<div class="av av-fb"></div>`
      out.push(
        `<div class="mg" id="m-${msg.id}">` +
        `<div class="av-wrap">${avTag}</div>` +
        `<div class="mc">` +
        `<span class="author" style="color:${cor}">${_escape(msg.author.displayName)}</span>` +
        `${bot}` +
        `<span class="ts">${_escape(ts)}</span>`
      )
      prevId = msg.author.id
    }

    // reply
    if (msg.reference?.messageId) {
      const ref = msg.mentions?.repliedUser
      if (ref) {
        const rAv   = _avatarUrl(ref)
        const rCor  = '#ffffff'
        const rNome = ref.displayName || ref.username
        const rTxt  = ''   // não temos o conteúdo resolvido facilmente via fetch; omitido
        const rAvTag = rAv
          ? `<img class="r-av" src="${_escape(rAv)}" onerror="this.style.display='none'">`
          : ''
        out.push(
          `<div class="reply">` +
          `${rAvTag}` +
          `<span class="r-name" style="color:${rCor}">${_escape(rNome)}</span>` +
          `<span class="r-txt">${_fmtMd(rTxt)}</span>` +
          `</div>`
        )
      }
    }

    // conteúdo
    if (msg.content) {
      out.push('<div class="content">')
      for (const linha of msg.content.split('\n')) {
        const fmt = linha.trim() ? _fmtMd(linha) : '<br>'
        out.push(`<div class="line">${fmt}</div>`)
      }
      out.push('</div>')
    }

    // embeds
    for (const emb of msg.embeds) {
      const corE   = emb.color ? `#${emb.color.toString(16).padStart(6, '0')}` : '#1a3a6b'
      const titulo = _escape(emb.title || '')
      let desc = ''
      if (emb.description) {
        desc = emb.description.split('\n').map(l =>
          `<div class="e-line">${l.trim() ? _fmtMd(l) : '&nbsp;'}</div>`
        ).join('')
      }
      const fields = (emb.fields || []).map(f =>
        `<div class="e-field">` +
        `<div class="e-fname">${_escape(f.name)}</div>` +
        `<div class="e-fval">${_fmtMd(f.value)}</div>` +
        `</div>`
      ).join('')
      const footerHtml = emb.footer?.text
        ? `<div class="e-footer">${_escape(emb.footer.text)}</div>`
        : ''
      out.push(
        `<div class="embed" style="border-left-color:${corE}">` +
        (titulo ? `<div class="e-title">${titulo}</div>` : '') +
        (desc    ? `<div class="e-desc">${desc}</div>`   : '') +
        fields + footerHtml +
        `</div>`
      )
    }

    // attachments
    for (const att of msg.attachments.values()) {
      const ext = att.name?.includes('.') ? att.name.split('.').pop() : 'file'
      if (['png','jpg','jpeg','gif','webp'].includes(ext.toLowerCase())) {
        out.push(
          `<div class="att-img"><img src="${_escape(att.url)}" ` +
          `alt="${_escape(att.name)}" loading="lazy"></div>`
        )
      } else {
        out.push(
          `<div class="att-file">` +
          `<span class="att-ico">📎</span>` +
          `<span class="att-name">${_escape(att.name)}</span>` +
          `<span class="att-ext">${ext.toUpperCase()}</span>` +
          `</div>`
        )
      }
    }
  }

  if (prevId !== null) out.push('</div></div>')
  return out.join('\n')
}

// ── HTML ───────────────────────────────────────────────────────────────────────

function _gerarHtml(channel, msgs, dono, fechadoPor) {
  const servidor  = channel.guild.name
  const srvIcon   = channel.guild.iconURL({ size: 128 }) || ''
  const canal     = channel.name
  const total     = msgs.length
  const tipo      = _tipoTicket(canal)
  const donoNome  = dono?.displayName ?? 'Desconhecido'
  const fechaNome = fechadoPor.displayName || fechadoPor.username

  const abrioEm = msgs.length
    ? msgs[0].createdAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : '—'
  const fechaEm = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  const msgsHtml = msgs.length
    ? _buildMsgs(msgs)
    : '<div style="text-align:center;padding:60px;color:#3a5080;font-size:14px">Nenhuma mensagem registrada.</div>'

  const srvIconHtml = srvIcon
    ? `<img class="srv-icon" src="${_escape(srvIcon)}" alt="">`
    : `<div class="srv-icon srv-fb">MS</div>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>#${_escape(canal)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#313338;font-family:'Noto Sans','Helvetica Neue',sans-serif;color:#dce2f0;min-height:100vh;font-size:16px}
.wrap{display:flex;min-height:100vh}
.sidebar{display:none}
.main{flex:1;min-width:0;display:flex;flex-direction:column;background:#313338}
.topbar{height:48px;padding:0 16px;display:flex;align-items:center;gap:8px;background:#313338;border-bottom:1px solid rgba(0,0,0,0.2);position:sticky;top:0;z-index:5;flex-shrink:0;box-shadow:0 1px 3px rgba(0,0,0,0.3)}
.topbar-hash{font-size:22px;color:#b5bac1;line-height:1}
.topbar-name{font-size:16px;font-weight:700;color:#f2f3f5}
.topbar-sep{width:1px;height:18px;background:rgba(255,255,255,0.12);margin:0 6px}
.topbar-topic{font-size:14px;color:#b5bac1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.start{padding:64px 16px 20px}
.start-circle{width:68px;height:68px;border-radius:50%;background:#1a2744;border:2px solid #1e4d8c;display:flex;align-items:center;justify-content:center;font-size:40px;color:#7ab8f5;margin-bottom:16px}
.start-title{font-size:28px;font-weight:700;color:#f2f3f5;margin-bottom:6px}
.start-sub{font-size:15px;color:#b5bac1}
.info-bar{margin:4px 16px 20px;padding:12px 16px;background:#2b2d31;border:1px solid rgba(30,77,140,0.3);border-left:3px solid #1e4d8c;border-radius:0 4px 4px 0;display:flex;gap:28px;flex-wrap:wrap}
.info-item{display:flex;flex-direction:column;gap:2px}
.info-lbl{font-size:11px;font-weight:700;color:#949ba4;text-transform:uppercase;letter-spacing:.06em}
.info-val{font-size:13px;color:#c9d1e0}
.info-val.hl{color:#7ab8f5}
.date-div{display:flex;align-items:center;gap:8px;padding:12px 16px 4px}
.dline{flex:1;height:1px;background:rgba(255,255,255,0.08)}
.dtxt{font-size:12px;font-weight:600;color:#949ba4;white-space:nowrap}
.messages{padding-bottom:40px;background:#313338}
.mg{display:flex;padding:2px 16px;transition:background .05s}
.mg:hover{background:rgba(0,0,0,0.06)}
.av-wrap{width:40px;min-width:40px;margin-right:16px;padding-top:2px}
.av{width:40px;height:40px;border-radius:50%;object-fit:cover;display:block}
.av-fb{width:40px;height:40px;border-radius:50%;background:#2b2d31}
.mc{flex:1;min-width:0;display:flex;flex-direction:column;padding-bottom:2px}
.author{font-size:15px;font-weight:500;cursor:default}
.bot-tag{display:inline-block;background:#5865f2;color:#fff;font-size:10px;font-weight:700;padding:1px 4px;border-radius:3px;margin-left:5px;letter-spacing:.02em;vertical-align:middle;line-height:16px}
.ts{font-size:12px;color:#949ba4;margin-left:8px;font-weight:400}
.reply{display:flex;align-items:center;gap:5px;margin-bottom:2px;font-size:13px;max-width:100%}
.reply::before{content:'';display:block;width:24px;height:10px;min-width:24px;border-top:2px solid #4e5058;border-left:2px solid #4e5058;border-radius:4px 0 0 0;margin-right:4px}
.r-av{width:16px;height:16px;border-radius:50%;object-fit:cover;flex-shrink:0}
.r-name{font-size:13px;font-weight:500;flex-shrink:0}
.r-txt{font-size:13px;color:#949ba4;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.content{}
.line{font-size:15px;color:#dbdee1;line-height:1.375;word-break:break-word}
.line strong{font-weight:700}
.line em{font-style:italic}
.line u{text-decoration:underline}
.line del{text-decoration:line-through}
.line code{font-family:Consolas,'Courier New',monospace;font-size:85%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.07);padding:0 4px;border-radius:3px;color:#c9d1e0}
.m{color:#dee3f4;background:rgba(88,101,242,0.15);border-radius:3px;padding:0 2px;font-weight:500}
.subtext{font-size:11px;color:#949ba4}
.embed{border-left:4px solid #1a3a6b;background:#2b2d31;border-radius:0 4px 4px 0;padding:12px 16px;max-width:520px;margin-top:4px}
.e-title{font-size:15px;font-weight:600;color:#f2f3f5;margin-bottom:6px}
.e-desc{font-size:14px;color:#c9d1e0;margin-bottom:4px}
.e-line{line-height:1.5}
.e-field{margin-top:8px}
.e-fname{font-size:13px;font-weight:600;color:#c9d1e0;margin-bottom:2px}
.e-fval{font-size:14px;color:#b5bac1}
.e-footer{font-size:12px;color:#949ba4;margin-top:8px;border-top:1px solid rgba(255,255,255,0.05);padding-top:6px}
.att-img{margin-top:6px;max-width:400px}
.att-img img{max-width:100%;border-radius:4px;display:block}
.att-file{display:inline-flex;align-items:center;gap:10px;background:#2b2d31;border:1px solid rgba(255,255,255,0.07);border-radius:4px;padding:10px 14px;margin-top:6px;font-size:13px}
.att-ico{font-size:20px}
.att-name{color:#00aff4;text-decoration:underline}
.att-ext{font-size:10px;font-weight:600;background:#4e5058;color:#dbdee1;padding:1px 5px;border-radius:2px;letter-spacing:.04em}
.sys{display:flex;align-items:center;gap:8px;padding:4px 16px;margin:4px 0}
.sline{flex:1;height:1px;background:rgba(255,255,255,0.07)}
.stxt{font-size:13px;color:#949ba4;white-space:nowrap}
.end-bar{display:flex;align-items:center;gap:8px;padding:8px 16px;margin-top:8px}
.eline{flex:1;height:1px;background:rgba(30,77,140,0.4)}
.etxt{font-size:12px;font-weight:600;color:#4a7ab5;white-space:nowrap;letter-spacing:.04em;text-transform:uppercase}
@media(max-width:680px){.sidebar{display:none}.info-bar{gap:14px}}
</style>
</head>
<body>
<div class="wrap">
<div class="sidebar">
  <div class="srv-header">
    ${srvIconHtml}
    <span class="srv-name">${_escape(servidor)}</span>
  </div>
  <div class="ch-section">
    <div class="ch-label">Tickets</div>
    <div class="ch-item active">
      <span class="ch-hash">#</span>
      <span class="ch-name">${_escape(canal)}</span>
    </div>
  </div>
</div>
<div class="main">
  <div class="topbar">
    <span class="topbar-hash">#</span>
    <span class="topbar-name">${_escape(canal)}</span>
    <div class="topbar-sep"></div>
    <span class="topbar-topic">${_escape(tipo)} · Fechado por ${_escape(fechaNome)}</span>
  </div>
  <div class="start">
    <div class="start-circle">#</div>
    <div class="start-title">#${_escape(canal)}</div>
    <div class="start-sub">Início do atendimento <strong>${_escape(tipo)}</strong>.</div>
  </div>
  <div class="info-bar">
    <div class="info-item">
      <span class="info-lbl">Aberto por</span>
      <span class="info-val hl">${_escape(donoNome)}</span>
    </div>
    <div class="info-item">
      <span class="info-lbl">Fechado por</span>
      <span class="info-val">${_escape(fechaNome)}</span>
    </div>
    <div class="info-item">
      <span class="info-lbl">Aberto em</span>
      <span class="info-val">${_escape(abrioEm)}</span>
    </div>
    <div class="info-item">
      <span class="info-lbl">Encerrado em</span>
      <span class="info-val">${_escape(fechaEm)}</span>
    </div>
    <div class="info-item">
      <span class="info-lbl">Mensagens</span>
      <span class="info-val">${total}</span>
    </div>
  </div>
  <div class="date-div">
    <div class="dline"></div>
    <span class="dtxt">${_escape(abrioEm)}</span>
    <div class="dline"></div>
  </div>
  <div class="messages">
${msgsHtml}
  </div>
  <div class="end-bar">
    <div class="eline"></div>
    <span class="etxt">💀 Atendimento Encerrado · MS-13</span>
    <div class="eline"></div>
  </div>
</div>
</div>
</body>
</html>`
}

// ── função principal ───────────────────────────────────────────────────────────

async function gerarEEnviarTranscript(channel, fechadoPor) {
  try {
    if (!fs.existsSync(TRANSCRIPT_DIR)) fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true })

    // Coleta TODAS as mensagens (igual ao Python: limit=None)
    const msgs = []
    let lastId = null
    while (true) {
      const options = { limit: 100 }
      if (lastId) options.before = lastId
      const batch = await channel.messages.fetch(options)
      if (batch.size === 0) break
      for (const m of batch.values()) msgs.push(m)
      lastId = batch.last().id
      if (batch.size < 100) break
    }
    msgs.sort((a, b) => a.createdTimestamp - b.createdTimestamp)

    // Descobre o dono do ticket
    const ownerId = _getOwnerId(channel)
    let dono = null
    if (ownerId) {
      try {
        dono = channel.guild.members.cache.get(ownerId)
          ?? await channel.guild.members.fetch(ownerId).catch(() => null)
      } catch {}
    }
    if (!dono) {
      for (const m of msgs) {
        if (!m.author.bot) { dono = m.member ?? m.author; break }
      }
    }

    const html  = _gerarHtml(channel, msgs, dono, fechadoPor)
    const fname = `ticket-${channel.name}-${Math.floor(Date.now() / 1000)}.html`
    const fpath = path.join(TRANSCRIPT_DIR, fname)
    fs.writeFileSync(fpath, html, 'utf8')

    if (!dono) return

    // Mensagem de DM — idêntica ao Python
    const dm =
      '# 🚨 Atendimento Encerrado\n' +
      'Seu atendimento foi finalizado! Esperamos que sua dúvida tenha sido esclarecida ou seu problema resolvido.\n' +
      'Todo o seu atendimento foi registrado e convertido em um documento, que está fixado logo abaixo para consulta futura.\n\n' +
      '**Importante**\n' +
      'Se você teve algum problema ou não ficou satisfeito com o atendimento, abra um chamado na categoria "Suporte Geral" e relate sua situação.\n' +
      '-# Observação: somente a direção da MS-13 terá acesso à esse atendimento.\n\n' +
      '**Atenciosamente, Direção MS-13.**\n' +
      '-# 💀 Omertà — O silêncio é lei.'

    const arquivo = new AttachmentBuilder(fpath, { name: fname })

    const donoUser = dono.user ?? dono   // pode ser Member ou User
    try {
      await donoUser.send({ content: dm, files: [arquivo] })
    } catch (err) {
      if (err.code === 50007) {   // Cannot send messages to this user (DM fechada)
        try {
          await channel.send({
            content:
              `${donoUser.toString()} não foi possível enviar a transcrição por DM.\n` +
              `-# Ative as DMs do servidor para receber futuros atendimentos.`,
            files: [new AttachmentBuilder(fpath, { name: fname })],
          })
        } catch {}
      } else {
        console.error('[TRANSCRIPT] DM error:', err)
      }
    }

    // Remove arquivo temporário
    try { fs.unlinkSync(fpath) } catch {}

  } catch (err) {
    console.error('[TRANSCRIPT] Error:', err)
  }
}

module.exports = { gerarEEnviarTranscript }