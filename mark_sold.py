import json
from datetime import datetime

file_path = '/Users/ezecarbajo/popper-site/coins.json'
log_path = '/Users/ezecarbajo/Desktop/Popper/operational_log.md'
target_id = 182

with open(file_path, 'r') as f:
    coins = json.load(f)

found_coin = None
for coin in coins:
    if coin['id'] == target_id:
        coin['status'] = 'sold'
        coin['soldAt'] = datetime.now().isoformat() + 'Z'
        found_coin = coin
        break

if found_coin:
    with open(file_path, 'w') as f:
        json.dump(coins, f, indent=2, ensure_ascii=False)
    
    log_entry = f"\n- **VENDIDA** — {found_coin.get('title')} (ID {found_coin.get('id')}, {found_coin.get('country')}, {found_coin.get('metal')}, {found_coin.get('price')}) → status: sold, soldAt: {found_coin['soldAt']}"
    with open(log_path, 'a') as f:
        f.write(log_entry)
    
    print(f"SUCCESS:{target_id}:{found_coin.get('title')}")
else:
    print("ERROR:Coin not found")
