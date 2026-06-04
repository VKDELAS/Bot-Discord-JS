// src/systems/transcript.js — MS-13 (Visual Discord Finalizado v3)
// USO: await gerarEEnviarTranscript(channel, fechadoPor, msgInicialBackup)

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
  // Bold
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Italic
  t = t.replace(/\*(.+?)\*/g, '<em>$1</em>')
  // Underline
  t = t.replace(/__(.+?)__/g, '<u>$1</u>')
  // Strikethrough
  t = t.replace(/~~(.+?)~~/g, '<del>$1</del>')
  // Code
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
  // Mentions
  t = t.replace(/&lt;@!?(\d+)&gt;/g, "<span class='mention'>@usuário</span>")
  t = t.replace(/&lt;#(\d+)&gt;/g, "<span class='mention'>#canal</span>")
  t = t.replace(/&lt;@&amp;(\d+)&gt;/g, "<span class='mention'>@cargo</span>")
  // Subtext
  t = t.replace(/^-#\s*(.+)$/m, "<span class='subtext'>$1</span>")
  // Quotes (Blockquotes)
  t = t.replace(/^&gt;\s*(.+)$/gm, "<blockquote>$1</blockquote>")
  return t
}

// ── build mensagens ────────────────────────────────────────────────────────────

function _buildMsgs(msgs) {
  const out  = []
  let prevId = null
  let prevTimestamp = null

  const PIN_TYPES = new Set(['CHANNEL_PINNED_MESSAGE', 'GUILD_MEMBER_JOIN', 'USER_PREMIUM_GUILD_SUBSCRIPTION'])

  for (const msg of msgs) {
    // mensagem de sistema
    if (PIN_TYPES.has(msg.type)) {
      if (prevId !== null) { out.push('</div></div>'); prevId = null }
      const sysMap = {
        CHANNEL_PINNED_MESSAGE: `${msg.author.displayName} fixou uma mensagem neste canal.`,
        GUILD_MEMBER_JOIN: `${msg.author.displayName} entrou no servidor.`,
        USER_PREMIUM_GUILD_SUBSCRIPTION: `${msg.author.displayName} impulsionou o servidor.`,
      }
      const sysTxt = sysMap[msg.type] || ''
      out.push(
        `<div class="message-system">` +
        `<span class="system-icon"></span>` +
        `<span class="system-content">${_escape(sysTxt)}</span>` +
        `<span class="system-timestamp">${_fmtTs(msg.createdAt)}</span>` +
        `</div>`
      )
      continue
    }

    // Lógica de agrupamento
    const isSameAuthor = msg.author.id === prevId
    const isRecent = prevTimestamp && (msg.createdTimestamp - prevTimestamp < 300000)
    
    if (!isSameAuthor || !isRecent) {
      if (prevId !== null) out.push('</div></div>')
      const av  = _avatarUrl(msg.author)
      const cor = _roleColor(msg.member ?? msg.author)
      const ts  = _fmtTs(msg.createdAt)
      const bot = msg.author.bot ? `<span class="bot-tag">APP</span>` : ''
      const avTag = av
        ? `<img class="message-avatar" src="${_escape(av)}" alt="" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">`
        : `<img class="message-avatar" src="https://cdn.discordapp.com/embed/avatars/0.png">`
      
      out.push(
        `<div class="message-group" id="m-${msg.id}">` +
        `<div class="avatar-container">${avTag}</div>` +
        `<div class="message-content-wrapper">` +
        `<div class="message-header">` +
        `<span class="message-author" style="color:${cor}">${_escape(msg.author.displayName)}</span>` +
        `${bot}` +
        `<span class="message-timestamp">${_escape(ts)}</span>` +
        `</div>`
      )
      prevId = msg.author.id
    }
    prevTimestamp = msg.createdTimestamp

    // reply
    if (msg.reference?.messageId) {
      const ref = msg.mentions?.repliedUser
      if (ref) {
        const rAv   = _avatarUrl(ref)
        const rNome = ref.displayName || ref.username
        const rAvTag = rAv
          ? `<img class="reply-avatar" src="${_escape(rAv)}" onerror="this.style.display='none'">`
          : ''
        out.push(
          `<div class="message-reply">` +
          `${rAvTag}` +
          `<span class="reply-author">${_escape(rNome)}</span>` +
          `<span class="reply-content">Mensagem respondida</span>` +
          `</div>`
        )
      }
    }

    // conteúdo
    if (msg.content) {
      const contentHtml = msg.content.split('\n').map(linha => {
        return linha.trim() ? _fmtMd(linha) : '';
      }).join('\n');
      out.push(`<div class="message-text">${contentHtml}</div>`);
    }

    // embeds
    for (const emb of msg.embeds) {
      const corE   = emb.color ? `#${emb.color.toString(16).padStart(6, '0')}` : '#202225'
      const titulo = _escape(emb.title || '')
      let desc = ''
      if (emb.description) {
        desc = emb.description.split('\n').map(l =>
          `<div class="embed-description-line">${l.trim() ? _fmtMd(l) : '&nbsp;'}</div>`
        ).join('')
      }
      const fields = (emb.fields || []).map(f =>
        `<div class="embed-field">` +
        `<div class="embed-field-name">${_escape(f.name)}</div>` +
        `<div class="embed-field-value">${_fmtMd(f.value)}</div>` +
        `</div>`
      ).join('')
      
      const footerHtml = emb.footer?.text
        ? `<div class="embed-footer">${emb.footer.iconURL ? `<img src="${emb.footer.iconURL}" class="embed-footer-icon">` : ''}${_escape(emb.footer.text)}</div>`
        : ''

      out.push(
        `<div class="message-embed" style="border-left-color:${corE}">` +
        `<div class="embed-grid">` +
        (titulo ? `<div class="embed-title">${titulo}</div>` : '') +
        (desc    ? `<div class="embed-description">${desc}</div>`   : '') +
        (fields ? `<div class="embed-fields">${fields}</div>` : '') +
        `</div>` +
        footerHtml +
        `</div>`
      )
    }

    // attachments
    for (const att of msg.attachments.values()) {
      const ext = att.name?.includes('.') ? att.name.split('.').pop() : 'file'
      if (['png','jpg','jpeg','gif','webp'].includes(ext.toLowerCase())) {
        out.push(
          `<div class="message-attachment-image">` +
          `<img src="${_escape(att.url)}" alt="${_escape(att.name)}" loading="lazy">` +
          `</div>`
        )
      } else {
        out.push(
          `<div class="message-attachment-file">` +
          `<div class="file-icon"></div>` +
          `<div class="file-info">` +
          `<a class="file-name" href="${_escape(att.url)}" target="_blank">${_escape(att.name)}</a>` +
          `<div class="file-size">${(att.size / 1024).toFixed(1)} KB</div>` +
          `</div>` +
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
  const canal     = channel.name
  const tipo      = _tipoTicket(canal)
  const donoNome  = dono?.displayName ?? 'Desconhecido'
  const fechaNome = fechadoPor.displayName || fechadoPor.username

  const abrioEm = msgs.length
    ? msgs[0].createdAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : '—'
  const fechaEm = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  const msgsHtml = msgs.length
    ? _buildMsgs(msgs)
    : '<div class="empty-messages">Nenhuma mensagem registrada neste atendimento.</div>'

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Transcript: #${_escape(canal)}</title>
    <link href="https://fonts.googleapis.com/css2?family=gg+sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #313338;
            --bg-secondary: #2b2d31;
            --bg-tertiary: #1e1f22;
            --header-primary: #f2f3f5;
            --header-secondary: #b5bac1;
            --text-normal: #dbdee1;
            --text-muted: #949ba4;
            --text-link: #00a8fc;
            --interactive-normal: #b5bac1;
            --interactive-hover: #dbdee1;
            --mention-bg: rgba(88, 101, 242, 0.3);
            --mention-text: #c9cdfb;
            --ms13-accent: #3a71c1;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background-color: var(--bg-primary);
            color: var(--text-normal);
            font-family: 'gg sans', 'Noto Sans', sans-serif;
            line-height: 1.375;
            -webkit-font-smoothing: antialiased;
        }

        /* Scrollbar */
        ::-webkit-scrollbar { width: 16px; height: 16px; }
        ::-webkit-scrollbar-corner { background-color: transparent; }
        ::-webkit-scrollbar-thumb { background-color: var(--bg-tertiary); min-height: 40px; border: 4px solid transparent; background-clip: padding-box; border-radius: 8px; }
        ::-webkit-scrollbar-track { background-color: #2e3338; border: 4px solid transparent; background-clip: padding-box; border-radius: 8px; }

        .container { display: flex; flex-direction: column; min-height: 100vh; }

        /* Header */
        header {
            height: 48px;
            padding: 0 16px;
            display: flex;
            align-items: center;
            background-color: var(--bg-primary);
            box-shadow: 0 1px 0 rgba(0,0,0,0.1);
            z-index: 100;
            flex-shrink: 0;
            position: sticky;
            top: 0;
        }
        .header-icon { color: var(--text-muted); margin-right: 8px; font-size: 24px; font-weight: 400; }
        .header-title { color: var(--header-primary); font-size: 16px; font-weight: 600; margin-right: 8px; }
        .header-separator { width: 1px; height: 24px; background-color: var(--bg-tertiary); margin: 0 8px; }
        .header-topic { color: var(--text-muted); font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* Main Content */
        main { flex: 1; display: flex; flex-direction: column; }

        /* Start Section */
        .ticket-start { padding: 48px 16px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .start-icon { width: 68px; height: 68px; background-color: var(--bg-secondary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 42px; color: var(--header-primary); margin-bottom: 12px; border: 2px solid var(--ms13-accent); }
        .start-title { color: var(--header-primary); font-size: 32px; font-weight: 700; margin-bottom: 4px; }
        .start-description { color: var(--text-muted); font-size: 16px; }
        .ms13-tag { color: var(--ms13-accent); font-weight: 700; }

        /* Info Card */
        .info-card { margin: 16px; padding: 12px; background-color: var(--bg-secondary); border-radius: 8px; display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; border-left: 4px solid var(--ms13-accent); }
        .info-item { display: flex; flex-direction: column; }
        .info-label { color: var(--text-muted); font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 2px; }
        .info-value { color: var(--header-primary); font-size: 13px; font-weight: 500; }

        /* Messages */
        .messages-list { padding-bottom: 32px; }
        .message-group { position: relative; display: flex; padding: 2px 16px; margin-top: 1.0625rem; }
        .message-group:hover { background-color: rgba(0,0,0,0.02); }
        .avatar-container { margin-right: 16px; margin-top: 2px; flex-shrink: 0; }
        .message-avatar { width: 40px; height: 40px; border-radius: 50%; }
        .message-content-wrapper { flex: 1; min-width: 0; }
        .message-header { display: flex; align-items: center; margin-bottom: 2px; }
        .message-author { color: var(--header-primary); font-size: 1rem; font-weight: 500; margin-right: 8px; }
        .message-timestamp { color: var(--text-muted); font-size: 0.75rem; font-weight: 500; }
        .bot-tag { background-color: #5865f2; color: white; font-size: 0.625rem; font-weight: 600; padding: 1px 4px; border-radius: 3px; margin-right: 8px; text-transform: uppercase; }
        
        .message-text { color: var(--text-normal); font-size: 1rem; white-space: pre-wrap; word-wrap: break-word; }
        
        /* Mentions & MD */
        .mention { background-color: var(--mention-bg); color: var(--mention-text); padding: 0 2px; border-radius: 3px; font-weight: 500; }
        strong { font-weight: 700; color: var(--header-primary); }
        code { background: var(--bg-tertiary); padding: 0.2rem; border-radius: 3px; font-family: Consolas, monospace; font-size: 85%; }
        .subtext { font-size: 0.75rem; color: var(--text-muted); display: block; margin-top: 2px; }
        blockquote { border-left: 4px solid #4e5058; padding-left: 12px; margin: 4px 0; color: var(--text-muted); }

        /* System Messages */
        .message-system { display: flex; align-items: center; padding: 2px 16px; margin-top: 8px; color: var(--text-muted); font-size: 0.875rem; }
        .system-icon { width: 16px; height: 16px; margin-right: 8px; background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="%23949ba4"><path d="M8 0L6.5 1.5L11 6H0V8H11L6.5 12.5L8 14L15 7L8 0Z"/></svg>'); background-repeat: no-repeat; background-position: center; }
        .system-timestamp { margin-left: 8px; font-size: 0.75rem; opacity: 0.6; }

        /* Embeds */
        .message-embed { margin-top: 4px; padding: 8px 12px; background-color: var(--bg-secondary); border-radius: 4px; border-left: 4px solid var(--bg-tertiary); max-width: 520px; }
        .embed-title { color: var(--header-primary); font-size: 0.95rem; font-weight: 600; margin-bottom: 4px; }
        .embed-description { color: var(--text-normal); font-size: 0.85rem; }
        .embed-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 4px; margin-top: 4px; }
        .embed-field-name { color: var(--header-primary); font-size: 0.85rem; font-weight: 600; margin-bottom: 1px; }
        .embed-field-value { color: var(--text-normal); font-size: 0.85rem; }
        .embed-footer { margin-top: 4px; display: flex; align-items: center; color: var(--text-muted); font-size: 0.7rem; }
        .embed-footer-icon { width: 16px; height: 16px; border-radius: 50%; margin-right: 6px; }

        /* Attachments */
        .message-attachment-image { margin-top: 4px; max-width: 500px; border-radius: 4px; overflow: hidden; }
        .message-attachment-image img { max-width: 100%; max-height: 300px; display: block; }
        .message-attachment-file { margin-top: 4px; display: flex; align-items: center; padding: 8px; background-color: var(--bg-secondary); border: 1px solid var(--bg-tertiary); border-radius: 4px; max-width: 400px; }
        .file-icon { width: 24px; height: 24px; background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="%23b5bac1"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>'); background-repeat: no-repeat; background-position: center; margin-right: 8px; }
        .file-name { color: var(--text-link); text-decoration: none; font-weight: 500; font-size: 13px; }
        .file-size { color: var(--text-muted); font-size: 11px; }

        /* Footer */
        footer { padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 11px; border-top: 1px solid rgba(255,255,255,0.05); }
        .footer-logo { font-weight: 700; color: var(--ms13-accent); margin-bottom: 2px; font-size: 13px; }

        .empty-messages { padding: 40px; text-align: center; color: var(--text-muted); }
        
        @media (max-width: 600px) {
            .info-card { grid-template-columns: 1fr 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <span class="header-icon">#</span>
            <span class="header-title">${_escape(canal)}</span>
            <div class="header-separator"></div>
            <span class="header-topic">${_escape(tipo)} • Fechado por ${_escape(fechaNome)}</span>
        </header>
        <main>
            <section class="ticket-start">
                <div class="start-icon">#</div>
                <h1 class="start-title">Bem-vindo ao #${_escape(canal)}</h1>
                <p class="start-description">Este é o início do atendimento de <span class="ms13-tag">${_escape(tipo)}</span> da <span class="ms13-tag">MS-13</span>.</p>
            </section>

            <section class="info-card">
                <div class="info-item">
                    <span class="info-label">Aberto por</span>
                    <span class="info-value">${_escape(donoNome)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Fechado por</span>
                    <span class="info-value">${_escape(fechaNome)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Aberto em</span>
                    <span class="info-value">${_escape(abrioEm)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Encerrado em</span>
                    <span class="info-value">${_escape(fechaEm)}</span>
                </div>
            </section>

            <div class="messages-list">
                ${msgsHtml}
            </div>

            <footer>
                <div class="footer-logo">MS-13 • OMERTÀ</div>
                <p>Transcrição gerada automaticamente pelo sistema de tickets.</p>
                <p>O silêncio é lei.</p>
            </footer>
        </main>
    </div>
</body>
</html>`
}

// ── função principal ───────────────────────────────────────────────────────────

async function gerarEEnviarTranscript(channel, fechadoPor, msgInicialBackup = null) {
  try {
    if (!fs.existsSync(TRANSCRIPT_DIR)) fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true })

    // Coleta TODAS as mensagens
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

    // --- RECUPERAÇÃO DA MENSAGEM INICIAL ---
    // Se a primeira mensagem foi editada (pelo fecharTicket), nós restauramos o backup
    if (msgInicialBackup && msgs.length > 0) {
      // Procuramos a mensagem do bot que foi editada
      const firstMsg = msgs[0];
      if (firstMsg.author.bot) {
        // Substituímos o conteúdo pelo backup
        firstMsg.content = msgInicialBackup.content || firstMsg.content;
        firstMsg.embeds = msgInicialBackup.embeds || firstMsg.embeds;
      }
    }

    // --- LOGICA DE REMOÇÃO DE ENCERRAMENTO ---
    // Agora que restauramos a inicial, removemos apenas a mensagem de encerramento real.
    const keywords = ['atendimento encerrado', 'excluído automaticamente', 'operador responsável'];
    
    const finalMsgs = msgs.filter((m, index) => {
      // NUNCA removemos a primeira mensagem agora
      if (index === 0) return true;
      
      if (m.author.bot && index >= msgs.length - 1) {
        const content = (m.content || '').toLowerCase();
        const hasKeyword = keywords.some(k => content.includes(k));
        if (hasKeyword) return false;
      }
      return true;
    });

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
      for (const m of finalMsgs) {
        if (!m.author.bot) { dono = m.member ?? m.author; break }
      }
    }

    const html  = _gerarHtml(channel, finalMsgs, dono, fechadoPor)
    const fname = `ticket-${channel.name}-${Math.floor(Date.now() / 1000)}.html`
    const fpath = path.join(TRANSCRIPT_DIR, fname)
    fs.writeFileSync(fpath, html, 'utf8')

    if (!dono) return

    // Mensagem de DM — MS-13 Style
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

    const donoUser = dono.user ?? dono
    try {
      await donoUser.send({ content: dm, files: [arquivo] })
    } catch (err) {
      if (err.code === 50007) {
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
