#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Completa Marca y Modelo en la planilla de fichas tecnicas de MercadoLibre.

Las 639 publicaciones quedaron con BRAND y MODEL vacios, lo que dispara el
objetivo de calidad "Corregi las caracteristicas" y baja la exposicion.

Uso:
    python3 ml_mejorar.py --sample   # muestra 3 filas y no escribe nada
    python3 ml_mejorar.py            # genera la copia completada

Nunca modifica coins.json ni la planilla descargada de ML.
"""

# =============================================================================
# CONFIGURACION
# =============================================================================
MARCA = "Genérica"          # ML: "escribi la marca real o 'Generica' si no tiene"

PLANILLA_ORIGEN = "/Users/ezecarbajo/Downloads/Fichas_tecnicas-2026_09_06-18_08.xlsx"
COINS_JSON      = "/Users/ezecarbajo/popper-site/coins.json"
DIR_SALIDA      = "/Users/ezecarbajo/popper-site/salidas_ml"

HOJA         = "Monedas"
FILA_INICIAL = 5
# Columnas de la planilla (relevadas del archivo real)
COL = {"FAMILY": 1, "ID": 2, "SKU": 4, "TITLE": 9, "ORIGIN": 10, "YEAR": 11,
       "BRAND": 12, "MODEL": 13, "METAL": 14, "COMMEM": 15, "VALUE": 16,
       "COINTYPE": 17}
# Solo se escriben estas dos. El resto ya vino bien cargado desde la publicacion.
COLUMNAS_A_ESCRIBIR = ("BRAND", "MODEL")

# =============================================================================
import argparse
import collections
import csv
import re
import json
import os
import shutil
import sys
from datetime import datetime

import openpyxl


def cargar_coins():
    with open(COINS_JSON, encoding="utf-8") as f:
        return {str(c["id"]): c for c in json.load(f)}


def leer_filas(ws):
    filas = []
    for r in range(FILA_INICIAL, ws.max_row + 1):
        if not ws.cell(r, COL["ID"]).value:
            continue
        filas.append({
            "row": r,
            "family": ws.cell(r, COL["FAMILY"]).value,
            "id": ws.cell(r, COL["ID"]).value,
            "sku": str(ws.cell(r, COL["SKU"]).value or "").strip(),
            "title": ws.cell(r, COL["TITLE"]).value,
            "value": (ws.cell(r, COL["VALUE"]).value or "").strip(),
        })
    return filas


def modelos_por_familia(filas, coins):
    """ML exige el MISMO Modelo en todas las variantes de una familia.

    Se usa la referencia de catalogo (CJ#/KM#) solo cuando toda la familia
    comparte una unica referencia; si las variantes tienen referencias
    distintas o falta el dato, se cae al valor facial, que si es comun.
    """
    fam = collections.defaultdict(list)
    for f in filas:
        fam[f["family"]].append(f)

    modelos, origen_dato = {}, {}
    for clave, grupo in fam.items():
        refs = {(coins[f["sku"]].get("reference") or "").strip()
                for f in grupo if f["sku"] in coins}
        refs.discard("")
        falta_alguna = any(f["sku"] not in coins for f in grupo)
        if len(refs) == 1 and not falta_alguna:
            modelos[clave] = refs.pop()
            origen_dato[clave] = "referencia"
        else:
            valores = {f["value"] for f in grupo if f["value"]}
            valor = valores.pop() if len(valores) == 1 else (grupo[0]["value"] or "")
            # un valor facial que quedo como puro numero ("10") no sirve de Modelo:
            # en ese caso se usa el titulo sin el prefijo "Moneda ".
            if not valor or re.fullmatch(r"[\d.,/ ]*", valor):
                valor = re.sub(r"^Moneda\s+", "", str(grupo[0]["title"] or "")).strip()
            modelos[clave] = valor
            origen_dato[clave] = ("valor facial (referencias distintas)"
                                  if len(refs) > 1 else "valor facial (sin referencia)")
    return modelos, origen_dato


def completar_vacios(ws, filas, coins):
    """Algunas filas vuelven de ML con TODOS los atributos vacios, incluido el
    ano de emision, que es obligatorio. Se completan desde coins.json y desde
    lo que ya tienen sus hermanas de familia, para no romper la consistencia
    que ML exige entre variantes."""
    import ml_mapeos as mp

    por_familia = collections.defaultdict(list)
    for f in filas:
        por_familia[f["family"]].append(f)

    def comun(grupo, col):
        vals = [ws.cell(g["row"], COL[col]).value for g in grupo]
        vals = [v for v in vals if v not in (None, "")]
        return collections.Counter(vals).most_common(1)[0][0] if vals else None

    completadas = []
    for f in filas:
        r = f["row"]
        faltan = [c for c in ("ORIGIN", "YEAR", "METAL", "VALUE", "COINTYPE")
                  if ws.cell(r, COL[c]).value in (None, "")]
        if not faltan:
            continue
        grupo = por_familia[f["family"]]
        coin = coins.get(f["sku"])
        nuevos = {}
        for c in faltan:
            v = comun(grupo, c)              # 1) lo que ya usan sus hermanas
            if v in (None, "") and coin:     # 2) el dato del catalogo
                if c == "ORIGIN":
                    v = mp.origen(coin.get("country"))
                elif c == "YEAR":
                    v = str(coin.get("year") or "")
                elif c == "METAL":
                    v = mp.metal(coin.get("metal"))
                elif c == "VALUE":
                    v = str(coin.get("title") or "")
                elif c == "COINTYPE":
                    v = mp.tipo_moneda(str(coin.get("title") or ""), coin.get("country"))
            if v not in (None, ""):
                nuevos[c] = v
        if nuevos:
            completadas.append((f, nuevos))
    return completadas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", action="store_true",
                    help="imprime 3 filas y termina sin escribir nada")
    args = ap.parse_args()

    coins = cargar_coins()
    wb = openpyxl.load_workbook(PLANILLA_ORIGEN)
    ws = wb[HOJA]
    filas = leer_filas(ws)
    modelos, origen_dato = modelos_por_familia(filas, coins)

    completadas = completar_vacios(ws, filas, coins)
    sin_match = [f["sku"] for f in filas if f["sku"] not in coins]
    resumen = collections.Counter(origen_dato[f["family"]] for f in filas)

    if args.sample:
        print(f"\nFilas en la planilla: {len(filas)}")
        print(f"Familias: {len(modelos)}")
        print(f"SKU sin match en coins.json: {len(sin_match)} -> {sin_match}")
        print("\nOrigen del Modelo (por fila):")
        for k, v in resumen.most_common():
            print(f"  {v:>4}  {k}")
        print("\n" + "=" * 74)
        print("3 FILAS DE EJEMPLO")
        print("=" * 74)
        muestras = [filas[0]]
        fam_grandes = collections.Counter(f["family"] for f in filas)
        grande = fam_grandes.most_common(1)[0][0]
        muestras.append(next(f for f in filas if f["family"] == grande))
        if sin_match:
            muestras.append(next(f for f in filas if f["sku"] not in coins))
        else:
            muestras.append(filas[-1])
        for f in muestras:
            c = coins.get(f["sku"])
            print(f"\n  fila {f['row']}  {f['id']}  SKU {f['sku']}")
            print(f"    Titulo (fijo)        : {f['title']}")
            print(f"    Valor de moneda (fijo): {f['value']}")
            print(f"    reference en el JSON : {(c.get('reference') if c else '(sin match)')!r}")
            print(f"    variantes en la familia: {fam_grandes[f['family']]}")
            print(f"    --> Marca            : {MARCA}")
            print(f"    --> Modelo           : {modelos[f['family']]}   [{origen_dato[f['family']]}]")
        if completadas:
            print(f"\nFilas con atributos vacios que se van a completar: {len(completadas)}")
            for f, nuevos in completadas:
                print(f"  fila {f['row']}  {f['id']}  SKU {f['sku']}  {f['title']}")
                for c, v in nuevos.items():
                    print(f"      {c:<9} -> {v!r}")
        print("\n(--sample: no se escribio ningun archivo)")
        return

    os.makedirs(DIR_SALIDA, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M")
    destino = os.path.join(DIR_SALIDA, f"Fichas-completadas-{ts}.xlsx")
    shutil.copy2(PLANILLA_ORIGEN, destino)

    wb2 = openpyxl.load_workbook(destino)
    ws2 = wb2[HOJA]
    for f in filas:
        ws2.cell(f["row"], COL["BRAND"]).value = MARCA
        ws2.cell(f["row"], COL["MODEL"]).value = modelos[f["family"]]
    for f, nuevos in completadas:
        for c, v in nuevos.items():
            ws2.cell(f["row"], COL[c]).value = v
    # openpyxl normaliza '' a None al reguardar. ML podria leer una celda
    # ausente distinto de una vacia, asi que se restaura la cadena vacia
    # exactamente donde el archivo original la tenia.
    for f in filas:
        for c in range(1, ws.max_column + 1):
            if ws.cell(f["row"], c).value == "" and ws2.cell(f["row"], c).value is None:
                ws2.cell(f["row"], c).value = ""
    wb2.save(destino)

    csv_path = os.path.join(DIR_SALIDA, f"control-fichas-{ts}.csv")
    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["publicacion_id", "sku", "titulo", "marca", "modelo",
                    "origen_modelo", "variantes_en_familia"])
        conteo = collections.Counter(f["family"] for f in filas)
        for f in filas:
            w.writerow([f["id"], f["sku"], f["title"], MARCA,
                        modelos[f["family"]], origen_dato[f["family"]],
                        conteo[f["family"]]])

    print("\n" + "=" * 74)
    print("FICHAS TECNICAS COMPLETADAS")
    print("=" * 74)
    print(f"Filas completadas : {len(filas)}")
    print(f"Familias          : {len(modelos)}")
    print(f"Marca             : '{MARCA}' en todas")
    print("\nOrigen del Modelo (por fila):")
    for k, v in resumen.most_common():
        print(f"  {v:>4}  {k}")
    if sin_match:
        print(f"\nSKU sin match en coins.json ({len(sin_match)}): {', '.join(sin_match)}")
        print("  -> se les puso el valor facial que ya traia la planilla.")
    if completadas:
        print(f"\nFilas con atributos vacios completadas: {len(completadas)}")
        for f, nuevos in completadas:
            print(f"  {f['id']} SKU {f['sku']}: " +
                  ", ".join(f"{c}={v!r}" for c, v in nuevos.items()))
    print(f"\nPlanilla : {destino}")
    print(f"CSV      : {csv_path}")
    print()


if __name__ == "__main__":
    main()
