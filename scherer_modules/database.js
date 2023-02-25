const sqlite3 = require('sqlite3');
const https = require('https');
const fs = require('fs');

//Setando recursos do DB sqlite;
var db_usuarios = new sqlite3.Database('usuarios.db');
var db_registro = new sqlite3.Database('registro.db');

//Configuração manual para o Axios aceitar o certificado de segurança do site da Scherer via Https Agent. 
const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    cert: fs.readFileSync('cert'),
  });

// Obj para adiconar temporariamente numeros pendentes no cadastro:
let nomeTemp = {};
let listaTemp = {};
let msgTemp = {};
let msgTempTel = {};
let opcoes = ["s", "n", "f", "m"];

  module.exports = {
    db_registro: db_registro,
    db_usuarios: db_usuarios,
    httpsAgent: httpsAgent,
    nomeTemp: nomeTemp,
    listaTemp: listaTemp,
    msgTemp: msgTemp,
    msgTempTel: msgTempTel,
    opcoes: opcoes
  };
