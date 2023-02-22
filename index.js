const qrcode = require('qrcode-terminal');
const sqlite3 = require('sqlite3');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const client = new Client({ 
    authStrategy: new LocalAuth(),
    puppeteer: { 
    // product: "chrome",   (product e executablePath apenas configurações para o servidor AWS.)
    // executablePath: "/usr/bin/chromium-browser",
    headless: true,
    handleSIGINT: false,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox']
    },      
});


//Configurações:
let numeroTelefonista = "555591217925@c.us";  //Quem vai receber a lista de requisições quando tiver um novo pedido de peça
let rangeIncial = 555533130350;               //Ramais da FISA apartir de 0350
let rangeFinal = 555533130393;                //Ramais da FISA até 0393



/////////////////////////////////////////////////////   DB   ////////////////////////////////////////////////////////////
// Obj para adiconar temporariamente numeros pendentes no cadastro:
var nomeTemp = {};
var listaTemp = {};
var msgTemp = {};
var opcoes = ["s", "n", "f", "m"];

//Setando recursos do DB sqlite;
var db_usuarios = new sqlite3.Database('usuarios.db');
var db_registro = new sqlite3.Database('registro.db');

//Cria tabela "usuarios" com as colunas id, numero e nome, caso não exista                                  
db_usuarios.serialize(() => {
    db_usuarios.run('CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, numero INTEGER, nome TEXT, data DATA, hora TIME)')
})

//Cria tabela "registro" com as colunas id, scherer, codigo, usuario, data e hora
db_registro.serialize(() => {
    db_registro.run('CREATE TABLE IF NOT EXISTS registro (id INTEGER PRIMARY KEY, tipo TEXT, scherer INT, codigo TEXT, usuario TEXT, numero TEXT, data DATA, hora TIME)')
})

//Função para salvar dois valores nas colunas numero e nome em usuarios
async function salvaUsuario(numeroX, nomeX, dataX, horaX){
    return db_usuarios.run('INSERT INTO usuarios (numero, nome, data, hora) VALUES (?, ?, ?, ?)',[numeroX, nomeX, dataX, horaX]);
}

//Função para salvar 5 valores nas colunas scherer, codigo, usuario, data e hora em registro
async function salvaRegistro(tipoX, schererX, codigoX, usuarioX, numeroX, dataX, horaX){
    return db_registro.run('INSERT INTO registro (tipo, scherer, codigo, usuario, numero, data, hora) VALUES (?, ?, ?, ?, ?, ?, ?)',[tipoX, schererX, codigoX, usuarioX, numeroX, dataX, horaX]);
}

/////////////////////////////////////////////////////   FUNÇÕES   ////////////////////////////////////////////////////////////

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
       
//Configuração manual para o Axios aceitar o certificado de segurança do site da Scherer via Https Agent. 
const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    cert: fs.readFileSync('cert'),
  });


////////////////////////////////////////////// INÍCIO ///////////////////////////////////////////////
client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
});

client.on('ready', () => {
    console.log('Cliente Ativo! ', tempo("data"), "|", tempo("hora") );
});

client.on('message', async msg => {

    //LOGs
    var logsView = `LOG: ${tempo("data")} ${tempo("hora")} MSG: ${msg.body} DE: ${formataTelefone(msg.from)} TIPO: ${msg.deviceType}`;

    //cadastrar >>> mensagem de boas vindas pedindo um nome para registro. Salva pendência em nomeTemp para aguardar nome na próxima mensagem
    if (formata(msg.body) === 'cadastrar') {
        console.log(logsView)
        let numero = msg.from.replace("@c.us", "");
        if (numero <= rangeFinal && numero >= rangeIncial) { //Se o numero estiver dentro do range de ramais usando na FISA
            nomeTemp[msg.from] = 0;
            numero = formataTelefone(msg.from);        
            let mensagem = `Olá ${numero}, envie um nome para vincular a esse número no registro de usuários.`;
            client.sendMessage(msg.from, mensagem); 
        } 
        else {
            client.sendMessage(msg.from, "Seu ramal é incompatível com o registro permitido nesse sistema."); 
        }              
    }

    //sudocadastrar >>> registro sem requisitos. Adiciona pendência em nomeTemp mesmo fora do range de ramais.
    else if (formata(msg.body) === 'sudocadastrar') {
        console.log(logsView)        
        nomeTemp[msg.from] = 0;             
        let numero = formataTelefone(msg.from);        
        let mensagem = `Olá ${numero}, envie um nome para vincular a esse número no registro de usuários.`;
        client.sendMessage(msg.from, mensagem);     
    }

    //gatilho para receber o nome de usuario enviado após "cadastrar" (etapas: valida regexp, verifica se existe registro no numero, depois se existe esse nome em outro numero)
    else if (nomeTemp[msg.from] === 0) {
        console.log(logsView)
        let numero = msg.from.replace("@c.us","");
        let nome = msg.body.trim();    
        if (nome.length < 20 && nome.length > 5) {
            if (validaString(nome) === true) {
                buscaUsuario(numero).then((row) => {
                    if (row?.nome === undefined) {
                        buscaUsuario(nome).then((row) => {
                            if (row?.nome !== undefined) {
                                client.sendMessage(msg.from, "Esse nome já está em uso, tente outro.")
                            } else {
                                let mensagem = `Bem vindo *${nome}*, para requisitar uma peça envie o código Scherer referente com o comando *#* seguido do código.\n\n   (exemplo: *#19117*)`;
                                salvaUsuario(numero, nome, tempo("data"), tempo("hora"));
                                delete nomeTemp[msg.from];
                                client.sendMessage(msg.from, mensagem);  
                            }
                        }).catch((err) => {
                            delete nomeTemp[msg.from];
                            console.error("ERRO:", err, msg.body, msg.from, ":ERRO")
                            client.sendMessage(msg.from, "A tentativa de operar na base de dados por nome retornou um erro.")
                        });        
                    } else {
                        let mensagem = row.nome + ", seu número já possui um registro, você pode requisitar uma peça enviando o código Scherer referente com o comando *#* seguido do código.\n\n   (exemplo: *#19117*)"
                        client.sendMessage(msg.from, mensagem);
                        delete nomeTemp[msg.from];
                        }
                    }).catch((err) => {
                        delete nomeTemp[msg.from];
                        console.error("ERRO:", err, msg.body, msg.from, ":ERRO");
                        client.sendMessage(msg.from, "A tentativa de operar na base de dados por número retornou um erro.");
                    });
            } else {
                client.sendMessage(msg.from, "Esse nome contém caracteres especiais que não são permitidos para registro, tente outro.")
            }       
        } else {
            client.sendMessage(msg.from, "O nome informado deve ter entre 5 a 20 caracteres, tente outro.");
        }
    } 
 
    //requerimento de peça por scherer (#19117), retornando as informações na mensagem com opções s/n/f/m e salvando as informações da requisições em listaTemp para na próxima mensagem resolver o destino dessa requisição
    if (formata(msg.body).startsWith("#")) {
        console.log(logsView)
        let scherer = msg.body.split('#')[1]; 
        if (isNaN(scherer) === false && scherer.length <= 9) {
            buscaUsuario(msg.from.replace("@c.us", "")).then(async (row) => {
                if (row?.nome !== undefined) {
                    let nome = row.nome;
                    let pesquisa = await pesquisaScherer(scherer);
                    if (pesquisa.status === "invalido") {
                        client.sendMessage(msg.from, pesquisa.erro);
                        console.log(pesquisa)
                    } else {
                        let mensagem = `*_Cod Scherer:_* ${pesquisa.scherer} \n\n*_Código da peça:_* ${pesquisa.codigo} \n\n*_Descrição:_* ${pesquisa.descricao} 
                        \n\n*Deseja requisitar esta peça?*\n*(S, N, F, M)*`
                        let chat = await msg.getChat();
                        const media = await MessageMedia.fromUrl(pesquisa.imgURL, 
                            {reqOptions:
                                {agent:
                                    httpsAgent // Injetando certificado manualmente para acessar o "db" scherer
                                } 
                            });
                        chat.sendMessage(media, {caption: mensagem});
                        listaTemp[msg.from] = {
                            usuario: [nome],
                            scherer: [pesquisa.scherer],
                            cod: [pesquisa.codigo]                    
                        }
                        console.log(listaTemp[msg.from])    
                    }
                } else {
                    client.sendMessage(msg.from, "Você ainda não está registrado no sistema de requisição.\n\nEnvie *cadastrar* para iniciar seu cadastro.")
                }
            }).catch((erro) => {
                console.error(erro)
            });           
        }
    }

    //gatilho para ouvir a opção do requerimento (S/N/F/M) em listaTemp
    else if (opcoes.includes(formata(msg.body)) && listaTemp[msg.from] !== undefined) {
        let opcao = formata(msg.body);
        if (opcao === "s") { //Adiciona a lista do telefonista
            console.log(logsView)
            salvaRegistro("⚙️", listaTemp[msg.from].scherer, listaTemp[msg.from].cod, listaTemp[msg.from].usuario, formataTelefone(msg.from), tempo("data"), tempo("hora")).catch((erro) => console.error(erro));
            client.sendMessage(msg.from, "Peça requisitada com sucesso.");
            buscaRegistro(tempo("data")).then((rows) => {
                var lista = "";
                rows.forEach(obj => {
                    let mensagem = `${obj.tipo} *${obj.scherer}* *_${obj.usuario}_*\n${obj.codigo}\n\n`;
                    lista = lista + mensagem;   
                });
                client.sendMessage(numeroTelefonista, lista);
            }).catch((err) => {
                console.error(err)
            });
            delete listaTemp[msg.from];
        } else if (opcao === "n") { //Apenas limpa o registro temporário 
            console.log(logsView)
            client.sendMessage(msg.from, "Peça não requisitada.")
            delete listaTemp[msg.from];
        } else if (opcao === "f") { //Faz o requerimento da foto da peça ao telefonista
            console.log(logsView)
            salvaRegistro("📷", listaTemp[msg.from].scherer, listaTemp[msg.from].cod, listaTemp[msg.from].usuario, formataTelefone(msg.from), tempo("data"), tempo("hora")).catch((erro) => console.error(erro));
            client.sendMessage(msg.from, "Foto requisitada com sucesso.");
            buscaRegistro(tempo("data")).then((rows) => {
                var lista = "";
                rows.forEach(obj => {
                    let mensagem = `${obj.tipo} *${obj.scherer}* *_${obj.usuario}_*\n${obj.codigo}\n\n`;
                    lista = lista + mensagem;   
                });
                client.sendMessage(numeroTelefonista, lista);
            }).catch((err) => {
                console.error(err)
            });
        } else if (opcao === "m") { //Adiciona pendência em msgTemp para aguardar resposta com a msg
            console.log(logsView)
            msgTemp[msg.from] = 0
            client.sendMessage(msg.from, "Qual mensagem deseja enviar?")
        }
    }
        
    //gatilho para salvar a mensagem recebida se estiver com pendência no objeto msgTemp caso a opção tiver sido "m" (mensagem)
    else if (msgTemp[msg.from] !== undefined) {
        console.log(logsView)
        if (msg.body.length < 100) {
            salvaRegistro("✉️", listaTemp[msg.from].scherer, msg.body.trim(), listaTemp[msg.from].usuario, formataTelefone(msg.from), tempo("data"), tempo("hora")).catch((erro) => console.error(erro));
            client.sendMessage(msg.from, "Mensagem enviada em anexo ao scherer com sucesso.");
            delete msgTemp[msg.from];
            buscaRegistro(tempo("data")).then((rows) => {
            let lista = "";
            rows.forEach(obj => {
                let mensagem = `${obj.tipo} *${obj.scherer}* *_${obj.usuario}_*\n${obj.codigo}\n\n`;
                lista = lista + mensagem;   
            });
            client.sendMessage(numeroTelefonista, lista);
            }).catch((err) => {
                console.error(err)
            });
        } else {
           client.sendMessage(msg.from, "Sua mensagem excede o limite de caracteres, tente outra.")
        }    
    }

    //se msg iniciar com "informe " (com espaço no final) para retornar a lista do dia (no formato xx/xx/xxxx):
    else if (formata(msg.body).startsWith('informe ')) {
        console.log(logsView)
        let datainforme = formata(msg.body).replace("informe ","");
        buscaRegistro(datainforme).then((rows) => {
            let lista = "";
            if (rows.length !== 0) {
                rows.forEach(obj => {
                    let mensagem = `${obj.tipo} *${obj.scherer}* *_${obj.usuario}_*\n${obj.codigo}\n\n`;
                    lista = lista + mensagem;   
                });
                client.sendMessage(msg.from, lista);     
            } else {
                client.sendMessage(msg.from, "Não existe registros na data informada, verifique se ela está no formato:\n\n*00/00/00*");
            }
        }).catch((err) => {
            console.error(err)
            client.sendMessage(msg.from, "Erro ao acessar registro, verifique se a data informada está no formato:\n\n*00/00/00*");
        });
    } 

    //foto scherer vendedor >>> comando na descrição da mensagem para enviar a foto para o vendedor informando o scherer da peça 
    else if (msg.body.trim().startsWith("foto ") && msg.hasMedia || msg.body.trim().startsWith("Foto ") && msg.hasMedia) { 
        console.log(logsView)
        //forma de receber foto ou Foto sem alterar o nome recebido que é case sensetive
        // Foto 19117 Gustavo S    |   foto 19117 Gustavo S
        let mensagem = msg.body.substring(5).trim().split(" "); 
        let scherer = mensagem[0];
        let vendedor = msg.body.substring(5).trim().replace(scherer, "").trim();
        buscaUsuario(vendedor).then(async (row) => {
        if (row?.numero !== undefined && isNaN(scherer) === false) {
            let numero = row.numero + "@c.us";
            const media = await msg.downloadMedia();
            let descricao = `Foto requerida do scherer ${scherer}`;
            client.sendMessage(numero, media, {caption: descricao} );
            client.sendMessage(msg.from, `Foto enviada para ${vendedor} com sucesso.`)
        } else {
            client.sendMessage(msg.from, "Verifique se o nome do vendedor está correto, incluindo possíveis letras maiúsculas, e se o scherer informado está no formato numérico simples. \n\n (exemplo: *foto 19117 _Júnior .S_*)");
        }
        }).catch((err) => {console.error(err)});
    }

});
   
process.on("SIGINT", async () => {
    console.log("(SIGINT) Encerrando cliente...");
    await client.destroy();
    process.exit(0);
    })
   
client.initialize();



//  https://www.monroe.com.br/catalogo/produtos/codigo-produto?buscaProduto=x
//  https://www.monroeaxios.com.br/products/cross-reference?crossReference=x
//  https://api-pioneiro.appspot.com/pub/produto?marca=Nissan

 /* //else para baixar list.db
    else if (msg.body === '!download') {    
        let chat = await msg.getChat();
        const media = MessageMedia.fromFilePath('./list.db');
        chat.sendMessage(media);
        console.log("Arquivo enviado.")
        
    }  */