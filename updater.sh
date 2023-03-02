#!/bin/bash
pm2 stop 0
echo "(1/7) - Processo parado"
npm install -g npm 
echo "(2/7) - NPM atualizado"

npm update node
echo "(3/7) - Node atualizado"

npm update
echo "(4/7) - NPM list atualizado"

git pull origen master
echo "(5/7) - Repositório atualizado"

git add registro.db usuarios.db
git commit -m "update Registro e Usuarios" && git push -u origen master
echo "(6/7) - Banco de dados salvo"



pm2 start index
echo "(7/7) - Processo iniciado"


