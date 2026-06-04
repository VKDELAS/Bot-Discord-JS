// src/database/manager.js
// better-sqlite3 é SÍNCRONO — NUNCA usar await nas queries

'use strict'

const fs      = require('fs')
const path    = require('path')
const Database = require('better-sqlite3')
const { REC_DB } = require('../config/settings')

const DATA_DIR        = path.resolve(__dirname, '../../data')
const METAS_FILE      = path.join(DATA_DIR, 'metas_data.json')
const REGISTROS_FILE  = path.join(DATA_DIR, 'registros.json')
const MULTAS_FILE     = path.join(DATA_DIR, 'multas_processadas.json')
const REC_CONFIG_PATH = path.join(DATA_DIR, 'rec_config.json')
const REC_DB_PATH     = path.join(DATA_DIR, REC_DB)

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

function _readJson(filePath, defaultValue = {}) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return defaultValue
  }
}

function _writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}

function loadData()       { return _readJson(METAS_FILE, {}) }
function saveData(data)   { _writeJson(METAS_FILE, data) }

function loadRegistros()  { return _readJson(REGISTROS_FILE, []) }
function saveRegistro(entry) {
  const registros = loadRegistros()
  registros.push(entry)
  _writeJson(REGISTROS_FILE, registros)
}

function loadMultasProcessadas()    { return _readJson(MULTAS_FILE, []) }
function salvarMultaProcessada(id) {
  const multas = loadMultasProcessadas()
  if (!multas.includes(id)) {
    multas.push(id)
    _writeJson(MULTAS_FILE, multas)
  }
}

let _db = null
function getDb() {
  if (!_db) _db = new Database(REC_DB_PATH)
  return _db
}

function recInitDb() {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id   TEXT    NOT NULL UNIQUE,
      user_id     TEXT    NOT NULL,
      status      TEXT    NOT NULL DEFAULT 'aberto',
      recrutador  TEXT,
      criado_em   TEXT    NOT NULL,
      fechado_em  TEXT
    );
    CREATE TABLE IF NOT EXISTS respostas (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id   TEXT    NOT NULL,
      pergunta    TEXT    NOT NULL,
      resposta    TEXT    NOT NULL
    );
    CREATE TABLE IF NOT EXISTS perguntas (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      ordem     INTEGER NOT NULL,
      texto     TEXT    NOT NULL,
      ativa     INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS recrutadores (
      user_id      TEXT PRIMARY KEY,
      nome         TEXT NOT NULL,
      total_rec    INTEGER NOT NULL DEFAULT 0,
      ultima_acao  TEXT
    );
    CREATE TABLE IF NOT EXISTS blacklist (
      user_id     TEXT PRIMARY KEY,
      motivo      TEXT,
      adicionado  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS config (
      chave TEXT PRIMARY KEY,
      valor TEXT
    );
    CREATE TABLE IF NOT EXISTS relatorios (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      recrutador  TEXT NOT NULL,
      aprovados   INTEGER NOT NULL DEFAULT 0,
      reprovados  INTEGER NOT NULL DEFAULT 0,
      periodo     TEXT NOT NULL,
      criado_em   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS avaliacoes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id   TEXT NOT NULL,
      recrutador  TEXT NOT NULL,
      resultado   TEXT NOT NULL,
      observacao  TEXT,
      avaliado_em TEXT NOT NULL
    );
  `)

  const count = db.prepare('SELECT COUNT(*) as c FROM perguntas').get()
  if (count.c === 0) {
    const insert = db.prepare('INSERT INTO perguntas (ordem, texto) VALUES (?, ?)')
    const perguntas = [
      [1, 'Qual é o seu nome no MTA?'],
      [2, 'Quantas horas você tem disponível por dia?'],
      [3, 'Já teve experiência com facções RP antes? Se sim, quais?'],
      [4, 'Por que quer entrar na MS-13?'],
      [5, 'Tem microfone e está disposto a usar?'],
    ]
    const insertMany = db.transaction((rows) => {
      for (const row of rows) insert.run(...row)
    })
    insertMany(perguntas)
  }
}

function recGetTicket(ticketId)              { return getDb().prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(ticketId) }
function recCreateTicket(ticketId, userId, criadoEm) {
  getDb().prepare('INSERT INTO tickets (ticket_id, user_id, criado_em) VALUES (?, ?, ?)').run(ticketId, userId, criadoEm)
}
function recUpdateTicketStatus(ticketId, status, extra = {}) {
  const { recrutador, fechadoEm } = extra
  if (recrutador && fechadoEm) {
    getDb().prepare('UPDATE tickets SET status = ?, recrutador = ?, fechado_em = ? WHERE ticket_id = ?').run(status, recrutador, fechadoEm, ticketId)
  } else if (recrutador) {
    getDb().prepare('UPDATE tickets SET status = ?, recrutador = ? WHERE ticket_id = ?').run(status, recrutador, ticketId)
  } else {
    getDb().prepare('UPDATE tickets SET status = ? WHERE ticket_id = ?').run(status, ticketId)
  }
}
function recSalvarResposta(ticketId, pergunta, resposta) {
  getDb().prepare('INSERT INTO respostas (ticket_id, pergunta, resposta) VALUES (?, ?, ?)').run(ticketId, pergunta, resposta)
}
function recGetRespostas(ticketId)  { return getDb().prepare('SELECT * FROM respostas WHERE ticket_id = ?').all(ticketId) }
function recGetPerguntas()          { return getDb().prepare('SELECT * FROM perguntas WHERE ativa = 1 ORDER BY ordem').all() }
function recGetBlacklist(userId)    { return getDb().prepare('SELECT * FROM blacklist WHERE user_id = ?').get(userId) }
function recAddBlacklist(userId, motivo, adicionado) {
  getDb().prepare('INSERT OR REPLACE INTO blacklist (user_id, motivo, adicionado) VALUES (?, ?, ?)').run(userId, motivo, adicionado)
}
function recRemoveBlacklist(userId) { getDb().prepare('DELETE FROM blacklist WHERE user_id = ?').run(userId) }
function recGetRecrutador(userId)   { return getDb().prepare('SELECT * FROM recrutadores WHERE user_id = ?').get(userId) }
function recUpsertRecrutador(userId, nome, ultimaAcao) {
  getDb().prepare(`
    INSERT INTO recrutadores (user_id, nome, total_rec, ultima_acao)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      total_rec   = total_rec + 1,
      ultima_acao = excluded.ultima_acao
  `).run(userId, nome, ultimaAcao)
}
function recGetTopRecrutadores(limit = 10) {
  return getDb().prepare('SELECT * FROM recrutadores ORDER BY total_rec DESC LIMIT ?').all(limit)
}
function recSalvarAvaliacao(ticketId, recrutador, resultado, observacao, avaliadoEm) {
  getDb().prepare('INSERT INTO avaliacoes (ticket_id, recrutador, resultado, observacao, avaliado_em) VALUES (?, ?, ?, ?, ?)').run(ticketId, recrutador, resultado, observacao, avaliadoEm)
}
function recGetConfig(chave) {
  const row = getDb().prepare('SELECT valor FROM config WHERE chave = ?').get(chave)
  return row ? row.valor : null
}
function recSetConfig(chave, valor) {
  getDb().prepare('INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)').run(chave, String(valor))
}

function loadRecConfig()       { return _readJson(REC_CONFIG_PATH, {}) }
function saveRecConfig(data)   { _writeJson(REC_CONFIG_PATH, data) }

module.exports = {
  loadData, saveData,
  loadRegistros, saveRegistro,
  loadMultasProcessadas, salvarMultaProcessada,
  loadRecConfig, saveRecConfig,
  recInitDb,
  recGetTicket, recCreateTicket, recUpdateTicketStatus,
  recSalvarResposta, recGetRespostas, recGetPerguntas,
  recGetBlacklist, recAddBlacklist, recRemoveBlacklist,
  recGetRecrutador, recUpsertRecrutador, recGetTopRecrutadores,
  recSalvarAvaliacao, recGetConfig, recSetConfig,
}
