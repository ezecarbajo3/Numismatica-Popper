#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cliente minimo de la API de MercadoLibre para Numismatica Popper.

Guarda las credenciales y los tokens en ~/.ml-api-credentials (JSON, chmod 600):

    {"client_id": "...", "client_secret": "...",
     "redirect_uri": "https://numismaticapopper.com/"}

Uso:
    python3 ml_api.py --auth-url          # imprime el link para autorizar
    python3 ml_api.py --code <code>       # canjea el code por los tokens
    python3 ml_api.py --whoami            # verifica que el token anda

Los tokens duran 6 horas; el refresh_token se usa solo y se reescribe en el archivo.
"""
import json
import os
import stat
import sys
import time
import urllib.parse
import urllib.request

CRED = os.path.expanduser("~/.ml-api-credentials")
API = "https://api.mercadolibre.com"
AUTH = "https://auth.mercadolibre.com.ar/authorization"
UA = "numismatica-popper/1.0"


def leer():
    if not os.path.exists(CRED):
        sys.exit(f"Falta {CRED}. Ver el docstring de ml_api.py.")
    with open(CRED) as f:
        return json.load(f)


def guardar(d):
    with open(CRED, "w") as f:
        json.dump(d, f, indent=1)
    os.chmod(CRED, stat.S_IRUSR | stat.S_IWUSR)


def _post(path, datos):
    body = urllib.parse.urlencode(datos).encode()
    req = urllib.request.Request(
        API + path, data=body,
        headers={"User-Agent": UA, "Accept": "application/json",
                 "Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def auth_url():
    c = leer()
    q = urllib.parse.urlencode({
        "response_type": "code",
        "client_id": c["client_id"],
        "redirect_uri": c["redirect_uri"],
    })
    return f"{AUTH}?{q}"


def canjear(code):
    c = leer()
    tok = _post("/oauth/token", {
        "grant_type": "authorization_code",
        "client_id": c["client_id"],
        "client_secret": c["client_secret"],
        "code": code,
        "redirect_uri": c["redirect_uri"],
    })
    c.update(access_token=tok["access_token"],
             refresh_token=tok.get("refresh_token"),
             user_id=tok["user_id"],
             expira_en=int(time.time()) + int(tok["expires_in"]) - 120)
    guardar(c)
    return c


def refrescar():
    c = leer()
    tok = _post("/oauth/token", {
        "grant_type": "refresh_token",
        "client_id": c["client_id"],
        "client_secret": c["client_secret"],
        "refresh_token": c["refresh_token"],
    })
    c.update(access_token=tok["access_token"],
             refresh_token=tok.get("refresh_token", c["refresh_token"]),
             expira_en=int(time.time()) + int(tok["expires_in"]) - 120)
    guardar(c)
    return c


def token():
    """Devuelve un access_token valido, refrescandolo si hace falta."""
    c = leer()
    if "access_token" not in c:
        sys.exit("Todavia no autorizaste. Corre: python3 ml_api.py --auth-url")
    if time.time() >= c.get("expira_en", 0):
        c = refrescar()
    return c["access_token"]


def user_id():
    return leer()["user_id"]


def pedir(metodo, path, cuerpo=None, reintentos=3):
    """Llamada autenticada a la API. Devuelve (status, dict|texto)."""
    url = path if path.startswith("http") else API + path
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    for intento in range(reintentos):
        req = urllib.request.Request(url, data=datos, method=metodo, headers={
            "Authorization": f"Bearer {token()}",
            "User-Agent": UA,
            "Accept": "application/json",
            "Content-Type": "application/json",
        })
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as e:
            txt = e.read().decode("utf-8", "replace")
            if e.code in (429, 500, 502, 503) and intento < reintentos - 1:
                time.sleep(2 ** intento)
                continue
            try:
                return e.code, json.loads(txt)
            except ValueError:
                return e.code, txt
        except Exception as e:
            if intento < reintentos - 1:
                time.sleep(2 ** intento)
                continue
            return 0, str(e)


def subir_foto(ruta):
    """POST multipart a /pictures/items/upload. Devuelve el picture id."""
    with open(ruta, "rb") as f:
        contenido = f.read()
    nombre = os.path.basename(ruta)
    borde = "----popper" + os.urandom(8).hex()
    cuerpo = b"".join([
        f'--{borde}\r\n'.encode(),
        f'Content-Disposition: form-data; name="file"; filename="{nombre}"\r\n'.encode(),
        b'Content-Type: image/jpeg\r\n\r\n',
        contenido,
        f'\r\n--{borde}--\r\n'.encode(),
    ])
    req = urllib.request.Request(API + "/pictures/items/upload", data=cuerpo, method="POST", headers={
        "Authorization": f"Bearer {token()}",
        "User-Agent": UA,
        "Accept": "application/json",
        "Content-Type": f"multipart/form-data; boundary={borde}",
    })
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


if __name__ == "__main__":
    if "--auth-url" in sys.argv:
        print(auth_url())
    elif "--code" in sys.argv:
        c = canjear(sys.argv[sys.argv.index("--code") + 1])
        print(f"Listo. user_id={c['user_id']}, token guardado en {CRED}")
    elif "--whoami" in sys.argv:
        print(pedir("GET", "/users/me")[1].get("nickname"))
    else:
        print(__doc__)
