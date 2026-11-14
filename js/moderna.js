//VERSION MODERNA DE LA CARTA NAKOYA.
//Usa los datos de js/carta.js y el pedido guardado de js/almacen.js (compartido con la Legacy).
(function () {
    "use strict";

    // ------------------------------------------------------------------ DATOS

    const HORARIO = {
        mediodia: { abre: 12 * 60, cierra: 16 * 60 },
        noche: { abre: 19 * 60 + 30, cierra: 24 * 60 }
    };
    const CLAVE_FESTIVO = "festivoNakoya";

    //Medallas personales de la carta (oro, plata, bronce) y la de "mejor evitar", como codigos Unicode.
    const MEDALLAS = { "\u{1F947}": 1, "\u{1F948}": 2, "\u{1F949}": 3 };
    const EVITAR = "\u{1F922}";
    const ESTRELLA = "⭐";
    const SIMBOLOS = new RegExp("[" + ESTRELLA + Object.keys(MEDALLAS).join("") + EVITAR + "]", "gu");

    //Convierte el mapa de la carta en objetos: la ⭐ pasa a "noche" y las medallas al podio.
    const platos = Array.from(mapMenu, function ([codigo, nombreOriginal]) {
        let medalla = null;
        Object.keys(MEDALLAS).forEach(function (emoji) {
            if (nombreOriginal.includes(emoji)) {
                medalla = MEDALLAS[emoji];
            }
        });

        return {
            codigo: codigo,
            nombre: nombreOriginal.replace(SIMBOLOS, "").replace(/\s+/g, " ").trim(),
            noche: nombreOriginal.includes(ESTRELLA),
            medalla: medalla,
            evitar: nombreOriginal.includes(EVITAR),
            favorito: platosFavoritos.includes(codigo),
            sushi: platosSushi.includes(codigo)
        };
    });
    const platoPorCodigo = new Map(platos.map(function (p) { return [p.codigo, p]; }));

    const formatoEuros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
    const formatoHora = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });
    const formatoLista = new Intl.ListFormat("es-ES", { type: "conjunction" });

    //Rondas ya pedidas en esta comida. Se borran solas 6 horas despues de la ultima.
    const CLAVE_RONDAS = "rondasNakoya";
    const CADUCIDAD_RONDAS = 6 * 60 * 60 * 1000;

    //Numero del plato para ordenar: A9 va antes que A15 y A15 antes que A109.
    function numeroPlato(codigo) {
        return parseInt(codigo.replace(/\D/g, ""), 10) || 0;
    }

    //El pedido siempre va ordenado por numero: asi el camarero lo apunta mas rapido.
    function ordenarPorNumero(lista) {
        return lista.sort(function (a, b) { return numeroPlato(a.codigo) - numeroPlato(b.codigo); });
    }

    //Valida una lista de {codigo, cantidad} que viene de fuera (almacen o enlace compartido):
    //quita platos que no existen y repetidos, corrige cantidades (1-99) y ordena por numero.
    function limpiarPlatos(lista) {
        if (!Array.isArray(lista)) return [];
        const vistos = new Set();
        return ordenarPorNumero(lista.filter(function (item) {
            if (!item || !platoPorCodigo.has(item.codigo) || vistos.has(item.codigo)) return false;
            vistos.add(item.codigo);
            return true;
        }).map(function (item) {
            const cantidad = parseInt(item.cantidad, 10);
            return { codigo: item.codigo, cantidad: cantidad > 0 ? Math.min(cantidad, 99) : 1 };
        }));
    }

    function cargarRondas() {
        let datos = null;
        try {
            datos = JSON.parse(leerStorage(CLAVE_RONDAS));
        } catch (e) { }
        if (!datos || !Array.isArray(datos.rondas) || Date.now() - datos.timestamp >= CADUCIDAD_RONDAS) {
            return [];
        }
        return datos.rondas.map(function (r) {
            return { hora: r.hora, platos: limpiarPlatos(r.platos) };
        }).filter(function (r) { return r.platos.length > 0; });
    }

    function guardarRondas() {
        if (rondas.length === 0) {
            borrarStorage(CLAVE_RONDAS);
            return;
        }
        escribirStorage(CLAVE_RONDAS, JSON.stringify({ timestamp: Date.now(), rondas: rondas }));
    }

    // ------------------------------------------------------------------ ESTADO

    let pedido = ordenarPorNumero(cargarPedidosStorage());
    let rondas = cargarRondas();
    let filtroActivo = "todos";
    let textoBusqueda = "";
    let servicio = null;
    let contador = cargarContadorStorage();

    const $ = function (selector) { return document.querySelector(selector); };
    const $$ = function (selector) { return Array.from(document.querySelectorAll(selector)); };

    function claveHoy(fecha) {
        return fecha.getFullYear() + "-" + (fecha.getMonth() + 1) + "-" + fecha.getDate();
    }

    function esFestivoHoy(fecha) {
        return leerStorage(CLAVE_FESTIVO) === claveHoy(fecha);
    }

    //Hora a partir de los minutos del dia (24:00 sale como 00:00), con el formato del idioma.
    function textoHora(minutos) {
        return formatoHora.format(new Date(2000, 0, 1, Math.floor(minutos / 60) % 24, minutos % 60));
    }

    function textoDuracion(minutos) {
        const h = Math.floor(minutos / 60);
        const m = minutos % 60;
        if (h === 0) return m + " min";
        return m === 0 ? h + " h" : h + " h " + m + " min";
    }

    // ------------------------------------------------------------------ DISPONIBILIDAD SEGUN LA HORA

    //Devuelve el turno actual (o el siguiente si esta cerrado), su tarifa y si se sirven los platos de noche.
    function calcularServicio(fecha) {
        const minutos = fecha.getHours() * 60 + fecha.getMinutes();
        const dia = fecha.getDay();
        const finDeSemana = (dia === 0 || dia === 6);
        const festivo = esFestivoHoy(fecha);

        let turno = null;
        if (minutos >= HORARIO.mediodia.abre && minutos < HORARIO.mediodia.cierra) {
            turno = "mediodia";
        } else if (minutos >= HORARIO.noche.abre && minutos < HORARIO.noche.cierra) {
            turno = "noche";
        }

        const abierto = turno !== null;
        //Si esta cerrado, el turno de referencia es el siguiente que abre hoy.
        const turnoRef = turno || (minutos < HORARIO.mediodia.abre ? "mediodia" : "noche");
        const tarifaNoche = turnoRef === "noche" || finDeSemana || festivo;

        return {
            fecha: fecha,
            minutos: minutos,
            abierto: abierto,
            turno: turnoRef,
            tarifa: tarifaNoche ? "noche" : "mediodia",
            platosNoche: tarifaNoche,
            finDeSemana: finDeSemana,
            festivo: festivo,
            cierre: HORARIO[turnoRef].cierra,
            apertura: HORARIO[turnoRef].abre
        };
    }

    function disponible(plato) {
        return !plato.noche || servicio.platosNoche;
    }

    function motivoTarifa(s) {
        if (s.festivo) return "festivo";
        if (s.finDeSemana) return "fin de semana";
        return s.turno === "noche" ? "noche" : "mediodía entre semana";
    }

    //Linea de estado compacta: tarifa que toca, cierre y, si aplica, los platos de noche que no se sirven.
    function pintarServicio() {
        const s = servicio;
        let nombre = "Mediodía";
        if (s.tarifa === "noche") {
            nombre = s.turno === "noche" ? "Noche" : (s.festivo ? "Festivo" : "Fin de semana");
        }
        const noDisponibles = platos.filter(function (pl) { return !disponible(pl); }).length;

        //Sin precios: estan en "Precios y horario". Aqui solo el turno y cuanto queda.
        let html = "<b>" + nombre + "</b> · ";
        html += s.abierto
            ? "cierra a las <span class=\"num\">" + textoHora(s.cierre) + "</span> · quedan "
            : "cerrado, abre a las <span class=\"num\">" + textoHora(s.apertura) + "</span> · faltan ";
        html += "<b class=\"num estado-cuenta\" id=\"cuentaAtras\"></b>" + (s.abierto ? " para cerrar" : " para abrir");
        if (!s.platosNoche) {
            html += " · <span class=\"estado-aviso\"><span class=\"num\">" + noDisponibles + "</span> platos solo de noche</span>";
        }
        //El festivo solo cambia algo a mediodia entre semana: solo entonces se ofrece.
        if (!s.finDeSemana && s.turno === "mediodia") {
            html += " <button type=\"button\" class=\"accion-texto\" data-accion=\"festivo\">" + (s.festivo ? "Quitar festivo" : "¿Hoy es festivo?") + "</button>";
        }

        $("#estadoTexto").innerHTML = html;
        $("#estadoSol").classList.toggle("cerrado", !s.abierto);
        actualizarCuentaAtras();
    }

    //Cuenta atras (H:MM:SS) hasta el cierre, o hasta la apertura si esta cerrado. Se actualiza cada segundo.
    function actualizarCuentaAtras() {
        const ahora = new Date();
        const segundosAhora = ahora.getHours() * 3600 + ahora.getMinutes() * 60 + ahora.getSeconds();
        const objetivo = (servicio.abierto ? servicio.cierre : servicio.apertura) * 60;
        const restante = objetivo - segundosAhora;

        //Al llegar a cero cambia el turno (abre o cierra): recalculamos todo.
        if (restante <= 0) {
            actualizarTodo();
            return;
        }

        const h = Math.floor(restante / 3600);
        const m = Math.floor(restante / 60) % 60;
        const seg = restante % 60;
        const cuenta = $("#cuentaAtras");
        if (cuenta) {
            cuenta.textContent = h + ":" + String(m).padStart(2, "0") + ":" + String(seg).padStart(2, "0");
        }
    }

    function alternarFestivo(activar) {
        if (activar) {
            escribirStorage(CLAVE_FESTIVO, claveHoy(new Date()));
        } else {
            borrarStorage(CLAVE_FESTIVO);
        }
        actualizarTodo();
    }

    // ------------------------------------------------------------------ FILTROS Y LISTA

    const FILTROS = [
        { id: "todos", etiqueta: "Todos", prueba: function () { return true; } },
        { id: "favoritos", etiqueta: "Favoritos", prueba: function (p) { return p.favorito; } },
        { id: "sushi", etiqueta: "Sushi", prueba: function (p) { return p.sushi; } }
    ];

    function pintarFiltros() {
        $("#filtros").innerHTML = FILTROS.map(function (f) {
            const total = platos.filter(f.prueba).length;
            return "<button type=\"button\" class=\"filtro\" data-filtro=\"" + f.id + "\" aria-pressed=\"" + (f.id === filtroActivo) + "\">" +
                "<span class=\"filtro-etiqueta\">" + f.etiqueta + "</span>" +
                "<span class=\"filtro-valor num\">" + total + "</span></button>";
        }).join("");
    }

    function normalizar(texto) {
        return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    }

    //Emojis como en la Legacy (decision del usuario por encima de la regla "sin emojis" de la skill).
    const EMOJI_MEDALLA = { 1: "\u{1F947}", 2: "\u{1F948}", 3: "\u{1F949}" };
    const LLAMA = "\u{1F525}";

    function emoji(caracter, clase, texto) {
        return "<span class=\"emoji " + clase + "\" title=\"" + texto + "\" aria-hidden=\"true\">" + caracter + "</span>" +
            "<span class=\"visually-hidden\">(" + texto.toLowerCase() + ")</span>";
    }

    //Estrella de los platos de noche (en gris si ahora no se sirven).
    function iconoNoche(p) {
        if (!p.noche) return "";
        const ahora = disponible(p);
        return emoji(ESTRELLA, "emoji-noche" + (ahora ? "" : " apagada"),
            ahora ? "Plato de noche" : "Solo noche, fines de semana y festivos");
    }

    //Emojis detras del nombre: estrella, medalla del podio, "mejor evitar" y llama animada de favorito.
    function iconosPlato(p) {
        let html = iconoNoche(p);
        if (p.medalla) {
            html += emoji(EMOJI_MEDALLA[p.medalla], "emoji-podio", "Podio de la casa: " + p.medalla + "º");
        }
        if (p.evitar) {
            html += emoji(EVITAR, "emoji-evitar", "Mejor evitar");
        }
        if (p.favorito) {
            html += emoji(LLAMA, "llama", "Favorito");
        }
        return html;
    }

    //Nombre con sus emojis pegados: la ultima palabra va unida a los emojis para que nunca
    //se quede un emoji solo en la linea siguiente.
    function nombreConEmojis(p) {
        const emojis = iconosPlato(p);
        if (!emojis) return p.nombre;
        const corte = p.nombre.lastIndexOf(" ");
        const inicio = corte >= 0 ? p.nombre.slice(0, corte + 1) : "";
        const ultima = corte >= 0 ? p.nombre.slice(corte + 1) : p.nombre;
        return inicio + "<span class=\"sin-corte\">" + ultima + "<span class=\"plato-iconos\">" + emojis + "</span></span>";
    }

    function enPedido(codigo) {
        return pedido.some(function (item) { return item.codigo === codigo; });
    }

    //"Pedido en la ronda 1" / "Pedido en las rondas 1 y 3": para no repetir platos sin querer.
    function textoYaPedido(codigo) {
        const numeros = [];
        rondas.forEach(function (r, i) {
            if (r.platos.some(function (item) { return item.codigo === codigo; })) numeros.push(String(i + 1));
        });
        if (numeros.length === 0) return "";
        return "<span class=\"plato-detalle ya-pedido\"><i class=\"bi bi-check2\" aria-hidden=\"true\"></i>Pedido en " +
            (numeros.length === 1 ? "la ronda " : "las rondas ") + formatoLista.format(numeros) + "</span>";
    }

    function botonPlato(p) {
        const dentro = enPedido(p.codigo);
        return "<button type=\"button\" class=\"btn " + (dentro ? "btn-principal" : "btn-secundario") + "\" data-alternar=\"" + p.codigo + "\" aria-pressed=\"" + dentro + "\" " +
            "aria-label=\"" + (dentro ? "Quitar " : "Añadir ") + p.nombre + (dentro ? " del pedido" : " al pedido") + "\">" +
            (dentro ? "<i class=\"bi bi-check-lg\" aria-hidden=\"true\"></i><span class=\"etq\">Añadido</span>" : "<i class=\"bi bi-plus-lg\" aria-hidden=\"true\"></i><span class=\"etq\">Añadir</span>") +
            "</button>";
    }

    function pintarLista() {
        const filtro = FILTROS.find(function (f) { return f.id === filtroActivo; });
        const busqueda = normalizar(textoBusqueda.trim());

        const visibles = platos.filter(function (p) {
            return filtro.prueba(p) && (!busqueda || normalizar(p.nombre).includes(busqueda) || p.codigo.toLowerCase() === busqueda || p.codigo.toLowerCase().startsWith(busqueda));
        });

        $("#totalLista").textContent = visibles.length + (visibles.length === 1 ? " plato" : " platos");

        if (visibles.length === 0) {
            $("#listaPlatos").innerHTML = "<li class=\"vacio\">Ningún plato coincide con «" + escaparHtml(textoBusqueda.trim()) + "» en este filtro.</li>";
            return;
        }

        $("#listaPlatos").innerHTML = visibles.map(function (p) {
            return "<li class=\"plato" + (disponible(p) ? "" : " no-disponible") + (enPedido(p.codigo) ? " en-pedido" : "") + "\" data-fila=\"" + p.codigo + "\">" +
                "<span class=\"plato-codigo num\" translate=\"no\">" + p.codigo + "</span>" +
                "<div class=\"plato-cuerpo\"><span class=\"plato-nombre\">" + nombreConEmojis(p) + "</span>" + textoYaPedido(p.codigo) + "</div>" +
                "<div class=\"plato-accion\">" +
                enlaceFotos(p.nombre) +
                botonPlato(p) + "</div></li>";
        }).join("");
    }

    //Boton para ver fotos del plato o postre en Google Imagenes.
    function enlaceFotos(nombre) {
        const limpio = nombre.replace(/"/g, "");
        return "<a class=\"btn btn-icono\" href=\"https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(limpio) + "\" target=\"_blank\" rel=\"noopener\" aria-label=\"Ver fotos de " + limpio + "\" title=\"Ver fotos\"><i class=\"bi bi-image\" aria-hidden=\"true\"></i></a>";
    }

    function escaparHtml(texto) {
        return texto.replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
        });
    }

    // ------------------------------------------------------------------ PEDIDO

    function textoPedido(item) {
        const plato = platoPorCodigo.get(item.codigo);
        return item.codigo + " - " + plato.nombre + " ~ (" + item.cantidad + (item.cantidad > 1 ? " uds." : " ud.") + ")";
    }

    //Guarda y repinta el pedido. Si se indica un plato, en la carta solo se actualiza su fila
    //(redibujar las 74 filas hacia saltar la pagina en el movil).
    function guardarYPintarPedido(codigo) {
        ordenarPorNumero(pedido);
        guardarPedidosStorage(pedido);
        pintarPedido();
        if (codigo) {
            actualizarFilaCarta(codigo);
        } else {
            pintarLista();
        }
    }

    //Actualiza el boton y el estado de un plato en la carta sin tocar el resto de la lista.
    function actualizarFilaCarta(codigo) {
        const fila = document.querySelector("[data-fila=\"" + codigo + "\"]");
        if (!fila) return;
        fila.classList.toggle("en-pedido", enPedido(codigo));
        const boton = fila.querySelector("[data-alternar]");
        if (boton) {
            boton.outerHTML = botonPlato(platoPorCodigo.get(codigo));
        }
    }

    //Cambia la cantidad en pantalla sin redibujar nada (asi no se mueve la pagina ni se pierde el boton).
    function mostrarCantidad(codigo, cantidad) {
        $$("[data-cantidad=\"" + codigo + "\"]").forEach(function (campo) {
            if (document.activeElement !== campo) campo.value = cantidad;
        });
        $$("[data-cambio=\"-1\"][data-codigo=\"" + codigo + "\"]").forEach(function (boton) {
            boton.disabled = cantidad <= 1;
        });
    }

    //Sin aviso: el boton pasa de "+" a "✓" y el contador del pedido da un pequeno rebote.
    function alternarPlato(codigo) {
        if (enPedido(codigo)) {
            pedido = pedido.filter(function (item) { return item.codigo !== codigo; });
        } else {
            pedido.push({ codigo: codigo, cantidad: 1 });
        }
        guardarYPintarPedido(codigo);
    }

    function cambiarCantidad(codigo, cambio) {
        const item = pedido.find(function (i) { return i.codigo === codigo; });
        if (!item) return;

        //El "−" se queda en 1: para quitar el plato esta su propio boton ✕.
        item.cantidad = Math.min(Math.max(item.cantidad + cambio, 1), 99);
        guardarPedidosStorage(pedido);
        mostrarCantidad(codigo, item.cantidad);
    }

    //Suma platos al pedido (ronda repetida o pedido compartido): si ya estaba, se suman las raciones.
    function sumarPlatos(lista) {
        lista.forEach(function (nuevo) {
            const item = pedido.find(function (i) { return i.codigo === nuevo.codigo; });
            if (item) {
                item.cantidad = Math.min(item.cantidad + nuevo.cantidad, 99);
            } else {
                pedido.push({ codigo: nuevo.codigo, cantidad: nuevo.cantidad });
            }
        });
    }

    //Quitar con el ✕ es inmediato, pero se puede deshacer desde el aviso durante unos segundos.
    function quitarPlato(codigo) {
        const item = pedido.find(function (i) { return i.codigo === codigo; });
        if (!item) return;
        pedido = pedido.filter(function (i) { return i.codigo !== codigo; });
        guardarYPintarPedido(codigo);
        avisar(codigo + " quitado del pedido", function () {
            if (enPedido(codigo)) return;
            pedido.push({ codigo: item.codigo, cantidad: item.cantidad });
            guardarYPintarPedido(codigo);
        });
    }

    //Cantidad escrita a mano (1-99): se guarda al vuelo; al salir del campo se corrige si hace falta.
    function fijarCantidad(codigo, texto, alSalir) {
        const item = pedido.find(function (i) { return i.codigo === codigo; });
        if (!item) return;
        const valor = parseInt(texto, 10);
        if (valor > 0) {
            item.cantidad = Math.min(valor, 99);
            guardarPedidosStorage(pedido);
        }
        if (alSalir) {
            $$("[data-cantidad=\"" + codigo + "\"]").forEach(function (campo) { campo.value = item.cantidad; });
            mostrarCantidad(codigo, item.cantidad);
        }
    }

    function pintarPedido() {
        const soloNoche = pedido.filter(function (item) { return !disponible(platoPorCodigo.get(item.codigo)); }).length;

        $$("[data-contador-pedido]").forEach(function (el) {
            const nuevo = pedido.length > 0 ? String(pedido.length) : "";
            if (el.textContent !== nuevo && nuevo) {
                //Rebote del contador cuando cambia el numero de platos.
                el.classList.remove("rebote");
                void el.offsetWidth;
                el.classList.add("rebote");
            }
            el.textContent = nuevo;

            //Nombre para lectores de pantalla: "Pedido, 3 platos" en vez de "Pedido3".
            const enlace = el.closest("a");
            if (enlace) {
                if (!enlace.dataset.nombre) enlace.dataset.nombre = enlace.textContent.replace(/\d+/g, "").trim();
                if (nuevo) {
                    enlace.setAttribute("aria-label", enlace.dataset.nombre + ", " + nuevo + (nuevo === "1" ? " plato" : " platos"));
                } else {
                    enlace.removeAttribute("aria-label");
                }
            }
        });
        $$("[data-total-pedido]").forEach(function (el) {
            el.textContent = pedido.length > 0 ? pedido.length + (pedido.length === 1 ? " plato" : " platos") : "";
        });

        //En el panel del pedido de la carta, las rondas ya pedidas se despliegan ahi mismo (sin cambiar de pantalla).
        //Al repintar se respeta lo que estaba desplegado.
        const totalRondas = rondas.length;
        const railRondas = $("[data-pedido=\"rail\"] .rail-rondas");
        const railAbierto = !!(railRondas && railRondas.open);
        const railAbiertas = new Set($$("[data-pedido=\"rail\"] .ronda[open]").map(function (d) { return d.dataset.ronda; }));
        const enlaceRondas = totalRondas === 0 ? "" :
            "<details class=\"rail-rondas\"" + (railAbierto ? " open" : "") + ">" +
            "<summary><i class=\"bi bi-clock-history\" aria-hidden=\"true\"></i>" +
            (totalRondas === 1 ? "1 ronda ya pedida" : totalRondas + " rondas ya pedidas") +
            "<i class=\"bi bi-chevron-down\" aria-hidden=\"true\"></i></summary>" +
            htmlListaRondas(railAbiertas) +
            "<div class=\"rail-rondas-pie\"><button type=\"button\" class=\"accion-texto\" data-accion=\"borrar-rondas\">" +
            (totalRondas === 1 ? "Borrar la ronda" : "Borrar todas") + "</button></div>" +
            "</details>";

        $$("[data-pedido]").forEach(function (contenedor) {
            const extra = contenedor.dataset.pedido === "rail" ? enlaceRondas : "";

            //Pedido vacio: una frase con el mismo boton "+" de la carta y el atajo de los habituales.
            if (pedido.length === 0) {
                const habituales = platosHabituales.filter(function (c) { return platoPorCodigo.has(c); });
                contenedor.innerHTML = "<p class=\"vacio\">" + (totalRondas > 0 ? "Ronda " + (totalRondas + 1) + ": pulsa " : "Tu pedido está vacío. Pulsa ") +
                    "<span class=\"mas-ejemplo\" aria-hidden=\"true\"><i class=\"bi bi-plus-lg\"></i><span class=\"etq\">Añadir</span></span>" +
                    "<span class=\"visually-hidden\">el botón Añadir</span> en los platos que quieras pedir.</p>" +
                    "<div class=\"pedido-acciones\"><button type=\"button\" class=\"btn btn-principal btn-peq\" data-accion=\"habituales\"><i class=\"bi bi-plus-lg\" aria-hidden=\"true\"></i>Añadir los " + habituales.length + " habituales</button>" +
                    (contenedor.dataset.pedido === "completo" ? "<a class=\"btn btn-secundario btn-peq\" href=\"#carta\">Ir a la carta</a>" : "") + "</div>" + extra;
                return;
            }

            let html = "";
            if (soloNoche > 0) {
                html += "<p class=\"pedido-aviso\">" + soloNoche + (soloNoche === 1 ? " plato solo se sirve" : " platos solo se sirven") + " de noche, fines de semana y festivos.</p>";
            }

            html += "<ul class=\"pedido-lista\">" + pedido.map(function (item) {
                const plato = platoPorCodigo.get(item.codigo);
                const aviso = disponible(plato) ? "" : "<span class=\"plato-iconos\">" + iconoNoche(plato) + "</span>";
                return "<li class=\"pedido-fila\">" +
                    "<span class=\"plato-codigo num\" translate=\"no\">" + item.codigo + "</span>" +
                    "<span class=\"pedido-nombre\">" + plato.nombre + aviso + "</span>" +
                    "<span class=\"paso\">" +
                    "<button type=\"button\" data-cambio=\"-1\" data-codigo=\"" + item.codigo + "\" aria-label=\"Una ración menos de " + plato.nombre + "\"" + (item.cantidad === 1 ? " disabled" : "") + ">−</button>" +
                    "<input class=\"num\" type=\"text\" inputmode=\"numeric\" pattern=\"[0-9]*\" maxlength=\"2\" autocomplete=\"off\" name=\"cantidad-" + item.codigo + "\" data-cantidad=\"" + item.codigo + "\" value=\"" + item.cantidad + "\" aria-label=\"Raciones de " + plato.nombre + "\">" +
                    "<button type=\"button\" data-cambio=\"1\" data-codigo=\"" + item.codigo + "\" aria-label=\"Una ración más de " + plato.nombre + "\">+</button>" +
                    "</span>" +
                    "<button type=\"button\" class=\"btn btn-icono btn-quitar\" data-quitar=\"" + item.codigo + "\" aria-label=\"Quitar " + plato.nombre + " del pedido\" title=\"Quitar del pedido\"><i class=\"bi bi-x-lg\" aria-hidden=\"true\"></i></button>" +
                    "</li>";
            }).join("") + "</ul>";

            //Acciones en una sola fila compacta y, debajo, el paso final: marcar la ronda como pedida.
            html += "<div class=\"pedido-acciones\">" +
                "<button type=\"button\" class=\"btn btn-secundario btn-peq\" data-accion=\"copiar\"><i class=\"bi bi-files\" aria-hidden=\"true\"></i>Copiar</button>" +
                "<button type=\"button\" class=\"btn btn-secundario btn-peq\" data-accion=\"discreto\"><i class=\"bi bi-eye\" aria-hidden=\"true\"></i>Discreto</button>" +
                "<button type=\"button\" class=\"btn btn-secundario btn-peq\" data-accion=\"compartir\"><i class=\"bi bi-qr-code\" aria-hidden=\"true\"></i>Compartir</button>" +
                "<button type=\"button\" class=\"btn btn-secundario btn-peq btn-icono-peq btn-peligro\" data-accion=\"borrar\" aria-label=\"Borrar todo el pedido\" title=\"Borrar todo\"><i class=\"bi bi-trash3\" aria-hidden=\"true\"></i></button>" +
                "</div>" +
                "<button type=\"button\" class=\"btn btn-principal btn-ronda\" data-accion=\"ronda\"><i class=\"bi bi-check2-all\" aria-hidden=\"true\"></i>Ya lo he pedido<span class=\"btn-nota\">ronda " + (totalRondas + 1) + "</span></button>";

            contenedor.innerHTML = html + extra;
        });
    }

    function copiarTexto(texto) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(texto);
        }
        return new Promise(function (resolve, reject) {
            const area = document.createElement("textarea");
            area.value = texto;
            area.setAttribute("readonly", "");
            area.style.position = "fixed";
            area.style.opacity = "0";
            document.body.appendChild(area);
            area.select();
            let ok = false;
            try { ok = document.execCommand("copy"); } catch (e) { }
            document.body.removeChild(area);
            ok ? resolve() : reject();
        });
    }

    //Modo discreto como en la Legacy: lineas de texto gris sobre negro, igual que el texto copiado.
    function abrirDiscreto() {
        $("#listaDiscreto").innerHTML = pedido.map(function (item) {
            return "<p>" + escaparHtml(textoPedido(item)) + "</p>";
        }).join("");
        $("#totalDiscreto").innerHTML = "Total: <b class=\"num\">" + pedido.length + "</b> " + (pedido.length === 1 ? "plato" : "platos");
        $("#discreto").showModal();
    }

    // ------------------------------------------------------------------ RONDAS

    //"Ya lo he pedido": el pedido pasa al historial como una ronda y queda vacio para la siguiente.
    function guardarRonda() {
        if (pedido.length === 0) return;
        rondas.push({
            hora: Date.now(),
            platos: pedido.map(function (item) { return { codigo: item.codigo, cantidad: item.cantidad }; })
        });
        guardarRondas();
        const anterior = pedido;
        pedido = [];
        guardarYPintarPedido();
        pintarRondas();

        //Deshacer: la ronda vuelve a ser el pedido en curso (sumada a lo que se haya anadido mientras).
        const ronda = rondas[rondas.length - 1];
        avisar("Ronda " + rondas.length + " guardada", function () {
            const indice = rondas.indexOf(ronda);
            if (indice < 0) return;
            rondas.splice(indice, 1);
            guardarRondas();
            sumarPlatos(anterior);
            guardarYPintarPedido();
            pintarRondas();
        });
    }

    //Historial de rondas en la vista Pedido: cada ronda se despliega para ver sus platos.
    function pintarRondas() {
        const panel = $("#panelRondas");
        if (rondas.length === 0) {
            panel.hidden = true;
            panel.innerHTML = "";
            return;
        }

        //Al repintar se mantienen desplegadas las rondas que lo estaban.
        const abiertas = new Set($$("#panelRondas details[open]").map(function (d) { return d.dataset.ronda; }));
        const totalPlatos = rondas.reduce(function (suma, r) { return suma + r.platos.length; }, 0);

        panel.hidden = false;
        panel.innerHTML = "<div class=\"panel-cabecera\">" +
            "<h2 id=\"titulo-rondas\">Ya pedido <span class=\"titulo-total num\">" +
            (rondas.length === 1 ? "1 ronda" : rondas.length + " rondas") + " · " + totalPlatos + (totalPlatos === 1 ? " plato" : " platos") + "</span></h2>" +
            "<button type=\"button\" class=\"accion-texto\" data-accion=\"borrar-rondas\">Borrar</button>" +
            "</div>" + htmlListaRondas(abiertas);
    }

    //Lista de rondas desplegables (se usa en la vista Pedido y en el panel del pedido de la carta).
    //"abiertas" son los indices de las rondas que deben salir desplegadas.
    function htmlListaRondas(abiertas) {
        return "<ol class=\"rondas\">" + rondas.map(function (r, i) {
                return "<li><details class=\"ronda\" data-ronda=\"" + i + "\"" + (abiertas.has(String(i)) ? " open" : "") + ">" +
                    "<summary><span class=\"ronda-nombre\">Ronda " + (i + 1) + "</span>" +
                    "<span class=\"ronda-meta num\">" + formatoHora.format(r.hora) + " · " + r.platos.length + (r.platos.length === 1 ? " plato" : " platos") + "</span>" +
                    "<i class=\"bi bi-chevron-down\" aria-hidden=\"true\"></i></summary>" +
                    "<ul class=\"ronda-lista\">" + r.platos.map(function (item) {
                        return "<li><span class=\"plato-codigo num\" translate=\"no\">" + item.codigo + "</span>" +
                            "<span>" + platoPorCodigo.get(item.codigo).nombre + "</span>" +
                            "<span class=\"ronda-cantidad num\">×" + item.cantidad + "</span></li>";
                    }).join("") + "</ul>" +
                    "<div class=\"ronda-acciones\">" +
                    "<button type=\"button\" class=\"btn btn-secundario btn-peq\" data-repetir=\"" + i + "\"><i class=\"bi bi-arrow-repeat\" aria-hidden=\"true\"></i>Volver a pedir esta ronda</button>" +
                    "<button type=\"button\" class=\"btn btn-secundario btn-peq btn-icono-peq btn-peligro\" data-borrar-ronda=\"" + i + "\" aria-label=\"Borrar la ronda " + (i + 1) + "\" title=\"Borrar esta ronda\"><i class=\"bi bi-trash3\" aria-hidden=\"true\"></i></button>" +
                    "</div></details></li>";
            }).join("") + "</ol>";
    }

    // ------------------------------------------------------------------ COMPARTIR

    //El pedido viaja dentro del enlace (sin servidor): ?pedido=15-2.20.28-3 es A15 x2, A20 y A28 x3.
    //Sin la "A" y sin "-1" el enlace es mas corto y el QR sale con menos puntos (mas facil de leer).
    function codificarPedido(lista) {
        return lista.map(function (item) {
            return item.codigo.replace(/^A/, "") + (item.cantidad > 1 ? "-" + item.cantidad : "");
        }).join(".");
    }

    function decodificarPedido(texto) {
        return limpiarPlatos(String(texto || "").split(".").map(function (parte) {
            const trozos = parte.split("-");
            const codigo = trozos[0].trim().toUpperCase();
            return { codigo: /^\d+$/.test(codigo) ? "A" + codigo : codigo, cantidad: trozos[1] || 1 };
        }));
    }

    //QR propio en SVG: puntos redondos, esquinas con el rojo de la casa y el maki en el centro.
    //Correccion de errores alta (H, hasta un 30%) si el pedido es corto. Con pedidos largos se baja a Q o M
    //(25% o 15%) para que salgan menos puntos: el maki solo tapa un 5%, asi que sigue leyendose bien.
    function svgQr(texto) {
        let qr = null;
        ["H", "Q", "M"].some(function (nivel) {
            qr = window.qrcode(0, nivel);
            qr.addData(texto);
            qr.make();
            return qr.getModuleCount() <= 61;
        });

        const n = qr.getModuleCount();
        const margen = 3;
        const lado = n + margen * 2;

        //Hueco central para el maki: alrededor de un 22% del lado, centrado.
        let hueco = Math.round(n * 0.22);
        if (hueco % 2 !== n % 2) hueco++;
        const desde = (n - hueco) / 2;
        const hasta = desde + hueco;

        function esOjo(f, c) {
            return (f < 7 && c < 7) || (f < 7 && c >= n - 7) || (f >= n - 7 && c < 7);
        }

        //Marcas de alineacion (cuadraditos 5x5 repartidos por el codigo). Con puntos redondos el lector
        //no las encuentra, asi que se dibujan como cuadrados redondeados solidos. Posiciones segun la norma QR.
        const version = (n - 17) / 4;
        const posiciones = [];
        if (version > 1) {
            const cuantas = Math.floor(version / 7) + 2;
            const paso = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (cuantas * 2 - 2)) * 2;
            posiciones.push(6);
            for (let p = n - 7; posiciones.length < cuantas; p -= paso) posiciones.splice(1, 0, p);
        }
        const alineaciones = [];
        posiciones.forEach(function (f) {
            posiciones.forEach(function (c) {
                const pisaOjo = (f < 9 && c < 9) || (f < 9 && c > n - 9) || (f > n - 9 && c < 9);
                if (!pisaOjo) alineaciones.push([f, c]);
            });
        });
        function esAlineacion(f, c) {
            return alineaciones.some(function (a) { return Math.abs(f - a[0]) <= 2 && Math.abs(c - a[1]) <= 2; });
        }

        let puntos = "";
        for (let f = 0; f < n; f++) {
            for (let c = 0; c < n; c++) {
                if (!qr.isDark(f, c) || esOjo(f, c) || esAlineacion(f, c)) continue;
                if (f >= desde && f < hasta && c >= desde && c < hasta) continue;
                puntos += "<circle cx=\"" + (c + margen + 0.5) + "\" cy=\"" + (f + margen + 0.5) + "\" r=\"0.44\"/>";
            }
        }

        //Los tres "ojos" de las esquinas: marco redondeado negro y centro rojo.
        let ojos = "";
        alineaciones.forEach(function (a) {
            const x = a[1] + margen;
            const y = a[0] + margen;
            ojos += "<rect x=\"" + (x - 1.5) + "\" y=\"" + (y - 1.5) + "\" width=\"4\" height=\"4\" rx=\"1.2\" fill=\"none\" stroke=\"#0b0a09\" stroke-width=\"1\"/>" +
                "<rect x=\"" + x + "\" y=\"" + y + "\" width=\"1\" height=\"1\" rx=\"0.3\" fill=\"#0b0a09\"/>";
        });
        [[0, 0], [0, n - 7], [n - 7, 0]].forEach(function (pos) {
            const x = pos[1] + margen;
            const y = pos[0] + margen;
            ojos += "<rect x=\"" + (x + 0.5) + "\" y=\"" + (y + 0.5) + "\" width=\"6\" height=\"6\" rx=\"1.9\" fill=\"none\" stroke=\"#0b0a09\" stroke-width=\"1\"/>" +
                "<rect x=\"" + (x + 2) + "\" y=\"" + (y + 2) + "\" width=\"3\" height=\"3\" rx=\"0.9\" fill=\"#e23b2e\"/>";
        });

        const centro = lado / 2;
        const radio = hueco / 2 - 0.4;
        //El maki entero dentro del circulo: ocupa un 70% del diametro, asi no se recortan sus bordes.
        const ladoMaki = radio * 2 * 0.7;
        const maki = "<circle cx=\"" + centro + "\" cy=\"" + centro + "\" r=\"" + radio + "\" fill=\"#0b0a09\"/>" +
            "<image href=\"images/maki_qr.webp\" x=\"" + (centro - ladoMaki / 2) + "\" y=\"" + (centro - ladoMaki / 2) + "\" width=\"" + ladoMaki + "\" height=\"" + ladoMaki + "\" preserveAspectRatio=\"xMidYMid meet\"/>";

        //Si aun asi sale denso, la tarjeta del QR se hace mas grande (clase "denso").
        $("#qrCompartir").classList.toggle("denso", n > 61);

        return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 " + lado + " " + lado + "\" role=\"img\" aria-label=\"Código QR del pedido\">" +
            "<rect width=\"" + lado + "\" height=\"" + lado + "\" fill=\"#ffffff\"/>" +
            "<g fill=\"#0b0a09\">" + puntos + "</g>" + ojos + maki + "</svg>";
    }

    function enlacePedido() {
        return location.href.split(/[?#]/)[0] + "?pedido=" + codificarPedido(pedido);
    }

    //La libreria del QR solo se descarga la primera vez que se abre "Compartir".
    let promesaQr = null;
    function cargarLibreriaQr() {
        if (window.qrcode) return Promise.resolve();
        if (!promesaQr) {
            promesaQr = new Promise(function (resolve, reject) {
                const script = document.createElement("script");
                script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
                script.onload = resolve;
                script.onerror = function () {
                    promesaQr = null;
                    script.remove();
                    reject();
                };
                document.head.appendChild(script);
            });
        }
        return promesaQr;
    }

    function abrirCompartir() {
        const enlace = enlacePedido();
        const caja = $("#qrCompartir");
        $("#compartirTexto").textContent = "Escanéalo con otro móvil para abrir " +
            (pedido.length === 1 ? "este plato" : "estos " + pedido.length + " platos") + " y sumarlos a su pedido.";
        caja.innerHTML = "<span class=\"qr-estado\">Generando QR…</span>";
        reiniciarBotonEnlace();
        $("#compartir").showModal();

        cargarLibreriaQr().then(function () {
            caja.innerHTML = svgQr(enlace);
        }).catch(function () {
            caja.innerHTML = "<span class=\"qr-estado\">Sin conexión no se puede generar el QR. Envía el enlace.</span>";
        });
    }

    //En el movil se usa el menu de compartir del sistema (WhatsApp...); en el ordenador se copia el enlace.
    function reiniciarBotonEnlace() {
        const boton = $("#enviarEnlace");
        boton.innerHTML = navigator.share
            ? "<i class=\"bi bi-share\" aria-hidden=\"true\"></i><span>Enviar enlace</span>"
            : "<i class=\"bi bi-link-45deg\" aria-hidden=\"true\"></i><span>Copiar enlace</span>";
    }

    //Al abrir un enlace compartido: si no hay pedido se carga tal cual; si lo hay, se pregunta si sumarlo.
    function importarPedidoCompartido() {
        const parametros = new URLSearchParams(location.search);
        if (!parametros.has("pedido")) return;

        const recibido = decodificarPedido(parametros.get("pedido"));
        //Quitamos el parametro para que al recargar no se vuelva a importar.
        history.replaceState(null, "", location.pathname + location.hash);
        if (recibido.length === 0) return;

        const cuantos = recibido.length === 1 ? "1 plato" : recibido.length + " platos";
        function cargar() {
            sumarPlatos(recibido);
            guardarYPintarPedido();
            location.hash = "#pedido";
            avisar("Pedido compartido añadido: " + cuantos);
        }

        if (pedido.length === 0) {
            cargar();
            return;
        }
        pedirConfirmacion({
            titulo: "Te han compartido un pedido",
            texto: "Tiene " + cuantos + ". ¿Lo sumas al tuyo? Si un plato ya está, se suman las raciones.",
            boton: "Sumar al mío",
            icono: "bi-plus-lg"
        }).then(function (si) {
            if (si) cargar();
        });
    }

    //Modal de confirmacion propio. Devuelve una promesa con true si se pulsa el boton principal.
    //Se cancela con "Cancelar", tocando fuera o con Escape.
    function pedirConfirmacion(opciones) {
        const modal = $("#confirmar");
        const boton = $("#confirmarSi");
        $("#confirmarTitulo").textContent = opciones.titulo;
        $("#confirmarTexto").textContent = opciones.texto;
        boton.className = "btn " + (opciones.peligro ? "btn-borrar" : "btn-principal");
        boton.innerHTML = "<i class=\"bi " + opciones.icono + "\" aria-hidden=\"true\"></i>" + escaparHtml(opciones.boton);
        modal.returnValue = "";
        modal.showModal();
        return new Promise(function (resolve) {
            modal.addEventListener("close", function () {
                resolve(modal.returnValue === "si");
            }, { once: true });
        });
    }

    $("#confirmar").addEventListener("click", function (e) {
        if (e.target === this) this.close("no");
    });

    let temporizadorAviso = null;
    //Aviso de una linea. Si se pasa alDeshacer, lleva un boton "Deshacer" y dura algo mas (5 s).
    //Con "largo" el texto puede ocupar varias lineas y se muestra mas tiempo (frases del easter egg).
    let accionDeshacer = null;
    function avisar(texto, alDeshacer, largo) {
        const aviso = $("#aviso");
        accionDeshacer = alDeshacer || null;
        aviso.innerHTML = "<span class=\"aviso-texto\">" + escaparHtml(texto) + "</span>" +
            (accionDeshacer ? "<button type=\"button\" class=\"aviso-deshacer\" data-deshacer>Deshacer</button>" : "");
        aviso.classList.toggle("con-accion", !!accionDeshacer);
        aviso.classList.toggle("largo", !!largo);
        aviso.classList.add("visible");
        clearTimeout(temporizadorAviso);
        temporizadorAviso = setTimeout(cerrarAviso, accionDeshacer || largo ? 5000 : 2200);
    }

    function cerrarAviso() {
        accionDeshacer = null;
        $("#aviso").classList.remove("visible", "con-accion");
    }

    // ------------------------------------------------------------------ EASTER EGG (como en la Legacy)

    //5 toques en el maki de Extras, con menos de 3 segundos entre uno y otro, muestran una frase al azar.
    const FRASES_SECRETAS = [
        "¿Cavani te apetece japones o japonesa?",
        "Cavani la tiene chicken little.",
        "Cavani la tiene como un nigiri.",
        "Hassy.",
        "No cualquier harina hace hot cakes \u{1F95E}.",
        "#BarbaDura TATA V6 3.2 GASOLINE 4MATIC."
    ];
    let toquesSecreto = 0;
    let ultimoToqueSecreto = 0;
    let ultimaFrase = -1;

    $("#makiSecreto").addEventListener("click", function () {
        const ahora = Date.now();
        toquesSecreto = ahora - ultimoToqueSecreto < 3000 ? toquesSecreto + 1 : 1;
        ultimoToqueSecreto = ahora;
        if (navigator.vibrate) navigator.vibrate(30);

        if (toquesSecreto >= 5) {
            toquesSecreto = 0;
            //Al azar, pero sin repetir la ultima frase.
            let indice;
            do {
                indice = Math.floor(Math.random() * FRASES_SECRETAS.length);
            } while (indice === ultimaFrase && FRASES_SECRETAS.length > 1);
            ultimaFrase = indice;
            avisar(FRASES_SECRETAS[indice], null, true);
        }
    });

    $("#aviso").addEventListener("click", function (e) {
        if (!e.target.closest("[data-deshacer]") || !accionDeshacer) return;
        const deshacer = accionDeshacer;
        cerrarAviso();
        deshacer();
    });

    // ------------------------------------------------------------------ POSTRES, PRECIOS Y PODIO

    function pintarPostres() {
        //Misma fila que la carta: numero a la izquierda, nombre y boton de fotos (sin "+": el postre no va en el pedido).
        $("#listaPostres").innerHTML = Array.from(mapPostres, function ([numero, nombre]) {
            return "<li class=\"plato\">" +
                "<span class=\"plato-codigo num\">" + numero.replace(".", "") + "</span>" +
                "<div class=\"plato-cuerpo\"><span class=\"plato-nombre\">" + nombre + "</span>" +
                (detallesPostres.has(numero) ? "<span class=\"plato-detalle\">" + detallesPostres.get(numero) + "</span>" : "") +
                "</div>" +
                "<div class=\"plato-accion\">" + enlaceFotos(nombre) + "</div></li>";
        }).join("");
    }

    function pintarPrecios() {
        const filas = [
            ["Mediodía entre semana, adultos", precios.mediodia.adultos, "mediodia"],
            ["Mediodía entre semana, menores de 7", precios.mediodia.ninos, "mediodia"],
            ["Noche, fines de semana y festivos, adultos", precios.noche.adultos, "noche"],
            ["Noche, fines de semana y festivos, menores de 7", precios.noche.ninos, "noche"],
            ["Botella de agua grande", precios.bebidas.agua, null],
            ["Lata de refresco", precios.bebidas.refresco, null]
        ];
        $("#listaPrecios").innerHTML = filas.map(function (f) {
            const actual = f[2] && f[2] === servicio.tarifa;
            return "<li><span>" + f[0] + "</span><span class=\"valor num" + (actual ? " actual" : "") + "\">" + formatoEuros.format(f[1]) + "</span></li>";
        }).join("");
        $("#subtituloInfo").textContent = "Hoy toca la " + (servicio.tarifa === "noche" ? "tarifa de noche" : "tarifa de mediodía") + " (" + motivoTarifa(servicio) + "), marcada en rojo.";
    }

    // ------------------------------------------------------------------ VISTAS

    //Vistas: las de "extras" (podio, maki...) son subpantallas y marcan su pestaña padre en la navegacion.
    const VISTAS = $$(".vista").map(function (seccion) { return seccion.dataset.vista; });

    //Icono normal -> icono relleno (mismo dibujo, solo cambia el relleno).
    const ICONOS_RELLENOS = {
        "bi-journal-bookmark": "bi-journal-bookmark-fill",
        "bi-bag": "bi-bag-fill",
        "bi-cake2": "bi-cake2-fill",
        "bi-clock": "bi-clock-fill",
        "bi-puzzle": "bi-puzzle-fill"
    };

    let vistaActual = null;

    function mostrarVista() {
        const vista = VISTAS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "carta";
        let pestana = vista;

        //Animacion de entrada segun el orden del menu: hacia la derecha entra desde la derecha y al reves.
        //La primera vez que se carga la pagina no se anima.
        const seccionNueva = $(".vista[data-vista=\"" + vista + "\"]");
        if (vistaActual && vistaActual !== vista) {
            const haciaDelante = VISTAS.indexOf(vista) > VISTAS.indexOf(vistaActual);
            seccionNueva.style.setProperty("--entrada", haciaDelante ? "14px" : "-14px");
            seccionNueva.classList.remove("entrando");
            void seccionNueva.offsetWidth;
            seccionNueva.classList.add("entrando");
        }
        vistaActual = vista;

        $$(".vista").forEach(function (seccion) {
            seccion.hidden = seccion.dataset.vista !== vista;
            if (seccion.dataset.vista === vista && seccion.dataset.padre) {
                pestana = seccion.dataset.padre;
            }
        });
        $$("[data-vista]").forEach(function (enlace) {
            if (enlace.tagName === "A") {
                if (enlace.dataset.vista === pestana) {
                    enlace.setAttribute("aria-current", "page");
                } else {
                    enlace.removeAttribute("aria-current");
                }
            }
        });

        //En la barra inferior del movil, la seccion activa lleva el icono relleno.
        $$(".barra-inferior a i").forEach(function (icono) {
            if (!icono.dataset.icono) {
                icono.dataset.icono = Array.from(icono.classList).find(function (c) { return ICONOS_RELLENOS[c]; }) || "";
            }
            const normal = icono.dataset.icono;
            if (!normal) return;
            const activo = icono.parentElement.getAttribute("aria-current") === "page";
            icono.classList.toggle(normal, !activo);
            icono.classList.toggle(ICONOS_RELLENOS[normal], activo);
        });
        window.scrollTo(0, 0);
    }

    // ------------------------------------------------------------------ CONTADOR MAKI

    const audioNuke = new Audio("audio/tactical_nuke.mp3");
    const audioCR7 = new Audio("audio/aficion_CR7.mp3");

    function pintarContador() {
        $("#makiValor").textContent = contador;
        //La barra crece con transform (mas fluido que animar el ancho).
        $("#makiBarra").style.transform = "scaleX(" + (contador / MAX_CONTADOR) + ")";
    }

    function setContador(valor) {
        contador = Math.min(Math.max(valor, 0), MAX_CONTADOR);
        guardarContadorStorage(contador);
        pintarContador();

        [audioNuke, audioCR7].forEach(function (a) { a.pause(); a.currentTime = 0; });
        if (contador === 30) audioNuke.play().catch(function () { });
        if (contador === 100) audioCR7.play().catch(function () { });
    }

    // ------------------------------------------------------------------ EVENTOS

    function actualizarTodo() {
        servicio = calcularServicio(new Date());
        pintarServicio();
        pintarFiltros();
        pintarLista();
        pintarPedido();
        pintarPrecios();
    }

    document.addEventListener("click", function (e) {
        const filtro = e.target.closest("[data-filtro]");
        if (filtro) {
            filtroActivo = filtro.dataset.filtro;
            pintarFiltros();
            pintarLista();
            return;
        }

        const alternar = e.target.closest("[data-alternar]");
        if (alternar) {
            alternarPlato(alternar.dataset.alternar);
            return;
        }
        const quitar = e.target.closest("[data-quitar]");
        if (quitar) {
            quitarPlato(quitar.dataset.quitar);
            return;
        }

        const cambio = e.target.closest("[data-cambio]");
        if (cambio) {
            cambiarCantidad(cambio.dataset.codigo, parseInt(cambio.dataset.cambio, 10));
            return;
        }

        const accion = e.target.closest("[data-accion]");
        if (accion) {
            if (accion.dataset.accion === "copiar") {
                copiarTexto(pedido.map(textoPedido).join("\n"))
                    .then(function () { avisar("Pedido copiado al portapapeles"); })
                    .catch(function () { avisar("No se pudo copiar"); });
            } else if (accion.dataset.accion === "festivo") {
                alternarFestivo(!servicio.festivo);
            } else if (accion.dataset.accion === "habituales") {
                platosHabituales.forEach(function (c) {
                    if (platoPorCodigo.has(c) && !enPedido(c)) {
                        pedido.push({ codigo: c, cantidad: 1 });
                    }
                });
                guardarYPintarPedido();
                avisar("Habituales añadidos al pedido");
            } else if (accion.dataset.accion === "discreto") {
                abrirDiscreto();
            } else if (accion.dataset.accion === "borrar") {
                pedirConfirmacion({
                    titulo: "¿Borrar el pedido?",
                    texto: pedido.length === 1 ? "Se quitará el plato del pedido." : "Se quitarán los " + pedido.length + " platos del pedido.",
                    boton: "Borrar todo",
                    icono: "bi-trash3",
                    peligro: true
                }).then(function (si) {
                    if (!si) return;
                    pedido = [];
                    guardarYPintarPedido();
                    avisar("Pedido borrado");
                });
            } else if (accion.dataset.accion === "ronda") {
                guardarRonda();
            } else if (accion.dataset.accion === "compartir") {
                abrirCompartir();
            } else if (accion.dataset.accion === "borrar-rondas") {
                pedirConfirmacion({
                    titulo: "¿Borrar las rondas?",
                    texto: rondas.length === 1 ? "Se borrará la ronda ya pedida." : "Se borrarán las " + rondas.length + " rondas ya pedidas.",
                    boton: "Borrar",
                    icono: "bi-trash3",
                    peligro: true
                }).then(function (si) {
                    if (!si) return;
                    rondas = [];
                    guardarRondas();
                    pintarRondas();
                    pintarPedido();
                    pintarLista();
                    avisar("Rondas borradas");
                });
            }
            return;
        }

        //Borrar una sola ronda (con confirmacion). Las siguientes se renumeran.
        const borrarRonda = e.target.closest("[data-borrar-ronda]");
        if (borrarRonda) {
            const indice = parseInt(borrarRonda.dataset.borrarRonda, 10);
            const ronda = rondas[indice];
            if (!ronda) return;
            pedirConfirmacion({
                titulo: "¿Borrar la ronda " + (indice + 1) + "?",
                texto: "Se quitará del historial con " + (ronda.platos.length === 1 ? "su plato." : "sus " + ronda.platos.length + " platos."),
                boton: "Borrar",
                icono: "bi-trash3",
                peligro: true
            }).then(function (si) {
                if (!si) return;
                //Se cierra antes de repintar para que no quede desplegada la ronda que ocupa su sitio.
                const detalle = borrarRonda.closest("details");
                if (detalle) detalle.open = false;
                rondas.splice(indice, 1);
                guardarRondas();
                pintarRondas();
                pintarPedido();
                pintarLista();
                avisar("Ronda " + (indice + 1) + " borrada");
            });
            return;
        }

        //Volver a pedir una ronda: sus platos se suman al pedido actual.
        const repetir = e.target.closest("[data-repetir]");
        if (repetir) {
            const indice = parseInt(repetir.dataset.repetir, 10);
            if (!rondas[indice]) return;
            sumarPlatos(rondas[indice].platos);
            guardarYPintarPedido();
            avisar("Ronda " + (indice + 1) + " añadida al pedido");
            //En la vista Pedido se sube para ver el pedido; en el panel de la carta el pedido ya esta justo encima.
            if (repetir.closest("#panelRondas")) window.scrollTo({ top: 0, behavior: "smooth" });
        }
    });

    //Cantidad escrita a mano: solo digitos, se guarda al escribir y se corrige (1-99) al salir del campo.
    document.addEventListener("input", function (e) {
        if (!e.target.matches("[data-cantidad]")) return;
        const limpio = e.target.value.replace(/\D/g, "").slice(0, 2);
        if (e.target.value !== limpio) e.target.value = limpio;
        fijarCantidad(e.target.dataset.cantidad, limpio, false);
    });

    document.addEventListener("change", function (e) {
        if (!e.target.matches("[data-cantidad]")) return;
        fijarCantidad(e.target.dataset.cantidad, e.target.value, true);
    });

    document.addEventListener("focusin", function (e) {
        if (e.target.matches("[data-cantidad]")) e.target.select();
    });

    document.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && e.target.matches("[data-cantidad]")) e.target.blur();
    });

    $("#buscar").addEventListener("input", function () {
        textoBusqueda = this.value;
        pintarLista();
    });

    //Copiar desde el modo discreto: la confirmacion va en el propio boton (el aviso quedaria debajo).
    let temporizadorCopiado = null;
    $("#copiarDiscreto").addEventListener("click", function () {
        const boton = this;
        const etiqueta = boton.querySelector("span");
        const icono = boton.querySelector("i");
        copiarTexto(pedido.map(textoPedido).join("\n")).then(function () {
            etiqueta.textContent = "Copiado";
            icono.className = "bi bi-check-lg";
        }).catch(function () {
            etiqueta.textContent = "No se pudo copiar";
        }).then(function () {
            clearTimeout(temporizadorCopiado);
            temporizadorCopiado = setTimeout(function () {
                etiqueta.textContent = "Copiar";
                icono.className = "bi bi-files";
            }, 1800);
        });
    });

    //Compartir: enviar o copiar el enlace (la confirmacion va en el propio boton, el aviso quedaria debajo).
    let temporizadorEnlace = null;
    $("#enviarEnlace").addEventListener("click", function () {
        const enlace = enlacePedido();
        const boton = this;
        if (navigator.share) {
            navigator.share({ title: "Pedido Nakoya", text: "Mi pedido para el Nakoya", url: enlace }).catch(function () { });
            return;
        }
        copiarTexto(enlace).then(function () {
            boton.innerHTML = "<i class=\"bi bi-check-lg\" aria-hidden=\"true\"></i><span>Enlace copiado</span>";
        }).catch(function () {
            boton.innerHTML = "<span>No se pudo copiar</span>";
        }).then(function () {
            clearTimeout(temporizadorEnlace);
            temporizadorEnlace = setTimeout(reiniciarBotonEnlace, 1800);
        });
    });

    $("#compartir").addEventListener("click", function (e) {
        if (e.target === this || e.target.closest("[data-cerrar-compartir]")) this.close();
    });

    $$("[data-cerrar-discreto]").forEach(function (boton) {
        boton.addEventListener("click", function () { $("#discreto").close(); });
    });

    //Como en la Legacy: vibra 100 ms, el maki "se hunde" un instante y suenan los audios a los 30 y a los 100.
    $("#makiBoton").addEventListener("click", function () {
        if (navigator.vibrate) navigator.vibrate(100);

        const imagen = this.querySelector("img");
        imagen.classList.remove("pulso");
        void imagen.offsetWidth;
        imagen.classList.add("pulso");

        setContador(Math.min(contador + 1, MAX_CONTADOR));
    });
    $("#makiMenos").addEventListener("click", function () { setContador(contador - 1); });
    //Poner a cero pide confirmacion: un toque sin querer borraria la cuenta de la noche.
    $("#makiReset").addEventListener("click", function () {
        if (contador === 0) return;
        pedirConfirmacion({
            titulo: "¿Poner el contador a cero?",
            texto: "Se perderán los " + contador + (contador === 1 ? " maki contado." : " makis contados."),
            boton: "Poner a cero",
            icono: "bi-arrow-counterclockwise",
            peligro: true
        }).then(function (si) {
            if (si) setContador(0);
        });
    });
    $("#makiBoton").addEventListener("contextmenu", function (e) { e.preventDefault(); });

    window.addEventListener("hashchange", mostrarVista);

    //Si se cambia el pedido en otra pestaña (o en la Legacy abierta a la vez), lo recargamos.
    window.addEventListener("storage", function (e) {
        if (e.key === CLAVE_PEDIDOS) {
            pedido = ordenarPorNumero(cargarPedidosStorage());
            pintarPedido();
            pintarLista();
        } else if (e.key === CLAVE_RONDAS) {
            rondas = cargarRondas();
            pintarRondas();
            pintarPedido();
            pintarLista();
        } else if (e.key === CLAVE_CONTADOR) {
            contador = cargarContadorStorage();
            pintarContador();
        }
    });

    // ------------------------------------------------------------------ ARRANQUE

    pintarPostres();
    pintarContador();
    mostrarVista();
    actualizarTodo();
    pintarRondas();
    importarPedidoCompartido();

    setInterval(actualizarCuentaAtras, 1000);

    //La disponibilidad depende de la hora: la recalculamos cada 30 segundos.
    setInterval(function () {
        const anterior = servicio;
        servicio = calcularServicio(new Date());
        pintarServicio();
        pintarPrecios();
        //Solo repintamos la carta y el pedido si cambia lo que se puede pedir (asi no se pierde el foco).
        if (anterior.platosNoche !== servicio.platosNoche) {
            pintarFiltros();
            pintarLista();
            pintarPedido();
        }
    }, 30000);

})();
