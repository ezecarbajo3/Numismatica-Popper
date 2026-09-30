#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Repricia las publicaciones de Mercado Libre para que el neto sea 110% del precio web.

Regla: la plata que queda despues de la comision de ML tiene que ser un 10% mas
que el precio de venta de la pagina pasado a pesos (USD de coins.json por el
dolar blue venta del dia).

Comision relevada de /sites/MLA/listing_prices para MLA2061 / gold_special:
16% + un costo fijo por venta que depende del tramo de precio (10/9/2026).

Uso:
    python3 ml_precios.py                    # simulacion, no toca nada
    python3 ml_precios.py --aplicar          # escribe los precios en ML
    python3 ml_precios.py --dolar-rate 1540  # fuerza la cotizacion
"""
import argparse
import csv
import json
import math
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ml_api
import ml_bulk

COINS_JSON = "/Users/ezecarbajo/popper-site/coins.json"
DIR_SALIDA = "/Users/ezecarbajo/popper-site/salidas_ml"

MARGEN_OBJETIVO = 0.10        # el neto tiene que superar en 10% al precio web
COMISION_ML = 0.16
# (precio_desde, costo_fijo_por_venta). Tramos verificados con la API.
TRAMOS_FIJO = [(0, 1330), (15000, 2740), (24000, 3320), (33000, 0)]
REDONDEO = 100                # el precio final siempre sube al multiplo de $100
PRECIO_MINIMO_ML = 1000
ESTADOS_EDITABLES = ("active", "under_review", "paused")
HILOS = 4                     # con mas de 4, ML devuelve 429


def costo_fijo(precio):
    fijo = TRAMOS_FIJO[0][1]
    for desde, f in TRAMOS_FIJO:
        if precio >= desde:
            fijo = f
    return fijo


def neto(precio, extra=0):
    return precio - precio * COMISION_ML - costo_fijo(precio) - extra


def techo(x, paso=REDONDEO):
    return int(math.ceil(x / float(paso))) * paso


def precio_para(objetivo, extra=0):
    """Menor precio (multiplo de REDONDEO) cuyo neto llega al objetivo.

    `extra` es cualquier cargo adicional por venta (ej. envio gratis) que se suma al bruto."""
    objetivo = objetivo + extra
    candidatos = []
    for desde, fijo in TRAMOS_FIJO:
        p = techo((objetivo + fijo) / (1 - COMISION_ML))
        if costo_fijo(p) == fijo:
            candidatos.append(p)
    p = min(candidatos) if candidatos else techo((objetivo + TRAMOS_FIJO[0][1]) / (1 - COMISION_ML))
    # el redondeo puede empujar el precio a un tramo con fijo mas caro
    while neto(p) < objetivo:
        p += REDONDEO
    return max(p, PRECIO_MINIMO_ML)


def precio_usd(coin):
    m = re.match(r"^([\d.,]+)\s*USD$", str(coin.get("price", "")).strip())
    return float(m.group(1).replace(",", "")) if m else None


def sku_de(item):
    for a in (item.get("attributes") or []):
        if a.get("id") == "SELLER_SKU":
            v = a.get("value_name") or a.get("value_id")
            return str(v).strip() if v else None
    return None


def traer_items():
    uid = ml_api.user_id()
    ids, off = [], 0
    while True:
        st, r = ml_api.pedir("GET", f"/users/{uid}/items/search?limit=100&offset={off}")
        if st != 200:
            sys.exit(f"la busqueda de publicaciones fallo ({st}): {str(r)[:200]}")
        ids += r["results"]
        off += 100
        if off >= r["paging"]["total"]:
            break
    campos = "id,title,status,price,attributes,variations,shipping"
    items = []
    for i in range(0, len(ids), 20):
        st, r = ml_api.pedir("GET", "/items?ids=" + ",".join(ids[i:i + 20]) + "&attributes=" + campos)
        if st != 200:
            sys.exit(f"la lectura de publicaciones fallo ({st}): {str(r)[:200]}")
        items += [x["body"] for x in r]
    return items


def poner_precio(item_id, precio):
    st, r = ml_api.pedir("PUT", f"/items/{item_id}", {"price": precio})
    return (True, None) if st == 200 else (False, f"{st}: {str(r)[:160]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--aplicar", action="store_true")
    ap.add_argument("--dolar-rate", type=float)
    a = ap.parse_args()

    cotiz = a.dolar_rate or ml_bulk.cotizacion_blue_venta()
    print(f"Dolar blue venta: {cotiz:,.2f}", file=sys.stderr)

    with open(COINS_JSON, encoding="utf-8") as f:
        coins = {str(c["id"]): c for c in json.load(f)}

    items = traer_items()
    print(f"Publicaciones leidas: {len(items)}", file=sys.stderr)

    plan, saltadas = [], []
    for it in items:
        sku = sku_de(it)
        if it.get("status") not in ESTADOS_EDITABLES:
            saltadas.append((it["id"], sku, f"estado {it.get('status')}")); continue
        if it.get("variations"):
            saltadas.append((it["id"], sku, "tiene variaciones")); continue
        if not sku or sku not in coins:
            saltadas.append((it["id"], sku, "sin SKU en coins.json")); continue
        usd = precio_usd(coins[sku])
        if usd is None:
            saltadas.append((it["id"], sku, "precio a consultar en la pagina")); continue
        web = usd * cotiz
        objetivo = web * (1 + MARGEN_OBJETIVO)
        nuevo = precio_para(objetivo)
        plan.append({"item_id": it["id"], "sku": sku, "titulo": it.get("title", ""),
                     "usd": usd, "web_ars": round(web, 2), "objetivo_neto": round(objetivo, 2),
                     "precio_viejo": it.get("price"), "precio_nuevo": nuevo,
                     "neto_nuevo": round(neto(nuevo), 2),
                     "margen_real": round(neto(nuevo) / web - 1, 4)})

    cambian = [p for p in plan if p["precio_nuevo"] != p["precio_viejo"]]
    os.makedirs(DIR_SALIDA, exist_ok=True)
    sello = datetime.now().strftime("%Y%m%d_%H%M")
    ruta = os.path.join(DIR_SALIDA, f"precios_{sello}.csv")
    with open(ruta, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(plan[0].keys()) + ["aplicado", "error"])
        w.writeheader()
        for p in plan:
            w.writerow(p)
    print(f"Plan: {len(plan)} publicaciones, {len(cambian)} cambian de precio, "
          f"{len(saltadas)} salteadas -> {ruta}", file=sys.stderr)
    for iid, sku, motivo in saltadas:
        print(f"  saltada {iid} sku={sku}: {motivo}", file=sys.stderr)

    if not a.aplicar:
        for p in cambian[:10]:
            print(f"  #{p['sku']:>4} {p['precio_viejo']:>10,.0f} -> {p['precio_nuevo']:>10,} "
                  f"neto {p['neto_nuevo']:>10,.0f} vs web {p['web_ars']:>10,.0f}", file=sys.stderr)
        print("Simulacion: no se escribio nada. Agregar --aplicar.", file=sys.stderr)
        return

    def aplicar(p):
        ok, err = poner_precio(p["item_id"], p["precio_nuevo"])
        p["aplicado"] = "si" if ok else "no"
        p["error"] = err or ""
        return p

    with ThreadPoolExecutor(max_workers=HILOS) as ex:
        list(ex.map(aplicar, cambian))

    fallidas = [p for p in cambian if p.get("aplicado") != "si"]
    with open(ruta, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(plan[0].keys()) + ["aplicado", "error"])
        w.writeheader()
        for p in plan:
            p.setdefault("aplicado", "sin cambio"); p.setdefault("error", "")
            w.writerow(p)
    print(f"Aplicadas: {len(cambian) - len(fallidas)} / {len(cambian)}. "
          f"Fallidas: {len(fallidas)}. Detalle en {ruta}", file=sys.stderr)
    for p in fallidas[:20]:
        print(f"  fallo #{p['sku']} {p['item_id']}: {p['error']}", file=sys.stderr)


if __name__ == "__main__":
    main()
