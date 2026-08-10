#!/usr/bin/env python3
"""Verifica que los estados de conservación de coins.json respeten la convención.

    grade_short = R | B | MB | EX | SC, con "+", "-" o nada, y opcionalmente "**"
                  al final (marca "con detalles"/defecto).
    grade       = el nombre largo que le corresponde, con el modificador separado
                  por un espacio: "MB+" → "Muy Bueno +", "EX-**" → "Excelente - **".

Los dos campos van siempre en sincronía: grade se deriva de grade_short, que es el
que el sitio trata como confiable (ver gradeRank en common.js). Una moneda puede no
tener conservación (libros, catálogos, piezas sin evaluar): ahí van los dos en "".

Correr después de tocar grados:  python3 validate_grades.py
"""
import json
import os
import re
import sys

LONG = {"R": "Regular", "B": "Bueno", "MB": "Muy Bueno", "EX": "Excelente", "SC": "Sin Circular"}
SHORT_RE = re.compile(r"^(SC|EX|MB|B|R)([+-]?)(\*\*)?$")

REPO_DIR = os.path.dirname(os.path.abspath(__file__))


def expected_long(short):
    """Texto largo que le corresponde a un grade_short ya validado."""
    m = SHORT_RE.match(short)
    if not m:
        return ""
    base, mod, det = m.groups()
    return LONG[base] + (f" {mod}" if mod else "") + (" **" if det else "")


def main():
    with open(os.path.join(REPO_DIR, "coins.json"), encoding="utf-8") as f:
        coins = json.load(f)

    errores = []
    for coin in coins:
        if "grade_short" not in coin and "grade" not in coin:
            continue  # moneda sin conservación cargada: es válido
        short = coin.get("grade_short", "")
        grade = coin.get("grade", "")
        if short and not SHORT_RE.match(short):
            errores.append(f"id {coin['id']}: grade_short {short!r} no es un valor válido")
            continue
        esperado = expected_long(short) if short else ""
        if grade != esperado:
            errores.append(
                f"id {coin['id']}: grade {grade!r} no coincide con grade_short "
                f"{short!r} (debería ser {esperado!r})"
            )

    if errores:
        print(f"{len(errores)} problema(s) de conservación:")
        for e in errores:
            print(f"  - {e}")
        sys.exit(1)

    print(f"OK: {len(coins)} monedas, conservaciones consistentes.")


if __name__ == "__main__":
    main()
