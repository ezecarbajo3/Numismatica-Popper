#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sincronizacion de stock entre coins.json y Mercado Libre.

El SKU de cada publicacion es el id de la moneda en coins.json: ml_bulk.py lo
carga en la columna F de la planilla y ML lo guarda como el atributo SELLER_SKU.
Por eso no hace falta ningun mapeo local: /users/{uid}/items/search?seller_sku=N
devuelve la publicacion en una sola llamada.

**El stock de la pagina manda.** No se resta ni se suma sobre lo que diga ML:
se copia la cantidad que quedo en coins.json. Si la moneda tiene 2 unidades y se
vende una, en ML quedan 2-1=1 y la publicacion sigue activa; recien cuando la
pagina llega a cero se pausa. Asi los dos canales no pueden quedar desfasados,
que es lo que pasa si cada uno lleva su propia cuenta.

Uso:
    python3 ml_stock.py --ver 507
    python3 ml_stock.py --sincronizar 507 --cantidad 0

Ninguna funcion levanta excepcion hacia el widget: todas devuelven un dict con
'ok' y 'motivo'. Una venta ya asentada en Excel y en la web no se puede abortar
porque Mercado Libre falle.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ml_api

# El SKU vive en este atributo, no en seller_custom_field (que viene en None).
ATRIBUTO_SKU = "SELLER_SKU"
ATTRS = "id,title,status,available_quantity,sold_quantity,attributes,variations"


def _sku_de(contenedor):
    """Lee el SELLER_SKU de un item o de una variacion. Devuelve str o None."""
    for a in (contenedor.get("attributes") or []):
        if a.get("id") == ATRIBUTO_SKU:
            v = a.get("value_name") or a.get("value_id")
            return str(v).strip().upper() if v else None
    return None


def buscar(sku):
    """Ubica la publicacion de un SKU.

    Devuelve un dict con item_id, variation_id (None si la publicacion no tiene
    variaciones), available_quantity y status, o {'ok': False, 'motivo': ...}.
    """
    sku = str(sku).strip().upper()
    if not sku:
        return {"ok": False, "motivo": "SKU vacio"}
    # Las monedas de terceros (P3, R4, F11) nunca se publicaron en ML:
    # ml_bulk.filtrar() las excluye por tener el id con letra.
    if not sku.isdigit():
        return {"ok": False, "motivo": f"la moneda {sku} es de un tercero y no esta en Mercado Libre"}

    uid = ml_api.user_id()
    st, r = ml_api.pedir("GET", f"/users/{uid}/items/search?seller_sku={sku}")
    if st != 200:
        return {"ok": False, "motivo": f"la busqueda por SKU fallo ({st}): {str(r)[:120]}"}
    resultados = r.get("results") or []
    if not resultados:
        return {"ok": False, "motivo": f"la moneda {sku} no tiene publicacion en Mercado Libre"}

    item_id = resultados[0]
    st, item = ml_api.pedir("GET", f"/items/{item_id}?attributes={ATTRS}")
    if st != 200:
        return {"ok": False, "motivo": f"no se pudo leer {item_id} ({st}): {str(item)[:120]}"}

    variaciones = item.get("variations") or []
    if variaciones:
        for v in variaciones:
            if _sku_de(v) == sku:
                return {"ok": True, "item_id": item_id, "variation_id": v.get("id"),
                        "available_quantity": v.get("available_quantity") or 0,
                        "status": item.get("status"), "title": item.get("title"),
                        "variaciones": variaciones}
        return {"ok": False, "motivo": f"{item_id} tiene variaciones pero ninguna con SKU {sku}"}

    return {"ok": True, "item_id": item_id, "variation_id": None,
            "available_quantity": item.get("available_quantity") or 0,
            "status": item.get("status"), "title": item.get("title"),
            "variaciones": []}


def _put_variacion(pub, nuevo):
    """Actualiza el stock de una sola variacion, dejando las demas intactas.

    ML exige el array completo de variaciones en el PUT: mandar solo la que
    cambia borra las otras.
    """
    cuerpo = {"variations": [
        {"id": v.get("id"),
         "available_quantity": nuevo if v.get("id") == pub["variation_id"]
         else (v.get("available_quantity") or 0)}
        for v in pub["variaciones"]
    ]}
    return ml_api.pedir("PUT", f"/items/{pub['item_id']}", cuerpo)


def _aplicar(nuevo, pub):
    """Escribe el stock nuevo. Devuelve (ok, pausada, motivo)."""
    if pub["variation_id"]:
        st, r = _put_variacion(pub, nuevo)
        if st == 200:
            return True, False, None
        return False, False, f"PUT de la variacion fallo ({st}): {str(r)[:150]}"

    st, r = ml_api.pedir("PUT", f"/items/{pub['item_id']}", {"available_quantity": nuevo})
    if st == 200:
        return True, nuevo == 0, None

    # Sin variaciones ML puede rechazar el cero en una publicacion activa.
    # En ese caso se pausa, que es reversible: sincronizar con cantidad > 0
    # la reactiva.
    if nuevo == 0:
        st2, r2 = ml_api.pedir("PUT", f"/items/{pub['item_id']}", {"status": "paused"})
        if st2 == 200:
            return True, True, None
        return False, False, (f"no se pudo poner en cero ({st}) ni pausar ({st2}): "
                              f"{str(r2)[:150]}")
    return False, False, f"PUT fallo ({st}): {str(r)[:150]}"


def _revivir(item_id, cantidad, estado):
    """Devuelve al aire una publicacion caida. -> (ok, motivo, hay_que_republicar).

    **Una publicacion que ya vendio no se puede reabrir.** Mercado Libre la cierra
    sola al agotarse el stock, y a partir de ahi rechaza cualquier PUT con
    `Cannot update item [status:closed, has_bids:true]` — ni el estado ni el
    stock son modificables. Verificado el 10/9/2026 con MLA2067297589.

    Asi que reponerle stock a una moneda que todavia tiene unidades en la pagina
    no siempre es actualizar: si la publicacion murio vendida, hay que crear una
    nueva. Esa decision la toma ml_sync, que es quien sabe llamar a ml_publicar;
    aca solo se informa con `hay_que_republicar`.

    Una pausada sin ventas si se reactiva, y ahi el PUT combinado alcanza.
    """
    cuerpo = {"available_quantity": cantidad, "status": "active"}
    st, r = ml_api.pedir("PUT", f"/items/{item_id}", cuerpo)
    if st == 200:
        return True, None, False

    texto = str(r)
    if estado == "closed" or "has_bids" in texto or "field_not_updatable" in texto:
        return False, ("la publicacion se cerro al venderse y Mercado Libre no la deja "
                       "reabrir: hay que republicar la moneda"), True

    return False, f"no se pudo reactivar ({st}): {texto[:150]}", False


def sincronizar(sku, cantidad):
    """Deja el stock de ML igual al que quedo en coins.json.

    `cantidad` es la cantidad que la moneda tiene AHORA en la pagina, despues de
    la venta. Cero pausa la publicacion; cualquier valor mayor la deja (o la
    vuelve a poner) a la venta, incluso si ML la habia cerrado.
    """
    pub = buscar(sku)
    if not pub.get("ok"):
        return pub

    cantidad = max(0, int(cantidad))
    actual = pub["available_quantity"]
    estado = pub.get("status")
    fuera_del_aire = estado in ("paused", "closed")

    if actual == cantidad and (cantidad > 0) != fuera_del_aire:
        return {"ok": True, "sin_cambios": True, "item_id": pub["item_id"],
                "sku": str(sku), "nuevo": cantidad,
                "motivo": f"#{sku} ya estaba en {cantidad} en Mercado Libre"}

    # Reponerle stock a una publicacion caida es un camino distinto: hay que
    # devolverla al aire en la misma operacion, no solo cambiarle el numero.
    if cantidad > 0 and fuera_del_aire:
        ok, motivo, republicar = _revivir(pub["item_id"], cantidad, estado)
        if not ok:
            return {"ok": False, "motivo": motivo, "republicar": republicar,
                    "item_id": pub["item_id"], "sku": str(sku)}
        return {"ok": True, "item_id": pub["item_id"], "variation_id": pub["variation_id"],
                "sku": str(sku), "anterior": actual, "nuevo": cantidad,
                "pausada": False, "reactivada": True, "title": pub.get("title")}

    ok, pausada, motivo = _aplicar(cantidad, pub)
    if not ok:
        return {"ok": False, "motivo": motivo}

    return {"ok": True, "item_id": pub["item_id"], "variation_id": pub["variation_id"],
            "sku": str(sku), "anterior": actual, "nuevo": cantidad,
            "pausada": pausada, "reactivada": False, "title": pub.get("title")}


if __name__ == "__main__":
    def _arg(flag, default=None):
        return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default

    if "--ver" in sys.argv:
        print(json.dumps(buscar(_arg("--ver")), ensure_ascii=False, indent=1, default=str))
    elif "--sincronizar" in sys.argv:
        cant = _arg("--cantidad")
        if cant is None:
            sys.exit("Falta --cantidad: la cantidad que quedo en coins.json.")
        print(json.dumps(sincronizar(_arg("--sincronizar"), cant), ensure_ascii=False, indent=1))
    else:
        print(__doc__)
