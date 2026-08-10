"""Sella la fecha de alta (publishedAt) de las monedas indicadas.

El badge "NUEVO" de la grilla se muestra durante los primeros días desde
publishedAt (ver NEW_BADGE_DAYS en script.js). Las monedas sin el campo no
llevan badge, así que solo hay que sellar las que se acaban de publicar.

Uso:
    python3 stamp_published.py 1043 1044      # sella esos ids
    python3 stamp_published.py --from 1019    # sella todos los ids >= 1019

Nunca pisa un publishedAt existente y sin argumentos no toca nada.
"""

import json
import os
import sys
from datetime import datetime, timezone

# Rutas derivadas de la ubicación del script, no absolutas: así el repo
# sigue funcionando si se clona en otra carpeta o en otra máquina.
_REPO_DIR = os.path.dirname(os.path.abspath(__file__))
file_path = os.path.join(_REPO_DIR, 'coins.json')
log_path = os.path.join(os.path.expanduser('~'), 'Desktop', 'Popper', 'operational_log.md')

args = sys.argv[1:]
if not args:
    print("Usage: python3 stamp_published.py <id1> <id2> ... | --from <id>")
    sys.exit(1)

from_id = None
target_ids = []

if args[0] == '--from':
    if len(args) != 2:
        print("ERROR: --from takes exactly one ID")
        sys.exit(1)
    try:
        from_id = int(args[1])
    except ValueError:
        print("ERROR: --from requires an integer ID")
        sys.exit(1)
else:
    try:
        target_ids = [int(x) for x in args]
    except ValueError:
        print("ERROR: All arguments must be integer IDs")
        sys.exit(1)

with open(file_path, 'r') as f:
    coins = json.load(f)

now = datetime.now(timezone.utc).isoformat()

stamped = []
for coin in coins:
    coin_id = coin.get('id')
    if from_id is not None:
        selected = isinstance(coin_id, int) and coin_id >= from_id
    else:
        selected = coin_id in target_ids
    if not selected or coin.get('publishedAt'):
        continue
    coin['publishedAt'] = now
    stamped.append(coin)

if not stamped:
    print("ERROR:No coins stamped (not found or already stamped)")
    sys.exit(1)

with open(file_path, 'w') as f:
    json.dump(coins, f, indent=2, ensure_ascii=False)

scope = f"--from {from_id}" if from_id is not None else ",".join(str(i) for i in target_ids)
ids_str = ",".join(str(c['id']) for c in stamped)
with open(log_path, 'a') as f:
    f.write(f"\n- **PUBLICADAS (badge NUEVO)** — {len(stamped)} monedas selladas con publishedAt: {now} (scope: {scope}) → IDs {ids_str}")

print(f"SUCCESS:{ids_str}")
