# -*- coding: utf-8 -*-
"""Mapeos de los valores de coins.json a las listas cerradas de la planilla de
carga masiva de MercadoLibre (categoria Monedas).

Las listas de ML son mucho mas cortas que el universo del catalogo, asi que
siempre se elige el valor mas parecido. Nunca se deja la celda vacia.
"""

# --- Listas cerradas exactas de la planilla (hoja 'extra info') ---------------
ORIGEN_ML = ["Alemania", "Argentina", "Austria", "Bolivia", "Brasil", "Bélgica",
             "Canadá", "Chile", "China", "Cuba", "Dinamarca", "España",
             "Estados Unidos", "Francia", "Grecia", "Holanda", "Inglaterra",
             "Israel", "Italia", "Japón", "México", "Perú", "Polonia",
             "Portugal", "Rusia", "Ucrania", "Uruguay"]

METAL_ML = ["Oro", "Cobre", "Níquel", "Plata", "Bronce"]

TIPO_MONEDA_ML = ["Real", "Rublo", "Zloty", "Yuan", "Euro", "Sheqel", "Grivna",
                  "Dólar", "Yen", "Peso"]


# --- Origen: pais del catalogo -> uno de los 27 de ML -------------------------
# Criterio: match exacto; luego vinculo colonial/historico; luego cercania
# geografica o monetaria.
ORIGEN = {
    # Exactos y variantes
    "Argentina": "Argentina",
    "Argentina - Patria": "Argentina",
    "Argentina - Buenos Aires": "Argentina",
    "Estados Unidos": "Estados Unidos",
    "Reino Unido": "Inglaterra",
    "Canadá": "Canadá",
    "Perú": "Perú",
    "Uruguay": "Uruguay",
    "Francia": "Francia",
    "Francia - Régimen de Vichy": "Francia",
    "Chile": "Chile",
    "Italia": "Italia",
    "Italia - Estados Preunitarios": "Italia",
    "Alemania": "Alemania",
    "Dinamarca": "Dinamarca",
    "China": "China",
    "Brasil": "Brasil",
    "Bolivia": "Bolivia",
    "Bélgica": "Bélgica",
    "Países Bajos": "Holanda",
    "Países Bajos - Overijssel": "Holanda",
    "España": "España",
    "Portugal": "Portugal",
    "Austria": "Austria",
    "Rusia": "Rusia",
    "México": "México",
    "Polonia": "Polonia",
    "Israel": "Israel",
    "Japón": "Japón",
    "Grecia": "Grecia",
    "Cuba": "Cuba",
    "Ucrania": "Ucrania",

    # Escandinavia / norte de Europa -> Dinamarca
    "Suecia": "Dinamarca",
    "Noruega": "Dinamarca",
    "Islandia": "Dinamarca",
    "Spitsbergen (Svalbard)": "Dinamarca",

    # Europa central / germanica -> Alemania o Austria
    "Suiza": "Alemania",
    "Luxemburgo": "Bélgica",
    "Hungría": "Austria",
    "Croacia": "Austria",
    "Bosnia y Herzegovina": "Austria",
    "Serbia": "Austria",
    "Yugoslavia": "Austria",
    "Condado de Gorizia": "Austria",
    "Rumania": "Austria",
    "Transnistria": "Rusia",

    # Territorios y ex colonias britanicas -> Inglaterra
    "Gibraltar": "Inglaterra",
    "Jamaica": "Inglaterra",
    "Islas Malvinas": "Inglaterra",
    "Santa Elena": "Inglaterra",
    "Tristán de Acuña": "Inglaterra",
    "Jersey": "Inglaterra",
    "Guernsey": "Inglaterra",
    "Islas Vírgenes Británicas": "Inglaterra",
    "Islas Cook": "Inglaterra",
    "Nueva Zelanda": "Inglaterra",
    "Belice": "Inglaterra",
    "Chipre": "Inglaterra",
    "Malta": "Inglaterra",
    "India": "Inglaterra",
    "India Británica": "Inglaterra",
    "Sri Lanka": "Inglaterra",
    "Bangladés": "Inglaterra",
    "Bangladesh": "Inglaterra",
    "Maldivas": "Inglaterra",
    "Malasia": "Inglaterra",
    "Brunei": "Inglaterra",
    "Hong Kong": "Inglaterra",
    "Isla de Java (Ocupación Británica)": "Inglaterra",
    "Sultanato de Cachemira": "Inglaterra",
    "Bután": "Inglaterra",
    "Irlanda": "Inglaterra",
    "Gambia": "Inglaterra",
    "Zambia": "Inglaterra",
    "Malawi": "Inglaterra",
    "Uganda": "Inglaterra",
    "Swazilandia": "Inglaterra",
    "Namibia": "Inglaterra",
    "Seychelles": "Inglaterra",
    "Mauricio": "Inglaterra",
    "Samoa": "Inglaterra",
    "Kiribati": "Inglaterra",
    "Vanuatu": "Inglaterra",

    # Ex colonias neerlandesas -> Holanda
    "Antillas Holandesas": "Holanda",
    "Curazao": "Holanda",
    "Indias Orientales Neerlandesas": "Holanda",
    "San Martín": "Holanda",
    "Indonesia": "Holanda",

    # Ex colonias belgas -> Bélgica
    "Congo Belga": "Bélgica",
    "Congo Belga y Ruanda-Urundi": "Bélgica",
    "Ruanda": "Bélgica",
    "Burundi": "Bélgica",

    # Ex colonias / zona franco -> Francia
    "África Occidental Francesa": "Francia",
    "Estados del África Occidental": "Francia",
    "Marruecos": "Francia",
    "Líbano": "Francia",
    "Siria": "Francia",
    "Vietnam del Sur": "Francia",
    "Mónaco": "Francia",
    "San Marino": "Italia",
    "Isla de Pascua": "Chile",

    # America latina hispana -> Peru / Mexico segun cercania
    "Paraguay": "Argentina",
    "Colombia": "Perú",
    "Ecuador": "Perú",
    "Venezuela": "Perú",
    "Costa Rica": "México",
    "Guatemala": "México",
    "El Salvador": "México",
    "Honduras": "México",
    "República Dominicana": "México",

    # Asia / Medio Oriente / Africa restantes
    "Turquía": "Grecia",
    "Imperio Otomano": "Grecia",
    "Egipto": "Israel",
    "Arabia Saudita": "Israel",
    "Emiratos Árabes Unidos": "Israel",
    "Yemen": "Israel",
    "Yemen del Norte": "Israel",
    "Bahréin": "Israel",
    "Omán": "Israel",
    "Kirguistán": "Rusia",
    "Uzbekistán": "Rusia",
    "Tayikistán": "Rusia",
    "Tailandia": "China",
    "Liberia": "Estados Unidos",

    # Sin pais real: son piezas argentinas (medallas, tokens, insumos)
    "Token": "Argentina",
    "Medalla": "Argentina",
    "Insumos": "Argentina",
    "Desconocido": "Argentina",
}

ORIGEN_FALLBACK = "Argentina"


def origen(country):
    """Devuelve el Origen de ML para un pais del catalogo. Nunca vacio."""
    c = (country or "").strip()
    if c in ORIGEN:
        return ORIGEN[c]
    # 'Pais - Provincia' -> probar solo el pais
    base = c.split(" - ")[0].strip()
    if base in ORIGEN:
        return ORIGEN[base]
    for k, v in ORIGEN.items():
        if k and k.lower() in c.lower():
            return v
    return ORIGEN_FALLBACK


# --- Tipo de metal: composicion del catalogo -> uno de los 5 de ML ------------
# Se evalua por substring en orden de prioridad: lo que define la pieza gana.
_METAL_REGLAS = [
    (("oro nórdico",), "Bronce"),          # el 'oro nordico' es una aleacion de laton
    (("oro", "au "), "Oro"),
    (("plata", "vellón", "vellon", "ag ", "ag0", "ag."), "Plata"),
    (("cuproníquel", "cuproniquel", "cupro-níquel", "cupro-niquel", "cu ni",
      "cuni"), "Níquel"),
    (("níquel", "niquel"), "Níquel"),
    (("bronce", "latón", "laton", "acmonital"), "Bronce"),
    (("cobre",), "Cobre"),
    (("acero", "hierro", "zinc", "aluminio", "bimetálica", "bimetalica",
      "trimetálica", "trimetalica", "monometálica", "monometalica",
      "polímero", "polimero"), "Níquel"),
]

METAL_FALLBACK = "Níquel"


def metal(valor):
    """Devuelve el Tipo de metal de ML. Nunca vacio."""
    v = (valor or "").strip().lower()
    if not v:
        return METAL_FALLBACK
    for claves, destino in _METAL_REGLAS:
        for k in claves:
            if k in v:
                return destino
    return METAL_FALLBACK


# --- Tipo de moneda: denominacion -> una de las 10 divisas de ML --------------
# Clave = unidad del valor facial en minusculas y sin acentos.
_UNIDAD = {
    # Peso y sus fracciones hispanoamericanas
    "centavo": "Peso", "centavos": "Peso", "peso": "Peso", "pesos": "Peso",
    "austral": "Peso", "australes": "Peso", "argentino": "Peso",
    "boliviano": "Peso", "bolivianos": "Peso", "quetzal": "Peso",
    "colon": "Peso", "colones": "Peso", "lempira": "Peso", "cordoba": "Peso",
    "guarani": "Peso", "guaranies": "Peso", "bolivar": "Peso",
    "bolivares": "Peso", "sucre": "Peso", "sol": "Peso", "soles": "Peso",
    "inti": "Peso", "intis": "Peso", "escudo": "Peso", "escudos": "Peso",
    "cruzeiro": "Peso", "cruzeiros": "Peso", "cruzado": "Peso",
    "cruzados": "Peso", "cruzeiros novos": "Peso",
    # Dolar y el mundo anglosajon / decimal britanico
    "dolar": "Dólar", "dolares": "Dólar", "dollar": "Dólar",
    "dollars": "Dólar", "cent": "Dólar", "cents": "Dólar",
    "penny": "Dólar", "pence": "Dólar", "pennies": "Dólar",
    "farthing": "Dólar", "shilling": "Dólar", "shillings": "Dólar",
    "florin": "Dólar", "crown": "Dólar", "crowns": "Dólar",
    "sovereign": "Dólar", "guinea": "Dólar", "libra": "Dólar",
    "libras": "Dólar", "pound": "Dólar", "pounds": "Dólar",
    "mil": "Dólar", "mils": "Dólar", "rupia": "Dólar", "rupias": "Dólar",
    "rupee": "Dólar", "rupees": "Dólar", "paisa": "Dólar", "paise": "Dólar",
    "anna": "Dólar", "annas": "Dólar", "poisha": "Dólar", "taka": "Dólar",
    "laari": "Dólar", "ringgit": "Dólar", "sen": "Dólar", "cts": "Dólar",
    "kwacha": "Dólar", "ngwee": "Dólar", "tambala": "Dólar",
    "kwacha/ngwee": "Dólar", "dalasi": "Dólar", "butut": "Dólar",
    "bututs": "Dólar", "shilingi": "Dólar", "senti": "Dólar",
    "lilangeni": "Dólar", "cents/dollar": "Dólar", "tala": "Dólar",
    "sene": "Dólar", "vatu": "Dólar", "chetrum": "Dólar",
    "ngultrum": "Dólar", "rand": "Dólar",
    # Euro y la zona franco / lira / peseta
    "euro": "Euro", "euros": "Euro", "eurocent": "Euro",
    "franco": "Euro", "francos": "Euro", "franc": "Euro", "francs": "Euro",
    "centime": "Euro", "centimes": "Euro", "centimo": "Euro",
    "centimos": "Euro", "centesimi": "Euro", "centesimo": "Euro",
    "centesimos": "Euro", "lira": "Euro", "liras": "Euro", "lire": "Euro",
    "peseta": "Euro", "pesetas": "Euro", "rappen": "Euro",
    "mark": "Euro", "marcos": "Euro", "marco": "Euro",
    "deutsche": "Euro", "reichspfennig": "Euro", "reichsmark": "Euro",
    "pfennig": "Euro", "pfennige": "Euro", "groschen": "Euro",
    "schilling": "Euro", "gulden": "Euro", "guldens": "Euro",
    "duit": "Euro", "stuiver": "Euro", "cent gulden": "Euro",
    "ore": "Euro", "øre": "Euro", "krone": "Euro", "kroner": "Euro",
    "kronor": "Euro", "krona": "Euro", "aurar": "Euro", "eyrir": "Euro",
    "escudo portugues": "Euro", "drachma": "Euro", "drachmas": "Euro",
    "lepta": "Euro", "dracma": "Euro", "dracmas": "Euro",
    "dinar": "Euro", "dinara": "Euro", "para": "Euro", "kuna": "Euro",
    "lipa": "Euro", "filler": "Euro", "forint": "Euro", "leu": "Euro",
    "lei": "Euro", "bani": "Euro", "ban": "Euro", "leone": "Euro",
    "kurus": "Euro", "piastra": "Euro", "piastras": "Euro",
    "piastre": "Euro", "piastres": "Euro", "lev": "Euro", "stotinki": "Euro",
    # Real
    "real": "Real", "reales": "Real", "reis": "Real", "reis/real": "Real",
    "réis": "Real",
    # Rublo
    "rublo": "Rublo", "rublos": "Rublo", "ruble": "Rublo",
    "kopeck": "Rublo", "kopecks": "Rublo", "kopek": "Rublo",
    "kopeks": "Rublo", "copeck": "Rublo", "tenge": "Rublo",
    "som": "Rublo", "tyiyn": "Rublo", "sum": "Rublo", "tiyin": "Rublo",
    "somoni": "Rublo", "diram": "Rublo",
    # Zloty
    "zloty": "Zloty", "groszy": "Zloty", "grosz": "Zloty",
    # Yuan / Yen
    "yuan": "Yuan", "jiao": "Yuan", "fen": "Yuan", "baht": "Yuan",
    "satang": "Yuan", "dong": "Yuan", "won": "Yuan", "kip": "Yuan",
    "riel": "Yuan", "rupiah": "Yuan", "hao": "Yuan",
    "yen": "Yen", "sen japones": "Yen",
    # Sheqel / Grivna
    "sheqel": "Sheqel", "shekel": "Sheqel", "sheqalim": "Sheqel",
    "agora": "Sheqel", "agorot": "Sheqel", "lirot": "Sheqel",
    "prutah": "Sheqel", "riyal": "Sheqel", "riyals": "Sheqel",
    "rial": "Sheqel", "halala": "Sheqel", "halalas": "Sheqel",
    "dirham": "Sheqel", "dirhams": "Sheqel", "fils": "Sheqel",
    "baisa": "Sheqel", "buqsha": "Sheqel", "qirsh": "Sheqel",
    "piastra egipcia": "Sheqel", "millieme": "Sheqel",
    "grivna": "Grivna", "hryvnia": "Grivna", "kopiyka": "Grivna",
}

# Cuando la unidad no resuelve, se cae al pais.
_POR_PAIS = {
    "Estados Unidos": "Dólar", "Canadá": "Dólar", "Inglaterra": "Dólar",
    "Argentina": "Peso", "México": "Peso", "Chile": "Peso", "Uruguay": "Peso",
    "Perú": "Peso", "Bolivia": "Peso", "Cuba": "Peso", "Brasil": "Real",
    "Rusia": "Rublo", "Ucrania": "Grivna", "Polonia": "Zloty",
    "China": "Yuan", "Japón": "Yen", "Israel": "Sheqel",
    "Alemania": "Euro", "Francia": "Euro", "Italia": "Euro",
    "España": "Euro", "Portugal": "Euro", "Austria": "Euro",
    "Bélgica": "Euro", "Holanda": "Euro", "Grecia": "Euro",
    "Dinamarca": "Euro",
}

TIPO_MONEDA_FALLBACK = "Dólar"

_ACENTOS = str.maketrans("áéíóúüàèìòùâêîôûäëïöñ", "aeiouuaeiouaeiouaeion")


def _norm(s):
    return (s or "").strip().lower().translate(_ACENTOS)


def tipo_moneda(valor_facial, country):
    """Devuelve el Tipo de moneda de ML a partir del valor facial y el pais.
    Nunca vacio."""
    palabras = [p for p in _norm(valor_facial).replace("/", " ").split()
                if not p.replace(".", "").replace(",", "").isdigit()]
    # frase completa primero, despues palabra por palabra
    frase = " ".join(palabras)
    if frase in _UNIDAD:
        return _UNIDAD[frase]
    for p in palabras:
        p = p.strip('".,()[]"“”')
        if p in _UNIDAD:
            return _UNIDAD[p]
    return _POR_PAIS.get(origen(country), TIPO_MONEDA_FALLBACK)


# --- Conservacion: sigla -> texto largo, conservando el subgrado --------------
_GRADO = {"SC": "Sin Circular", "EX": "Excelente", "MB": "Muy Buena",
          "B": "Buena", "R": "Regular"}


def conservacion(grade_short):
    """SC** -> 'Sin Circular **'. Devuelve None si no hay dato."""
    g = (grade_short or "").strip()
    if not g:
        return None
    for sigla in ("SC", "MB", "EX", "B", "R"):
        if g.upper().startswith(sigla):
            sufijo = g[len(sigla):].strip()
            return f"{_GRADO[sigla]} {sufijo}".strip()
    return None
