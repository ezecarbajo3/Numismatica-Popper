#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Publica en Mercado Libre una moneda recien subida al catalogo web.

La skill `pp` inserta la moneda en coins.json, copia las fotos y hace push. Este
modulo toma ese mismo coin_obj y crea la publicacion en ML por API, para que los
dos canales salgan juntos y no haya que cargar nada dos veces.

Reusa todo lo que ya decide `ml_bulk` para la carga masiva -- filtros, titulo,
descripcion y precio -- asi las publicaciones nuevas quedan iguales a las 639 que
ya estan arriba. La unica diferencia es el camino: POST /items en vez de planilla.

Las fotos se suben desde el archivo local con ml_api.subir_foto() y no por URL.
La moneda se publica en el mismo instante en que se pushea al sitio, asi que la
URL publica todavia puede no existir: GitHub Pages tarda en buildear.

Uso:
    python3 ml_publicar.py --id 1400            # publica esa moneda de coins.json
    python3 ml_publicar.py --id 1400 --dry-run  # imprime el JSON y no postea nada
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ml_api
import ml_bulk
import ml_mapeos as mp
import ml_stock

# Antiguedades y Colecciones > Monedas y Billetes > Monedas.
# Se hardcodea a proposito: todas las piezas son monedas, y el predictor de ML
# devuelve "Monedas para maquinas arcade" como segunda opcion para titulos raros.
CATEGORIA = "MLA2061"
MONEDA = "ARS"
TIPO_PUBLICACION = "gold_special"      # "Clasica": la misma de las 639 ya publicadas
GARANTIA_SIN = "6150835"               # sale_terms WARRANTY_TYPE = "Sin garantia"
MAX_TITULO = 60

# value_id de las listas cerradas de la categoria. Mandar el id evita que un
# acento ("Niquel", "Japon") haga fallar la resolucion por nombre.
IDS_ORIGEN = {
    "Argentina": "96380", "Alemania": "1098900", "Brasil": "97214",
    "Chile": "1253099", "China": "96381", "España": "2114722",
    "Estados Unidos": "2114723", "Francia": "2114724", "Inglaterra": "2114727",
    "Italia": "1253100", "Japón": "1098901", "México": "2240786",
    "Uruguay": "2114737",
}
IDS_METAL = {"Oro": "2114738", "Plata": "2114739", "Bronce": "2114740",
             "Cobre": "2114741", "Níquel": "2114742"}
IDS_TIPO = {"Peso": "2114743", "Real": "2114744", "Euro": "2114745",
            "Dólar": "2114746", "Sheqel": "2114747", "Yuan": "2114748",
            "Zloty": "2114749", "Rublo": "2114750", "Yen": "2114751",
            "Grivna": "4011961"}

MARCA = "Genérica"      # sin esto ML deja el aviso "Completa las caracteristicas"


def _attr(aid, nombre, ids=None):
    """Un atributo del POST. Devuelve None si el valor esta vacio."""
    if not nombre:
        return None
    nombre = str(nombre).strip()
    if not nombre:
        return None
    a = {"id": aid, "value_name": nombre}
    if ids and nombre in ids:
        a["value_id"] = ids[nombre]
    return a


def armar_payload(coin, fotos, precio, titulo):
    """El cuerpo del POST /items. El espejo de ml_bulk.armar_fila(), por API."""
    atributos = [
        # SELLER_SKU es el que ata la publicacion a coins.json: ml_stock lo lee
        # para sincronizar el stock. Sin esto la moneda queda huerfana en ML.
        _attr("SELLER_SKU", str(coin["id"])),
        _attr("ISSUE_YEAR", ml_bulk.anio(coin)),
        _attr("ORIGIN", mp.origen(coin.get("country")), IDS_ORIGEN),
        _attr("METAL_TYPE", mp.metal(coin.get("metal")), IDS_METAL),
        _attr("COIN_TYPE", mp.tipo_moneda(ml_bulk.valor_facial(coin), coin.get("country")), IDS_TIPO),
        _attr("COIN_VALUE", ml_bulk.valor_facial(coin)),
        _attr("BRAND", MARCA),
        _attr("MODEL", coin.get("reference")),
        _attr("COMMEMORATIVE_COIN", coin.get("commemorates")),
    ]
    return {
        # En esta categoria ML publica por "familia": se manda `family_name` y el
        # titulo lo arma el solo con los atributos. Mandar `title` ademas hace
        # fallar el alta con "The fields [title] are invalid". Es el mismo
        # agrupamiento que en la carga masiva junto 634 filas en 537 publicaciones.
        "family_name": titulo,
        "category_id": CATEGORIA,
        "price": precio["precio_ml"],
        "currency_id": MONEDA,
        "available_quantity": max(1, int(coin.get("cantidad") or 1)),
        "buying_mode": "buy_it_now",
        "listing_type_id": TIPO_PUBLICACION,
        "condition": "used",
        "pictures": fotos,
        "sale_terms": [{"id": "WARRANTY_TYPE", "value_id": GARANTIA_SIN,
                        "value_name": "Sin garantía"}],
        # logistic_type y tags los asigna ML: mandarlos hace fallar el POST.
        "shipping": {"mode": "me2", "local_pick_up": True,
                     "free_shipping": bool(precio["envio_gratis"])},
        "attributes": [a for a in atributos if a],
    }


def _subir_fotos(coin):
    """Sube los JPEG locales y devuelve (lista_para_pictures, error)."""
    base = os.path.dirname(os.path.abspath(__file__))
    fotos = []
    for rel in ml_bulk.imagenes_json(coin):
        ruta = os.path.join(base, str(rel).lstrip("/"))
        if not os.path.exists(ruta):
            continue
        try:
            r = ml_api.subir_foto(ruta)
        except Exception as e:
            return None, f"no se pudo subir {os.path.basename(ruta)}: {e}"
        pid = r.get("id")
        if pid:
            fotos.append({"id": pid})
    if len(fotos) < 2:
        return None, "no se pudieron subir las dos fotos"
    return fotos, None


def publicar(coin, cotizacion=None, dry_run=False):
    """Crea la publicacion de una moneda. Devuelve {'ok', 'motivo', 'item_id'}.

    Nunca levanta: la moneda ya esta publicada en el sitio propio cuando esto
    corre, asi que un fallo de ML es un aviso, no un motivo para deshacer nada.
    """
    cid = str(coin.get("id"))

    # 1. Los mismos filtros de la carga masiva: ID con letra, oculta, precio
    #    "Consultar", menos de dos fotos, lote, sin año de emision.
    incluidas, excluidas = ml_bulk.filtrar([coin])
    if not incluidas:
        return {"ok": False, "id": cid, "motivo": excluidas[0][1]}

    # 2. Guarda contra duplicados: si el SKU ya tiene publicacion VIVA, no se crea
    #    otra. Pasa al re-correr pp sobre una moneda ya subida.
    #
    #    Una publicacion cerrada no cuenta: cuando se vende la ultima unidad ML la
    #    cierra y ya no la deja reabrir ni actualizar. Si en la pagina todavia
    #    quedan unidades, la unica forma de volver a ponerla a la venta es esta.
    ya = ml_stock.buscar(cid)
    if ya.get("ok") and ya.get("status") != "closed":
        return {"ok": False, "id": cid, "item_id": ya["item_id"],
                "motivo": f"ya tiene publicacion ({ya['item_id']})"}

    titulo, largo = ml_bulk.construir_titulo(coin)
    if largo:
        return {"ok": False, "id": cid,
                "motivo": f"el titulo supera los {MAX_TITULO} caracteres, revisalo a mano"}

    usd = ml_bulk.precio_usd(coin)
    if cotizacion is None:
        try:
            cotizacion = ml_bulk.cotizacion_blue_venta()
        except Exception as e:
            return {"ok": False, "id": cid, "motivo": f"no se pudo cotizar el blue: {e}"}
    try:
        precio = ml_bulk.calcular_precio(usd, cotizacion)
    except Exception as e:
        return {"ok": False, "id": cid, "motivo": f"no se pudo calcular el precio: {e}"}

    if dry_run:
        fotos = [{"source": ml_bulk.BASE_URL + str(r).lstrip("/")}
                 for r in ml_bulk.imagenes_json(coin)]
        return {"ok": True, "id": cid, "dry_run": True, "precio": precio["precio_ml"],
                "payload": armar_payload(coin, fotos, precio, titulo),
                "descripcion": ml_bulk.construir_descripcion(coin)}

    fotos, err = _subir_fotos(coin)
    if err:
        return {"ok": False, "id": cid, "motivo": err}

    st, r = ml_api.pedir("POST", "/items", armar_payload(coin, fotos, precio, titulo))
    if st not in (200, 201):
        return {"ok": False, "id": cid, "motivo": f"POST /items fallo ({st}): {str(r)[:250]}"}

    item_id = r.get("id")

    # 3. La descripcion va en una segunda llamada: no entra en el POST ni en la
    #    planilla. Por eso las 639 publicaciones de la carga masiva no tienen.
    #    Si falla, la publicacion ya existe y no se deshace.
    aviso = None
    desc = ml_bulk.construir_descripcion(coin)
    if desc:
        std, rd = ml_api.pedir("POST", f"/items/{item_id}/description", {"plain_text": desc})
        if std not in (200, 201):
            aviso = f"quedo sin descripcion ({std})"

    # ML puede dejarla inactiva por la imagen en si ("incumple politicas").
    estado = r.get("status")
    if estado and estado != "active":
        aviso = f"{aviso + ' · ' if aviso else ''}quedo en estado '{estado}'"

    return {"ok": True, "id": cid, "item_id": item_id, "titulo": titulo,
            "precio": precio["precio_ml"], "permalink": r.get("permalink"),
            "motivo": aviso}


def publicar_varias(coins, cotizacion=None, dry_run=False):
    """Publica una lista de monedas, de a una.

    Secuencial a proposito: con mas de 4 llamadas en paralelo ML devuelve 429, y
    cada publicacion son 3 o 4 llamadas (dos fotos, el item y la descripcion).
    """
    if cotizacion is None and not dry_run:
        try:
            cotizacion = ml_bulk.cotizacion_blue_venta()
        except Exception:
            cotizacion = None
    return [publicar(c, cotizacion=cotizacion, dry_run=dry_run) for c in coins]


if __name__ == "__main__":
    def _arg(flag, default=None):
        return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default

    cid = _arg("--id")
    if not cid:
        print(__doc__)
        sys.exit(0)
    ruta = os.environ.get("POPPER_COINS_JSON") or ml_bulk.COINS_JSON
    with open(ruta, encoding="utf-8") as f:
        coins = json.load(f)
    coin = next((c for c in coins if str(c.get("id")).upper() == cid.upper()), None)
    if coin is None:
        sys.exit(f"No existe la moneda {cid} en {ruta}")
    print(json.dumps(publicar(coin, dry_run="--dry-run" in sys.argv),
                     ensure_ascii=False, indent=1))
