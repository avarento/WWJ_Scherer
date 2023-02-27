<h1>Robô Scherer FISA</h1>
Pequeno projeto para automatizar e facilitar a relação entre vendedor e o auxiliar de estoque responsável por levar ou
verificar alguma peça requerida a ele.

<h2>Contexto</h2>
A <a href="https://www.scherer-sa.com.br/">Scherer Autopeças</a> é uma gigante empresa do
mercado de reposição de autopeças com dezenas de filiais espalhadas pelo sul do Brasil. 
Fazem parte da estrutura de uma filial, o estoque e uma sala de vendas. Sendo do cotidiano de um vendedor sanar as necessidades dos clientes
com o pruduto extritamente compatível com suas aplicações, medidas ou uso.<br><br>

Em alguns casos as informações que estão contidas no sistema interno não são suficientes para certificar todas as características de uma peça, logo ela
é requerida para analise em mãos via uma ligação a um auxiliar de estoque que anota o código scherer (código interno) e o nome do vendedor para quem ele irá
levar a peça. Essa função pode ser descrita no seguinte processo:
<ul>
  <li>Estar atento as ligações, manter o telefone com carga, ligado e ao alcance.
  <li>Manter um bloco de anotações para registro das requisições.<br>
  (requisições essas que podem ser usadas para análise pelo motivo descrito posteriormente)
  <li>Se necessário verificar a existência do código informado, sua localização ou outra informação da peça em um computador disponível. 
</ul>
<b>Nota:</b><br>
[Após a análise feita pelo vendedor, a peça é deixada em uma caixa para que o auxiliar responsável, com o conhecimento
dos processos de armazenagem que estão sempre sendo atualizados para otimizar espaço e organização, faça novamente o armazenamento destas peças sempre
que possível. No período de tempo que peças acomulam nesta caixa, algumas delas podem ser a única unidade da filial. Se ela então é vendida, no momento da
separação das peças do pedido feito pelo cliente, essa peça única estará fora do lugar e não será encontrada no processo de busca da mesma.
Quando uma peça pode se encaixar neste caso, no meio da busca por ela é pergutado ao auxiliar responsável pelo telefone se ele a levou a algum vendedor
(verificando os registros do bloco), caso sim, então provavelmente estará na caixa de sobras das vendas ou de posse do vendedor.]

<br><h2>Análise de eficiência</h2>
Alguns pontos podem ser discutidos para explicar as vantagem de se aplicar esse sistema automatizado sobre o atual:<br>
<ul>
  <li>Independe do telefone não estar em outra ligação ou o aparelho móvel estar em condições para receber a chamada,
  já que o sistema automatizado estará disponível 24h para requisições simultâneas na nuvem.
  <li>Aplicando os princípios da comunicação efetiva se extingue erros de entendimento nessa conversação. O código é verificado no site e então é
  retornado uma mensagem de confirmação contendo foto, código interno, código da peça e descrição para tornar a requisição acertiva.
  <li>A lista de requisições enviada ao auxiliar contém juntamente ao código interno e o nome do vendedor, o código da peça que torna possível se ter 
  uma idéia da natureza dela. (TECFIL PSL545, O prefixo PSL indica um filtro hidráulico de óleo Tecfil que está em uma seção diferente dos filtros de ar
  da mesma marca que contêm outros prefixos como ACP, ARS, ARL. Poupando o tempo da busca dessas informações em um computador disponível).
  <li>O armazenamento dessas requisições pode se tornar alvo de futuras análises de dados para obter informações de peças mais requisitadas, horários e datas  que essas requisiçoes são mais comuns ou além.
  <li>Possibilita que o auxiliar envie fotografias ou mensagens requisitadas sobre as peças para os vendedores sem a necessidade de gerenciar contatos e várias conversas simultâneas.
  <li>Com o recebimento das requisições sendo automatizadas, apenas será necessário a execução delas, reduzido assim o trabalho e tempo gasto nessa função pelo auxiliar, trabalho e tempo esses que agora podem ser realocados em outras responsabilidades.
</ul>
<h2>Comandos de uso</h2>
tabela
