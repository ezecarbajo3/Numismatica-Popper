#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generador de la planilla de carga masiva de MercadoLibre a partir de coins.json.

Uso:
    python3 ml_bulk.py --sample          # muestra 3 filas de ejemplo y no escribe nada
    python3 ml_bulk.py                   # genera la planilla + el CSV de control
    python3 ml_bulk.py --dolar-rate 1540 # fuerza la cotizacion (si dolarhoy falla)

Nunca modifica coins.json ni la planilla original descargada.
"""

# =============================================================================
# CONFIGURACION  --  editar aca
# =============================================================================
MARKUP                   = 1.20
FIJO_ARS                 = 3000
UMBRAL_ENVIO_GRATIS_USD  = 100      # sobre el precio web en USD
RECARGO_ENVIO_GRATIS     = 20000
COMISION_ML              = 0.16     # confirmado: la col J de la planilla devuelve 16%
COSTO_FIJO_UNIDAD        = 0        # PENDIENTE: completar segun el simulador de ML
COSTO_ENVIO_ESTIMADO_ARS = 0        # PENDIENTE: costo real de un envio con envio gratis

PLANILLA_ORIGEN = "/Users/ezecarbajo/Downloads/Publicar-09-06-15_27_06.xlsx"
COINS_JSON      = "/Users/ezecarbajo/popper-site/coins.json"
DIR_SALIDA      = "/Users/ezecarbajo/popper-site/salidas_ml"
BASE_URL        = "https://numismaticapopper.com/"

# Monedas con el ano corregido a mano (el JSON no lo trae valido)
YEAR_OVERRIDE = {26: 2021}

# =============================================================================
import argparse
import csv
import json
import math
import os
import re
import shutil
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from urllib.request import Request, urlopen

import openpyxl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ml_mapeos as mp

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " \
     "(KHTML, like Gecko) Chrome/122.0 Safari/537.36"

EXT_IMAGEN = (".jpeg", ".jpg", ".png", ".webp")
FILA_INICIAL = 8
MAX_TITULO = 60
MAX_DESCRIPCION = 50000
PRECIO_MINIMO_ML = 1000


# --- 1. Cotizacion -----------------------------------------------------------
def cotizacion_blue_venta():
    """Dolar blue VENTA en vivo desde dolarhoy.com. Sin fallback: si falla, corta."""
    url = "https://dolarhoy.com/cotizaciondolarblue"
    html = urlopen(Request(url, headers={"User-Agent": UA}), timeout=25).read().decode("utf-8", "replace")
    i = html.find('class="tile cotizacion_value"')
    if i < 0:
        raise ValueError("no se encontro el bloque 'tile cotizacion_value' en dolarhoy.com")
    m = re.search(r'<div class="topic">\s*Venta\s*</div>\s*<div class="value">\s*\$?\s*([\d.]+,\d+|[\d.]+)\s*</div>',
                  html[i:i + 4000], re.S)
    if not m:
        raise ValueError("no se encontro el valor de Venta dentro del bloque de cotizacion")
    valor = float(m.group(1).replace(".", "").replace(",", "."))
    if not (100 < valor < 100000):
        raise ValueError(f"cotizacion fuera de rango razonable: {valor}")
    return valor


# --- 2. Lectura y filtrado del catalogo --------------------------------------
def precio_usd(coin):
    m = re.match(r"^([\d.,]+)\s*USD$", str(coin.get("price", "")).strip())
    return float(m.group(1).replace(",", "")) if m else None


def imagenes_json(coin):
    return [i for i in (coin.get("images") or []) if str(i).lower().endswith(EXT_IMAGEN)]


def anio(coin):
    cid = coin.get("id")
    y = YEAR_OVERRIDE.get(cid, coin.get("year"))
    return int(y) if str(y or "").isdigit() else None


def filtrar(coins):
    incluidas, excluidas = [], []
    for c in coins:
        cid = str(c.get("id"))
        if c.get("status") == "sold":
            excluidas.append((cid, "vendida")); continue
        if not cid.isdigit():
            excluidas.append((cid, "ID con letra (moneda de tercero)")); continue
        if c.get("hidden"):
            excluidas.append((cid, "oculta en el sitio")); continue
        if precio_usd(c) is None:
            excluidas.append((cid, 'precio "Consultar"')); continue
        if len(imagenes_json(c)) < 2:
            excluidas.append((cid, "sin foto de anverso y reverso")); continue
        if re.search(r"\blotes?\b", str(c.get("title", "")), re.I):
            excluidas.append((cid, "es un lote")); continue
        if anio(c) is None:
            excluidas.append((cid, "sin ano de emision valido")); continue
        incluidas.append(c)
    return incluidas, excluidas


# --- 3. Fotos ----------------------------------------------------------------
def head_ok(url):
    try:
        req = Request(url, headers={"User-Agent": UA})
        req.get_method = lambda: "HEAD"
        with urlopen(req, timeout=20) as r:
            return r.status == 200
    except Exception:
        return False


def verificar_fotos(coins):
    """Devuelve {id: [urls validas]} y la lista de URLs que fallaron."""
    pendientes = []
    for c in coins:
        for rel in imagenes_json(c):
            pendientes.append((c["id"], BASE_URL + str(rel).lstrip("/")))
    print(f"Verificando {len(pendientes)} fotos con HEAD...", file=sys.stderr)
    with ThreadPoolExecutor(max_workers=8) as ex:
        resultados = list(ex.map(lambda t: head_ok(t[1]), pendientes))
    validas, fallidas = {}, []
    for (cid, url), ok in zip(pendientes, resultados):
        if ok:
            validas.setdefault(cid, []).append(url)   # conserva el orden del JSON
        else:
            fallidas.append((cid, url))
    return validas, fallidas


# --- 4. Titulo ---------------------------------------------------------------
def valor_facial(coin):
    """El title del JSON sin el ano."""
    t = re.sub(r"\s+", " ", str(coin.get("title", "")).strip())
    y = str(coin.get("year") or "")
    if y and y in t:
        t = re.sub(r"\b" + re.escape(y) + r"\b", "", t)
    return re.sub(r"\s+", " ", t).strip(" -")


def construir_titulo(coin):
    """Devuelve (titulo, se_paso_de_60)."""
    # solo el pais: "Argentina - Patria" -> "Argentina"
    pais = coin.get("country", "").split(" - ")[0].strip()
    cuerpo = f"{pais} {valor_facial(coin)} {anio(coin)}"
    cuerpo = re.sub(r"\s+", " ", cuerpo).strip()
    con_prefijo = f"Moneda {cuerpo}"
    if len(con_prefijo) <= MAX_TITULO:
        return con_prefijo, False
    if len(cuerpo) <= MAX_TITULO:
        return cuerpo, False
    return cuerpo, True


# --- 5. Descripcion ----------------------------------------------------------
def construir_descripcion(coin):
    """Solo con datos que ya estan en coins.json. Sin placeholders."""
    lineas = []
    cons = mp.conservacion(coin.get("grade_short"))
    if cons:
        lineas.append(f"Estado de conservacion: {cons}")
    if str(coin.get("reference") or "").strip():
        lineas.append(f"Referencia de catalogo: {str(coin['reference']).strip()}")
    if str(coin.get("metal") or "").strip():
        lineas.append(f"Material: {str(coin['metal']).strip()}")
    if coin.get("peso"):
        lineas.append(f"Peso: {coin['peso']} g")
    if coin.get("diametro"):
        lineas.append(f"Diametro: {coin['diametro']} mm")
    if str(coin.get("mintage") or "").strip():
        lineas.append(f"Tirada: {str(coin['mintage']).strip()}")
    if str(coin.get("commemorates") or "").strip():
        lineas.append(f"Conmemora: {str(coin['commemorates']).strip()}")
    if str(coin.get("description") or "").strip():
        lineas.append("")
        lineas.append(str(coin["description"]).strip())
    texto = "\n".join(lineas).strip()
    # sin acentos raros, y bien dentro del limite de ML
    return texto[:MAX_DESCRIPCION]


# --- 6/7. Precio y rentabilidad ----------------------------------------------
def techo_mil(x):
    """Siempre hacia arriba al multiplo de 1000. 1530->2000, 12000->12000."""
    return int(math.ceil(x / 1000.0)) * 1000


def calcular_precio(usd, cotiz):
    """Devuelve un dict con todo el detalle del precio de la moneda."""
    precio_web_ars = usd * cotiz
    envio_gratis = usd >= UMBRAL_ENVIO_GRATIS_USD
    p = precio_web_ars * MARKUP + FIJO_ARS
    if envio_gratis:
        p += RECARGO_ENVIO_GRATIS
    p = techo_mil(p)
    p_original = p

    costo_envio = COSTO_ENVIO_ESTIMADO_ARS if envio_gratis else 0
    neto = p - p * COMISION_ML - COSTO_FIJO_UNIDAD - costo_envio

    corregido = False
    if neto < precio_web_ars:
        p_min = (precio_web_ars + COSTO_FIJO_UNIDAD + costo_envio) / (1 - COMISION_ML)
        p = techo_mil(p_min)
        neto = p - p * COMISION_ML - COSTO_FIJO_UNIDAD - costo_envio
        corregido = True
        if neto < precio_web_ars:
            raise RuntimeError(
                f"la correccion de rentabilidad no cierra: precio={p} neto={neto:.2f} "
                f"< precio_web_ars={precio_web_ars:.2f}")

    if p < PRECIO_MINIMO_ML:
        p = PRECIO_MINIMO_ML
        neto = p - p * COMISION_ML - COSTO_FIJO_UNIDAD - costo_envio

    return {
        "precio_web_ars": round(precio_web_ars, 2),
        "envio_gratis": envio_gratis,
        "precio_original": p_original,
        "precio_ml": p,
        "neto": round(neto, 2),
        "margen": round(neto - precio_web_ars, 2),
        "corregido": corregido,
    }


# --- Armado de la fila -------------------------------------------------------
COLUMNAS = {
    "A": "Codigo de catalogo ML", "B": "Titulo", "D": "Condicion", "E": "Fotos",
    "F": "SKU", "G": "Stock", "H": "Precio [$]", "I": "Descripcion",
    "K": "Cuotas", "M": "Forma de envio", "N": "Costo de envio",
    "O": "Retiro en persona", "P": "Tipo de garantia", "Q": "Tiempo de garantia",
    "R": "Unidad de Tiempo de garantia", "S": "Factura A", "T": "Ano de emision",
    "U": "Origen", "V": "Marca", "W": "Modelo", "X": "Tipo de metal",
    "Y": "Moneda conmemorativa", "Z": "Valor de la moneda", "AA": "Tipo de moneda",
}


def armar_fila(coin, fotos, precio, titulo):
    return {
        "A": None,
        "B": titulo,
        "D": "Usado",
        "E": ",".join(fotos),
        "F": str(coin["id"]),
        "G": 1,
        "H": precio["precio_ml"],
        "I": construir_descripcion(coin),
        "K": "No agregar cuotas",
        "M": "Mercado Envíos",
        "N": "Ofrecés envío gratis" if precio["envio_gratis"] else "A cargo del comprador",
        "O": "Acepto",
        "P": "Sin garantía",
        "Q": None,
        "R": "Seleccionar",
        "S": "No ofrezco",
        "T": anio(coin),
        "U": mp.origen(coin.get("country")),
        "V": None,
        "W": None,
        "X": mp.metal(coin.get("metal")),
        "Y": str(coin.get("commemorates") or "").strip() or None,
        "Z": valor_facial(coin) or None,
        "AA": mp.tipo_moneda(valor_facial(coin), coin.get("country")),
    }


# --- Main --------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dolar-rate", type=float, default=None,
                    help="cotizacion blue venta manual (solo si dolarhoy falla)")
    ap.add_argument("--sample", action="store_true",
                    help="imprime 3 filas completas y termina sin escribir nada")
    args = ap.parse_args()

    # 1. Cotizacion
    if args.dolar_rate:
        cotiz = args.dolar_rate
        fuente = "manual (--dolar-rate)"
    else:
        try:
            cotiz = cotizacion_blue_venta()
            fuente = "dolarhoy.com (blue venta, en vivo)"
        except Exception as e:
            print("\nERROR: no se pudo obtener la cotizacion del dolar blue.", file=sys.stderr)
            print(f"       Detalle: {e}", file=sys.stderr)
            print("       Ejecucion DETENIDA (sin fallback).", file=sys.stderr)
            print("       Pasame la cotizacion por chat y reintento con --dolar-rate <valor>.\n",
                  file=sys.stderr)
            sys.exit(1)

    # 2. Catalogo
    with open(COINS_JSON, encoding="utf-8") as f:
        coins = json.load(f)
    total = len(coins)
    incluidas, excluidas = filtrar(coins)

    # 3. Fotos
    fotos_validas, fotos_fallidas = verificar_fotos(incluidas)
    finales, sin_fotos = [], []
    for c in incluidas:
        f = fotos_validas.get(c["id"], [])
        if len(f) < 2:
            sin_fotos.append(str(c["id"]))
            excluidas.append((str(c["id"]), "fotos no accesibles (HEAD != 200)"))
        else:
            finales.append((c, f))

    # 4-7. Titulos, precios
    filas, titulos_largos, correcciones = [], [], []
    for c, fotos in finales:
        titulo, se_paso = construir_titulo(c)
        if se_paso:
            titulos_largos.append((str(c["id"]), len(titulo), titulo))
            excluidas.append((str(c["id"]), "titulo > 60 caracteres (revisar a mano)"))
            continue
        precio = calcular_precio(precio_usd(c), cotiz)
        if precio["corregido"]:
            correcciones.append((str(c["id"]), titulo, precio["precio_original"],
                                 precio["precio_ml"],
                                 precio["precio_ml"] - precio["precio_original"]))
        filas.append((c, armar_fila(c, fotos, precio, titulo), precio))

    # --sample: mostrar 3 filas y salir
    if args.sample:
        print(f"\nCotizacion: ${cotiz:,.2f} ARS  [{fuente}]")
        print(f"Monedas que entrarian: {len(filas)}\n")
        for c, fila, precio in filas[:3]:
            print("=" * 78)
            print(f"MONEDA id={c['id']}  ({precio_usd(c)} USD)")
            print("=" * 78)
            for col, nombre in COLUMNAS.items():
                v = fila[col]
                if col == "I" and v:
                    print(f"  {col:>2} {nombre:<28} |")
                    for ln in str(v).split("\n"):
                        print(f"     {'':28} | {ln}")
                else:
                    print(f"  {col:>2} {nombre:<28} | {v if v is not None else '(vacio)'}")
            print(f"  -- precio_web_ars={precio['precio_web_ars']:,.2f}  "
                  f"neto={precio['neto']:,.2f}  margen={precio['margen']:,.2f}  "
                  f"envio_gratis={precio['envio_gratis']}  corregido={precio['corregido']}")
            print()
        print("(--sample: no se escribio ningun archivo)")
        return

    # 8. Escritura del xlsx (siempre sobre una copia)
    os.makedirs(DIR_SALIDA, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M")
    destino = os.path.join(DIR_SALIDA, f"Publicar-ML-{ts}.xlsx")
    shutil.copy2(PLANILLA_ORIGEN, destino)

    wb = openpyxl.load_workbook(destino)   # sin data_only: preserva las formulas
    ws = wb["Monedas"]
    if FILA_INICIAL + len(filas) - 1 > ws.max_row:
        print(f"ERROR: la planilla admite hasta la fila {ws.max_row} "
              f"({ws.max_row - FILA_INICIAL + 1} publicaciones) y hay {len(filas)}.",
              file=sys.stderr)
        sys.exit(1)

    for i, (_, fila, _) in enumerate(filas):
        r = FILA_INICIAL + i
        for col, valor in fila.items():
            ws[f"{col}{r}"] = valor
    # limpiar las filas sobrantes que ML dejo pre-cargadas con valores por defecto
    for r in range(FILA_INICIAL + len(filas), ws.max_row + 1):
        for col in COLUMNAS:
            ws[f"{col}{r}"] = None
    wb.save(destino)

    # 9. CSV de control
    csv_path = os.path.join(DIR_SALIDA, f"control-{ts}.csv")
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "titulo", "precio_usd", "precio_web_ars", "precio_ml",
                    "envio_gratis", "neto_estimado", "margen", "corregido_si_no"])
        for c, fila, p in filas:
            w.writerow([c["id"], fila["B"], precio_usd(c), p["precio_web_ars"],
                        p["precio_ml"], "si" if p["envio_gratis"] else "no",
                        p["neto"], p["margen"], "si" if p["corregido"] else "no"])

    # 10. Reporte
    print("\n" + "=" * 78)
    print("REPORTE DE GENERACION")
    print("=" * 78)
    print(f"Cotizacion dolar blue VENTA : ${cotiz:,.2f} ARS  [{fuente}]")
    print(f"Monedas procesadas          : {total}")
    print(f"Incluidas en la planilla    : {len(filas)}")
    print(f"Excluidas                   : {total - len(filas)}")
    motivos = {}
    for _, m in excluidas:
        motivos[m] = motivos.get(m, 0) + 1
    for m, n in sorted(motivos.items(), key=lambda x: -x[1]):
        print(f"    - {m:<45} {n:>4}")
    print(f"Con envio gratis            : {sum(1 for _, _, p in filas if p['envio_gratis'])}")
    print(f"\nPlanilla : {destino}")
    print(f"CSV      : {csv_path}")

    print("\n--- Monedas con precio corregido por rentabilidad ---")
    if correcciones:
        print(f"{'ID':>6}  {'Titulo':<44} {'Original':>10} {'Corregido':>10} {'Dif':>9}")
        for cid, tit, o, n, d in correcciones:
            print(f"{cid:>6}  {tit[:44]:<44} {o:>10,} {n:>10,} {d:>+9,}")
    else:
        print("  (ninguna: todas cierran con el precio calculado)")

    print("\n--- Top 10 de mayor precio ---")
    print(f"{'ID':>6}  {'Titulo':<44} {'USD':>7} {'Precio ML':>11} {'Neto':>11} {'Envio':>7}")
    for c, fila, p in sorted(filas, key=lambda x: -x[2]["precio_ml"])[:10]:
        print(f"{c['id']:>6}  {fila['B'][:44]:<44} {precio_usd(c):>7,.0f} "
              f"{p['precio_ml']:>11,} {p['neto']:>11,.0f} "
              f"{'gratis' if p['envio_gratis'] else 'comprad':>7}")

    if titulos_largos:
        print("\n--- Titulos que NO entran en 60 caracteres (resolver a mano) ---")
        for cid, ln, tit in titulos_largos:
            print(f"  id={cid}  ({ln} chars)  {tit}")

    if fotos_fallidas:
        print(f"\n--- Fotos que NO respondieron 200 ({len(fotos_fallidas)}) ---")
        for cid, url in fotos_fallidas:
            print(f"  id={cid}  {url}")
    if sin_fotos:
        print(f"  -> excluidas por quedarse sin anverso+reverso: {', '.join(sin_fotos)}")

    if COSTO_FIJO_UNIDAD == 0 or COSTO_ENVIO_ESTIMADO_ARS == 0:
        print("\n*** AVISO: COSTO_FIJO_UNIDAD y/o COSTO_ENVIO_ESTIMADO_ARS estan en 0. ***")
        print("    Los netos de las publicaciones con envio gratis estan sobreestimados.")
        print("    Cargalos al tope de ml_bulk.py cuando los tengas del simulador de ML.")
    print()


if __name__ == "__main__":
    main()
