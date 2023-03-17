const qrcode = require('qrcode-terminal');
const sqlite3 = require('sqlite3');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const { contato, formata, tempo, validaString, formataTelefone, buscaRegistro, buscaRegistroPorScherer, buscaUsuario, pesquisaScherer, salvaRegistro, salvaUsuario, salvaConfig, buscaConfig, alteraConfig, buscaAllConfigs } = require('./scherer_modules/functions');
const { db_registro, db_usuarios, db_config, httpsAgent, nomeTemp, listaTemp, msgTemp, msgTempTel, opcoes } = require('./scherer_modules/database');
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

//Cria tabela "config" com as colunas id, chave e valor
db_config.serialize(() => {
    db_config.run('CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY, chave TEXT, valor INT)')
})

const configs = {
    adm: "",
    range_inicial: "",
    range_final: "",
    telefonista: "",
    adm2: "",
    telefonista2: ""
}

async function atualizaConfigs() {
    buscaAllConfigs().then((rows) => {
        if (rows.length === 0) {
            salvaConfig("adm", 0);
            salvaConfig("range_inicial", 0);
            salvaConfig("range_final", 0);
            salvaConfig("telefonista", 1);
            salvaConfig("adm2", 0);
            salvaConfig("telefonista2", 1);
            configs.adm = 0;
            configs.range_inicial = 0;
            configs.range_final = 0;
            configs.telefonista = 1;
            configs.adm2 = 0;
            configs.telefonista2 = 1;
            console.log(configs)
            console.log("Configurações zeradas aguardando entrada.")
        } else {
            configs[rows[0].chave] = rows[0].valor;
            configs[rows[1].chave] = rows[1].valor;
            configs[rows[2].chave] = rows[2].valor;
            configs[rows[3].chave] = rows[3].valor;
            configs[rows[4].chave] = rows[4].valor;
            configs[rows[5].chave] = rows[5].valor;
            console.log(rows, configs)
            console.log("Configurações atualizadas.")
        }    
    });
}
atualizaConfigs();


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
    if (formata(msg.body) === 'cadastrar' && msg.author === undefined) {
        console.log(logsView)
        let numero = msg.from.replace("@c.us", "");
        if (numero <= configs.range_final && numero >= configs.range_inicial) { //Se o numero estiver dentro do range de ramais usando na FISA
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
    else if (formata(msg.body) === 'sudocadastrar' && msg.author === undefined) {
        console.log(logsView)        
        nomeTemp[msg.from] = 0;             
        let numero = formataTelefone(msg.from);        
        let mensagem = `Olá ${numero}, envie um nome para vincular a esse número no registro de usuários.`;
        client.sendMessage(msg.from, mensagem);     
    }

    //gatilho para receber o nome de usuario enviado após "cadastrar" (etapas: valida regexp, verifica se existe registro no numero, depois se existe esse nome em outro numero)
    else if (nomeTemp[msg.from] === 0 && msg.author === undefined) {
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
            client.sendMessage(msg.from, "O nome informado deve ter entre 6 a 20 caracteres, tente outro.");
        }
    } 
 
    //requerimento de peça por scherer (#19117), retornando as informações na mensagem com opções s/n/f/m e salvando as informações da requisições em listaTemp para na próxima mensagem resolver o destino dessa requisição
    else if (formata(msg.body).startsWith("#") && msg.author === undefined) {
        console.log(logsView)
        let scherer = msg.body.split('#')[1]; 
        console.log(scherer)
        if (isNaN(scherer) === false && scherer.length <= 9 && scherer.includes("#") === false && scherer !== "") {
            buscaUsuario(msg.from.replace("@c.us", "")).then(async (row) => {
                if (row?.nome !== undefined) {
                    let nome = row.nome;
                    try {
                        let pesquisa = await pesquisaScherer(scherer);
                        if (pesquisa.status === "invalido") {
                            let mensagem = `O código scherer *${scherer}* pode não existir, verifique novamente.`;
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
                            }).catch((erroimg) => { console.erro(erroimg, "erro ao fazer a busca da imagem.")});
                            chat.sendMessage(media, {caption: mensagem});
                            listaTemp[msg.from] = {
                                usuario: nome,
                                scherer: pesquisa.scherer,
                                cod: pesquisa.codigo                    
                            }
                            console.log(listaTemp[msg.from])
                        }
                    } catch (error) {
                        console.error("ERRO PESQUISA SCHERER", error.AxiosError, error.code)
                        client.sendMessage(msg.from, "Desculpe, o sistema de busca da Scherer em scherer-sa.com.br não está respondendo, portando não possibilita o uso por essa API.")
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
    else if (opcoes.includes(formata(msg.body)) && listaTemp[msg.from] !== undefined && msg.author === undefined) {
        let opcao = formata(msg.body);
        if (opcao === "s") { //Adiciona a lista do telefonista
            console.log(logsView)
            salvaRegistro("⚙️", listaTemp[msg.from].scherer, listaTemp[msg.from].cod, listaTemp[msg.from].usuario, formataTelefone(msg.from), tempo("data"), tempo("hora")).catch((erro) => console.error(erro));
            client.sendMessage(msg.from, "Peça requisitada com sucesso.");
            buscaRegistro(tempo("data")).then((rows) => {
                var lista = "📥 _*Lista de requisição*_ 📤\n\n";
                rows.forEach(obj => {
                    let mensagem = `${obj.tipo} *${obj.scherer}* *_${obj.usuario}_*\n${obj.codigo}\n\n`;
                    lista = lista + mensagem;   
                });
                
                client.sendMessage(contato(configs.telefonista), lista);

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
                var lista = "📥 _*Lista de requisição*_ 📤\n\n";
                rows.forEach(obj => {
                    let mensagem = `${obj.tipo} *${obj.scherer}* *_${obj.usuario}_*\n${obj.codigo}\n\n`;
                    lista = lista + mensagem;   
                });
                client.sendMessage(contato(configs.telefonista), lista);
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
    else if (msgTemp[msg.from] !== undefined && msg.author === undefined) {
        console.log(logsView)
        if (msg.body.length < 100) {
            salvaRegistro("✉️", listaTemp[msg.from].scherer, msg.body.trim(), listaTemp[msg.from].usuario, formataTelefone(msg.from), tempo("data"), tempo("hora")).catch((erro) => console.error(erro));
            client.sendMessage(msg.from, "Mensagem enviada em anexo ao scherer com sucesso.");
            delete msgTemp[msg.from];
            buscaRegistro(tempo("data")).then((rows) => {
            let lista = "📥 _*Lista de requisição*_ 📤\n\n";
            rows.forEach(obj => {
                let mensagem = `${obj.tipo} *${obj.scherer}* *_${obj.usuario}_*\n${obj.codigo}\n\n`;
                lista = lista + mensagem;   
            });
            client.sendMessage(contato(configs.telefonista), lista);
            }).catch((err) => {
                console.error(err)
            });
        } else {
           client.sendMessage(msg.from, "Sua mensagem excede o limite de caracteres, tente outra.")
        }    
    }

    //se msg iniciar com "informe " (com espaço no final) para retornar a lista do dia (no formato xx/xx/xxxx):
    else if (formata(msg.body).startsWith('informe ') && msg.author === undefined) {
        console.log(logsView)
        let dia = formata(msg.body).replace("informe ","").trim();
        let datainforme = "";
        if (dia === "hoje") {
            datainforme = tempo("data");
        } else if (dia === "ontem") {
            datainforme = tempo("ontem");
        } else if (dia === "anteontem") {
            datainforme = tempo("anteontem");
        } else {
            const validaData = (data) => {
                let date = new Date(data);
                return !isNaN(date.getTime());
            }
            datainforme = validaData(dia) ? dia : "invalido"; 
        }
        if (datainforme !== "invalido" && datainforme.length == 10) {
            buscaRegistro(datainforme).then((rows) => {
                let lista = "📥 _*Lista de requisição*_ 📤\n\n";
                console.log(rows)
                if (rows.length !== 0) {
                    
                    rows.forEach(obj => {
                        let mensagem = `${obj.tipo} *${obj.scherer}* *_${obj.usuario}_*\n${obj.codigo}\n\n`;
                        lista = lista + mensagem;   
                    });
                    client.sendMessage(msg.from, lista);     
                } else {
                    client.sendMessage(msg.from, "Não existe registros na data informada.");
                }
            }).catch((err) => {
                console.error(err)
                client.sendMessage(msg.from, "Erro ao acessar registro, verifique se a data informada está no formato:\n\n*dd/mm/aaaa*");
            });
        } else {
            client.sendMessage(msg.from, "Verifique se a data informada está no formato:\n\n*dd/mm/aaaa*");

        }
    } 

    //foto scherer vendedor >>> comando na descrição da mensagem para enviar a foto para o vendedor informando o scherer da peça 
    else if ((msg.body.trim().startsWith("foto ") || msg.body.trim().startsWith("Foto ")) && msg.hasMedia && msg.author === undefined) { 
        console.log(logsView)
        if (msg.from === (contato(configs.telefonista) || contato(configs.telefonista2))) {
            let splited = msg.body.trim().substring(5).split(" "); //19117 Gustavo S
            let scherer = splited[0];
            let vendedor = msg.body.trim().substring(5).replace(scherer, "").trim();
            console.log(splited, "s:", scherer, "vend:", vendedor)
            buscaUsuario(vendedor).then(async (row) => {
                console.log(row)
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
        } else {
            client.sendMessage(msg.from, "Este recurso é reservado apenas para usuários específicos da função.")
        }
    }

    else if (formata(msg.body).startsWith("msg ") && msg.author === undefined) {
        console.log(logsView)
        let vendedor = msg.body.substring(4).trim();
        if (msg.from === (contato(configs.telefonista) || contato(configs.telefonista2))) {
            buscaUsuario(vendedor).then((row) => {
                if (row?.numero !== undefined) {
                    let numero = row.numero + "@c.us";
                    msgTempTel[msg.from] = {
                        vendedor: vendedor,
                        numero: numero
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
   
    else if (msgTempTel[msg.from] !== undefined && msg.author === undefined) {
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
    
    else if (formata(msg.body).startsWith("busque ") && msg.author === undefined) {
        let scherer = formata(msg.body).substring(7);
        console.log(scherer)
        buscaRegistroPorScherer(scherer).then((rows) => {
            let lista = "📄 _*Últimas requisições:*_ 📄\n\n";
            if (rows.length !== 0) {
                rows.forEach(obj => {
                    let mensagem = `*${obj.usuario}* _${obj.data} ${obj.hora}_\n\n`;
                    lista = lista + mensagem;   
                });
                client.sendMessage(msg.from, lista);     
            } else {
                client.sendMessage(msg.from, "Não existe registros do scherer informado.");
            }
        }).catch((err) => { console.error(err)});  
    }

    else if (formata(msg.body).startsWith("show ") && (contato(msg.from) == configs.adm || configs.adm == 0) ) {
        console.log(logsView)
        let chave = formata(msg.body).substring(5).trim();
        let opcoesChave = ["adm", "range_incial", "range_final", "telefonista", "adm2", "telefonista2"];
        if (opcoesChave.includes(chave)) {
            buscaConfig(chave).then((row) => {
                console.log(row)
                if (row.valor == 0) {
                    client.sendMessage(msg.from, `A chave *${chave}* ainda não está registrada.`)
                } else {
                    client.sendMessage(msg.from, `O valor da chave *${row.chave}* é *${row.valor}*`)
                }
            }).catch((err) => { console.error(err) });
        } else {
            client.sendMessage(msg.from, `A chave deve estar na lista de chaves disponíveis para uso.`)
        }
    }

    else if (formata(msg.body).startsWith("set ") && (contato(msg.from) == configs.adm || configs.adm == 0)) {
        console.log(logsView)
        let splited = formata(msg.body).split(" ");
        let chave = splited[1].trim();
        let valor = splited[2].trim();
        let opcoesChave = ["adm", "range_incial", "range_final", "telefonista", "adm2", "telefonista2"];
        if (opcoesChave.includes(chave) && !isNaN(valor)) {
            buscaConfig(chave).then((row) => {
                if (row?.valor == 0) {
                    alteraConfig(chave, valor).catch((err) => console.error(err));/////////
                    client.sendMessage(msg.from, `A chave *${chave}* foi registrada com o valor *${valor}*`);
                    atualizaConfigs();
                } else {
                    alteraConfig(chave, valor).catch((err) => console.error(err));
                    client.sendMessage(msg.from, `A chave *${chave}* com valor *${row.valor}* agora possui o valor *${valor}*`);
                    atualizaConfigs();
                }
            })
        } else {
            client.sendMessage(msg.from, `O valor informado deve ser apenas numérico e a chave deve estar na lista de chaves disponíveis para uso.`)
        }
    }

    else if (msg.body === "reset_all_system") {
        client.sendMessage(msg.from, "Reiniciando sistema --force");
        console.log("--FORCE Encerrando cliente...");
        await client.destroy();
        process.exit(0);
    }
  
});

process.on("SIGINT", async () => {
    console.log("(SIGINT) Encerrando cliente...");
    await client.destroy();
    process.exit(0);
    })
   
client.initialize();