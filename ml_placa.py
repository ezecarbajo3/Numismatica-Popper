#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Agrega la placa de marca Popper como ULTIMA foto de las publicaciones activas de ML.

La placa se sube una sola vez al servicio de fotos de ML y el mismo picture id se
reusa en todas las publicaciones: no hay una subida por moneda.

Uso:
    python3 ml_placa.py --sample     # muestra 3 publicaciones y no escribe nada
    python3 ml_placa.py --limite 5   # corre sobre las primeras 5 (prueba)
    python3 ml_placa.py              # corre sobre todas las activas

Es idempotente: si la publicacion ya tiene la placa, la saltea. Se puede volver a
correr sobre todas para recuperar las que fallaron.
Guarda el set de fotos ORIGINAL de cada publicacion en el log, para poder revertir.
"""
PLACA        = "/Users/ezecarbajo/popper-site/images/popper-marca.jpg"
ESTADO       = "/Users/ezecarbajo/popper-site/salidas_ml/placa_estado.json"
DIR_SALIDA   = "/Users/ezecarbajo/popper-site/salidas_ml"
HILOS        = 4      # publicaciones en paralelo

import argparse
import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ml_api


def cargar_estado():
    if os.path.exists(ESTADO):
        with open(ESTADO) as f:
            return json.load(f)
    return {}


def guardar_estado(e):
    os.makedirs(DIR_SALIDA, exist_ok=True)
    with open(ESTADO, "w") as f:
        json.dump(e, f, indent=1)


def picture_id_placa(estado):
    """Sube la placa una sola vez y cachea el picture id en el estado."""
    if estado.get("picture_id"):
        return estado["picture_id"]
    print(f"Subiendo la placa a ML ({PLACA})...", file=sys.stderr)
    r = ml_api.subir_foto(PLACA)
    pid = r["id"]
    estado["picture_id"] = pid
    estado["picture_url"] = (r.get("variations") or [{}])[0].get("secure_url")
    guardar_estado(estado)
    print(f"picture_id = {pid}", file=sys.stderr)
    return pid


def items_activos():
    """Todas las publicaciones activas del usuario, paginando de a 50."""
    uid = ml_api.user_id()
    ids, offset = [], 0
    while True:
        st, r = ml_api.pedir("GET", f"/users/{uid}/items/search?status=active"
                                    f"&limit=50&offset={offset}")
        if st != 200:
            sys.exit(f"No se pudo listar las publicaciones: {st} {r}")
        ids.extend(r["results"])
        total = r["paging"]["total"]
        offset += 50
        if offset >= total or not r["results"]:
            break
    return ids


def fotos_de(item_id):
    st, r = ml_api.pedir("GET", f"/items/{item_id}?attributes=id,title,status,pictures")
    if st != 200:
        return None, f"GET {st}: {r}"
    return r, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", action="store_true", help="muestra 3 y no escribe nada")
    ap.add_argument("--limite", type=int, default=None, help="procesar solo las primeras N")
    args = ap.parse_args()

    estado = cargar_estado()
    hechos = set(estado.get("hechos", []))

    ids = items_activos()
    print(f"Publicaciones activas: {len(ids)}  |  ya hechas en corridas previas: "
          f"{len(hechos & set(ids))}", file=sys.stderr)

    pendientes = [i for i in ids if i not in hechos]
    if args.limite:
        pendientes = pendientes[:args.limite]

    if args.sample:
        for iid in pendientes[:3]:
            it, err = fotos_de(iid)
            print("=" * 70)
            if err:
                print(f"{iid}: {err}"); continue
            print(f"{iid}  {it['title']}  [{it['status']}]")
            for i, p in enumerate(it["pictures"], 1):
                print(f"   {i}. {p['id']}  {p.get('secure_url','')}")
            print(f"   --> quedaria una foto mas al final: la placa")
        print("\n(--sample: no se escribio nada, ni siquiera se subio la placa)")
        return

    pid = picture_id_placa(estado)

    ok, saltados, fallas, log = 0, 0, [], []
    lock = threading.Lock()

    def procesar(iid):
        it, err = fotos_de(iid)
        if err:
            return ("falla", iid, err, None)
        actuales = it["pictures"]
        if any(p["id"] == pid for p in actuales):
            return ("saltado", iid, None, it)
        cuerpo = {"pictures": [{"id": p["id"]} for p in actuales] + [{"id": pid}]}
        st, r = ml_api.pedir("PUT", f"/items/{iid}", cuerpo)
        if st == 200:
            return ("ok", iid, [p["id"] for p in actuales], it)
        return ("falla", iid, f"PUT {st}: {r}", it)

    with ThreadPoolExecutor(max_workers=HILOS) as ex:
        for n, (estado_r, iid, extra, it) in enumerate(ex.map(procesar, pendientes), 1):
            with lock:
                if estado_r == "ok":
                    ok += 1; hechos.add(iid)
                    log.append({"id": iid, "titulo": it["title"], "ok": True,
                                "fotos_originales": extra})
                elif estado_r == "saltado":
                    saltados += 1; hechos.add(iid)
                else:
                    fallas.append((iid, extra))
                    log.append({"id": iid, "ok": False, "error": str(extra)})
                if n % 50 == 0:
                    estado["hechos"] = sorted(hechos); guardar_estado(estado)
                    print(f"  {n}/{len(pendientes)}  ok={ok} saltados={saltados} "
                          f"fallas={len(fallas)}", file=sys.stderr, flush=True)

    estado["hechos"] = sorted(hechos)
    guardar_estado(estado)

    ts = datetime.now().strftime("%Y%m%d-%H%M")
    log_path = os.path.join(DIR_SALIDA, f"placa-{ts}.json")
    with open(log_path, "w") as f:
        json.dump(log, f, indent=1, ensure_ascii=False)

    print("\n" + "=" * 70)
    print("PLACA DE MARCA EN PUBLICACIONES DE ML")
    print("=" * 70)
    print(f"picture id de la placa : {pid}")
    print(f"Procesadas             : {len(pendientes)}")
    print(f"Actualizadas           : {ok}")
    print(f"Ya la tenian           : {saltados}")
    print(f"Fallas                 : {len(fallas)}")
    for iid, e in fallas[:20]:
        print(f"    {iid}  {str(e)[:110]}")
    if len(fallas) > 20:
        print(f"    ... y {len(fallas)-20} mas (ver el log)")
    print(f"\nLog    : {log_path}")
    print(f"Estado : {ESTADO}  (borralo para volver a procesar todo desde cero)")


if __name__ == "__main__":
    main()
