import json
import os
from datetime import datetime, timezone
import sys
import re
import argparse

_REPO_DIR = os.path.dirname(os.path.abspath(__file__))
# POPPER_COINS_JSON permite apuntar a una copia para testear sin tocar el catálogo real
file_path = os.environ.get("POPPER_COINS_JSON") or os.path.join(_REPO_DIR, 'coins.json')

def parse_sales_text(text):
    """
    Robustly parses sales strings in multiple formats:
      - '[isla de pascua - 6] [5000] [Luis pons]' (Bracketed syntax)
      - 'id 105 2000 quique' or '1088 $4.000 Seba Verna' (<ID> <PRICE> <CLIENTS>)
      - 'id 1089 bruni 18000' or '1089 bruni $18.000' (<ID> <CLIENTS> <PRICE>)
      - Comma-separated: '1090 $3.000 Alegre German, Seba Verna'
      - Multi-line sales blocks
    Returns a dict mapping coin_id -> requested_quantity.
    """
    cleaned = re.sub(r'^(?:pe|mv|publicar[\s\-_]excel|asentar|registrar|venta[s]?)\s*[:,\-]?\s*', '', text.strip(), flags=re.IGNORECASE)
    counts = {}
    lines = [l.strip() for l in cleaned.split('\n') if l.strip()]

    # Load coins.json for reference
    coins = []
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                coins = json.load(f)
        except Exception:
            pass
    coin_map = {c['id']: c for c in coins if isinstance(c, dict) and 'id' in c}

    for line in lines:
        line_clean = re.sub(r'\([^\)]*el resto no[^\)]*\)', '', line, flags=re.IGNORECASE).strip()
        line_clean = re.sub(r'\b(?:pe\s+y\s+mv|pe\s+y\s+mark[\s\-_]sold|mv\s+y\s+pe|pe|mv)\s*$', '', line_clean, flags=re.IGNORECASE).strip()
        if not line_clean:
            continue

        # 1. Sintaxis entre corchetes [campo1] [campo2] [campo3]
        brackets = [b.strip() for b in re.findall(r'\[([^\]]+)\]', line_clean) if b.strip()]
        if len(brackets) >= 2:
            motivo = brackets[0]
            qty = 1
            if len(brackets) >= 3:
                clients_b = brackets[2] if not re.search(r'^[$]?\d+', brackets[2]) else brackets[1]
                if ',' in clients_b:
                    qty = len([c for c in clients_b.split(',') if c.strip()])

            cid = None
            if motivo.isdigit() and int(motivo) in coin_map:
                cid = int(motivo)
            else:
                id_m = re.search(r'\b(\d{1,5})\b', motivo)
                if id_m and int(id_m.group(1)) in coin_map:
                    cid = int(id_m.group(1))
                else:
                    m_norm = motivo.lower()
                    for c in coins:
                        t = (c.get('title') or '').lower()
                        p = (c.get('country') or '').lower()
                        if m_norm and (m_norm in f"{p} {t}" or (len(m_norm) > 5 and t in m_norm)):
                            cid = c['id']
                            break

            if cid is not None:
                counts[cid] = counts.get(cid, 0) + max(1, qty)
            continue

        # 2. Patrón clásico por ID
        m1 = re.match(r'^(?:id\s+)?(?P<id>\d+)\s+(?:a\s+|por\s+)?(?P<price>[$]?\d+(?:[\.,]\d+)?(?:\s*(?:usd|dolar(?:es)?))?)\s+(?P<clients>.+)$', line_clean, re.IGNORECASE)
        m2 = re.match(r'^(?:id\s+)?(?P<id>\d+)\s+(?P<clients>.+?)\s+(?:a\s+|por\s+)?(?P<price>[$]?\d+(?:[\.,]\d+)?(?:\s*(?:usd|dolar(?:es)?))?)$', line_clean, re.IGNORECASE)
        m = m1 or m2
        if m:
            cid = int(m.group('id'))
            if cid in coin_map:
                clients_raw = m.group('clients').strip()
                qty = len([c for c in clients_raw.split(',') if c.strip()]) if ',' in clients_raw else 1
                counts[cid] = counts.get(cid, 0) + max(1, qty)
            continue

        # 3. Sub-pattern / IDs que realmente existan en coins.json
        id_matches = re.findall(r'\b(?:id\s*)?(\d{1,5})\b', line_clean, re.IGNORECASE)
        for mid in id_matches:
            cid = int(mid)
            if cid in coin_map:
                counts[cid] = counts.get(cid, 0) + 1

    return counts

def parse_arguments():
    parser = argparse.ArgumentParser(description="Mark coins as sold / decrement stock, or mark as available in coins.json")
    parser.add_argument("ids", nargs="*", help="List of IDs or ID:QTY (e.g. 105 2034 2034 or 2034:2)")
    parser.add_argument("--text", default=None, help="Raw sales text e.g. 'id 105 2000 quique' or multiline list")
    parser.add_argument("--json", dest="json_input", default=None, help="JSON list of {id, qty}")
    parser.add_argument("--skip-stock-check", action="store_true", help="Allow selling down to 0 even if requested > initial stock")
    parser.add_argument("--available", "--disponible", dest="mark_available", action="store_true", help="Mark coin(s) as available instead of sold")
    return parser.parse_args()

def main():
    args = parse_arguments()
    requested_counts = {}
    
    if args.text:
        requested_counts = parse_sales_text(args.text)
            
    elif args.json_input:
        data = json.loads(args.json_input)
        for item in data:
            cid = int(item['id'])
            qty = int(item.get('qty', item.get('cantidad', 1)))
            requested_counts[cid] = requested_counts.get(cid, 0) + qty
            
    elif args.ids:
        for arg in args.ids:
            if ":" in arg:
                parts = arg.split(":")
                cid = int(parts[0])
                qty = int(parts[1])
                requested_counts[cid] = requested_counts.get(cid, 0) + qty
            else:
                try:
                    cid = int(arg)
                    requested_counts[cid] = requested_counts.get(cid, 0) + 1
                except ValueError:
                    pass
    else:
        print("Usage: python3 mark_sold.py <id1> <id2> ... or --text 'id 105 2000 quique'")
        sys.exit(1)
        
    if not requested_counts:
        # Nunca reportar éxito sin haber tocado nada: el widget lo mostraba como
        # "Web actualizada" aunque no hubiera resuelto ninguna moneda.
        print("ERROR: No se resolvió ninguna moneda del catálogo para actualizar")
        sys.exit(1)

    if not os.path.exists(file_path):
        print(f"ERROR: {file_path} not found")
        sys.exit(1)

    with open(file_path, 'r', encoding='utf-8') as f:
        coins = json.load(f)

    # ─────────────────────────────────────────────────────────────
    # DOBLE VERIFICACIÓN DE EXISTENCIA Y STOCK
    # ─────────────────────────────────────────────────────────────
    coin_map = {c['id']: c for c in coins}
    verification_errors = []

    for cid, req_qty in requested_counts.items():
        if cid not in coin_map:
            verification_errors.append(f"Moneda ID {cid} NO existe en coins.json.")
            continue
            
        coin = coin_map[cid]
        title = coin.get('title', 'Sin título')
        status = coin.get('status', '')
        
        if not args.mark_available:
            if status == 'sold':
                current_stock = 0
            else:
                current_stock = int(coin.get('cantidad', 1))
                
            if not args.skip_stock_check and current_stock - req_qty < 0:
                verification_errors.append(
                    f"Stock insuficiente para ID {cid} ({title}). Stock disponible: {current_stock}, Solicitado: {req_qty}. El stock nunca puede ser menor a 0."
                )

    if verification_errors:
        print("ERROR_DOBLE_VERIFICACION_STOCK:")
        for err in verification_errors:
            print(f"  - {err}")
        sys.exit(1)

    # ─────────────────────────────────────────────────────────────
    # APLICACIÓN DE CAMBIOS (STOCK / SOLD / AVAILABLE)
    # ─────────────────────────────────────────────────────────────
    updated_coins = []
    now_iso = datetime.now(timezone.utc).isoformat()

    for cid, req_qty in requested_counts.items():
        coin = coin_map[cid]

        if args.mark_available:
            # Restaurar como disponible
            if 'status' in coin:
                del coin['status']
            if 'soldAt' in coin:
                del coin['soldAt']
            coin['cantidad'] = max(1, req_qty)
            updated_coins.append((coin, "available", coin['cantidad'], req_qty))
        else:
            # Marcar como vendido o reducir stock
            if coin.get('status') == 'sold':
                current_stock = 0
            else:
                current_stock = int(coin.get('cantidad', 1))
                
            new_stock = max(0, current_stock - req_qty)
            
            if new_stock == 0:
                coin['status'] = 'sold'
                coin['soldAt'] = now_iso
                if 'cantidad' in coin:
                    coin['cantidad'] = 0
                updated_coins.append((coin, "sold", 0, req_qty))
            else:
                coin['cantidad'] = new_stock
                if 'status' in coin and coin['status'] == 'sold':
                    del coin['status']
                updated_coins.append((coin, "reduced", new_stock, req_qty))

    # Guardar coins.json
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(coins, f, indent=2, ensure_ascii=False)

    ids_str = ",".join(str(c['id']) for c, _, _, _ in updated_coins)
    titles_str = "; ".join(c['title'] for c, _, _, _ in updated_coins)
    print(f"SUCCESS:{ids_str}:{titles_str}")
    
    for found_coin, change_type, rem_stock, req_qty in updated_coins:
        cid = found_coin.get('id')
        title = found_coin.get('title')
        if change_type == "available":
            print(f"ID {cid}: {title} → DISPONIBLE (status: available, stock: {rem_stock})")
        elif change_type == "sold":
            print(f"ID {cid}: {title} → VENDIDO (status: sold, stock: 0)")
        else:
            print(f"ID {cid}: {title} → STOCK REDUCIDO (vendidas: {req_qty}, restante: {rem_stock})")

if __name__ == '__main__':
    main()
