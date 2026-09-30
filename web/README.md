# codes2pdf — web

Interfaz web minimalista para generar un **notebook** (hoja de trucos tipo ACM-ICPC) a partir de la
URL de un repositorio de GitHub.

Pegas la URL —y opcionalmente una carpeta—, eliges el diseño, y la página:

1. Lee el árbol del repo con la **API pública de GitHub** (sin token).
2. Descarga los archivos de código (`.cpp`, `.py`, `.java`, `.js`, `.ts`, `.go`, `.rs`… ver
   `lib/config.js`) y los resalta con `highlight.js`.
3. Muestra una **vista previa** con índice, columnas y números de línea → botón **Guardar como PDF**
   (usa el diálogo de impresión del navegador).
4. Pestaña **Código LaTeX**: el `.tex` completo listo para **copiar y pegar en Overleaf**.

## Solo una carpeta del repositorio

La URL puede apuntar a una carpeta concreta; solo se incluyen los archivos de ahí:

```
https://github.com/usuario/repo/tree/main/src/algo     ← solo src/algo
https://github.com/usuario/repo/blob/main/src/x.cpp    ← su carpeta
```

También hay un campo **Carpeta** en el formulario que funciona con cualquier URL de repo
(`content/geometry`, `src/utils`…). Si la URL ya trae carpeta, el campo la sustituye.

- Se resuelve la rama de la URL aunque no sea la principal (y aunque GitHub la haya renombrado).
- En repos enormes (`vercel/next.js`) el árbol recursivo viene truncado: al indicar una carpeta se
  recorre solo esa con la API de contenidos, así que no se pierde nada.

## Campos configurables

| Campo | Opciones |
|---|---|
| Título | texto libre (portada) |
| Equipo | texto libre |
| Universidad / institución | texto libre (segunda línea del autor) |
| Iniciales | cabecera de cada página |
| Fecha | texto libre (o vacío para `\date{\today}`) |
| Columnas | 1, 2 o 3 |
| Tamaño de letra | 6–12 pt |
| Interlineado | 1.0–2.0 |
| Espacio entre columnas | 0–40 mm |
| Orientación | horizontal / vertical (A4) |
| Tabulación | 1, 2, 4 u 8 espacios |
| Índice | activado / desactivado |
| Números de línea | activados / desactivados |

Las mismas opciones se aplican a la vista previa (variables CSS `--cols`, `--font`, `--leading`,
`--gap`, `--tab`, `@page` dinámico) **y** al LaTeX (`buildTex()` en `lib/tex.js`), de modo que lo que
ves es lo que compila Overleaf.

## Desarrollo

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

Otros comandos:

```bash
node scripts/build-template.mjs   # regenera lib/template.js desde ../template_header.tex
node scripts/smoke.mjs <base> <salida>   # prueba de interfaz con Playwright (29 comprobaciones)
node scripts/print-check.mjs       # verifica las reglas de impresión
```

Las pruebas usan Playwright, que **no** va en `dependencies` (Vercel no debe descargar navegadores).
Instálalo solo cuando quieras ejecutarlas:

```bash
npm install --no-save playwright && npx playwright install chromium
```

## Desplegar en Vercel

1. Sube este repositorio a GitHub.
2. En Vercel: **Add New → Project** → Importa el repo.
3. En **Settings → Root Directory** elige `web` (la app está en ese subdirectorio para conservar los
   archivos originales de `codes2pdf` en la raíz).
4. Deploy. No hace falta configurar nada más.

Opcional: añade el secreto `GITHUB_TOKEN` para subir el límite de 60 peticiones/hora de la API de
GitHub a 5.000/hora. Sin token también funciona. Playwright no está en `dependencies`, así que el
build de Vercel solo instala lo necesario.

## Estructura

```
web/
├── app/
│   ├── page.jsx            # interfaz (formulario, vista previa, pestaña LaTeX)
│   ├── globals.css         # estilos + reglas de impresión (@page según orientación)
│   └── api/repo/route.js   # consulta el árbol del repo en la API de GitHub
├── lib/
│   ├── config.js           # extensiones, límites, jerarquía de secciones, opciones por defecto
│   ├── github.js           # parseo de URL/rama/carpeta + árbol del repositorio
│   ├── model.js            # árbol de directorios (equivalente a walk())
│   ├── highlight.js        # resaltado de sintaxis
│   ├── tex.js              # genera el documento LaTeX   [MPL-2.0]
│   └── template.js         # plantilla LaTeX generada    [MPL-2.0]
└── scripts/
    ├── build-template.mjs  # regenera lib/template.js
    ├── smoke.mjs           # prueba de interfaz completa
    └── print-check.mjs     # comprobación de las reglas de impresión
```

## Licencia

`lib/tex.js` y `lib/template.js` derivan de `codes2pdf.js` / `template_header.tex` del proyecto
original y se distribuyen bajo **Mozilla Public License 2.0** (copia en [`../LICENSE`](../LICENSE)):
si los modificas, conserva los avisos de cabecera. El resto de archivos de esta carpeta son nuevos y
se publican bajo MIT; juntos forman una obra mayor (Larger Work) según el apartado 3.1 de la MPL.

## Limitaciones conocidas

- No hay `pdflatex` en Vercel: el PDF sale de **Imprimir → Guardar como PDF** (A4, se ajusta a las
  columnas y orientación elegidas). El `.tex` está pensado para Overleaf y compila sin errores
  (probado con `kactl`, 275 listados).
- Los caracteres no ASCII dentro de los listados se pasan a ASCII: `listings` de LaTeX no procesa
  multibyte y aborta con *Invalid UTF-8 byte sequence*. La vista previa HTML y el texto de los `.tex`
  del repo no se tocan.
- Límite de 60 peticiones/hora a la API de GitHub sin token (compartido por IP); la app muestra un
  mensaje claro cuando se agota.
