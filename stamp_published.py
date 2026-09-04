"""Sella la fecha de alta (publishedAt) de las monedas indicadas.

El badge "NUEVO" de la grilla se muestra durante los primeros días desde
publishedAt (ver NEW_BADGE_DAYS en script.js). Las monedas sin el campo no
llevan badge, así que solo hay que sellar las que se acaban de publicar.

Uso:
    python3 stamp_published.py 1043 1044      # sella esos ids
    python3 stamp_published.py P1 R2          # ids con prefijo de consignatario
    python3 stamp_published.py --from 1019    # sella todos los ids >= 1019
    python3 stamp_published.py --from P1      # sella toda la serie P desde P1

Un ID es <prefijo opcional de letras><número>. `--from` compara dentro del mismo
prefijo: `--from 1019` no toca la serie P ni la R, y `--from P1` sólo toca la P.

Nunca pisa un publishedAt existente y sin argumentos no toca nada.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

_RE_COIN_ID = re.compile(r'^\s*#?\s*([A-Za-z]{0,3}\d{1,6})\s*$')


def coin_key(raw):
    """Clave canónica de un ID ('p1' -> 'P1', 1088 -> '1088'), o None."""
    if raw is None:
        return None
    m = _RE_COIN_ID.match(str(raw))
    return m.group(1).upper() if m else None


def split_key(key):
    """('P', 1) para 'P1'; ('', 1088) para '1088'."""
    m = re.match(r'^([A-Za-z]*)(\d+)$', key or '')
    return (m.group(1), int(m.group(2))) if m else ('', None)

# Rutas derivadas de la ubicación del script, no absolutas: así el repo
# sigue funcionando si se clona en otra carpeta o en otra máquina.
_REPO_DIR = os.path.dirname(os.path.abspath(__file__))
file_path = os.path.join(_REPO_DIR, 'coins.json')

args = sys.argv[1:]
if not args:
    print("Usage: python3 stamp_published.py <id1> <id2> ... | --from <id>")
    sys.exit(1)

from_key = None
target_keys = []

if args[0] == '--from':
    if len(args) != 2:
        print("ERROR: --from takes exactly one ID")
        sys.exit(1)
    from_key = coin_key(args[1])
    if from_key is None:
        print("ERROR: --from requires an ID like 1019 or P1")
        sys.exit(1)
else:
    target_keys = [coin_key(x) for x in args]
    if not all(target_keys):
        bad = [a for a, k in zip(args, target_keys) if not k]
        print(f"ERROR: not valid coin IDs: {', '.join(bad)}")
        sys.exit(1)

with open(file_path, 'r') as f:
    coins = json.load(f)

now = datetime.now(timezone.utc).isoformat()

stamped = []
from_prefix, from_number = split_key(from_key) if from_key else ('', None)

for coin in coins:
    key = coin_key(coin.get('id'))
    if key is None:
        continue
    if from_key is not None:
        prefix, number = split_key(key)
        selected = (prefix == from_prefix and number >= from_number)
    else:
        selected = key in target_keys
    if not selected or coin.get('publishedAt'):
        continue
    coin['publishedAt'] = now
    stamped.append(coin)

if not stamped:
    print("ERROR:No coins stamped (not found or already stamped)")
    sys.exit(1)

with open(file_path, 'w') as f:
    json.dump(coins, f, indent=2, ensure_ascii=False)

ids_str = ",".join(str(c['id']) for c in stamped)

# No se escribe en operational_log.md: esa bitácora guarda lógica, no altas de monedas.
# El sellado ya queda en coins.json (publishedAt) y en el historial de git.

print(f"SUCCESS:{ids_str}")
