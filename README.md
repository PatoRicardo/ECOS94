# ECOS '94

Roguelike ASCII por turnos, jogado **inteiramente em um terminal de verdade**, com a estética de um jogo de MS-DOS de 1994.

Você desce por 10 setores de um sistema decommissionado. Não há lanterna — há um **sonar**. Cada ping revela o escuro ao redor, mas o ruído que ele gera atrai tudo que vive lá embaixo.

> **Toda informação tem preço em ruído. Ruído atrai.**

Python 3 puro, **sem nenhuma dependência externa**. Sem `pip install`, sem build, sem engine gráfica.

---

## Como rodar

**Jeito mais fácil:** duplo clique em `run.bat`.

**Pelo terminal:**

```bat
cd C:\Users\n0t.berna\Desktop\ECOS94
python -m ecos
```

O jogo usa a tela inteira (buffer alternativo do console) e lê o teclado sem esperar ENTER. Se rodar num terminal sem suporte a sequências ANSI, ele avisa e sai — em vez de quebrar.

### Opções de linha de comando

| Opção | Efeito |
|---|---|
| `--phosphor green` | Paleta de fósforo verde (também `amber` e `white`) |
| `--no-scanlines` | Desliga as scanlines horizontais |
| `--seed N` | Fixa a seed da run: mesmo mapa, mesmo loot, mesma IA |
| `--cp437` | Usa a página de código 437 do DOS (glifos de caixa desenhada) |
| `--mute` | Desliga o áudio |

A paleta e o modo fósforo também podem ser alternados **em tempo real**, pelo menu de título.

---

## Controles

Movimento: setas, `WASD`, `hjkl`, vi-keys `yubn` e numpad.

Comandos são **maiúsculas** (o que separa comando de movimento no mesmo teclado); as minúsculas são atalhos para os mais usados:

| Tecla | Ação |
|---|---|
| `S` (`p`) | Ping do sonar — revela um círculo, custa 30 de ruído |
| `M` (`m`) + direção | Usar o RULER — mede uma linha reta, custa 2 de ruído |
| `L` / `U` | Trancar / destrancar a porta ao lado |
| `G` (`g`) | Pegar item do chão |
| `I` (`i`) | Inventário / usar consumível |
| `D` | Largar item |
| `X` (`x`) | RESET do setor (custa ALERT +1 permanente) |
| `B` | Força bruta na porta travada |
| `.` | Esperar 1 turno |
| `?` | Ajuda |
| `Q` (`q`) | Voltar ao menu / sair |
| `Esc` | Cancelar prompt / fechar painel |

---

## Os seis subsistemas

| Subsistema | O que é |
|---|---|
| **LOAD** | A massa que você carrega (kg). Define quanto ruído cada passo seu produz — e, em sobrecarga, os monstros ganham um turno extra. |
| **RULER** | Medidor. Dispara um feixe reto de 1 tile e imprime a distância. A alternativa silenciosa ao sonar: 2 de ruído em vez de 30. |
| **LOCK** | Portas em três estados (OPEN / CLOSED / LOCKED). Você tranca e destranca; monstros arrombam. Serve para selar corredores e prender inimigos. |
| **PASSWORD** | Portas travadas pedem senha. As senhas ficam em itens SLATE. Três tentativas erradas de força bruta triggers um PURGE: a porta explode e dois monstros brotam. |
| **ROM** | 10 upgrades permanentes, 3 slots, não-dropáveis, 8–15 kg cada. O único item irreversível do jogo. |
| **RESET** | Regenera o setor. Você mantém inventário, ROMs e HP — mas o ALERT global sobe para sempre, e todo monstro do mundo fica mais rápido e mais audível. |

O eixo que amarra tudo: **LOAD compete com ROM** pelo mesmo recurso (peso), **RULER compete com PING** pelo mesmo recurso (informação por ruído), e **LOCK / PASSWORD / ALERT** formam a dimensão de risco.

---

## Estrutura do projeto

```
ECOS94/
├── run.bat              launcher (python -m ecos)
├── ecos/                o jogo — 13 módulos, stdlib only
│   ├── terminal.py      VT via ctypes, buffer alternativo, leitura de tecla cru
│   ├── render.py        paleta VGA de 16 cores, modo fósforo, framebuffer
│   ├── view.py          mapa, HUD, log e painéis
│   ├── rng.py           gerador determinístico isolado por sistema
│   ├── data.py          monstros, itens, ROMs, tabelas de spawn e ruído
│   ├── entities.py      Player, Monster, Item, Rom
│   ├── dungeon.py       geração de setor: salas, corredores, lacos, cofre
│   ├── sonar.py         revelação circular, memória de tiles, feixe do RULER
│   ├── status.py        ruído, dano, ALERT, efeitos de ROM
│   ├── ai.py            turno dos monstros: hearing, sight, comportamento
│   ├── actions.py       a classe Game: cada comando do jogador
│   ├── audio.py         PC speaker: beeps e WAV sintetizado em memória
│   └── main.py          boot falso de BIOS, menu de título, loop principal
├── tools/                ferramentas de validação (não fazem parte do jogo)
│   ├── simulate.py      suíte de testes headless + bot que joga sozinho
│   ├── duel.py          duelo 1x1 por profundidade e tabela do chefe
│   └── balance.py       grade paramétrica de balanceamento
└── docs/
    ├── ECOS94.docx              manual do jogo
    └── RELATORIO-DE-TRABALHO.docx  relatório de trabalho
```

---

## Validação

O jogo roda inteiro sem terminal. A suíte abaixo exercita geração, comandos, descida, reprodutibilidade por seed, render em todos os modos de cor, compatibilidade CP437, limpeza visual (RESET e fechamento de painel), o loop principal completo e um bot que joga sozinho:

```bat
python tools/simulate.py
```

Saída esperada: `TODAS AS VERIFICACOES PASSARAM`.

Outros dois utilitários:

```bat
python tools/duel.py      REM taxa de vitória em duelo 1x1 e a curva do chefe
python tools/balance.py   REM grade de balanceamento (varia HP, cura, armadura, visão, ataque)
```

O bot da suíte é um jogador **mediano**: ele desce direto, briga com tudo que encontra e pinge demais. Na versão final ele vence 1 run a cada 12 e chega em média ao setor 7 — a evidência de que o jogo é vencível, já que um humano com RULER, portas, SHOCKER, ROMs e disciplina de ruído joga bem melhor.

---

## Detalhes que importam

- **O HUD se adapta**: em terminais de 80 colunas (o tamanho clássico do DOS) ele usa um formato compacto; a partir de 108 colunas entra o layout completo com as duas barras.
- **Três níveis de memória por tile**: desconhecido, lembrado (cinza) e iluminado (branco). Lembrar de uma sala não é ver o que está nela agora.
- **A seed é o save**: mesma seed, mesmo mapa, mesmo loot, mesmo comportamento de IA. Dá para compartilhar um mapa como um "cruzado" de TAB-como-tipo.
- **O chefe é o teste do build**: em duelo 1x1, com a DAGGER é impossível (0%), com CLEAVER + PLACA você vence 84% das vezes e com CLEAVER + PLACA + o ROM PARITY é garantido (100%). No setor 10 tem 2 ou 3 RAT GIANTS junto, então a vida extra importa.
- **A tela é limpa a cada quadro**: um RESET apaga o setor anterior de verdade (você fica no escuro, só enxergando o pedaço ao redor) e fechar um painel não deixa sombra no mapa.

---

## Licença

MIT — veja o arquivo [LICENSE](LICENSE).
