#!/bin/bash
pm2 stop 0
echo "(1/6) - Processo parado"
npm install -g npm 
echo "(2/6) - NPM atualizado"
npm update node
echo "(3/6) - Node atualizado"
npm update
echo "(4/6) - NPM list atualizado"
git pull origen master
echo "(5/6) - Repositório Atualizado"
pm2 start index
echo "(6/6) - Processo iniciado"
