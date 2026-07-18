import json
from datetime import datetime, timezone
import sys

file_path = '/Users/ezecarbajo/popper-site/coins.json'
log_path = '/Users/ezecarbajo/Desktop/Popper/operational_log.md'

if len(sys.argv) < 2:
    print("Usage: python3 mark_sold.py <id1> <id2> ...")
    sys.exit(1)

try:
    target_ids = [int(x) for x in sys.argv[1:]]
except ValueError:
    print("ERROR: All arguments must be integer IDs")
    sys.exit(1)

with open(file_path, 'r') as f:
    coins = json.load(f)

updated_coins = []
for coin in coins:
    if coin['id'] in target_ids:
        # Se asume stock de 1 si no se especifica 'cantidad'
        cant = coin.get('cantidad', 1)
        if cant > 1:
            coin['cantidad'] = cant - 1
            updated_coins.append((coin, False))
        else:
            if 'cantidad' in coin:
                coin['cantidad'] = 0
            coin['status'] = 'sold'
            coin['soldAt'] = datetime.now(timezone.utc).isoformat()
            updated_coins.append((coin, True))

if len(updated_coins) > 0:
    with open(file_path, 'w') as f:
        json.dump(coins, f, indent=2, ensure_ascii=False)
    
    log_entries = []
    for found_coin, became_sold in updated_coins:
        if became_sold:
            log_entry = f"\n- **VENDIDA** — {found_coin.get('title')} (ID {found_coin.get('id')}, {found_coin.get('country')}, {found_coin.get('metal')}, {found_coin.get('price')}) → status: sold, soldAt: {found_coin['soldAt']}"
        else:
            log_entry = f"\n- **STOCK REDUCIDO** — {found_coin.get('title')} (ID {found_coin.get('id')}, {found_coin.get('country')}, {found_coin.get('metal')}, {found_coin.get('price')}) → cantidad restante: {found_coin['cantidad']}"
        log_entries.append(log_entry)
        
    with open(log_path, 'a') as f:
        f.write("".join(log_entries))
    
    # Return formatted success with all processed IDs
    ids_str = ",".join(str(c['id']) for c, _ in updated_coins)
    titles_str = "; ".join(c['title'] for c, _ in updated_coins)
    print(f"SUCCESS:{ids_str}:{titles_str}")
else:
    print("ERROR:Coins not found")
