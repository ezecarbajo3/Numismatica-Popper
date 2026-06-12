# Propuesta de Agrupación de Variantes — Fase 0

> Generado: 2026-06-12  
> Base: coins.json — 132 monedas activas (status ≠ "sold")

---

## REGLA A — Aplicada directamente (mismo `reference` + mismo país-catálogo)

Estos grupos ya tienen `group_id` y `group_label` escritos en coins.json.  
Los listo para tu revisión; si algo no te parece correcto, avisame antes de la Fase 1.

| group_id | group_label | IDs incluidos | Años | Precios |
|----------|-------------|---------------|------|---------|
| group_a_cj2 | **2 Centavos (CJ# 2)** | 3, 5 | 1854, 1854 | $10, $14 |
| group_a_cj23 | **2 Reales (CJ# 23)** | 7, 147 | 1860, 1860 | $9, $22 |
| group_a_cj37 | **2 Centavos (CJ# 37)** | 33, 102, 146, 178 | 1896 ×4 | $6, $6, $10, $15 |
| group_a_cj50 | **Centavo (CJ# 50)** | 50, 51 | 1895, 1895 | $15, $15 |
| group_a_cj55 | **20 Centavos (CJ# 55)** | 105, 107 | 1899, 1899 | $6, $30 |
| group_a_cj59 | **20 Centavos (CJ# 59)** | 44, 45, 108, 109, 110 | 1908 ×5 | $30, $30, $60, $90, $120 |
| group_a_cj83 | **20 Centavos (CJ# 83)** | 111, 112 | 1936, 1936 | $12, $8 |
| group_a_cj185 | **2 Centavos (CJ# 185)** | 114, 115 | 1950, 1950 | $15, $12 |
| group_a_km10_uy | **40 Centésimos (KM# 10)** | 78, 79 | 1857, 1857 | $20, $25 |
| group_a_km30_uy | **Peso (KM# 30)** | 55, 140 | 1942, 1942 | $16, $14 |
| group_a_km90_us | **Indian Head Cent** | 28, 29, 30, 32 | 1860–1864 | $20, $40, $20, $25 |

**Nota sobre KM# 172:** ids 151 (Bolivia, 10 Centavos 1892) y 153 (Baden, 3 Kreuzer 1818) comparten el número pero son catálogos de países distintos — coincidencia numérica, NO se agrupan.  
**Nota sobre KM# 21a:** ids 202 (Uruguay) y 209 (Suiza) — idem, no se agrupan.

---

## REGLA B — Propuestas pendientes de confirmación

Estas monedas NO comparten `reference` pero sí país, denominación y años cercanos.  
**No modificaré coins.json para estos grupos hasta que me des el OK** (o rechaces alguno).  
Podés responder "OK todo B", "OK B1, B3, B5", "rechazo B4", etc.

---

### B1 — Argentina · 2 Reales Buenos Aires (1854–1860)

Extender el grupo A `group_a_cj23` (1860) sumando id 8 (1854, CJ# 19).  
Mismo país-era (Buenos Aires), misma denominación, rango 6 años.

| id | ref | Título | Año | Precio |
|----|-----|--------|-----|--------|
| 8 | CJ# 19 | 2 Reales 1854 | 1854 | $13 |
| 7 | CJ# 23 | 2 Reales 1860 | 1860 | $9 |
| 147 | CJ# 23 | 2 Reales 1860 | 1860 | $22 |

**group_label propuesto:** `"2 Reales Buenos Aires (1854-1860)"`  
**group_id propuesto:** `"group_b_2reales_ba"`

---

### B2 — Argentina · 2 Centavos (1884–1895)

Mismo país (Argentina), misma denominación, rango 11 años. Todos son la serie de 2 centavos de la República (distintos tipos/fechas).

| id | ref | Título | Año | Precio |
|----|-----|--------|-----|--------|
| 14 | CJ# 26 | 2 Centavos 1884 | 1884 | $3 |
| 17 | CJ# 27 | 2 Centavos 1885 | 1885 | $18 |
| 18 | CJ# 31 | 2 Centavos 1890 | 1890 | $2.5 |
| 19 | CJ# 32 | 2 Centavos 1891 | 1891 | $3 |
| 100 | CJ# 34 | 2 Centavos 1893 | 1893 | $2 |
| 101 | CJ# 33 | 2 Centavos 1895 | 1895 | $4 |

**group_label propuesto:** `"2 Centavos (1884-1895)"`  
**group_id propuesto:** `"group_b_2ctvs_1884_1895"`

---

### B3 — Argentina · 2 Centavos (1944–1950)

Extender el grupo A `group_a_cj185` (1950) sumando id 113 (1944, CJ# 178).  
Misma denominación, mismo país, rango 6 años.

| id | ref | Título | Año | Precio |
|----|-----|--------|-----|--------|
| 113 | CJ# 178 | 2 Centavos 1944 | 1944 | $20 |
| 114 | CJ# 185 | 2 Centavos 1950 | 1950 | $15 |
| 115 | CJ# 185 | 2 Centavos 1950 | 1950 | $12 |

**group_label propuesto:** `"2 Centavos (1944-1950)"`  
**group_id propuesto:** `"group_b_2ctvs_1944_1950"` *(reemplaza group_a_cj185)*

---

### B4 — Argentina · Centavo (1885–1890)

Mismo país, misma denominación, rango 5 años. Serie de centavos de la República.

| id | ref | Título | Año | Precio |
|----|-----|--------|-----|--------|
| 38 | CJ# 41 | Centavo 1885 | 1885 | $6 |
| 43 | CJ# 42 | Centavo 1886 | 1886 | $9 |
| 35 | CJ# 45 | Centavo 1890 | 1890 | $5 |

**group_label propuesto:** `"Centavo (1885-1890)"`  
**group_id propuesto:** `"group_b_centavo_1885_1890"`

---

### B5 — Argentina · 5 Centavos (1908–1916)

Mismo país, misma denominación, rango 8 años. (id 104 de 1934 queda afuera por distancia.)

| id | ref | Título | Año | Precio |
|----|-----|--------|-----|--------|
| 103 | CJ# 139 | 5 Centavos 1908 | 1908 | $6 |
| 39 | CJ# 145.2 | 5 Centavos 1914 | 1914 | $8 |
| 49 | CJ# 147 | 5 Centavos 1916 | 1916 | $6 |

**group_label propuesto:** `"5 Centavos (1908-1916)"`  
**group_id propuesto:** `"group_b_5ctvs_1908_1916"`

---

### B6 — Argentina · 20 Centavos (1931–1936)

Extender el grupo A `group_a_cj83` (1936) sumando id 34 (1931, CJ# 81).  
Misma denominación, mismo país, rango 5 años.

| id | ref | Título | Año | Precio |
|----|-----|--------|-----|--------|
| 34 | CJ# 81 | 20 Centavos 1931 | 1931 | $3 |
| 111 | CJ# 83 | 20 Centavos 1936 | 1936 | $12 |
| 112 | CJ# 83 | 20 Centavos 1936 | 1936 | $8 |

**group_label propuesto:** `"20 Centavos (1931-1936)"`  
**group_id propuesto:** `"group_b_20ctvs_1931_1936"` *(reemplaza group_a_cj83)*

---

### B7 — Bolivia · 10 Centavos (1883–1892)

Mismo país, misma denominación, rango 9 años.

| id | ref | Título | Año | Precio |
|----|-----|--------|-----|--------|
| 138 | KM# 170.2 | 10 Centavos 1883 | 1883 | $8 |
| 151 | KM# 172 | 10 Centavos 1892 | 1892 | $6 |

**group_label propuesto:** `"10 Centavos Bolivia (1883-1892)"`  
**group_id propuesto:** `"group_b_10ctvs_bolivia"`

---

### B8 — Estados Unidos · Kennedy Half Dollar (1964–1989)

Misma denominación, mismo país. Aunque el rango es 25 años, los tres son **Kennedy Half Dollars** — misma serie con el mismo diseño (Kennedy), distinto año/emisión. El nombre propio de la serie justifica agruparlos (Regla de label prioridad 1).

| id | ref | Título | Año | Precio |
|----|-----|--------|-----|--------|
| 148 | KM# 202 | 1/2 Dólar 1964 | 1964 | $20 |
| 149 | KM# 212 | 1/2 Dólar 1986 S | 1986 | $16 |
| 150 | KM# 224 | 1/2 Dólar 1989 S | 1989 | $18 |

**group_label propuesto:** `"Kennedy Half Dollar"`  
**group_id propuesto:** `"group_b_kennedy_half"`

---

### B9 — Estados Unidos · Indian Head Cent (KM# 90 + KM# 90a)

Extender el grupo A `group_a_km90_us` (1860–1864, cobre-níquel) sumando id 181 (1881, KM# 90a, bronce).  
Misma serie "Indian Head", mismo diseño. El descriptor `desc: "Indian Head."` confirma la serie. KM#90 y KM#90a son variantes de aleación, no diseños distintos.

| id | ref | Título | Año | Precio |
|----|-----|--------|-----|--------|
| 32 | KM# 90 | Cent 1860 | 1860 | $20 |
| 29 | KM# 90 | Cent 1861 | 1861 | $40 |
| 28 | KM# 90 | Cent 1863 | 1863 | $25 |
| 30 | KM# 90 | Cent 1864 | 1864 | $20 |
| 181 | KM# 90a | Cent 1881 | 1881 | $10 |

**group_label propuesto:** `"Indian Head Cent"` *(mantiene label A, solo suma id 181)*  
**group_id propuesto:** `"group_b_indian_cent"` *(reemplaza group_a_km90_us)*

---

### B10 — Uruguay · 5 Centésimos (1854–1857)

Mismo país, misma denominación, rango solo 3 años. (id 202 de 1948 queda afuera por distancia.)

| id | ref | Título | Año | Precio |
|----|-----|--------|-----|--------|
| 76 | KM# 1 | 5 Centésimos 1854/40 RARA | 1854 | $60 |
| 77 | KM# 8 | 5 Centésimos 1857 | 1857 | $16 |

**group_label propuesto:** `"5 Centésimos Uruguay (1854-1857)"`  
**group_id propuesto:** `"group_b_5centes_uy"`

---

### B11 — Argentina · Catálogo Carlos Janson (ediciones 2001/2004/2009)

Caso especial: son libros, no monedas. Pero son el mismo catálogo en distintas ediciones. Si los agrupás, aparecerán como una sola ficha "Catálogo Janson" con selector de edición. Si preferís que aparezcan como ítems separados en la sección Exonumia/Libros, dejalo así.

| id | Título | Precio |
|----|--------|--------|
| 170 | Catálogo Carlos Janson 1881-2001 | $18 |
| 171 | Catálogo Carlos Janson 1881-2004 | $20 |
| 172 | Catálogo Carlos Janson 1881-2009 | $22 |

**group_label propuesto:** `"Catálogo Carlos Janson"`  
**group_id propuesto:** `"group_b_janson_catalogo"`

---

## Resumen

| Tipo | Grupos | Monedas cubiertas |
|------|--------|-------------------|
| Regla A (aplicados) | 11 | 29 |
| Regla B (pendientes) | 11 | 32 |
| **Total agrupables** | **22** | **61** |
| Sin grupo (singletons) | — | 71 |
| **Total activos** | | **132** |

---

*Respondé con "OK todo B" para aplicar todos los grupos B, o listá cuáles aceptás/rechazás.*
