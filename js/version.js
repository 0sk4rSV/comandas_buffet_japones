//SELECTOR PARA CAMBIAR ENTRE LA VERSION LEGACY Y LA VERSION MODERNA.
//Se carga en el <head> de ambas paginas. Cada pagina indica su version en <html data-version="...">.
(function () {

    const CLAVE_VERSION = "versionNakoya";
    const CLAVE_TRANSICION = "transicionVersionNakoya";
    const DURACION_SALIDA = 260; //ms (algo mas que la animacion del indicador y el fundido).
    const PAGINAS = {
        legacy: "index.html",
        moderna: "moderna.html"
    };

    function leer(almacen, clave) {
        try {
            return almacen.getItem(clave);
        } catch (e) {
            return null;
        }
    }

    function escribir(almacen, clave, valor) {
        try {
            almacen.setItem(clave, valor);
        } catch (e) { }
    }

    function borrar(almacen, clave) {
        try {
            almacen.removeItem(clave);
        } catch (e) { }
    }

    //App instalable y sin conexion: se registra el service worker (sw.js) en las dos versiones.
    if ("serviceWorker" in navigator && window.isSecureContext) {
        window.addEventListener("load", function () {
            navigator.serviceWorker.register("sw.js").catch(function () { });
        });
    }

    const html = document.documentElement;
    const versionActual = html.dataset.version;

    //Si la ultima vez se eligio la otra version, vamos directamente a ella (antes de pintar la pagina).
    //Si nunca se ha elegido ninguna, la predeterminada es la Moderna.
    //Excepcion: un enlace con un pedido compartido (?pedido=...) solo lo sabe abrir la Moderna.
    const VERSION_PREDETERMINADA = "moderna";
    const versionPreferida = leer(localStorage, CLAVE_VERSION) || VERSION_PREDETERMINADA;
    const pedidoCompartido = /[?&]pedido=/.test(location.search);
    if (versionPreferida && versionPreferida !== versionActual && PAGINAS[versionPreferida] && !pedidoCompartido) {
        location.replace(PAGINAS[versionPreferida]);
        return;
    }

    //Si llegamos desde el selector, la pagina aparece con un fundido.
    if (leer(sessionStorage, CLAVE_TRANSICION)) {
        borrar(sessionStorage, CLAVE_TRANSICION);
        html.classList.add("transicionEntrada");
    }

    const sinAnimaciones = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    document.addEventListener("DOMContentLoaded", function () {
        const selector = document.getElementById("divSwitchVersion");
        if (!selector) {
            return;
        }

        const opciones = selector.querySelectorAll(".opcionVersion");
        let cambiando = false;

        //Marca la opcion activa y coloca el indicador.
        function pintar(version) {
            selector.dataset.activa = version;
            opciones.forEach(function (opcion) {
                opcion.setAttribute("aria-pressed", opcion.dataset.version === version ? "true" : "false");
            });
        }

        function cambiarA(version) {
            if (cambiando || version === versionActual || !PAGINAS[version]) {
                return;
            }

            cambiando = true;
            pintar(version);
            escribir(localStorage, CLAVE_VERSION, version);
            escribir(sessionStorage, CLAVE_TRANSICION, "1");
            html.classList.add("transicionSalida");

            //Usamos replace para no dejar la otra version en el historial
            //(asi el boton "atras" no hace cosas raras).
            setTimeout(function () {
                location.replace(PAGINAS[version]);
            }, sinAnimaciones ? 0 : DURACION_SALIDA);
        }

        pintar(versionActual);

        //Al volver a la pagina con el boton "atras" el navegador puede restaurarla tal cual estaba.
        window.addEventListener("pageshow", function () {
            cambiando = false;
            html.classList.remove("transicionSalida");
            pintar(versionActual);
        });

        opciones.forEach(function (opcion) {
            opcion.addEventListener("click", function () {
                cambiarA(opcion.dataset.version);
            });
        });
    });

})();
