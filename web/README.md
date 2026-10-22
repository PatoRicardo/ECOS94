# ECOS '94 — WEB

Porte jogável no navegador do ECOS '94 original em Python. Mesma lógica de
setores, ruído, sonar, RULER, portas, senhas, ROMs, RESET e IA — agora em
canvas + DOM, sem dependências e sem build.

**Desktop e mobile.** No celular aparecem o D-pad, `INTERACT` e `INVENTORY`.

---

## Como rodar

O jogo usa módulos ES, então precisa de um servidor HTTP (não abra
`index.html` com duplo clique).

**Windows:** duplo clique em `web\run.bat`.

**Manual:**

```bat
cd web
python -m http.server 8765
```

Depois abra <http://localhost:8765/>.

Qualquer servidor estático funciona (`npx serve`, `php -S`, etc.).

---

## GitHub Pages

O site é publicado pelo workflow `.github/workflows/pages.yml`, que envia o
conteúdo de `web/` como artifact. Não há build: o Pages serve os arquivos
estáticos diretamente, com os caminhos relativos funcionando sob `/ECOS94/`.

1. No repositório, abra **Settings → Pages**.
2. Em **Build and deployment → Source**, selecione **GitHub Actions**.
3. Faça push em `master` ou `feat/web` alterando `web/**`, ou rode o workflow
   manualmente em **Actions → Deploy web → Run workflow**.

O jogo fica em <https://patoricardo.github.io/ECOS94/>.

O `run.bat` continua sendo só para rodar localmente; o Pages não precisa dele.
Se o ambiente `github-pages` estiver restrito a branches protegidas, faça o
merge em `master` antes de publicar.

---

## Controles

### Desktop

| Tecla | Ação |
|---|---|
| `↑` `↓` `←` `→` | Mover (andar contra um monstro ataca) |
| `Enter` / `Espaço` | INTERACT: pegar, ler ROM, portas, ping, RULER, esperar |
| `S` (`p`) | Ping do sonar |
| `M` + seta | RULER: feixe reto de até 30 tiles |
| `L` / `U` | Trancar / destrancar a porta ao lado |
| `B` | Força bruta (3 tentativas; a terceira dispara PURGE) |
| `G` | Pegar o que está sob você |
| `I` | Inventário (usar, equipar, largar) |
| `D` | Largar item |
| `X` | RESET do setor (ALERT +1 permanente) |
| `.` | Esperar um turno |
| `?` | Ajuda |
| `Esc` | Menu de pausa / cancelar |

### Mobile

- **D-pad** para mover (segurar repete o passo).
- **INTERACT** abre as ações contextuais: item/ROM sob você, portas ao lado,
  sonar, RULER, esperar, RESET e ajuda.
- **INVENTORY** lista equipamento, itens e ROMs. Toque em um item para
  `USE`, `EQUIP`, `DROP` ou `BACK`.
- O menu `☰` no HUD pausa, troca cor/scanlines/som e volta ao título.

---

## Seed e opções

- A seed é o save: mesma seed, mesmo mapa, mesmo loot, mesma IA.
- `?seed=123` na URL inicia direto naquela seed.
- Título e menu de pausa alternam **VGA · VERDE · ÂMBAR · BRANCO**,
  scanlines e som. As preferências ficam no `localStorage`.
- Todo som é sintetizado com WebAudio (sem arquivos), liberado no primeiro
  gesto do usuário.

---

## Estrutura

```
web/
├── index.html          tela, HUD, overlay, aviso de file://
├── run.bat             servidor local + navegador
├── css/style.css       layout responsivo e estética CRT
├── js/
│   ├── app.js          boot, menu, teclado/toque, loop
│   ├── game.js         estado da run e ações do jogador
│   ├── dungeon.js      geração de setor
│   ├── entities.js     Player, Monster, Item, Rom
│   ├── data.js         tabelas do jogo
│   ├── ai.js           turno dos monstros
│   ├── sonar.js        revelação, memória e feixe
│   ├── status.js       carga, ruído, dano e ROMs
│   ├── rng.js          RNG determinístico (mulberry32 + CRC32)
│   ├── context.js      ações do botão INTERACT
│   ├── renderer.js     mapa em canvas
│   ├── ui.js           HUD, log, painéis e inventário
│   ├── theme.js        paleta VGA e fósforo
│   └── audio.js        PC speaker via WebAudio
└── tests/simulate.mjs  suíte headless (Node)
```

O núcleo (`game.js`, `dungeon.js`, `ai.js`, `status.js`, `sonar.js`) não
toca no DOM: as mesmas regras rodam no navegador e no Node.

---

## Testes

```bat
cd web
npm test
```

ou:

```bat
node web/tests/simulate.mjs
```

A suíte espelha `tools/simulate.py`: geração dos 10 setores, comandos,
portas, descida, reprodutibilidade por seed, fuzz de 16 mil turnos e um bot
que joga sozinho. Saída esperada: `TODAS AS VERIFICACOES PASSARAM.`

A suíte Python original continua válida:

```bat
python tools/simulate.py
```

---

## Fidelidade ao original

- Regras, tabelas, geração, IA, ruído, dano, portas e ROMs seguem `ecos/`.
- O RNG é determinístico e reproduz uma run por seed, mas **não é
  byte-idêntico** ao `random.Random` do Python: a mesma seed gera outro
  mapa (igualmente válido). O simulador Python continua sendo a referência
  de balanceamento.
- O HUD do terminal virou DOM; o mapa é canvas com os mesmos glifos e os
  três estados de memória por tile.
- O texto do jogo permanece em inglês, como no original.
