#!/usr/bin/env node
/**
 * mark_sold.js — Numismática Popper: sold-item lifecycle manager
 *
 * Usage:
 *   node mark_sold.js "search term"      → mark matching coin(s) as sold
 *   node mark_sold.js --purge            → dry-run: lista lo que se borraría
 *   node mark_sold.js --purge --confirm  → borra de verdad (irreversible)
 *   node mark_sold.js --list-sold        → print all currently sold items
 *
 * Expects to be run from the project root (same directory as coins.json).
 */

const fs   = require('fs');
const path = require('path');

const COINS_FILE   = path.join(__dirname, 'coins.json');

// Ventana de retención de una moneda vendida. DEBE coincidir con
// SOLD_RETENTION_DAYS de common.js, que es la que decide qué muestra el sitio.
// Estaba en 7 días mientras el sitio mostraba 30: corrido tal cual, --purge
// borraba de coins.json y del disco 168 monedas, 112 de ellas todavía visibles
// en el catálogo, sin vuelta atrás.
const RETENTION_DAYS = 30;
const RETENTION_MS   = RETENTION_DAYS * 24 * 60 * 60 * 1000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readCoins() {
  return JSON.parse(fs.readFileSync(COINS_FILE, 'utf8'));
}

function writeCoins(coins) {
  fs.writeFileSync(COINS_FILE, JSON.stringify(coins, null, 2), 'utf8');
}

// Nota: este script NO escribe en ~/Desktop/Popper/operational_log.md. Esa bitácora
// guarda la lógica del proyecto (reglas, trampas, estado, pendientes), no el movimiento
// de cada moneda: la venta ya queda en coins.json, en VTAS.xlsx y en el historial de git.

function normalize(str) {
  return String(str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ─── Commands ────────────────────────────────────────────────────────────────

function markSold(searchTerm) {
  const coins   = readCoins();
  const term    = normalize(searchTerm);
  const matches = coins.filter(c =>
    normalize(c.title).includes(term) ||
    String(c.id) === searchTerm.trim()
  );

  if (matches.length === 0) {
    console.error(`✗ No coin found matching "${searchTerm}"`);
    process.exit(1);
  }

  const soldAt  = new Date().toISOString();
  const changed = [];

  matches.forEach(coin => {
    if (coin.status === 'sold') {
      console.log(`⚠  ID ${coin.id} "${coin.title}" is already marked sold — skipping`);
      return;
    }

    const cant = typeof coin.cantidad === 'number' ? coin.cantidad : 1;
    if (cant > 1) {
      coin.cantidad = cant - 1;
      changed.push({ coin, becameSold: false });
      console.log(`✓  Reduced stock for: [${coin.id}] ${coin.title} (remaining: ${coin.cantidad})`);
    } else {
      if (coin.hasOwnProperty('cantidad')) {
        coin.cantidad = 0;
      }
      coin.status = 'sold';
      coin.soldAt = soldAt;
      changed.push({ coin, becameSold: true });
      console.log(`✓  Marked as VENDIDO (Out of Stock): [${coin.id}] ${coin.title}`);
    }
  });

  if (changed.length === 0) process.exit(0);

  writeCoins(coins);

}

// Borra del catálogo las monedas vendidas cuya ventana ya venció, junto con TODO
// lo que arrastran: fotos originales, miniaturas WebP y la página de compartir.
// Antes dejaba huérfanos los dos últimos, así que quedaban moneda/<id>.html
// apuntando a una ficha inexistente.
//
// Es irreversible y sin --confirm solo muestra qué haría.
function purgeExpired(confirmed) {
  const coins    = readCoins();
  const now      = Date.now();
  const expired  = coins.filter(c =>
    c.status === 'sold' && c.soldAt &&
    (now - new Date(c.soldAt).getTime() > RETENTION_MS)
  );

  if (expired.length === 0) {
    console.log(`✓ No hay vendidas con más de ${RETENTION_DAYS} días para purgar.`);
    return;
  }

  // Rutas asociadas a una moneda: fotos, sus miniaturas y la página de compartir.
  const assetsOf = (coin) => {
    const images = Array.isArray(coin.images) ? coin.images : [];
    const out = [...images];
    images.forEach(img => {
      if (img.startsWith('images/') && !img.startsWith('images/thumbs/') && !/\.mp4$/i.test(img)) {
        const base = img.split('/').pop().replace(/\.[^.]+$/, '');
        out.push(`images/thumbs/${base}.webp`);
      }
    });
    out.push(`moneda/${coin.id}.html`);
    return out.filter(p => fs.existsSync(path.join(__dirname, p)));
  };

  if (!confirmed) {
    console.log(`\nSIMULACIÓN — no se borró nada. ${expired.length} moneda(s) vencida(s):\n`);
    let files = 0;
    expired.forEach(coin => {
      const assets = assetsOf(coin);
      files += assets.length;
      const dias = Math.floor((now - new Date(coin.soldAt).getTime()) / 86400000);
      console.log(`  [${coin.id}] ${coin.title} — vendida hace ${dias} días, ${assets.length} archivo(s)`);
    });
    console.log(`\nSe borrarían ${expired.length} monedas de coins.json y ${files} archivos del disco.`);
    console.log('Es IRREVERSIBLE. Para hacerlo de verdad: node mark_sold.js --purge --confirm\n');
    return;
  }

  const deletedFiles = [];
  expired.forEach(coin => {
    assetsOf(coin).forEach(rel => {
      fs.unlinkSync(path.join(__dirname, rel));
      deletedFiles.push(rel);
      console.log(`🗑  Borrado: ${rel}`);
    });
    console.log(`✗  Purgada: [${coin.id}] ${coin.title}`);
  });

  const remaining = coins.filter(c => !expired.includes(c));
  writeCoins(remaining);

  console.log(`\n✓ Purgadas ${expired.length} moneda(s), borrados ${deletedFiles.length} archivo(s).`);

}

function listSold() {
  const coins = readCoins();
  const sold  = coins.filter(c => c.status === 'sold');
  if (sold.length === 0) { console.log('No sold items.'); return; }

  const now = Date.now();
  sold.forEach(c => {
    const soldAt   = new Date(c.soldAt);
    const elapsed  = now - soldAt.getTime();
    const daysLeft = Math.max(0, Math.ceil((RETENTION_MS - elapsed) / 86400000));
    const status   = elapsed > RETENTION_MS ? '⚠  VENCIDA (correr --purge)' : `quedan ${daysLeft}d`;
    console.log(`  [${c.id}] ${c.title}  —  sold ${soldAt.toLocaleDateString('es-AR')}  (${status})`);
  });
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const [,, ...args] = process.argv;
const flag = args[0];

if (!flag || flag === '--help') {
  console.log([
    '',
    'Usage:',
    '  node mark_sold.js "search term"   Mark matching coin as sold',
    '  node mark_sold.js --purge         Simula la purga de vendidas vencidas',
    '  node mark_sold.js --purge --confirm  Purga de verdad (IRREVERSIBLE)',
    '  node mark_sold.js --list-sold     Show current sold items with days remaining',
    '',
  ].join('\n'));
} else if (flag === '--purge') {
  purgeExpired(args.includes('--confirm'));
} else if (flag === '--list-sold') {
  listSold();
} else {
  markSold(args.join(' '));
}
