# Rangos Preflop — PDF LaTeX (EducaPoker · Universidad)

Este proyecto genera un PDF con **las 161 tablas de rango preflop de la estrategia Universidad** scrapeadas de EducaPoker.

## Compilar

### Local (ya tiene MiKTeX/TeX Live)
```
pdflatex main.tex   (repetir 2 veces para los números de página)
```

### Overleaf (online)
1. Crea un proyecto nuevo en overleaf.com → **New Project → Upload Project**.
2. Sube **`edu-overleaf.zip`** (está en `C:\Users\hugo\Desktop\PreflopStudy\latex\`) o, si solo tienes estos ficheros sueltos, crea un proyecto en blanco, pega `main.tex` y pulsa Recompile.
3. Pulsa **Recompile**. Recuerda que el compilador debe ser **pdfLaTeX** (configuración por defecto).

## Contenido de cada tabla
- **Título**: el nombre del rango en EducaPoker (p.ej. `OR UTG 30BB`).
- **Línea superior**: a qué estrategia pertenece (estas son todas **Universidad**) y las **acciones dominantes con sus tamaños** en BB (p.ej. `OR 2,2bb;  Call 2bb; 3Bet 7,5bb`), extraídos del scrap.
- **Cuadrícula 13×13**: cada celda muestra la **pareja de cartas** (AA, AK, AQ…; diagonal-superior suited, inferior offsuit). El color de cada celda es la **acción dominante** (F=fold, C=call, R=raise/open, 3B/4B=3/4-bet, SQ=squeeze, AI=all-in) y la **intensidad** del color es la frecuencia de esa acción en la mano.

## Ficheros
- `main.tex` — documento completo (162 páginas: portada + 161 tablas).
- `edu.pdf` — resultado compilado.
- `edu-overleaf.zip` — paquete listo para Overleaf.

El código generador está en `C:\Users\hugo\AppData\Local\Temp\opencode\gen_latex.js` y la fuente de datos en `rangos\out\edu_import.json` (datos ya filtrados a Universidad, con matrices completas).