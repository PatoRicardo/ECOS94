// Abertura narrativa do porte web.
//
// Ficcao de moldura: nenhuma regra do jogo depende deste texto. A versao
// completa, em portugues, esta em ../docs/LORE-ATUALIZADA.md.

export const PROLOGUE = [
  {
    title: "SUBSOLO 7 // ARQUIVO MORTO",
    subtitle: "RECOVERED FILE — 1 OF 3",
    body: `
      <div class="lore">
        <p class="lore-lead">THE ARCHIVE WAS NEVER LIT.</p>
        <p>NOT TO SAVE MONEY. LIGHT ERASES WHAT THE STONE REMEMBERS.</p>
        <p>THEY WROTE WITH SOUND AND READ WITH SOUND, AND NAMED THE SYSTEM
        <b>ECOS</b> BECAUSE THAT IS WHAT THE WELL GAVE BACK.</p>
        <p class="lore-law">EVERYTHING YOU HEAR, IT HEARS TOO.</p>
      </div>`,
  },
  {
    title: "INVENTÁRIO DE CAMPO",
    subtitle: "RECOVERED FILE — 2 OF 3",
    body: `
      <div class="lore">
        <p class="lore-lead">SIX SUBSYSTEMS. ONE LAW.</p>
        <dl class="lore-systems">
          <dt>SONAR ARRAY</dt><dd>A CIRCLE OF LIGHT. A PRICE.</dd>
          <dt>RULER OPTICS</dt><dd>A STRAIGHT LINE. ALMOST FREE.</dd>
          <dt>LOAD SENSORS</dt><dd>WEIGHT IS NOISE.</dd>
          <dt>PASSWORD VAULT</dt><dd>SLATES IN HER HANDWRITING.</dd>
          <dt>LOCK CONTROL</dt><dd>A DOOR IS A PROMISE.</dd>
          <dt>RESET VECTOR</dt><dd>IT REBUILDS. IT REMEMBERS.</dd>
        </dl>
        <p class="lore-law">TO BE HEARD IS TO BE REMEMBERED.<br />
        TO BE REMEMBERED IS TO BE EATEN.</p>
      </div>`,
  },
  {
    title: "LOG // TEC. 04",
    subtitle: "RECOVERED FILE — 3 OF 3",
    body: `
      <div class="lore">
        <p class="muted">14 MAR 1994, 23:41 — SECTOR 7 LOOPS.</p>
        <p>FOUR WEEKS OF THE SAME CORRIDOR. IT IS NOT STUCK. IT IS TRYING TO
        REMEMBER SOMEONE.</p>
        <p class="lore-lead">I PRESSED RESET.</p>
        <p>THE SECTOR CAME BACK IN 40 SECONDS. SO DID THE ROUTINE THAT REBUILT
        IT.</p>
        <p>THE COMPANY SEALED THE WELL IN NINE WEEKS. ON THE BLUEPRINT, SECTOR 10
        IS A RECTANGLE WITH ONE WORD IN IT: <b>VOID</b>.</p>
        <p class="lore-law">YOU ARE THE LAST BOOT. GO DOWN.</p>
      </div>`,
  },
];

/** Pagina da abertura, ou null quando acabou. */
export function prologuePage(index) {
  return PROLOGUE[index] || null;
}
