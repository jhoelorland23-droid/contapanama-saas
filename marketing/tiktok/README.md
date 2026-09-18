> ARCHIVO HISTORICO / NO VIGENTE. Plantilla tecnica, no asesoramiento ni contenido listo para publicar. Las fechas, cifras y afirmaciones pertenecen al guion antiguo y NO fueron revalidadas en este rescate. Sustituir datos y fuentes, y obtener revision CPA antes de reutilizar.

# Videos de TikTok a partir del monitoreo fiscal diario

Cada plantilla puede alimentarse de un reporte editorial revisado. La conexion a sistemas internos y su calendario se configuran fuera del repositorio.

El video **no** habla de productos ni de servicios propios: habla del tema fiscal del día.
La autoridad se construye explicando la noticia, no vendiendo.

## Flujo

1. Leer el reporte del día en Notion y tomar el **tema principal**.
2. **Verificar los hechos** contra fuente primaria (MEF, DGI, CSS, Gaceta Oficial) o prensa
   panameña seria. El reporte lo genera un agente: sirve como pista, no como fuente.
3. Escribir el guion visual en un HTML `AAAA-MM-DD-tema.html`.
4. Renderizar a MP4.
5. Documentar en `AAAA-MM-DD-tema.md`: estructura, voz en off, caption, hashtags y **tabla de
   hechos verificados con sus fuentes**.

## Renderizar

```bash
pip3 install imageio-ffmpeg   # ffmpeg con libx264 (o usa el del sistema)
NODE_PATH=$(npm root -g) node marketing/tiktok/render.cjs marketing/tiktok/<guion>.html
```

Salida: `<guion>.mp4` — 1080×1920, H.264, `+faststart`, listo para subir.

## Cómo funciona el render

`render.cjs` abre el HTML en Chromium y, para cada fotograma, llama a `window.renderFrame(tMs)`
antes de capturar. No hay animaciones CSS corriendo: la página es una función pura del tiempo,
así que el render es **determinista** — mismo HTML, mismo video, sin fotogramas a destiempo.
Los PNG van directo a ffmpeg por stdin, sin tocar disco.

Cada guion HTML expone dos cosas:

- `window.renderFrame(tMs)` — pinta el fotograma de ese instante.
- `window.VIDEO_DURATION` — duración en segundos.

## Reglas de la plantilla

- **Zona segura:** contenido entre y=400 y y=1450. TikTok tapa el resto con su interfaz.
- **Fuente en pantalla** desde la escena 2 en adelante, siempre. Es lo que distingue a un CPA
  colegiado de una cuenta de rumores.
- **Cifras atribuidas** a quien las dio (MEF, Ministerio Público, DGI), nunca sueltas.
- **Nada de pánico.** El tono es "esto pasó, esto significa, esto haces". La ansiedad genera
  vistas y destruye confianza; el objetivo es lo segundo.
- **Sin audio.** Se le pone voz en off o un sonido en tendencia al subir.
- Duración objetivo: 30–40 s.

## Vista previa rápida

```bash
npx http-server marketing/tiktok -p 8080
# abre el HTML y en la consola del navegador: renderFrame(12000)
```

## Estado del rescate

Se preservan render.cjs y dos pares HTML/MD como ejemplos historicos. No se incluyen MP4. Los identificadores personales y enlaces internos se sustituyeron por marcadores. El renderizador usa FFMPEG explicito o ffmpeg del PATH; no presupone una ruta de maquina. Playwright, Chromium y ffmpeg deben estar instalados por el operador. No ejecutar HTML no confiable. Los videos generados deben quedar fuera de Git.
