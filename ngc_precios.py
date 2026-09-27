#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Valuacion de monedas de coins.json contra el price guide de NGC.

NGC no tiene API de precios. Las dos secciones del price guide se comportan
distinto y hay que pegarles distinto:

  Estados Unidos  ->  JSON de punta a punta. /coin-explorer/data/coins/search/
                      {texto}/ resuelve el CoinID y
                      /coin-explorer/data/coins/{id}/price-guide/ devuelve una
                      fila por designacion con una columna por grado.
  Mundiales       ->  HTML renderizado en el servidor. No hay JSON: el mismo
                      endpoint del Coin Explorer devuelve [] para toda moneda
                      que no sea de EEUU.

Ademas www.ngccoin.com/price-guide/world/* responde 403 con desafio de
Cloudflare a cualquier cliente que no sea un navegador real. La regla es
especifica de ese path. Los mirrors regionales (ngccoin.in, ngccoin.hk) sirven
la misma pagina sin desafio, asi que las mundiales van por ahi y todo el modulo
corre con urllib, sin navegador.

Uso:
    python3 ngc_precios.py --moneda 1
    python3 ngc_precios.py --buscar "argentina 1957 peso"
    python3 ngc_precios.py --reporte

Ninguna funcion levanta excepcion hacia el widget: todas devuelven un dict con
'ok' y 'motivo', igual que ml_stock.py. Una consulta de referencia no puede
tumbar el registro de una venta.
"""
import argparse
import html as _html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

_REPO_DIR = os.path.dirname(os.path.abspath(__file__))
# POPPER_COINS_JSON permite apuntar a una copia para testear sin tocar el catalogo real
COINS_JSON = os.environ.get("POPPER_COINS_JSON") or os.path.join(_REPO_DIR, "coins.json")
CACHE_PATH = os.path.join(_REPO_DIR, "insumos", "ngc_cache.json")

# Host para las mundiales. www.ngccoin.com devuelve 403 en /price-guide/world/.
HOST_WORLD = "https://www.ngccoin.in"
# Host para EEUU y para el buscador: ahi ngccoin.com responde normal.
HOST_US = "https://www.ngccoin.com"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")

TIMEOUT = 25
# Los precios de NumisMaster no se mueven de un mes para el otro: una entrada
# cacheada sirve largo y evita golpear el sitio de mas.
CACHE_DIAS = 90

# Columnas de la tabla mundial, en orden. Las mismas que usa el JSON de EEUU
# despues de sacarle el prefijo Grade_.
GRADOS = ["PrAg", "G", "VG", "F", "VF", "XF", "50", "53", "55", "58",
          "60", "61", "62", "63", "64", "65", "66", "67", "68", "69", "70"]

# Equivalencia entre la convencion de coins.json (ver validate_grades.py) y las
# columnas de NGC. Cada grado propio mapea a una lista de columnas en orden de
# preferencia: se toma la primera que tenga precio.
EQUIVALENCIA = {
    "R":  ["G", "PrAg"],
    "B":  ["VG", "G"],
    "MB": ["F", "VG"],
    "EX": ["XF", "VF"],
    "SC": ["62", "63", "61", "60", "64"],
}
# El modificador corre el grado medio escalon para arriba o para abajo.
_ESCALA = ["PrAg", "G", "VG", "F", "VF", "XF", "50", "55", "58", "60", "61",
           "62", "63", "64", "65", "66", "67", "68", "69", "70"]

# Denominaciones: coins.json las escribe en espaniol, NGC busca en ingles.
DENOM_EN = {
    "centavo": "Centavo", "centavos": "Centavos", "centesimo": "Centesimo",
    "centimo": "Centimo", "centimos": "Centimos", "cent": "Cent",
    "penique": "Penny", "peniques": "Pence", "chelin": "Shilling",
    "corona": "Crown", "media corona": "1/2 Crown", "florin": "Florin",
    "libra": "Pound", "soberano": "Sovereign", "peso": "Peso",
    "pesos": "Pesos", "real": "Real", "reales": "Reales",
    "escudo": "Escudo", "escudos": "Escudos", "sol": "Sol", "soles": "Soles",
    "franco": "Franc", "francos": "Francs", "marco": "Mark", "marcos": "Mark",
    "lira": "Lira", "liras": "Lire", "corona sueca": "Krona",
    "ore": "Ore", "oere": "Ore", "dolar": "Dollar", "dolares": "Dollars",
    "medio dolar": "1/2 Dollar", "cuarto": "1/4", "patacon": "Patacon",
    "guarani": "Guarani", "bolivar": "Bolivar", "sucre": "Sucre",
    "quetzal": "Quetzal", "colon": "Colon", "balboa": "Balboa",
    "cruzeiro": "Cruzeiro", "cruzado": "Cruzado", "reis": "Reis",
    "yen": "Yen", "yuan": "Yuan", "rupia": "Rupee", "rublo": "Ruble",
    "zloty": "Zloty", "florín": "Florin", "ducado": "Ducat",
}

# El Coin Explorer de EEUU no entiende "1/2 Dollar": busca por el nombre
# corriente de la pieza. La clave es el titulo sin el anio y sin tildes.
DENOM_US = {
    "cent": "cent", "centavo": "cent", "1 centavo": "cent",
    "2 centavos": "two cent", "3 centavos": "three cent",
    "5 centavos": "nickel", "nickel": "nickel",
    "10 centavos": "dime", "dime": "dime",
    "1/4 dolar": "quarter", "cuarto de dolar": "quarter", "quarter": "quarter",
    "1/2 dolar": "half dollar", "medio dolar": "half dollar",
    "half dollar": "half dollar",
    "dolar": "dollar", "1 dolar": "dollar", "dollar": "dollar",
    "1/2 centavo": "half cent", "20 centavos": "twenty cent",
    "2 1/2 dolares": "quarter eagle", "5 dolares": "half eagle",
    "10 dolares": "eagle", "20 dolares": "double eagle",
}

# El campo country trae sufijos historicos ("Argentina - Patria") y nombres en
# espaniol. NGC indexa por el nombre en ingles y en mayusculas.
PAIS_EN = {
    "argentina": "ARGENTINA", "uruguay": "URUGUAY", "chile": "CHILE",
    "peru": "PERU", "brasil": "BRAZIL", "bolivia": "BOLIVIA",
    "paraguay": "PARAGUAY", "colombia": "COLOMBIA", "ecuador": "ECUADOR",
    "venezuela": "VENEZUELA", "mexico": "MEXICO", "cuba": "CUBA",
    "estados unidos": "UNITED STATES", "reino unido": "GREAT BRITAIN",
    "gran bretana": "GREAT BRITAIN", "inglaterra": "GREAT BRITAIN",
    "escocia": "SCOTLAND", "irlanda": "IRELAND", "canada": "CANADA",
    "francia": "FRANCE", "alemania": "GERMANY", "italia": "ITALY",
    "espana": "SPAIN", "portugal": "PORTUGAL", "suecia": "SWEDEN",
    "noruega": "NORWAY", "dinamarca": "DENMARK", "finlandia": "FINLAND",
    "holanda": "NETHERLANDS", "paises bajos": "NETHERLANDS",
    "belgica": "BELGIUM", "suiza": "SWITZERLAND", "austria": "AUSTRIA",
    "rusia": "RUSSIA", "polonia": "POLAND", "hungria": "HUNGARY",
    "grecia": "GREECE", "turquia": "TURKEY", "japon": "JAPAN",
    "china": "CHINA", "india": "INDIA", "australia": "AUSTRALIA",
    "nueva zelanda": "NEW ZEALAND", "sudafrica": "SOUTH AFRICA",
    "israel": "ISRAEL", "egipto": "EGYPT", "marruecos": "MOROCCO",
    "vaticano": "VATICAN CITY", "checoslovaquia": "CZECHOSLOVAKIA",
    "yugoslavia": "YUGOSLAVIA", "rumania": "ROMANIA",
    "sri lanka": "SRI LANKA", "costa rica": "COSTA RICA",
    "gibraltar": "GIBRALTAR", "tailandia": "THAILAND",
    "indias orientales neerlandesas": "NETHERLANDS EAST INDIES",
    "antillas holandesas": "NETHERLANDS ANTILLES", "curazao": "CURACAO",
    "bangladés": "BANGLADESH", "bangladesh": "BANGLADESH",
    "transnistria": "TRANSNISTRIA", "namibia": "NAMIBIA", "monaco": "MONACO",
    "libano": "LEBANON", "jamaica": "JAMAICA", "islandia": "ICELAND",
    "hong kong": "HONG KONG", "emiratos arabes unidos": "UNITED ARAB EMIRATES",
    "arabia saudita": "SAUDI ARABIA", "zambia": "ZAMBIA",
    "tristan de acuna": "TRISTAN DA CUNHA", "siria": "SYRIA",
    "serbia": "SERBIA", "san marino": "SAN MARINO", "samoa": "SAMOA",
    "ruanda": "RWANDA", "maldivas": "MALDIVES", "malasia": "MALAYSIA",
    "liberia": "LIBERIA", "jersey": "JERSEY", "guernsey": "GUERNSEY",
    "islas malvinas": "FALKLAND ISLANDS", "isla de pascua": "EASTER ISLAND",
    "gambia": "GAMBIA", "chipre": "CYPRUS", "belice": "BELIZE",
    "congo belga": "BELGIAN CONGO",
    "congo belga y ruanda-urundi": "BELGIAN CONGO",
    "africa occidental francesa": "FRENCH WEST AFRICA",
    "estados del africa occidental": "WEST AFRICAN STATES",
    "yemen": "YEMEN", "vietnam del sur": "VIET NAM",
    "vanuatu": "VANUATU", "uzbekistan": "UZBEKISTAN", "uganda": "UGANDA",
    "tayikistan": "TAJIKISTAN", "swazilandia": "SWAZILAND",
    "seychelles": "SEYCHELLES", "santa elena": "SAINT HELENA",
    "san martin": "SINT MAARTEN", "republica dominicana": "DOMINICAN REPUBLIC",
    "panama": "PANAMA", "oman": "OMAN", "mauricio": "MAURITIUS",
    "malawi": "MALAWI", "luxemburgo": "LUXEMBOURG", "kiribati": "KIRIBATI",
    "kirguistan": "KYRGYZSTAN", "islas cook": "COOK ISLANDS",
    "indonesia": "INDONESIA", "india britanica": "INDIA-BRITISH",
    "imperio otomano": "TURKEY", "honduras": "HONDURAS",
    "guatemala": "GUATEMALA", "eslovaquia": "SLOVAKIA",
    "el salvador": "EL SALVADOR", "croacia": "CROATIA",
    "colombia (santander)": "COLOMBIA", "butan": "BHUTAN",
    "burundi": "BURUNDI", "brunei": "BRUNEI",
    "bosnia y herzegovina": "BOSNIA-HERZEGOVINA", "bahrein": "BAHRAIN",
    "eslovenia": "SLOVENIA", "bulgaria": "BULGARIA", "ucrania": "UKRAINE",
    "letonia": "LATVIA", "lituania": "LITHUANIA", "estonia": "ESTONIA",
    "nicaragua": "NICARAGUA", "haiti": "HAITI", "filipinas": "PHILIPPINES",
    "singapur": "SINGAPORE", "corea del sur": "KOREA-SOUTH",
    "iran": "IRAN", "irak": "IRAQ", "jordania": "JORDAN",
    "tunez": "TUNISIA", "argelia": "ALGERIA", "libia": "LIBYA",
    "kenia": "KENYA", "tanzania": "TANZANIA", "ghana": "GHANA",
    "nigeria": "NIGERIA", "etiopia": "ETHIOPIA", "zimbabue": "ZIMBABWE",
    "botsuana": "BOTSWANA", "mozambique": "MOZAMBIQUE", "angola": "ANGOLA",
    "fiyi": "FIJI", "tonga": "TONGA", "papua nueva guinea": "PAPUA NEW GUINEA",
    "islas salomon": "SOLOMON ISLANDS", "bermudas": "BERMUDA",
    "bahamas": "BAHAMAS", "barbados": "BARBADOS", "trinidad y tobago": "TRINIDAD & TOBAGO",
    "isla de man": "ISLE OF MAN", "malta": "MALTA", "albania": "ALBANIA",
}


# --- utilidades ------------------------------------------------------------

def _sin_tildes(s):
    """Minusculas sin acentos, para poder matchear las tablas de arriba."""
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


def _ok(**kw):
    d = {"ok": True, "motivo": ""}
    d.update(kw)
    return d


def _error(motivo, **kw):
    d = {"ok": False, "motivo": motivo}
    d.update(kw)
    return d


def _get(url, json_esperado=False, seguir_redirect=True):
    """GET con urllib. Devuelve (texto_o_dict, url_final) o levanta _NgcError."""
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "application/json, text/html;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": HOST_US + "/price-guide/world/",
    })
    opener = urllib.request.build_opener()
    if not seguir_redirect:
        class _NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *a, **k):
                return None
        opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(req, timeout=TIMEOUT) as r:
            cuerpo = r.read().decode("utf-8", errors="replace")
            final = r.geturl()
    except urllib.error.HTTPError as e:
        if not seguir_redirect and e.code in (301, 302, 303, 307, 308):
            return "", e.headers.get("Location") or ""
        if e.code == 403:
            raise _NgcError("NGC devolvio 403: el path esta detras de Cloudflare")
        raise _NgcError("NGC devolvio HTTP %s" % e.code)
    except Exception as e:                                    # red caida, DNS, timeout
        raise _NgcError("no se pudo consultar NGC: %s" % e)
    if json_esperado:
        try:
            return json.loads(cuerpo), final
        except ValueError:
            raise _NgcError("NGC no devolvio JSON (probable desafio de Cloudflare)")
    return cuerpo, final


class _NgcError(Exception):
    pass


# --- cache -----------------------------------------------------------------

def _cache_leer():
    try:
        with open(CACHE_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _cache_guardar(cache):
    try:
        os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
        tmp = CACHE_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=1, sort_keys=True)
        os.replace(tmp, CACHE_PATH)
    except Exception:
        pass                                   # el cache es una optimizacion, no un requisito


def _cache_vigente(entrada):
    try:
        t = datetime.fromisoformat(entrada["consultado"])
    except Exception:
        return False
    return (datetime.now(timezone.utc) - t).days < CACHE_DIAS


# --- Estados Unidos: JSON --------------------------------------------------

def buscar_us(consulta, ceca=""):
    """Resuelve texto libre al CoinID del Coin Explorer de Estados Unidos.

    Las descripciones de NGC son del tipo "1989 P 50C MS": alcanza con anio y
    denominacion. Si la moneda tiene ceca se prefiere el candidato que la lleve,
    y entre los que quedan la acuniacion normal antes que Proof o Prooflike.
    """
    url = "%s/coin-explorer/data/coins/search/%s/" % (
        HOST_US, urllib.parse.quote(consulta.replace("/", " "), safe=""))
    try:
        res, _ = _get(url, json_esperado=True)
    except _NgcError as e:
        return _error(str(e))
    if not isinstance(res, list) or not res:
        return _error("el Coin Explorer no encontro nada para %r" % consulta)

    def rango(r):
        d = (r.get("Description") or "").upper()
        con_ceca = bool(ceca) and (" %s " % ceca) in d
        return (0 if con_ceca or not ceca else 1,
                1 if ("PF" in d.split() or "PROOFLIKE" in d) else 0)

    elegido = sorted(res, key=rango)[0]
    return _ok(coin_id=elegido.get("CoinID"),
               descripcion=elegido.get("Description") or "",
               candidatos=[r.get("Description") for r in res[:8]])


def precios_us(coin_id):
    """Tabla de precios de una moneda de EEUU por su CoinID de NGC.

    Devuelve {'ok':True,'filas':[{'designacion':..,'precios':{grado:usd}}],..}
    """
    base = "%s/coin-explorer/data/coins/%s/" % (HOST_US, coin_id)
    try:
        crudo, _ = _get(base + "price-guide/", json_esperado=True)
        meta, _ = _get(base, json_esperado=True)
    except _NgcError as e:
        return _error(str(e))
    if not isinstance(crudo, list) or not crudo:
        return _error("NGC no tiene precios para el CoinID %s" % coin_id)

    filas = []
    for f in crudo:
        precios = {}
        for g in GRADOS:
            v = (f.get("Grade_" + g) or "").strip()
            n = _a_numero(v)
            if n is not None:
                precios[g] = n
        filas.append({
            "designacion": f.get("ProofStrikeChar") or f.get("StrikeChar") or "",
            "tipo": f.get("GradeType") or "",
            "actualizado": (f.get("LastUpdated") or "")[:10],
            "precios": precios,
        })
    return _ok(via="us-json",
               descripcion=(meta.get("Description") or "").strip(),
               url="%s/coin-explorer/united-states/" % HOST_US,
               filas=filas)


def _a_numero(texto):
    """'$1,080' o '4.00' -> float. '-', '' o basura -> None."""
    if not texto:
        return None
    t = texto.replace("$", "").replace(",", "").strip()
    if not t or t == "-":
        return None
    try:
        return float(t)
    except ValueError:
        return None


# --- Mundiales: buscador + HTML --------------------------------------------

def buscar_mundial(consulta):
    """Resuelve texto libre a la ficha de NGC. Devuelve url y descripcion.

    El typeahead ordena por relevancia difusa, asi que "GREAT BRITAIN 1862
    Penny" devuelve primero la de 1/2 Penny. Cuando algun candidato coincide
    palabra por palabra con la consulta se usa ese y no el primero.

    La URL de resultados responde 302 directo a la ficha si hay una sola
    coincidencia; si hay varias devuelve 200 con la lista, y ahi se toma el
    primer enlace a ficha del listado.
    """
    url = ("%s/resources/services/coin-search/price-guide/world/search/?keywords=%s"
           % (HOST_US, urllib.parse.quote(consulta)))
    try:
        res, _ = _get(url, json_esperado=True)
    except _NgcError as e:
        return _error(str(e))
    candidatos = [r for r in (res or []) if r.get("URL")]
    if not candidatos:
        return _error("NGC no encontro nada para %r" % consulta)

    elegido = _mejor(consulta, candidatos)
    try:
        cuerpo, location = _get(HOST_WORLD + elegido["URL"], seguir_redirect=False)
    except _NgcError as e:
        return _error(str(e))

    ficha = _ficha_en(location) or _ficha_en(cuerpo)
    if not ficha:
        return _error("la busqueda de NGC no resolvio a una ficha para %r" % consulta,
                      candidatos=[c.get("CoinDescription") for c in candidatos[:8]])
    if ficha.startswith("/"):
        ficha = HOST_WORLD + ficha
    return _ok(url=ficha,
               descripcion=elegido.get("CoinDescription") or "",
               candidatos=[c.get("CoinDescription") for c in candidatos[:8]])


# En la pagina de resultados los enlaces vienen relativos ("../../slug"), asi que
# se matchea el slug suelto y despues se le pone el prefijo de la seccion.
_RE_FICHA = re.compile(r"[a-z0-9][a-z0-9\-\.]*cuid-\d+-duid-\d+")
# km-pn son pruebas, km-e essais, km-tn y km-x fichas y tokens: no son la moneda
# de circulacion que estamos valuando.
_RE_NO_CIRCULANTE = re.compile(r"-km-(pn|e|tn|x|m)[0-9]")


def _ficha_en(texto):
    """Primera ficha de moneda circulante que aparezca en una URL o en un HTML."""
    fichas = _fichas_en(texto)
    return fichas[0] if fichas else None


def _fichas_en(texto):
    """Todas las fichas del listado, sin repetir y con las circulantes primero.

    Es aca donde viven las variantes: el typeahead colapsa "ARGENTINA 1950 10
    Centavos" en una sola linea, pero la pagina de resultados enlaza las dos
    fichas, KM#41 en aluminio-bronce y KM#44 de San Martin en cuproniquel.
    """
    slugs = list(dict.fromkeys(_RE_FICHA.findall(texto or "")))
    if not slugs:
        return []
    circulantes = [x for x in slugs if not _RE_NO_CIRCULANTE.search(x)]
    otras = [x for x in slugs if _RE_NO_CIRCULANTE.search(x)]
    return ["/price-guide/world/" + x for x in circulantes + otras]


def _mejor(consulta, candidatos):
    """Candidato con las mismas palabras que la consulta, o el primero."""
    pedido = set(_sin_tildes(consulta).split())
    for c in candidatos:
        if set(_sin_tildes(c.get("CoinDescription") or "").split()) == pedido:
            return c
    return candidatos[0]


_RE_FILA_FIJA = re.compile(
    r'uxPriceTableFixedColumns_DXDataRow(\d+)"[^>]*>(.*?)(?=<tr |</table>)', re.S)
_RE_FILA_GRADO = re.compile(
    r'uxPriceTable_DXDataRow(\d+)"[^>]*>(.*?)(?=<tr |</table>)', re.S)
_RE_CELDA = re.compile(r'<td[^>]*>(.*?)</td>', re.S)


def _texto(frag):
    frag = re.sub(r"<[^>]+>", " ", frag)
    return re.sub(r"\s+", " ", _html.unescape(frag)).strip()


def precios_mundial(url):
    """Parsea la ficha mundial. Devuelve una fila por anio con sus precios.

    La pagina arma dos tablas paralelas: uxPriceTableFixedColumns trae anio,
    denominacion y acuniacion; uxPriceTable trae las 21 columnas de grado. Se
    alinean por el numero de DXDataRow, y la fila 0 es el encabezado.
    """
    if url.startswith("/"):
        url = HOST_WORLD + url
    # La ficha solo se sirve entera fuera de ngccoin.com.
    url = re.sub(r"^https://www\.ngccoin\.com", HOST_WORLD, url)
    try:
        h, _ = _get(url)
    except _NgcError as e:
        return _error(str(e))

    fijas = {int(n): _RE_CELDA.findall(c) for n, c in _RE_FILA_FIJA.findall(h)}
    grados = {int(n): _RE_CELDA.findall(c) for n, c in _RE_FILA_GRADO.findall(h)}
    if not fijas or not grados:
        return _error("no se pudo leer la tabla de precios en %s" % url)

    encabezado = [_texto(c) for c in grados.get(0, [])]
    columnas = [c for c in encabezado if c in GRADOS] or GRADOS

    filas = []
    for n in sorted(k for k in fijas if k > 0):
        celdas = [_texto(c) for c in fijas[n]]
        anio = celdas[0] if celdas else ""
        denom = celdas[1] if len(celdas) > 1 else ""
        mintage = celdas[2] if len(celdas) > 2 else ""
        precios = {}
        for i, celda in enumerate([_texto(c) for c in grados.get(n, [])]):
            if i >= len(columnas):
                break
            v = _a_numero(celda)
            if v is not None:
                precios[columnas[i]] = v
        if not anio and not precios:
            continue
        filas.append({"anio": anio, "denominacion": denom,
                      "mintage": mintage, "precios": precios})

    if not filas:
        return _error("la ficha %s no tiene filas de precio" % url)
    return _ok(via="world-html", url=url,
               descripcion=_titulo(h), especificaciones=_specs(h), filas=filas)


def _titulo(h):
    m = re.search(r"<title>(.*?)</title>", h, re.S)
    return _html.unescape(m.group(1)).replace("| NGC", "").strip() if m else ""


def _specs(h):
    """Composicion, peso y diametro del bloque Specifications de la ficha."""
    out = {}
    i = h.find("Composition")
    if i == -1:
        return out
    t = _texto(h[i:i + 4000])
    cortes = (r"(?:Composition:|Fineness:|Weight:|Diameter:|ASW:|Melt Value:|"
              r"Obverse:|Reverse:|Obverse Legend:|Reverse Legend:|Obverse Designer:|"
              r"Reverse Designer:|Edge Description:|Subject:|Mint:|Ruler:|Shape:|"
              r"Design|Notes|Note:|Numismatic|$)")
    for clave, campo in (("Composition:", "composicion"), ("Fineness:", "fineza"),
                         ("Weight:", "peso"),
                         ("Diameter:", "diametro"), ("ASW:", "asw"),
                         ("Melt Value:", "valor_metal"), ("Obverse:", "anverso"),
                         ("Reverse:", "reverso"), ("Edge Description:", "canto"),
                         ("Subject:", "motivo"), ("Mint:", "ceca")):
        m = re.search(re.escape(clave) + r"\s*(.+?)\s*" + cortes, t)
        if m and m.group(1).strip():
            out[campo] = m.group(1).strip()
    return out


# --- Variantes: lo que se elige antes de ver un precio -----------------------
#
# Valor facial, pais y anio casi nunca alcanzan para identificar una pieza: los
# dos 10 centavos argentinos de 1950 son KM#41 en aluminio-bronce y KM#44 de San
# Martin en cuproniquel. Estas funciones devuelven la lista con el dato que las
# distingue, para elegir y recien despues cotizar.

_RE_KM = re.compile(r"-km-([a-z]*[0-9][0-9a-z\.]*)-")


def listar_variantes_mundial(pais, valor, anio, limite=None):
    """Variantes de NGC mundial para un pais, valor facial y anio.

    La unidad de variante es la **fila** de la tabla, no la ficha. NGC publica
    una ficha por tipo de moneda y dentro pone una fila por emision, y es ahi
    donde dice en que se diferencian: el 10 centesimos uruguayo de 1877 tiene
    "Privy mark anchor points left", "...right" y "Proof", las tres en la misma
    ficha KM#14, con precios que van de 7 a 475 dolares.

    Ademas la misma ficha aparece varias veces en el listado, una por cada fila
    (mismo cuid, distinto duid), asi que se deduplica por tipo de moneda.
    """
    consulta = " ".join(str(x) for x in (_pais_ngc(pais), anio, valor) if x).strip()
    url = ("%s/resources/services/coin-search/price-guide/world/search/?keywords=%s"
           % (HOST_US, urllib.parse.quote(consulta)))
    try:
        res, _ = _get(url, json_esperado=True)
    except _NgcError as e:
        return _error(str(e))
    candidatos = [r for r in (res or []) if r.get("URL")]
    if not candidatos:
        return _error("NGC no encontro nada para %r" % consulta)

    fichas, tipos = [], set()
    for c in _ordenados(consulta, candidatos)[:3]:
        try:
            cuerpo, location = _get(HOST_WORLD + c["URL"], seguir_redirect=False)
        except _NgcError:
            continue
        for f in (_fichas_en(location) or []) + _fichas_en(cuerpo):
            m = _RE_CUID.search(f)
            tipo = m.group(1) if m else f
            if tipo in tipos:
                continue
            tipos.add(tipo)
            fichas.append(f)
    if not fichas:
        return _error("la busqueda de NGC no resolvio a ninguna ficha para %r" % consulta)

    variantes = []
    for f in fichas:
        tabla = precios_mundial(f)
        if not tabla["ok"]:
            continue
        km = _RE_KM.search(f)
        referencia = ("KM# " + km.group(1).upper()) if km else ""
        metal = _metal_es((tabla.get("especificaciones") or {}).get("composicion"))
        for fila in tabla["filas"]:
            if anio and not _es_del_anio(fila.get("anio", ""), anio):
                continue
            variantes.append({
                "id": "world:%s#%s" % (f, fila.get("anio", "")),
                "fuente": "ngc-mundial",
                "referencia": referencia,
                "descripcion": _descripcion_fila(fila, metal),
                "titulo": tabla.get("descripcion", ""),
                "anios": fila.get("anio", ""),
                "mintage": fila.get("mintage", ""),
                "url": tabla.get("url", ""),
                "especificaciones": tabla.get("especificaciones", {}),
                "precios": fila.get("precios", {}),
            })
    if not variantes:
        return _error("NGC tiene la ficha pero no cotiza %s" % (anio or valor))
    # Lo mas barato primero: casi siempre es la emision comun, y las caras son
    # las variantes raras que conviene mirar despues.
    variantes.sort(key=_valor_referencia)
    return _ok(consulta=consulta, variantes=variantes[:limite] if limite else variantes)


_RE_CUID = re.compile(r"cuid-(\d+)")


def _es_del_anio(etiqueta, anio):
    """La etiqueta de fila arranca con el anio: '1877A Privy mark...'.

    La ceca va pegada al anio sin espacio, asi que no sirve un borde de palabra:
    lo unico que no puede seguir es otro digito, para que 1877 no matchee 18770.
    """
    return re.match(r"\(?%s(?![0-9])" % re.escape(str(anio)),
                    (etiqueta or "").strip()) is not None


def _descripcion_fila(fila, metal=""):
    """Lo que diferencia esta emision de las otras de la misma ficha."""
    etiqueta = (fila.get("anio") or "").strip()
    # Se saca el anio y la ceca pegada, que ya van en su propia columna.
    detalle = re.sub(r"^\(?\d{3,4}[a-zA-Z]{0,3}\)?\s*", "", etiqueta).strip()
    return " \u00b7 ".join(p for p in (detalle, metal) if p)


def _valor_referencia(v):
    """El precio mas alto cotizado, para ordenar de comun a rara."""
    precios = [p for p in (v.get("precios") or {}).values() if p is not None]
    return max(precios) if precios else 0


def _pais_ngc(pais):
    return PAIS_EN.get(_sin_tildes(pais or ""), (pais or "").upper())


def _ordenados(consulta, candidatos):
    """Los candidatos con el mejor primero, sin descartar los demas."""
    mejor = _mejor(consulta, candidatos)
    return [mejor] + [c for c in candidatos if c is not mejor]


# El metal es lo primero que se mira para separar dos variantes del mismo anio,
# asi que se dice en castellano aunque el resto de la ficha sea de NGC.
METAL_ES = {
    "copper": "cobre", "bronze": "bronce", "brass": "latón",
    "stainless steel": "acero inoxidable",
    "aluminum": "aluminio", "aluminium": "aluminio", "nickel": "niquel",
    "silver": "plata", "gold": "oro", "steel": "acero", "zinc": "zinc",
    "tin": "estaño", "lead": "plomo", "iron": "hierro", "platinum": "platino",
    "plated": "chapado", "billon": "vellón", "copper-nickel": "cuproníquel",
    "nickel": "níquel", "stainless": "inoxidable",
}


def _metal_es(texto):
    """Traduce 'Aluminum-Bronze' a 'aluminio-bronce' sin perder los compuestos."""
    if not texto:
        return ""
    t = _sin_tildes(texto)
    if t in METAL_ES:
        return METAL_ES[t]
    # "Nickel Clad Steel" es acero revestido en niquel, no niquel revestido:
    # en ingles el revestimiento va adelante y el nucleo atras.
    m = re.match(r"(.+?)[\s\-]+clad[\s\-]+(.+)", t)
    if m:
        return "%s revestido en %s" % (_metal_es(m.group(2)), _metal_es(m.group(1)))
    m = re.match(r"(.+?)[\s\-]+plated[\s\-]+(.+)", t)
    if m:
        return "%s chapado en %s" % (_metal_es(m.group(2)), _metal_es(m.group(1)))
    partes = re.split(r"([\s\-]+)", t)
    return "".join(METAL_ES.get(p, p) for p in partes)


CANTO_ES = {
    "reeded": "estriado", "plain": "liso", "smooth": "liso",
    "lettered": "con leyenda", "segmented reeding": "estriado segmentado",
    "reeded and plain": "estriado y liso", "security": "de seguridad",
    "grooved": "acanalado", "milled": "estriado", "ornamented": "decorado",
}


def _descripcion_mundial(tabla):
    """Frase corta que dice en que se diferencia esta ficha de sus hermanas."""
    e = tabla.get("especificaciones") or {}
    partes = [_metal_es(e.get("composicion")), e.get("motivo") or e.get("reverso")]
    canto = _sin_tildes(e.get("canto") or "")
    if canto:
        partes.append("canto " + CANTO_ES.get(canto, canto))
    return " \u00b7 ".join(p for p in partes if p)


def _rango_anios(tabla):
    anios = [re.sub(r"[^0-9].*$", "", f.get("anio", "")) for f in tabla.get("filas", [])]
    anios = sorted({a for a in anios if a})
    if not anios:
        return ""
    return anios[0] if len(anios) == 1 else "%s-%s" % (anios[0], anios[-1])


# El Coin Explorer busca difuso: "1955 cent" trae tambien los 5 centavos. Cada
# denominacion tiene su codigo en la descripcion ("1955 1C MS") y se filtra por
# ahi. 3CS es el de plata y 3CN el de niquel: los dos son "three cent".
DENOM_CODE_US = {
    "half cent": ["1/2C"], "cent": ["1C"], "two cent": ["2C"],
    "three cent": ["3CS", "3CN"], "nickel": ["5C"], "half dime": ["H10C"],
    "dime": ["10C"], "twenty cent": ["20C"], "quarter": ["25C"],
    "half dollar": ["50C"], "dollar": ["$1"], "quarter eagle": ["$2.5"],
    "half eagle": ["$5"], "eagle": ["$10"], "double eagle": ["$20"],
}


def _codigos_us(valor):
    return DENOM_CODE_US.get(_sin_tildes(valor or "").strip(), [])


# Las designaciones de color de EEUU (Brown, Red Brown, Red) son CoinIDs
# distintos de la misma moneda, y el price-guide de cualquiera de ellos ya
# devuelve todas. Se listan una sola vez.
_RE_DESIGNACION = re.compile(r"\s+(MS|PF|SP)\b.*$")


def listar_variantes_us(valor, anio, limite=None):
    """Variantes de NGC Estados Unidos para un valor facial y anio."""
    consulta = " ".join(str(x) for x in (anio, valor) if x).strip()
    url = "%s/coin-explorer/data/coins/search/%s/" % (
        HOST_US, urllib.parse.quote(consulta.replace("/", " "), safe=""))
    try:
        res, _ = _get(url, json_esperado=True)
    except _NgcError as e:
        return _error(str(e))
    if not isinstance(res, list) or not res:
        return _error("el Coin Explorer no encontro nada para %r" % consulta)

    codigos = _codigos_us(valor)
    vistos, variantes = set(), []
    for r in res:
        desc = (r.get("Description") or "").strip()
        if codigos and not any((" %s " % c) in (" " + desc + " ") for c in codigos):
            continue
        base = _RE_DESIGNACION.sub("", desc).strip()
        m = re.search(r"\b(MS|PF|SP)\b", desc)
        acunacion = m.group(1) if m else ""
        clave = (base, acunacion)
        if not base or clave in vistos:
            continue
        vistos.add(clave)
        variantes.append({
            "id": "us:%s" % r.get("CoinID"),
            "fuente": "ngc-eeuu",
            "referencia": base,
            "descripcion": _diferencia_us(base, anio, acunacion),
            "titulo": desc,
            "coin_id": r.get("CoinID"),
            "categoria": r.get("CategoryDescription") or "",
        })
        if limite and len(variantes) >= limite:
            break
    return _ok(consulta=consulta, variantes=variantes)


# Lo que NGC mete en la descripcion y no es ni el anio ni la denominacion es
# justamente lo que distingue la variante: la ceca y la variedad de cuno.
VARIEDAD_ES = {
    "doubled die obv": "cuño doblado del anverso",
    "doubled die rev": "cuño doblado del reverso",
    "doubled die": "cuño doblado",
    "repunched mintmark": "marca de ceca repunzonada",
    "large date": "fecha grande", "small date": "fecha chica",
    "large letters": "letras grandes", "small letters": "letras chicas",
    "over": "sobre", "no motto": "sin lema", "motto": "con lema",
    "type 1": "tipo 1", "type 2": "tipo 2", "type 3": "tipo 3",
    "high relief": "alto relieve", "bronze": "bronce", "steel": "acero",
    "silver": "plata", "clad": "revestida", "wheat": "espigas",
}


def _diferencia_us(base, anio, acunacion):
    """Ceca y variedad: lo que queda de la descripcion al sacarle lo comun."""
    t = base
    if anio:
        t = re.sub(r"^\s*%s\S*\s*" % re.escape(str(anio)), "", t)
    t = re.sub(r"\s*(\$?[0-9/]+(?:C|CS|CN)?)\s*$", "", t).strip()
    partes = []
    if re.match(r"^[A-Z]{1,2}(\s|$)", t):            # la ceca va sola adelante
        ceca, t = t.split(" ", 1) if " " in t else (t, "")
        partes.append("ceca " + ceca)
    if t:
        clave = _sin_tildes(t)
        partes.append(VARIEDAD_ES.get(clave, t.lower()))
    if acunacion == "PF":
        partes.append("proof")
    elif acunacion == "SP":
        partes.append("specimen")
    return " \u00b7 ".join(partes)


def detalle_us(coin_id):
    """Precios y especificaciones de una variante de Estados Unidos."""
    tabla = precios_us(coin_id)
    if not tabla["ok"]:
        return tabla
    try:
        meta, _ = _get("%s/coin-explorer/data/coins/%s/" % (HOST_US, coin_id),
                       json_esperado=True)
    except _NgcError:
        meta = {}
    spec = meta.get("CoinSpecification") or {}
    canto = _sin_tildes(spec.get("Edge") or "")
    tabla["especificaciones"] = {
        "composicion": _metal_es(spec.get("Composition")),
        "fineza": spec.get("Fineness", ""),
        "diametro": spec.get("Diameter", ""),
        "canto": ("canto " + CANTO_ES.get(canto, canto)) if canto else "",
        "acunacion": spec.get("Mintage", ""),
    }
    tabla["imagen"] = meta.get("ObverseImageURL") or ""
    return tabla


# --- puente con coins.json -------------------------------------------------

def consulta_de(coin):
    """Arma la consulta en ingles que entiende el buscador de NGC."""
    pais_raw = (coin.get("country") or "").split(" - ")[0]
    pais = PAIS_EN.get(_sin_tildes(pais_raw), pais_raw.upper())
    titulo = _sin_tildes(coin.get("title") or "")
    # El titulo es "<denominacion> <anio>": se saca el anio y se traduce el resto.
    sin_anio = re.sub(r"\b(1[0-9]{3}|20[0-9]{2})\b", " ", titulo)
    sin_anio = re.sub(r"\s+", " ", sin_anio).strip()
    denom = DENOM_EN.get(sin_anio)
    if denom is None:
        # "1/2 Real" o "2 Pesos": se traduce solo la ultima palabra y se
        # conserva el multiplicador que viene adelante.
        partes = sin_anio.split()
        if partes:
            ultima = DENOM_EN.get(partes[-1])
            denom = " ".join(partes[:-1] + [ultima]) if ultima else sin_anio.title()
        else:
            denom = ""
    anio = coin.get("year") or ""
    return " ".join(str(x) for x in (pais, anio, denom) if x).strip()


def _consulta_floja(coin):
    """Pais y anio nomas, para cuando la denominacion del titulo no matchea."""
    pais_raw = (coin.get("country") or "").split(" - ")[0]
    pais = PAIS_EN.get(_sin_tildes(pais_raw), pais_raw.upper())
    return ("%s %s" % (pais, coin.get("year") or "")).strip()


def consulta_us_de(coin):
    """Consulta para el Coin Explorer de EEUU: anio mas denominacion en ingles.

    El titulo trae la ceca pegada al final ("1/2 Dolar 1989 S"). El buscador no
    la entiende, asi que se saca de la consulta y se usa despues para desempatar
    entre los candidatos.
    """
    titulo = _sin_tildes(coin.get("title") or "")
    sin_anio = re.sub(r"\b(1[0-9]{3}|20[0-9]{2})\b", " ", titulo)
    sin_anio = re.sub(r"\s+", " ", sin_anio).strip()
    sin_anio = re.sub(r"\s+[a-z]$", "", sin_anio)              # ceca suelta al final
    denom = DENOM_US.get(sin_anio)
    if denom is None:
        partes = sin_anio.split()
        denom = DENOM_US.get(partes[-1]) if partes else None
    return " ".join(str(x) for x in (coin.get("year") or "", denom or sin_anio) if x).strip()


def ceca_de(coin):
    """Letra de ceca al final del titulo, o cadena vacia."""
    m = re.search(r"\b(1[0-9]{3}|20[0-9]{2})\s+([A-Z])$", (coin.get("title") or "").strip())
    return m.group(2) if m else ""


def columna_para(grade_short):
    """Columnas de NGC a probar para un grade_short de coins.json, en orden."""
    m = re.match(r"^(SC|EX|MB|B|R)([+-]?)", (grade_short or "").strip())
    if not m:
        return []
    base, mod = m.group(1), m.group(2)
    cols = list(EQUIVALENCIA.get(base, []))
    if mod and cols and cols[0] in _ESCALA:
        i = _ESCALA.index(cols[0]) + (1 if mod == "+" else -1)
        if 0 <= i < len(_ESCALA):
            cols.insert(0, _ESCALA[i])
    return cols


def valuar(coin, usar_cache=True):
    """Precio de referencia de NGC para una entrada de coins.json.

    Elige la via segun el pais y devuelve el valor de la columna equivalente al
    grado propio, junto al precio de venta que ya tiene la moneda.
    """
    es_us = _sin_tildes((coin.get("country") or "").split(" - ")[0]) == "estados unidos"
    clave = ("us:%s" % consulta_us_de(coin)) if es_us else ("world:%s" % consulta_de(coin))

    cache = _cache_leer() if usar_cache else {}
    entrada = cache.get(clave)
    if entrada and _cache_vigente(entrada):
        tabla = entrada["tabla"]
    else:
        if es_us:
            hallado = buscar_us(consulta_us_de(coin), ceca_de(coin))
            tabla = precios_us(hallado["coin_id"]) if hallado["ok"] else hallado
        else:
            hallado = buscar_mundial(consulta_de(coin))
            if not hallado["ok"]:
                # El titulo suele omitir el multiplicador ("Ore" por "2 Ore"):
                # una segunda pasada con pais y anio nomas suele pegarle.
                hallado = buscar_mundial(_consulta_floja(coin))
            tabla = precios_mundial(hallado["url"]) if hallado["ok"] else hallado
        if tabla["ok"] and usar_cache:
            cache[clave] = {"consultado": datetime.now(timezone.utc).isoformat(),
                            "tabla": tabla}
            _cache_guardar(cache)

    if not tabla["ok"]:
        return _error(tabla["motivo"], id=coin.get("id"),
                      consulta=consulta_us_de(coin) if es_us else consulta_de(coin))

    if tabla["via"] == "us-json":
        # El JSON de EEUU ya viene filtrado por moneda: una fila por designacion.
        # Se toma la Base, que es la que cotiza los grados sin el sufijo Plus.
        fila = next((f for f in tabla["filas"] if f.get("tipo") == "Base"),
                    tabla["filas"][0])
    else:
        anio = str(coin.get("year") or "")
        fila = next((f for f in tabla["filas"]
                     if str(f.get("anio", "")).startswith(anio)), tabla["filas"][0])

    columnas = columna_para(coin.get("grade_short"))
    ngc_usd, ngc_col = None, ""
    for c in columnas:
        if c in fila["precios"]:
            ngc_usd, ngc_col = fila["precios"][c], c
            break

    # NGC no cotiza todos los grados de todas las piezas: las de plata suelen
    # arrancar en 55. Cuando no esta el nuestro se devuelve el mas cercano de la
    # escala como referencia, marcado aparte para no confundirlo con el exacto.
    cerca_col, cerca_usd = "", None
    if ngc_usd is None and columnas and fila["precios"]:
        objetivo = _ESCALA.index(columnas[0]) if columnas[0] in _ESCALA else 0
        disponibles = [(abs(_ESCALA.index(c) - objetivo), c)
                       for c in fila["precios"] if c in _ESCALA]
        if disponibles:
            cerca_col = min(disponibles)[1]
            cerca_usd = fila["precios"][cerca_col]

    return _ok(id=coin.get("id"),
               titulo=coin.get("title"),
               pais=coin.get("country"),
               grado=coin.get("grade_short"),
               consulta=consulta_us_de(coin) if es_us else consulta_de(coin),
               via=tabla["via"],
               url=tabla.get("url", ""),
               ficha=tabla.get("descripcion", ""),
               columna_ngc=ngc_col,
               ngc_usd=ngc_usd,
               columna_cercana=cerca_col,
               ngc_usd_cercano=cerca_usd,
               propio=coin.get("price"),
               precios_fila=fila["precios"],
               motivo="" if ngc_usd is not None
                      else "NGC no cotiza el grado %s para ese anio%s"
                           % (coin.get("grade_short"),
                              "; lo mas cercano es %s" % cerca_col if cerca_col else ""))


# --- CLI -------------------------------------------------------------------

def _coins():
    with open(COINS_JSON, encoding="utf-8") as f:
        return json.load(f)


def main():
    p = argparse.ArgumentParser(description="Precios NGC para coins.json")
    p.add_argument("--moneda", help="id de coins.json a valuar")
    p.add_argument("--buscar", help="texto libre contra el buscador mundial de NGC")
    p.add_argument("--us", help="CoinID de NGC, o texto libre, para la via JSON de EEUU")
    p.add_argument("--reporte", action="store_true",
                   help="recorre el catalogo y cuenta cuantas matchean")
    p.add_argument("--muestra", type=int, default=0,
                   help="con --reporte: tomar solo N monedas repartidas del catalogo")
    p.add_argument("--sin-cache", action="store_true")
    a = p.parse_args()

    if a.us:
        r = buscar_us(a.us) if not a.us.isdigit() else _ok(coin_id=a.us)
        if r["ok"]:
            r = {**r, "tabla": precios_us(r["coin_id"])}
        print(json.dumps(r, ensure_ascii=False, indent=1))
        return 0 if r["ok"] else 1
    if a.buscar:
        r = buscar_mundial(a.buscar)
        if r["ok"]:
            r = {**r, "tabla": precios_mundial(r["url"])}
        print(json.dumps(r, ensure_ascii=False, indent=1))
        return 0 if r["ok"] else 1
    if a.moneda:
        coin = next((c for c in _coins() if str(c.get("id")) == str(a.moneda)), None)
        if coin is None:
            print("no existe la moneda %s en coins.json" % a.moneda, file=sys.stderr)
            return 1
        print(json.dumps(valuar(coin, not a.sin_cache), ensure_ascii=False, indent=1))
        return 0
    if a.reporte:
        return _reporte(a.muestra)
    p.print_help()
    return 1


def _reporte(muestra=0):
    """Pasada por el catalogo para medir cuanto matchea contra NGC.

    Solo mira las monedas con conservacion cargada: sin grade_short no hay
    columna que buscar. Con --muestra toma N repartidas parejo, que alcanza para
    estimar la cobertura sin hacer 750 rondas contra el sitio.
    """
    coins = [c for c in _coins() if c.get("grade_short")]
    if muestra and muestra < len(coins):
        paso = len(coins) / float(muestra)
        coins = [coins[int(i * paso)] for i in range(muestra)]
    ok = con_precio = 0
    for i, c in enumerate(coins, 1):
        r = valuar(c)
        ok += 1 if r["ok"] else 0
        con_precio += 1 if r.get("ngc_usd") is not None else 0
        estado = "%-6s" % (r.get("columna_ngc") or ("-" if r["ok"] else "X"))
        print("%4d/%d  %-5s %s %-34s %-10s %s"
              % (i, len(coins), c["id"], estado, (c.get("title") or "")[:34],
                 c.get("price") or "", r.get("ngc_usd") if r["ok"] else r["motivo"][:60]))
        time.sleep(0.3)                       # no golpear el sitio de a rafagas
    print("\nfichas encontradas: %d/%d | con precio para el grado: %d"
          % (ok, len(coins), con_precio))
    return 0


if __name__ == "__main__":
    sys.exit(main())
