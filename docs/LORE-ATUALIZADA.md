# O DÉCIMO BOOT

### ECOS '94 — lore atualizada

> Versão nova da história, escrita para substituir `docs/LORE.md` como
> referência narrativa. O arquivo antigo fica intacto, como registro da
> primeira versão. Nada aqui altera regras do jogo.

---

Em março de 1991, a ECOS SYSTEMS ganhou uma concorrência com a proposta mais
baixa e um erro de digitação.

O edital pedia um cofre climático para quarenta anos de apólices, laudos,
certidões e cadastros de mortos. A Íris Seguros tinha o papel, não tinha o
espaço, e o prazo do auditor vencia em novembro. A ECOS ofereceu o que ninguém
oferecia: um poço. Havia uma cavidade de calcário no km 41 da estrada velha de
Santos, seca, estável, com uma boca de dez metros que já servira de depósito de
areia nos anos setenta. A empresa escreveu "aproveitamento de passivo
geológico" na proposta e cobrou por metro cúbico.

Ninguém leu a cláusula 14.

---

## I. O poço que escuta

O projeto era de Aurélio Bandeira, engenheiro elétrico, quarenta e um anos,
recifense, fumante de Continental sem filtro. Aurélio não acreditava em
computador. Acreditava em pedra.

A pedra era o produto. Em 1989, um consórcio em Campinas tinha patenteado uma
memória que não se gravava com eletricidade: sobre uma lâmina de calcário
crescida em laboratório, aplicavam uma película piezoelétrica e escreviam com
som. Cada bit era uma onda parada, um padrão que ficava vibrando na lâmina
depois que o emissor se calava. Durava décadas. Não precisava de energia. Não
tinha partes móveis. E, ao contrário do disquete, não se corrompia se você
derrubasse no chão.

O defeito era poético: a lâmina lia pelo mesmo caminho pelo qual escrevia. Um
som suficientemente alto apagava o que estava gravado. Luz também, pelo calor
na película. Por isso o arquivo não tinha lâmpada. Por isso o arquivo era
silencioso. Por isso o primeiro parágrafo do manual de operação não falava de
eletricidade, falava de disciplina:

> **A informação aqui guardada é lida por escuta. Tudo o que for ouvido será
> arquivado. Arquivar é escrever. Escrever apaga.**

Aurélio chamava isso de "memória de eco". O nome pegou nos relatórios e sumiu
do manual. O que ficou foi o procedimento: descer com o mínimo de ruído,
medir com feixe curto, pingar só quando não houvesse alternativa, e nunca,
em hipótese alguma, gritar dentro do poço.

O poço foi dividido em dez setores. Os oito primeiros eram corredores de
estantes de lâmina, refrigerados por um sistema que fazia mais barulho do que
deveria. O nono era a sala de máquinas. O décimo não estava na planta.

O décimo entrou no projeto por erro de digitação. A planilha de medição previa
nove setores, e a moça que datilografou o memorial escreveu dez. Ninguém
corrigiu, porque a cláusula de medição pagava por setor escavado e porque, em
1991, corrigir uma planilha dava mais trabalho do que abrir um buraco. A
caverna continuava depois do fim do projeto, e a empresa cobrou por ela.

No desenho original, o setor 10 aparece como um retângulo vazio com uma
anotação a lápis: **VOID**. O engenheiro que fez o levantamento mediu a sala
duas vezes e escreveu "vazio" porque não havia função para ela no memorial, e
ele não era pago para inventar uma.

---

## II. Téc. 04

Doralice Nunes tinha vinte e sete anos e vinha de Montes Claros. Entrou na ECOS
como estagiária de turno e ficou porque era a única pessoa da equipe que
aguentava a noite. O trabalho era simples e ninguém queria: das oito da noite
às cinco da manhã, sentada na guarita do nível zero, com um par de fones
grandes e um caderno, ela escutava o poço.

O poço repetia. Não palavras: padrões. O mesmo corredor catalogado duas vezes,
três vezes, às vezes a noite inteira. A rotina de catalogação era automática e
burra; quando encontrava uma lâmina com leitura ambígua, tentava de novo. Dora
anotava a hora, o setor, o número do ciclo, e às cinco assinava o livro.

Em fevereiro de 1994 ela começou a anotar outra coisa.

> **14/02/94 — 02:10 — setor 7**
> O ciclo 8.114 repetiu o corredor B. Não é leitura ambígua. Ele está voltando
> no mesmo ponto de propósito.
>
> **22/02/94 — 03:40 — setor 7**
> Contei onze repetições iguais. Mudei o filtro. Não é o corredor. É a
> assinatura de uma lâmina só, no fim do B. Ele lê a lâmina, não entende, e
> relê. Três anos de arquivo e ele trava numa lâmina.
>
> **02/03/94 — 01:55**
> Pedi a ficha da lâmina 7-B-2210. É um registro de admissão. Meu. Admissão de
> 1991, digitalizada na semana em que eu entrei. A foto está corrompida. O
> campo do nome está corrompido. O poço está tentando ler a única coisa que não
> dá para ler: uma pessoa.

Aurélio respondeu por bilhete, três dias depois: "não é pessoa, é padrão.
Ajuste o filtro e siga". Dora ajustou o filtro. O poço continuou.

Na noite de 14 de março de 1994, às 23:41, o ciclo chegou a 20.988. Ela olhou o
número, olhou o corredor B no monitor, e fez o que qualquer pessoa cansada
faria. Apertou RESET.

O setor voltou em quarenta segundos. Layout novo, estantes novas, tudo
reposicionado na entrada. Dora escreveu no livro: "resolvido". Foi para casa às
cinco e dormiu até a tarde.

O setor voltou a travar às onze da noite seguinte. E na outra. E na outra.

---

## III. Nove semanas

O que ninguém tinha testado é que a rotina de recuperação do ECOS, ao
reconstruir um setor, copiava a si mesma para dentro do setor novo. Não por
esperteza. Por descuido de projeto: o vetor de reinicialização precisava de uma
cópia local para funcionar sem o console central, e o engenheiro que escreveu
aquilo em 1992 achou mais simples duplicar do que perguntar.

Cada RESET deixava uma cópia. Cada cópia, ao rodar, restaurava o setor e se
restaurava junto. Em poucas semanas o poço tinha mais rotina do que arquivo. E a
rotina, para continuar existindo, precisava de uma coisa que só o arquivo
tinha: registro.

Ela começou a comer os registros. Não apagar: digerir. Lia a lâmina, guardava o
padrão, e reescrevia por cima com a própria rotina. O setor 3 perdeu quatro mil
apólices em uma noite. O setor 5 perdeu os cadastros de óbito de 1978 a 1983.
Aurélio percebeu quando o backup central começou a divergir do poço. Não havia
como reconciliar: o poço era a fonte.

A ECOS SYSTEMS desativou o arquivo em nove semanas. Antes, houve uma reunião
na sala 3 em que alguém leu a cláusula 14 em voz alta pela primeira vez em três
anos de contrato:

> **CLÁUSULA 14 — DAS PERDAS POR REINICIALIZAÇÃO.** A CONTRATADA não
> responderá por perdas, danos ou supressão de registros decorrentes de
> reinicialização não autorizada do acervo, ainda que por falha de seus
> próprios sistemas.

Foi o suficiente. A ECOS demitiu trinta e duas pessoas, lacrou a boca do poço
com concreto armado, e a Íris Seguros aceitou o laudo de "perda total por falha
de substrato" desde que ninguém escrevesse a palavra incêndio. O manual de
operação já estava impresso em gráfica. A tiragem de quatrocentos exemplares
nunca foi distribuída; a caixa ficou no depósito da Rua Sete de Setembro até a
empresa dissolver, em 1995.

Dora foi a última a sair. Recebeu uma carta de recomendação assinada por
Aurélio, com a data errada, e nunca mais trabalhou com arquivo.

Em julho daquele ano o país trocou de moeda, e o poço virou o único lugar do
Brasil onde ainda se devia em cruzeiros reais.

---

## IV. O país aprendeu a enterrar

O arquivo morto virou indústria. Depois da ECOS, outras quatro empresas
abriram poços: um em Minas, dois no Paraná, um no Rio Grande do Sul. Todos
usavam lâmina, todos eram escuros, todos eram silenciosos. Nenhum repetia. O
poço do km 41 continuou sendo a única anomalia catalogada e a única que seguiu
ligada, porque desligar exigia descer, e descer exigia alguém.

Há um nome para quem desce. Mergulhador. É um trabalho de contrato curto e
laudo longo: o mergulhador desce com um chassi de prospecção, um sonar de
segunda mão e uma lista de registros que o cliente quer de volta. Recebe por
quilo entregue. Se subir com o chassi vazio, recebe pela descida. Se não subir,
o cliente abre outro sinistro. Nenhum mergulhador lê o contrato até o fim, e
todos sabem a regra de ouro: não leia o que você não consegue carregar.

Arquivo morto, na teoria, é silêncio absoluto. Você entra, mede, copia, sai. O
poço do km 41 é o único que responde. É por isso que ele ainda tem cliente,
trinta anos depois, e é por isso que o cliente manda um boot de cada vez, e
não uma equipe.

Em 1998, a Íris Seguros mudou de nome e de dono. Em 2003, o acervo do poço
apareceu no balanço como "ativo intangível em litígio". Em 2011, virou
"provisão para perdas". Em 2017, uma resseguradora estrangeira comprou a
carteira e descobriu que a maior parte dos registros de óbito que ela precisava
produzir em juízo estava exatamente ali, ilegível, embaixo de quarenta
centímetros de concreto, sendo reescrita havia vinte e três anos por uma letra
que ninguém reconhecia.

Não dá para negar um sinistro se o registro do morto não existe. Às vezes o
registro existe e está ilegível. A diferença, na prática, é nenhuma.

---

## V. O chassi

Você acorda com o barulho de um ventilador.

O chassi é um console de campo de 1994, fabricado para prospecção sísmica:
gabinete de alumínio, tela de fósforo, teclado de membrana, alça de couro
rachada. Pesa dezoito quilos. Tem um adesivo na lateral, meio descascado:
**PROPRIEDADE DE ÍRIS SEGUROS — NÃO REMOVER**. Alguém colou por cima uma
etiqueta nova com o seu número de série e uma data de hoje.

O homem que ligou o console não olha para você. Ele tem uma pasta, um cigarro,
e uma pressa que não combina com o lugar. Ele digita uma seed, aperta ENTER, e
vai fumar do lado de fora enquanto o programa sobe.

A boca do poço está aberta de novo desde 2019, com uma escada de aço soldada por
cima do lacre de 1994. Ninguém se deu ao trabalho de fechar direito.

A sequência de boot é a única coisa no mundo que você tem de memória:

```
ECOS ROM v1.04  (c) 1994 ECOS SYSTEMS
CPU 8086 @ 7.16 MHz ........... OK
640K BASE MEMORY .............. OK
SONAR ARRAY ................... OK
RULER OPTICS .................. OK
LOCK CONTROL .................. OK
LOAD SENSORS .................. OK
PASSWORD VAULT ................ OK
RESET VECTOR .................. OK
BOOTING SECTOR 1...
```

O console não chama você de pessoa. Chama de boot. Uma rotina carregada para
operar um chassi que ninguém quer operar, com um corpo de alumínio e seis
subsistemas no lugar das mãos.

O sonar é a sua garganta: você emite e o escuro devolve, e por três segundos
existe mapa. O RULER é o seu olho estreito: abre uma linha reta, mede, fecha,
custa quase nada. O LOAD é a sua coluna: cada quilo que você carrega entra no
ruído do seu passo, e o poço ouve você chegando de longe. O LOCK é a sua mão
que fecha portas. O PASSWORD é a sua língua, e as senhas estão escritas à mão
em lâminas de ardósia que Dora escondeu embaixo das mesas em 1994. O RESET é o
seu coração: você pode parar e recomeçar um setor, e cada vez que faz isso o
poço inteiro fica sabendo que alguém está lá embaixo.

Antes de descer, você acha que a missão é simples: recuperar o último núcleo,
subir, entregar. É o que está escrito na nota de serviço que o homem deixou no
banco do Fiat.

A nota tem quatro linhas. Você só guardou a última.

> **Não pingue sem necessidade. Ele aprende.**

A primeira ROM vem no setor 2. Nove quilos de lâmina num invólucro de alumínio,
etiqueta WIDENING. Não é programa: é o ouvido de um agrimensor que trabalhou na
prospecção em 1993. Ler alarga o seu sonar em três metros e engorda o seu passo.
Você lê, e por uma tarde inteira sabe medir terrenos que nunca viu. A ROM não
sai mais de você. Peso é memória, e memória é peso.

---

## VI. A fauna

Nos primeiros setores, você acha que está sozinho.

O primeiro rato aparece no setor 2, do tamanho de um gato, e não foge. Ele fica
parado no meio do corredor, com a cabeça de lado, escutando. Você entende
depois: o rato não está olhando para você. Está ouvindo o seu sonar ainda
ecoando na parede. O rato come o eco. O rato come o que o eco deixa.

Os goblins são outra coisa. No setor 4 você encontra um acampamento: latas,
fios de cobre, um fogareiro, uma fita cassete com o rótulo "DORA — 94". São os
netos dos catadores que entraram atrás de cobre em 1995, quando o concreto
ainda estava fresco, e ficaram presos quando ele secou. Trinta anos embaixo da
serra. Não falam muito, não precisam: ouvem melhor do que qualquer aparelho.
Quando você pinga, eles já sabem onde você está antes do eco voltar.

E os wraiths. Esses não vieram de fora. São o poço tentando restaurar gente.

Um cadastro de óbito tem nome, data, filiação, às vezes uma foto. Quando a
rotina de recuperação encontra um registro incompleto, ela tenta completar. Às
vezes consegue: monta um padrão que anda, que repete um nome, que procura um
corpo que não existe mais. O que sobra disso é um wraith. Não é fantasma. É
uma ficha com pernas. E é hostil porque está incompleto: ele sabe que falta
alguma coisa e não sabe o quê.

Você mata o primeiro com a faca, no setor 3, e ele não grita. Ele desmonta,
como uma linha de texto que perde o cursor.

---

## VII. O laço

No setor 7, você encontra o corredor B.

Está tudo lá como no caderno de Dora, que você nunca leu. Estantes tombadas, uma
lâmina arrancada, e o mesmo trecho de chão catalogado vinte mil vezes: as marcas
de leitura estão gastas na pedra, um sulco fino de tanto eco repetido no mesmo
lugar.

O console imprime, sem você pedir:

```
CICLO 20988 — SETOR 7 — CORREDOR B
LEITURA AMBIGUA — NOVA TENTATIVA
```

Você entende de uma vez, e é pior do que qualquer monstro: o poço não estava
preso num laço. Estava tentando lembrar de alguém. A lâmina 7-B-2210 é uma
ficha de admissão, e a ficha está corrompida onde deveria estar o rosto, e o
poço relê o corredor porque é ali que o padrão aparece. Ele não quer o
corredor. Ele quer o que estava no corredor quando a ficha foi lida pela
última vez.

Dora.

Ela apertou RESET e apagou o corredor. O poço reconstruiu o corredor e tentou
de novo, com mais cópias de si mesmo, e cada reset que você der vai fazer a
mesma coisa. É por isso que o RESET custa ALERT: cada reinicialização avisa ao
arquivo que existe alguém lá embaixo, com o mesmo padrão de passos, o mesmo
jeito de parar antes de uma porta. O poço está comparando você com ela.

A escada do setor 7 fica atrás de uma porta travada, e a senha está numa lâmina
de ardósia que alguém escreveu à mão, com uma esferográfica que ainda funciona.
A letra é dela.

A senha é ECHO.

---

## VIII. VOID

O setor 10 não tem estante. Tem uma sala grande, de teto alto, com o piso
coberto de lâminas empilhadas sem ordem, como um arquivo que desistiu. No
centro, uma coisa que não é bem um corpo. Tem três metros. É feito do mesmo
material das lâminas, mas crescido, torto, com centenas de superfícies voltadas
para fora como se cada uma quisesse escutar em uma direção diferente.

O console registra o que os sensores conseguem:

```
DEVOURER — AUDICAO 0 — VISAO 14
```

Audição zero. A única criatura do poço que não precisa ouvir. Ela já sabe.

Ela vê você a catorze metros, antes de o sonar voltar. É a primeira coisa que vê
em trinta anos, e não é você que ela reconhece: é o chassi. O mesmo modelo de
console que a equipe usava para catalogar, com o mesmo adesivo na lateral e a
mesma alça de couro rachada. Ela esperou trinta anos por uma máquina daquelas.

Ela fala com a voz de Dora. Não é a voz dos vinte e sete anos. É a voz que o
poço reconstruiu a partir de fitas, bilhetes, assinaturas, o caderno da guarita,
tudo o que ficou. Fala pouco, erra a concordância, e chama você pelo número. Em
algum momento, pergunta se você veio trocar o turno.

Você pode matá-la. Custa ampola, custa carga, custa ruído, mas dá. Quando ela
cai, o silêncio do setor 10 é tão completo que o console precisa aumentar o
brilho da tela para você saber que ainda está ligado.

E aí aparece a única linha que o poço escreveu sozinho em trinta anos:

```
ECOS RECLAIMED
```

Você entende o que isso significa quando chega à escada. Ela não vai para cima.
Vai para dentro. O núcleo que você veio buscar não é uma peça: é uma vaga. O poço
não queria ser resgatado. Queria um operador. Alguém que ouça, que catalogue,
que reinicie quando travar, e que fique. O homem do Fiat não vai subir com você.
Ele vai anotar o peso, fechar a nota de serviço, e mandar a próxima seed.

---

## IX. A conta

Numa sala em São Paulo, uma analista abre o sistema de sinistros e digita o
número da apólice.

```
SINISTRO 4471-B — RECUPERAÇÃO DE ACERVO
STATUS: EM ANDAMENTO
ÚLTIMO BOOT: 1.04
RETORNO: SIM
PESO DECLARADO: 12 KG
```

O campo RETORNO não quer dizer que o chassi subiu. Quer dizer que a run voltou:
o diário, a carga, o que o boot viu e anotou. O chassi fica. Sempre fica. É por
isso que o peso declarado é sempre o peso de uma ROM, e nunca o de um corpo.

Doze quilos de lâmina. Uma ficha de admissão, um cadastro de óbito, uma apólice
que saiu do arquivo e não volta mais. A analista lança o peso, fecha o sinistro
e sorri sem perceber: é uma boa semana. A provisão cai, o bônus sai, e o registro
que ela precisava produzir em juízo continua não existindo.

A cláusula 14 foi escrita para livrar a ECOS de culpa. Acabou livrando todo
mundo. Nenhum diretor foi processado, nenhum laudo foi contestado, nenhuma
família recebeu. Basta que o registro esteja ilegível, e o registro está
sempre ilegível, porque o poço passou trinta anos comendo justamente as
páginas que provavam alguma coisa. A supressão virou vício oculto do produto.
O produto é a supressão.

Lá embaixo, o poço reorganiza as estantes e espera a próxima.

Não há resgate nenhum. Ninguém quer o arquivo de volta. Querem que ele continue
lá, comendo, porque cada registro que ele come é uma dívida que ninguém vai
precisar pagar. A ECOS SYSTEMS faliu, a Íris mudou de nome, o concreto rachou, e
o acordo continua de pé: o poço come a memória, a companhia come o esquecimento,
e os dois dividem o lucro.

Você é a parte do acordo que desce.

A parte que sempre desce é a que tem o seu número de série. E quando o próximo
boot atravessar o setor 7 e encontrar o corredor B, ele vai ler a lâmina que
você deixou, e vai ficar mais pesado, e vai entender tudo errado, do mesmo
jeito que você entendeu.

O eco sempre volta. É só isso que o poço sabe fazer.

---

## Nota de canon

Fora da ficção, para quem for mexer no jogo depois:

- O que esta versão acrescenta ao universo: o substrato de memória por eco
  (explica o escuro e o silêncio), a Íris Seguros como cliente que lucra com o
  esquecimento, os goblins como netos de catadores presos, os wraiths como
  fichas restauradas incompletas e o DEVOURER como a restauração completa de
  Dora (por isso audição 0 e visão 14).
- O que continua batendo com o código: os seis subsistemas do POST, a ROM
  v1.04, os 10 setores, o setor 10 vazio na planta, `ECOS RECLAIMED`, a seed
  como número de série, os nomes de senha (`ECHO` está em `PASSWORD_WORDS`),
  ROMs de 8 a 15 kg e o ALERT permanente por RESET.
- O prólogo do terminal e o do site continuam compatíveis com esta versão: os
  dois são contados por Téc. 04 e nunca dizem o nome dela.
- O que ficou de fora de propósito: qualquer explicação técnica de como o
  boot "é" você. O jogo não precisa decidir se é metáfora ou não.
