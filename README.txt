# Coin Catalog Site

Este pack incluye:
- `index.html`
- `styles.css`
- `script.js`
- `coins.json`

## Cómo usarlo en GitHub Pages
1. Subí los 4 archivos al repositorio.
2. Asegurate de que `index.html` esté en la raíz.
3. Activá GitHub Pages desde `Settings > Pages`.
4. Elegí la rama principal y carpeta `/root`.

## Cómo cargar monedas
Abrí `coins.json` y agregá nuevos objetos dentro del array.

Ejemplo:

```json
{
  "id": 6,
  "title": "2 Pesos 1881",
  "country": "Argentina",
  "metal": "Plata",
  "year": 1881,
  "price": "USD 95",
  "image": "images/2-pesos-1881.jpg",
  "description": "Muy linda pieza argentina, ideal para colección.",
  "reference": "KM# 30",
  "status": "Disponible",
  "grade": "Muy buena",
  "weight": "10 g",
  "diameter": "28 mm"
}
```

## Recomendación
Si vas a subir tus propias fotos, creá una carpeta `images` dentro del repo y usá rutas como:
- `images/moneda-1.jpg`
- `images/moneda-2.jpg`

No repitas IDs. Y mantené siempre los mismos nombres de país y metal para que los filtros no se fragmenten.
