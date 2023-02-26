const qrcode = require('qrcode-terminal');
const sqlite3 = require('sqlite3');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const { formata, tempo, validaString, formataTelefone, buscaRegistro, buscaUsuario, pesquisaScherer, salvaRegistro, salvaUsuario } = require('./scherer_modules/functions');
const { numeroTelefonista, rangeIncial, rangeFinal } = require('./scherer_modules/settings');
const { db_registro, db_usuarios, httpsAgent, nomeTemp, listaTemp, msgTemp, msgTempTel, opcoes } = require('./scherer_modules/database');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const client = new Client({ 
    authStrategy: new LocalAuth(),
    puppeteer: { 
     product: "chrome",   //(product e executablePath apenas configurações para o servidor AWS.)
     executablePath: "/usr/bin/chromium-browser",
    headless: true,
    handleSIGINT: false,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox']
    },      
});

//Cria tabela "usuarios" com as colunas id, numero e nome, caso não exista                                  
db_usuarios.serialize(() => {
    db_usuarios.run('CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, numero INTEGER, nome TEXT, data DATA, hora TIME)')
})

//Cria tabela "registro" com as colunas id, scherer, codigo, usuario, data e hora
db_registro.serialize(() => {
    db_registro.run('CREATE TABLE IF NOT EXISTS registro (id INTEGER PRIMARY KEY, tipo TEXT, scherer INT, codigo TEXT, usuario TEXT, numero TEXT, data DATA, hora TIME)')
})

//Main:
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
                                let mensagem = `Bem vindo *${nome}*, para requisitar uma peça envie o código scherer referente com o comando *#* seguido do código.\n\n   (exemplo: *#19117*)`;
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
    else if (formata(msg.body).startsWith("#")) {
        console.log(logsView)
        let scherer = msg.body.split('#')[1]; 
        if (isNaN(scherer) === false && scherer.length <= 9) {
            buscaUsuario(msg.from.replace("@c.us", "")).then(async (row) => {
                if (row?.nome !== undefined) {
                    let nome = row.nome;
                    let pesquisa = await pesquisaScherer(scherer);
                    if (pesquisa.status === "invalido") {
                        let mensagem = `O código Scherer *${scherer}* pode não existir, verifique novamente.`;
                        client.sendMessage(msg.from, mensagem);

                    } else if (pesquisa.status === "down") {
                        client.sendMessage(msg.from, "Desculpe, o sistema de busca da Scherer em scherer-sa.com.br não está respondendo, portando não possibilita o uso por essa API.")

                    } else if (pesquisa.status === "valido") {
                        let mensagem = `*_Cod Scherer:_* ${pesquisa.scherer} \n\n*_Código da peça:_* ${pesquisa.codigo} \n\n*_Descrição:_* ${pesquisa.descricao} 
                        \n\n*Deseja requisitar esta peça?*\n*(S, N, F, M)*`
                        let chat = await msg.getChat();
                        const media = await MessageMedia.fromUrl(pesquisa.imgURL, 
                            {reqOptions:
                                {agent:
                                    httpsAgent // Injetando certificado manualmente para acessar o "db" scherer
                                } 
                            }).catch((erroimg) => {
                                console.erro(erroimg, "erro ao fazer a busca da imagem.")
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
        let dia = formata(msg.body).replace("informe ","");
        let datainforme = "";
        if (dia === "hoje") {
            datainforme = tempo("data");
        } else if (dia === "ontem") {
            datainforme = tempo("ontem");
        } else if (dia === "anteontem") {
            datainforme = tempo("anteontem");
        } else {
            datainforme = dia;
        }
        buscaRegistro(datainforme).then((rows) => {
            let lista = "";
            if (rows.length !== 0) {
                rows.forEach(obj => {
                    let mensagem = `${obj.tipo} *${obj.scherer}* *_${obj.usuario}_*\n${obj.codigo}\n\n`;
                    lista = lista + mensagem;   
                });
                client.sendMessage(msg.from, lista);     
            } else {
                client.sendMessage(msg.from, "Não existe registros na data informada, verifique se ela está no formato:\n\n*00/00/0000*");
            }
        }).catch((err) => {
            console.error(err)
            client.sendMessage(msg.from, "Erro ao acessar registro, verifique se a data informada está no formato:\n\n*00/00/0000*");
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
            client.sendMessage(msg.from, "Verifique se o nome do vendedor está correto, incluindo possíveis letras maiúsculas, espaços, e se o scherer informado está no formato numérico simples. \n\n (exemplo: *foto 19117 _Júnior .S_*)");
        }
        }).catch((err) => {console.error(err)});
    }

    else if (formata(msg.body).startsWith("msg")) {
        console.log(logsView)
        let vendedor = msg.body.substring(4).trim();
        if (msg.from === numeroTelefonista) {
            buscaUsuario(vendedor).then((row) => {
                if (row?.numero !== undefined) {
                    let numero = row.numero + "@c.us";
                    msgTempTel[msg.from] = {
                        vendedor: [vendedor],
                        numero: [numero]
                    }
                    client.sendMessage(msg.from, "Qual mensagem deseja enviar?");
                } else {
                    client.sendMessage(msg.from, "Verifique se o nome do vendedor está correto, incluindo possíveis letras maiúsculas e espaços.\n\n (exemplo: *msg _Júnior .S_*)");
                }
            }).catch((err) => { console.error(err)});
        } else {
            client.sendMessage(msg.from, "Este recurso é reservado apenas para usuários específicos da função.")
        }
    }
   
    else if (msgTempTel[msg.from] !== undefined) {
        console.log(logsView)
        if (msg.body.length < 100) {
            let mensagem = msg.body.trim();
            client.sendMessage(msgTempTel[msg.from].numero, `*Mensagem recebida:* _${mensagem}_`);
            client.sendMessage(msg.from, `Mensagem enviada com sucesso para ${msgTempTel[msg.from].vendedor}`);
            delete msgTempTel[msg.from];
        } else {
            client.sendMessage(msg.from, "Sua mensagem excede o limite de caracteres, tente outra.")
        }        
    }

});
   
process.on("SIGINT", async () => {
    console.log("(SIGINT) Encerrando cliente...");
    await client.destroy();
    process.exit(0);
    })
   
client.initialize();