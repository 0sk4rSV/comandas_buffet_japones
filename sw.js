//SERVICE WORKER: permite instalar la app y usarla sin conexion (en el restaurante a veces no hay cobertura).
//
//Estrategia:
// - Archivos de la app (mismo dominio): primero la red, para que cada publicacion en Vercel se vea al momento.
//   Si la red tarda mas de 3 segundos o no hay conexion, se sirve la copia guardada.
// - Archivos de CDN (iconos, fuente Inter, libreria del QR): primero la copia guardada (sus URLs llevan version).
//
//Si se anaden o renombran archivos de la app, actualizar la lista PRECARGA y subir el numero de VERSION.

const VERSION = "nakoya-v4";
const ESPERA_RED = 3000; //ms antes de tirar de la copia guardada.

//Todo lo que necesitan la Legacy y la Moderna para funcionar sin conexion.
const PRECARGA = [
    "./",
    "index.html",
    "moderna.html",
    "manifest.webmanifest",

    "css/main.css",
    "css/bootstrap.min.css",
    "css/dataTables.bootstrap5.min.css",
    "css/responsive.dataTables.min.css",
    "css/tooltipster.bundle.min.css",
    "css/tooltipster-sideTip-borderless.min.css",
    "css/version.css",
    "css/moderna.css",

    "js/version.js",
    "js/carta.js",
    "js/almacen.js",
    "js/moderna.js",
    "js/jquery-3.6.4.min.js",
    "js/jquery.dataTables.min.js",
    "js/dataTables.bootstrap5.min.js",
    "js/dataTables.responsive.min.js",
    "js/responsive.bootstrap5.min.js",
    "js/bootstrap.min.js",
    "js/tooltipster.bundle.min.js",

    "fonts/GangOfThree.ttf",
    "images/favicon.ico",
    "images/loading_gif.svg",
    "images/maki_atun.png",
    "images/maki_atun.webp",
    "images/maki_qr.webp",
    "images/podio.png",
    "images/icono-192.png",
    "images/icono-512.png",
    "images/icono-180.png",
    "images/icono-32.png",
    "images/icono-maskable-192.png",
    "images/icono-maskable-512.png",
    "audio/tactical_nuke.mp3",
    "audio/aficion_CR7.mp3"
];

//Recursos de CDN que se guardan al instalar (si alguno falla, no impide la instalacion).
const PRECARGA_CDN = [
    "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css",
    "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/fonts/bootstrap-icons.woff2?dd67030699838ea613ee6dbda90effa6",
    "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.8.3/font/bootstrap-icons.css",
    "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.8.3/font/fonts/bootstrap-icons.woff2?08efbba7c53d8c5413793eecb19b20bb",
    "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js",
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
];

//Solo se guardan respuestas de estos CDN (no Google Imagenes, Maps, etc.).
const CDN_PERMITIDOS = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"];

//Cada archivo se guarda por separado: si uno falla (p. ej. se renombro y no se actualizo la lista),
//la app se instala igual y ese archivo se guardara la primera vez que se use con conexion.
self.addEventListener("install", function (evento) {
    evento.waitUntil(caches.open(VERSION).then(function (cache) {
        const locales = PRECARGA.map(function (url) {
            return cache.add(url).catch(function () { });
        });
        const cdn = PRECARGA_CDN.map(function (url) {
            return cache.add(new Request(url, { mode: "cors" })).catch(function () { });
        });
        return Promise.all(locales.concat(cdn));
    }).then(function () {
        return self.skipWaiting();
    }));
});

//Al activar una version nueva se borran las copias de las anteriores.
self.addEventListener("activate", function (evento) {
    evento.waitUntil(caches.keys().then(function (claves) {
        return Promise.all(claves.filter(function (clave) { return clave !== VERSION; }).map(function (clave) {
            return caches.delete(clave);
        }));
    }).then(function () {
        return self.clients.claim();
    }));
});

//Guarda una copia de la respuesta. Las respuestas parciales (206, p. ej. los audios pedidos por trozos)
//no se pueden guardar: los audios ya estan en la precarga completos.
function guardar(peticion, respuesta) {
    if (respuesta && respuesta.status !== 206 && (respuesta.ok || respuesta.type === "opaque")) {
        const copia = respuesta.clone();
        caches.open(VERSION).then(function (cache) {
            return cache.put(peticion, copia);
        }).catch(function () { });
    }
    return respuesta;
}

//Busca la copia guardada. Las paginas se buscan sin parametros (?pedido=... de un enlace compartido).
function copiaGuardada(peticion) {
    const esPagina = peticion.mode === "navigate";
    return caches.match(peticion, { ignoreSearch: esPagina }).then(function (copia) {
        if (copia || !esPagina) return copia;
        return caches.match("index.html");
    });
}

//Primero la red; si tarda demasiado o falla, la copia guardada (y la red sigue actualizando la copia).
function primeroRed(peticion) {
    return new Promise(function (resolver) {
        let resuelto = false;
        const red = fetch(peticion).then(function (respuesta) { return guardar(peticion, respuesta); });

        const temporizador = setTimeout(function () {
            copiaGuardada(peticion).then(function (copia) {
                if (copia && !resuelto) {
                    resuelto = true;
                    resolver(copia);
                }
            });
        }, ESPERA_RED);

        red.then(function (respuesta) {
            clearTimeout(temporizador);
            if (!resuelto) {
                resuelto = true;
                resolver(respuesta);
            }
        }).catch(function () {
            clearTimeout(temporizador);
            copiaGuardada(peticion).then(function (copia) {
                if (!resuelto) {
                    resuelto = true;
                    resolver(copia || Response.error());
                }
            });
        });
    });
}

//Primero la copia guardada; si no existe, la red (y se guarda).
function primeroCopia(peticion) {
    return caches.match(peticion).then(function (copia) {
        return copia || fetch(peticion).then(function (respuesta) { return guardar(peticion, respuesta); });
    });
}

self.addEventListener("fetch", function (evento) {
    const peticion = evento.request;
    if (peticion.method !== "GET") return;

    const url = new URL(peticion.url);
    if (url.origin === self.location.origin) {
        evento.respondWith(primeroRed(peticion));
    } else if (CDN_PERMITIDOS.includes(url.hostname)) {
        evento.respondWith(primeroCopia(peticion));
    }
    //El resto (Google Imagenes, Maps, la web del restaurante...) va directo a la red, sin guardar.
});
