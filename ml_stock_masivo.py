#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Deja el stock de TODAS las publicaciones de Mercado Libre igual al de coins.json.

ml_stock.py sincroniza una moneda por venta; este modulo recorre el catalogo entero
para corregir lo que se desfaso (ventas fuera del widget, cargas masivas que subieron
stock 1 para todo, ventas hechas directo en ML).

Regla (la misma de ml_stock.py y de stock_actual_en_web en ml_sync.py): el stock de la
pagina manda. `status == "sold"` es 0; sin la clave `cantidad` es 1; si no, la cantidad.
Prioridad: nunca puede haber mas stock en ML que en la pagina, asi que primero se baja o
se pausa y despues se sube.

- Una publicacion cuyo SKU ya no existe en coins.json se trata como stock 0 (se pausa).
- Las cerradas, las pausadas con stock en la pagina y las monedas sin publicacion
  NO se tocan: solo se listan.

Uso:
    python3 ml_stock_masivo.py             # simulacion, no toca nada
    python3 ml_stock_masivo.py --aplicar   # escribe en ML
"""
import argparse
import csv
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ml_precios
import ml_stock

VIVAS = ("active", "paused", "under_review")
CAMPOS = "id,title,status,available_quantity,sold_quantity,attributes,variations"


def stock_web(coin):
    if str(coin.get("status") or "").lower() == "sold":
        return 0
    if "cantidad" not in coin:
        return 1
    try:
        return max(0, int(coin.get("cantidad") or 0))
    except (TypeError, ValueError):
        return 0


def decidir(it, objetivo, huerfana):
    """-> (accion, motivo). accion: ok | bajar | subir | info."""
    estado = it["status"]
    actual = it.get("available_quantity") or 0
    if it.get("variations"):
        return "info", "tiene variaciones: no se toca"
    if objetivo == 0:
        # ML rechaza available_quantity=0 ("Stock of item should be more than 0"):
        # lo mas que se puede hacer es pausar. Una pausada no se puede comprar, asi
        # que su stock residual queda como esta.
        if estado == "paused":
            return "ok", ""
        return "bajar", "huerfana: no esta en coins.json" if huerfana else "sin stock en la pagina"
    if actual > objetivo:
        return "bajar", f"ML tiene {actual} y la pagina {objetivo}"
    if actual < objetivo:
        if estado == "active":
            return "subir", f"ML tiene {actual} y la pagina {objetivo}"
        return "info", f"{estado} con stock en la pagina ({objetivo}); ML tiene {actual}"
    return "ok", ""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--aplicar", action="store_true", help="escribe en ML (sin esto es simulacion)")
    args = ap.parse_args()

    with open(ml_precios.COINS_JSON, encoding="utf-8") as f:
        coins = {str(c["id"]): c for c in json.load(f)}
    items = ml_precios.traer_items(CAMPOS)
    por_sku = {}
    for it in items:
        por_sku.setdefault(ml_precios.sku_de(it), []).append(it)

    acciones, info = [], []   # acciones: (accion, it, sku, objetivo, motivo)
    cerradas_con_stock = []
    for sku, grupo in por_sku.items():
        vivas = [i for i in grupo if i["status"] in VIVAS]
        if sku is None:
            info += [(i["id"], sku, i["status"], "sin SKU") for i in vivas]
            continue
        if not sku.isdigit():
            continue
        coin = coins.get(sku)
        objetivo = stock_web(coin) if coin else 0
        if not vivas:
            if objetivo > 0:
                cerradas_con_stock.append(sku)
            continue
        if len(vivas) > 1:
            info += [(i["id"], sku, i["status"], "SKU con mas de una publicacion viva") for i in vivas]
            continue
        accion, motivo = decidir(vivas[0], objetivo, coin is None)
        if accion == "info":
            info.append((vivas[0]["id"], sku, vivas[0]["status"], motivo))
        elif accion != "ok":
            acciones.append((accion, vivas[0], sku, objetivo, motivo))

    publicados = {s for s in por_sku if s}
    sin_publicar = sorted((k for k, c in coins.items()
                           if k.isdigit() and stock_web(c) > 0 and not c.get("hidden") and k not in publicados),
                          key=int)

    def aplicar(a):
        accion, it, sku, objetivo, motivo = a
        if not args.aplicar:
            return a, None, None
        pub = {"item_id": it["id"], "variation_id": None, "variaciones": []}
        ok, _, err = ml_stock._aplicar(objetivo, pub)
        return a, ok, err

    resultados = []
    for fase in ("bajar", "subir"):   # primero lo que evita sobreventa
        lote = [a for a in acciones if a[0] == fase]
        with ThreadPoolExecutor(max_workers=ml_precios.HILOS) as ex:
            resultados += list(ex.map(aplicar, lote))

    print(f"Publicaciones leidas: {len(items)}  |  acciones: {len(acciones)}  |  "
          f"{'APLICADO' if args.aplicar else 'SIMULACION (usar --aplicar)'}")
    for (accion, it, sku, objetivo, motivo), ok, err in resultados:
        estado_op = "" if ok is None else ("  OK" if ok else f"  FALLO: {err}")
        print(f"  {accion.upper():5} #{sku:<5} {it['id']} {it['status']:<12} "
              f"ML {it.get('available_quantity')} -> {objetivo}  ({motivo}){estado_op}")
    if info:
        print(f"\nSolo informar ({len(info)}):")
        for item_id, sku, estado, motivo in info:
            print(f"  #{sku} {item_id} {estado}: {motivo}")
    if cerradas_con_stock:
        print(f"\nCerradas en ML con stock en la pagina ({len(cerradas_con_stock)}): {', '.join(cerradas_con_stock)}")
    if sin_publicar:
        print(f"\nCon stock en la pagina y sin publicacion en ML ({len(sin_publicar)}): {', '.join(sin_publicar)}")

    os.makedirs(ml_precios.DIR_SALIDA, exist_ok=True)
    ruta = os.path.join(ml_precios.DIR_SALIDA, f"stock_{datetime.now():%Y%m%d_%H%M}.csv")
    with open(ruta, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["item_id", "sku", "estado", "ml_antes", "web", "accion", "motivo", "aplicado", "ok", "detalle"])
        for (accion, it, sku, objetivo, motivo), ok, err in resultados:
            w.writerow([it["id"], sku, it["status"], it.get("available_quantity"), objetivo, accion,
                        motivo, args.aplicar, "" if ok is None else ok, err or ""])
    print(f"\nCSV: {ruta}")
    if args.aplicar and any(ok is False for _, ok, _ in resultados):
        sys.exit(1)


if __name__ == "__main__":
    main()
