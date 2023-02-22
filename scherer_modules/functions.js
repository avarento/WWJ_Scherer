/////////////////////////////////////////////////////   FUNÇÕES   ////////////////////////////////////////////////////////////

const sqlite3 = require('sqlite3');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const { db_registro, db_usuarios, httpsAgent } = require('./database')

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

//retorna data ou hora no formato necessário
function tempo(datahora) {
    const data = new Date();
    if (datahora === "data") { 
        return new Intl.DateTimeFormat('pt-BR').format(data);
    } 
    else if (datahora === "hora") { 
        return new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', minute: 'numeric'}).format(data);
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

//retorna o objeto "pesquisa" com as informações da peça se o scherer existir no site
async function pesquisaScherer(scherer) {

    let URL = 'https://www.scherer-sa.com.br/produto/' + scherer;
    const { data } = await axios.get(URL, { httpsAgent });
    const dom = new JSDOM(data);
    const { document } = dom.window
    var pesquisa = new Object();
    try {
        const codigoP = document.querySelector("div> div > div > div > div > p.m-t-20").lastChild.textContent
        const codigo = codigoP.trim(); //Retirando espaço no final do código da peça, erro do DB_Scherer
        const descricao = document.querySelector("div > div > div > div > div > p.m-t-5").textContent
        const imgURL = document.querySelector("div > div > div > div > div > img").src
                
        pesquisa.codigo = codigo;
        pesquisa.scherer = scherer;
        pesquisa.descricao = descricao;
        pesquisa.imgURL = imgURL;
        pesquisa.status = "valido";
        
        console.log(pesquisa)
        return pesquisa;        
                
    } catch (error) {
        pesquisa.erro = "O código Scherer *" + scherer + "* pode não existir, verifique novamente.";
        pesquisa.status = "invalido";
        return pesquisa
    }            
}


module.exports = {
    formata: formata,
    tempo: tempo, 
    validaString: validaString,
    formataTelefone: formataTelefone, 
    buscaRegistro: buscaRegistro, 
    buscaUsuario: buscaUsuario, 
    pesquisaScherer: pesquisaScherer,
    salvaUsuario: salvaUsuario,
    salvaRegistro: salvaRegistro
};