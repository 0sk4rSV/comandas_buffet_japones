# Nakoya comandas

Web app para preparar la comanda en el buffet libre **Nakoya** (restaurante japonés, Pl. de Juan Grandia 3, Requena).
Se usa **en el móvil, sentado en la mesa**: tiene que ser ágil, compacta y entenderse a la primera.
Es un sitio estático (HTML + CSS + JS, sin build ni dependencias de npm). Todo el texto y el código están en español.

## Dos versiones

| Archivo | Versión | Notas |
|---|---|---|
| `index.html` | **Legacy** | La original, hecha a mano. jQuery 3.6.4, DataTables, Bootstrap 5.2.3 local, Tooltipster. CSS en `css/main.css`. |
| `moderna.html` | **Moderna** (predeterminada) | Rediseño propio en JS sin librerías. `css/moderna.css` + `js/moderna.js`. |

- Selector Legacy/Moderna (píldora arriba): `js/version.js` + `css/version.css`, cargados en el `<head>` de las dos.
  Recuerda la elección en `localStorage.versionNakoya` y redirige antes de pintar. Sin elección → **Moderna**
  (`VERSION_PREDETERMINADA`). Un enlace con `?pedido=` siempre abre la Moderna.
- `happy.html` es una página de broma para un amigo: **ignorarla**.

## Datos compartidos (las dos versiones)

- `js/carta.js`: `mapMenu` (74 platos `"A15" → "Nombre ⭐🥈"`), `mapPostres`, `detallesPostres`, `platosFavoritos`,
  `platosSushi`, `platosHabituales` (= favoritos), `precios` (mediodía/noche, adultos/niños, bebidas), `formatoPrecio()`.
  En los nombres: ⭐ = solo noche/finde/festivo; 🥇🥈🥉 = podio de la casa; 🤢 = mejor evitar. Los nombres están corregidos a mano.
- `js/almacen.js`: lectura/escritura segura de `localStorage` y el pedido en curso.
- Claves de `localStorage`: `pedidosNakoya` (pedido, caduca a las 24 h), `valorContador` (contador maki, 0-100),
  `versionNakoya`, `festivoNakoya`, `rondasNakoya` (historial de rondas, caduca 6 h tras la última), `ruletaNakoya` (nombres y reto).
  `sessionStorage.transicionVersionNakoya` para el fundido al cambiar de versión.

## Versión Moderna

- Vistas por hash: `#carta`, `#pedido`, `#postres`, `#info`, `#extras` y las subpantallas de Extras `#podio`, `#maki`, `#ruleta`,
  `#sorpresa`, `#dedo`, `#moneda`, `#duelo`, `#piedra-papel-tijera`, `#adivina`, `#atrapa`, `#galleta` (llevan `data-padre="extras"`). Cada vista es una `<section class="vista">`; `mostrarVista()` anima la entrada según el orden del menú.
- Horario: mediodía 12:00-16:00 (tarifa de mediodía entre semana), noche 19:30-24:00. Fines de semana y festivos = tarifa y platos de noche.
  Línea de estado arriba con la cuenta atrás ("quedan H:MM:SS para cerrar/abrir").
- Funciones: carta con filtros (Todos/Favoritos/Sushi) y buscador; pedido con cantidades, ordenado por número; copiar; modo discreto;
  **rondas** ("Ya lo he pedido" guarda la ronda; historial desplegable; volver a pedir; borrar una o todas); **compartir pedido**
  por enlace `?pedido=15-2.20.109` o QR propio (qrcode-generator 1.4.4 de cdnjs, pintado en SVG con el maki en el centro);
  avisos con "Deshacer"; Extras: Hall of Fame (imagen del podio de makis), contador maki (vibra y suena a los 30 y 100; a los 100, confeti a pantalla completa en un `<canvas class="confeti">`; en 100 el maki ya no suma y avisa "¡Para ya, animal…!"; mantener el "-" resta seguido; tocar el número deja escribirlo),
  "Ruleta de una rusa" estilo casino (aro dorado con bombillas, trozos rojo/negro; los nombres largos encogen la letra o se parten en dos líneas con `htmlEtiquetaRueda()`, centro dorado con la N fijo encima de la rueda; giro de 5,2 s con suspense (curva propia `curvaSuspense`: frenazo y luego arrastre lento del último trozo, bombillas parpadeando con `.ruleta.suspense`; la mitad de las veces se para justo tras entrar en el trozo ganador); mientras gira suena un "tic" metálico de tambor de revólver (`chasquido()`, ruido filtrado) cada vez que una bombilla pasa por el puntero y al parar el "clic-clac" del percutor; el trozo ganador sale hacia fuera y destella en dorado y los demás se apagan; el logo de casino de la esquina (`#ruletaLogo`) reproduce `audio/hagan_juego.mp3` y gira la ruleta a la vez ("Señores, hagan juego… ¡No va más!"; si no puede, lo dice con `speechSynthesis`); interruptor "Bolita" (`ruletaNakoya.bolita`): sin puntero, la bolita corre por el aro al revés, cae botando y acaba en el trozo ganador (la mitad de las veces cae antes en el de al lado y da un último salto); "Borrar todos" los jugadores (con Deshacer) y X dentro del campo del reto;
  truco secreto: un nombre apuntado con espacio al final nunca pierde), plato sorpresa (un plato al azar
  entre los que se sirven ahora), duelo de reflejos (gana el primero que llega a 3 rondas; `<dialog id="arena">` a pantalla completa partido en dos;
  el marcador de la pantalla cuenta duelos ganados),
  piedra, papel o tijera para dos jugadores por turnos con un móvil
  (el 1 elige sin que se vea, luego el 2; marcador y rondas jugadas), adivina el plato (preguntas sin fin código ↔ nombre; aciertos, fallos y racha; mejor racha en `localStorage.rachaAdivinaNakoya`;
  no hay fotos de los platos, solo enlace a Google Imágenes), el dedo elegido (`<dialog id="dedos">`: varios dedos a la vez,
  3 s quietos y elige uno), cara o cruz (moneda 3D con la N), atrapa el sushi (piezas que caen, bento +5, bombas que quitan
  vida al tocarlas, 3 vidas, cuenta atrás, acelera más desde 150 puntos, récord en `localStorage.recordAtrapaNakoya`;
  bloquea el scroll durante la partida con `html.sin-scroll` y `touch-action: none`; se para al salir de la pantalla), galletita de la suerte (SVG de dos mitades; entre 5 y 8 toques al azar la agrietan y la rompen;
  papelito con una frase de `FRASES_GALLETA` sin repetir las últimas 10;
  se reinicia al entrar) y easter egg 🍣 (5 toques → frase).
  Los pitidos de los juegos se generan con Web Audio (`pitido()`), sin archivos.
- Las ventanas (`<dialog>`) se abren siempre con `abrirVentana()`, nunca con `showModal()` directamente: deja un paso en el
  historial para que el botón de atrás del móvil/navegador (y la tecla de retroceso) las cierre sin salir de la pantalla.
- Diseño: negro (`--ground #0b0a09`), rojo hinomaru (`--accent #e23b2e`), Inter + GangOfThree para la marca, iconos Bootstrap Icons 1.11.3.

### Reglas de diseño (el usuario es muy detallista)

- **Paneles**: el espacio entre el borde y el contenido es siempre `--pad-y`/`--pad-x` (14/16 px en móvil, 18/20 en escritorio).
  Las filas que tocan el borde pierden su relleno propio (bloque "NORMA DE ESPACIADO" al final de `moderna.css`).
  Las tablas de carta y postres (`.panel.panel-lista`) van aparte.
- **Textos de acción subrayados** ("Ver carta oficial", "Ver completo", "Borrar"…): siempre la clase `.accion-texto`.
- Efectos `:hover` dentro de `@media (hover: hover)` (en móvil se quedan pegados).
- "Reducir movimiento" (`prefers-reduced-motion`) anula las animaciones de la app, **salvo las de los juegos**: los elementos que
  se animan como parte de un juego llevan la clase `.anima-juego` (moneda, manos, dedos, piezas, "+1"…). Los giros largos
  (ruleta, moneda) se hacen más cortos en ese modo, pero se ven. La ruleta gira con `element.animate()` (en Safari una
  transición CSS a veces no giraba).
- Nada de toasts para añadir/quitar platos de la carta; solo para copiar, habituales, borrar, rondas y deshacer.
- Comprobar siempre en móvil (360-412 px) y escritorio, midiendo espacios y alineaciones; para decisiones visuales,
  enseñar variantes en una imagen comparativa.

## App instalable (PWA)

- `manifest.webmanifest` (nombre "NAKOYA COMANDAS", abre `moderna.html`), iconos en `images/icono-*.png`
  (redondeados para "any", `icono-maskable-*` cuadrados para Android, `icono-180` cuadrado para iPhone), `images/favicon.ico`.
- `sw.js` (registrado desde `js/version.js`): primero red (3 s de margen) y copia guardada sin conexión; CDN primero copia.
  **Si se añade o renombra un archivo que usen las páginas, añadirlo a `PRECARGA` en `sw.js` y subir `VERSION`.**

## Publicación

- GitHub (rama `main`) → **Vercel** lo publica solo en cada push. Preset "Other", sin build.
- `.vercelignore` deja fuera de la web este archivo, `herramientas/`, `.github/`, los `.psd` y los `.map`.
- **Los commits y el push los hace el usuario** (GitHub Desktop). No hacer commit ni push salvo que lo pida.

## Robot de la carta oficial

- `.github/workflows/comprobar-carta.yml` se ejecuta cada día antes de cada apertura (10:00 y 17:30 UTC), en cada push a `main`
  y a mano (pestaña Actions → Run workflow).
- `herramientas/comprobar-carta.mjs` descarga http://m.restaurantejaponesnakoya.com/col.jsp?id=112 y la compara con la última
  "foto" (`herramientas/carta-oficial.json`), **no con `carta.js`** (los nombres de la web tienen erratas que la app corrige).
  Si cambia, abre una Pull Request "La carta oficial ha cambiado" con `carta.js` actualizado (platos nuevos/quitados, ⭐, precios)
  y lista para revisar a mano los cambios de nombre, postres, normas y horario.
  Los platos nuevos cuyo nombre lleva "sushi", "maki", "sashimi", "nigiri", "gunkan", "temaki", "uramaki", "california" o
  "aburi" se añaden solos a `platosSushi` (`PALABRAS_SUSHI`); los que no lo dicen (como A201 "Taco de salmón y mango") van a mano.
- Opciones: `--foto` (solo guarda la foto actual), `--html archivo.html` (prueba con una copia local).
- Requiere en GitHub: Settings → Actions → General → Workflow permissions = "Read and write" + "Allow GitHub Actions to create and approve pull requests".

## Convenciones del código

- Comentarios en español, sin tildes en los comentarios de JS/CSS (por costumbre del proyecto).
- `index.html` y `js/carta.js` usan saltos de línea **CRLF**: editarlos sin convertirlos (con `sed` se pierden; usar Node o el editor).
- En `moderna.js` los emojis se escriben como escapes Unicode (`"\u{1F525}"`).
- Variables y funciones con nombres en español (`pintarPedido`, `guardarRonda`…).

## Cómo probar en local

1. Servidor estático en la carpeta del proyecto (cualquiera vale; por ejemplo `npx serve .` o un script de Node que sirva `index.html` en `/`).
   El service worker necesita `http://localhost` o `127.0.0.1`, no `file://`.
2. Abrir `moderna.html`. Para simular otra hora, en Playwright usar `page.clock`.
3. Tras tocar `localStorage` en una prueba, recargar la página.
