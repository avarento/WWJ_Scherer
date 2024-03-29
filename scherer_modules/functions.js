const sqlite3 = require('sqlite3');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const { db_registro, db_usuarios, db_config, httpsAgent } = require('./database')

function contato(msgFrom) {
    let from = msgFrom.toString().includes("@c.us") ? msgFrom.toString().replace("@c.us", "") : msgFrom.toString() + "@c.us";
    return from;
}

//Função para salvar dois valores nas colunas numero e nome em usuarios
async function salvaUsuario(numeroX, nomeX, dataX, horaX){
    return db_usuarios.run('INSERT INTO usuarios (numero, nome, data, hora) VALUES (?, ?, ?, ?)',[numeroX, nomeX, dataX, horaX]);
}

//Função para salvar 5 valores nas colunas scherer, codigo, usuario, data e hora em registro
async function salvaRegistro(tipoX, schererX, codigoX, usuarioX, numeroX, dataX, horaX){
    return db_registro.run('INSERT INTO registro (tipo, scherer, codigo, usuario, numero, data, hora) VALUES (?, ?, ?, ?, ?, ?, ?)',[tipoX, schererX, codigoX, usuarioX, numeroX, dataX, horaX]);
}

//retorna string com caixa baixa e remove ocasionais espaços no início/final
function formata(string) {
    return string.toLowerCase().trim();
}

//retorna data ou hora no formato necessário (GMT-3 para adequar o servidor aws ao horário brasileiro)
function tempo(datahora) {
    const dataServer = new Date();
    const data = new Date(dataServer.setHours(dataServer.getHours() - 3));
    if (datahora === "data") { 
        return new Intl.DateTimeFormat('pt-BR').format(data);
    } else if (datahora === "hora") { 
        return new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', minute: 'numeric'}).format(data);
    } else if (datahora === "ontem") {
        let ontem = data.setDate(data.getDate() - 1);
        return new Intl.DateTimeFormat('pt-BR').format(ontem);
    } else if (datahora === "anteontem") {
        let anteontem = data.setDate(data.getDate() - 2);
        return new Intl.DateTimeFormat('pt-BR').format(anteontem);
    }
}

//testa a string com a RegExp que garante apenas letras e algumas variações
function validaString(string) {
    const regex = /^[a-záäàâãéëèêẽíïìîĩóöòôõúüùũûçĉñ,.' ]+$/gi;
    return regex.test(string)
}

//recebe msg.from e o retorna com uma máscara +xx (xx) x xxxx-xxxx
function formataTelefone(from) { 
    let numero = (from.includes("@c.us") ? from.replace("@c.us","") : from);
    if (numero.length == 12) { //"55 55 1234-1234" ou "55 55 1 2345-1234" pela possível existencia de um prefixo 9 (9 8121-8273)
        let formatado = numero.replace(/^(\d{2})(\d{2})(\d{4})(\d{4})/g, (RegExp, caPais, caRegional, prefixTel, sufixTel) => {
            return `+${caPais} (${caRegional}) ${prefixTel}-${sufixTel}`;
        });
        return formatado;
    }
    else if (numero.length == 13) {
        let formatado = numero.replace(/^(\d{2})(\d{2})(\d{1})(\d{4})(\d{4})/g, (RegExp, caPais, caRegional, prefix, prefixTel, sufixTel) => {
            return `+${caPais} (${caRegional}) ${prefix}${prefixTel}-${sufixTel}`;
        });
        return formatado;
    } 
    else {
        return numero;
    }   
}

//retorna em row as informações do nome ou numero [ nota para implementação futura: if (input.includes("@c.us")) {... ]
function buscaUsuario(input) {
    return new Promise((resolve, reject) => {
        let NoN = (isNaN(input) ? 'nome' : 'numero') //NoN Name or Number
        let userQuery = `SELECT * FROM usuarios WHERE ${NoN} = ?`; //Usei template string pq qnd declarava duas variáveis por "?" não fazia uma requisição correta ¯\_(ツ)_/¯
        db_usuarios.get(userQuery, [input], (err, row) => {
            if (err) {
                reject(err);
            }
            resolve(row);
        });
        
    });   
}   

//retorna um array de objetos das requisições de peça do dia informado no formato xx/xx/xxxx (tempo("data"))
function buscaRegistro(data) {
    return new Promise((resolve, reject) => {
        db_registro.all('SELECT tipo, usuario, scherer, codigo FROM registro WHERE data = ?', [data], (err, rows) => {
            if(err) {
                reject(err);
            }
            resolve(rows);
        });
    });
}

//retorna um array de objetos das requisições de peça do dia informado no formato xx/xx/xxxx (tempo("data"))
function buscaRegistroPorScherer(scherer) {
    return new Promise((resolve, reject) => {
        db_registro.all('SELECT * FROM registro WHERE scherer = ?', [scherer], (err, rows) => {
            if(err) {
                reject(err);
            }
            resolve(rows);
        });
    });
}

//retorna o objeto "pesquisa" com as informações da peça se o scherer existir no site
async function pesquisaScherer(scherer) {
    let URL = 'https://www.scherer-sa.com.br/produto/' + scherer;
    const { data } = await axios.get(URL, { httpsAgent });
    const dom = new JSDOM(data);
    const { document } = dom.window
    const pesquisa = {};
    pesquisa.codigo = document.querySelector("div> div > div > div > div > p.m-t-20")?.lastChild?.textContent.trim();
    pesquisa.descricao = document.querySelector("div > div > div > div > div > p.m-t-5")?.textContent
    pesquisa.imgURL = document.querySelector("div > div > div > div > div > img")?.src.replace("_g", "");
    pesquisa.updown = (document.querySelector("#wrapper > div > div > div > h1")?.textContent === "Produtos" ? "up" : "down");
    pesquisa.scherer = scherer;
    pesquisa.status = "";

    if (pesquisa.updown === "up" && pesquisa.descricao !== undefined) {
        pesquisa.status = "valido";
        console.log(pesquisa) 
        return pesquisa;
    } else if (pesquisa.updown === "up" && pesquisa.descricao === undefined) {
        pesquisa.status = "invalido";
        console.log(pesquisa) 
        return pesquisa;
    } else if (pesquisa.updown === "down") {
        pesquisa.status = pesquisa.updown;
        console.log(pesquisa) 
        return pesquisa;
    } else {
        pesquisa.status = "error";
        console.log(pesquisa) 
        return pesquisa;
    }        
}

async function buscaConfig(chave) {
    return new Promise((resolve, reject) => {
        db_config.get('SELECT * FROM config WHERE chave = ?', [chave], (err, rows) => {
            if(err) {
                reject(err);
            }
            resolve(rows);
        });
    });
}

async function salvaConfig(chaveX, valorX) {
    return db_config.run('INSERT INTO config (chave, valor) VALUES (?, ?)', [chaveX, valorX]);
}

async function alteraConfig(chaveX, valorX) {
    return db_config.run(`UPDATE config SET valor = "${valorX}" WHERE chave = "${chaveX}"`);
}

async function buscaAllConfigs() {
    return new Promise((resolve, reject) => {
        db_config.all('SELECT * FROM config', (err, rows) => {
            if(err) {
                reject(err);
            }
            resolve(rows);
        });
    });
}




module.exports = {
    contato: contato,
    formata: formata,
    tempo: tempo, 
    validaString: validaString,
    formataTelefone: formataTelefone, 
    buscaRegistro: buscaRegistro,
    buscaRegistroPorScherer: buscaRegistroPorScherer, 
    buscaUsuario: buscaUsuario, 
    pesquisaScherer: pesquisaScherer,
    salvaUsuario: salvaUsuario,
    salvaRegistro: salvaRegistro,
    buscaConfig: buscaConfig,
    salvaConfig: salvaConfig,
    alteraConfig: alteraConfig,
    buscaAllConfigs: buscaAllConfigs
};