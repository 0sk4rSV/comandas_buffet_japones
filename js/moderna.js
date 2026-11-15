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

    //VENTANAS (dialog): se abren dejando un paso en el historial, asi el boton de atras del movil o del navegador
    //las cierra en vez de salir de la pantalla. La tecla de retroceso tambien las cierra.
    function abrirVentana(ventana) {
        ventana.showModal();
        history.pushState({ ventana: ventana.id }, "");
        ventana.addEventListener("close", function () {
            //Si se cierra con su boton (no con atras), se quita el paso que se habia anadido al historial.
            if (history.state && history.state.ventana === ventana.id) history.back();
        }, { once: true });
    }

    window.addEventListener("popstate", function () {
        $$("dialog[open]").forEach(function (d) { d.close(); });
    });

    document.addEventListener("keydown", function (e) {
        if (e.key !== "Backspace") return;
        const abierta = $("dialog[open]");
        //En la ventana de confirmar o con un campo de texto activo, retroceso sigue borrando texto.
        if (!abierta || e.target.matches("input, textarea")) return;
        e.preventDefault();
        abierta.close();
    });

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
            "Borrar todas</button></div>" +
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
        abrirVentana($("#discreto"));
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
        abrirVentana($("#compartir"));

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
        abrirVentana(modal);
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
    //Aviso de una linea. Si se pasa alDeshacer, lleva un boton "Deshacer".
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
        //Rebote al aparecer una frase nueva, para que se note el cambio aunque el aviso ya estuviera visible.
        if (largo) {
            aviso.classList.remove("nuevo");
            void aviso.offsetWidth;
            aviso.classList.add("nuevo");
        }
        clearTimeout(temporizadorAviso);
        //Duracion: 2,2 s los avisos normales, 3 s los que llevan "Deshacer" y 5 s las frases largas del easter egg.
        temporizadorAviso = setTimeout(cerrarAviso, largo ? 5000 : (accionDeshacer ? 3000 : 2200));
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
    //Copyright del pie de Extras, como en la Legacy (el año se pone solo).
    $("#copyright").textContent = "© " + new Date().getFullYear() + ", Desarrollado por Tito’s S.A.";

    let toquesSecreto = 0;
    let ultimoToqueSecreto = 0;
    let ultimaFrase = -1;
    let fraseHasta = 0;

    $("#makiSecreto").addEventListener("click", function () {
        const ahora = Date.now();
        //Justo despues de salir una frase se ignoran los toques un momento (0,6 s): al tocar rapido se dan
        //2 o 3 de mas sin querer y, si contaran, la siguiente frase saldria enseguida. Pasado ese momento,
        //otros 5 toques sacan una frase nueva aunque la anterior siga en pantalla.
        if (ahora < fraseHasta) {
            toquesSecreto = 0;
            ultimoToqueSecreto = 0;
            return;
        }
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
            fraseHasta = ahora + 600;
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
        //Lo que vaya detras de "?" en el hash (p. ej. "#atrapa?algo") no forma parte del nombre de la vista.
        const nombreVista = location.hash.slice(1).split("?")[0];
        const vista = VISTAS.includes(nombreVista) ? nombreVista : "carta";
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

        //El plato sorpresa depende del pedido: al entrar se refresca por si ha cambiado.
        if (vista === "sorpresa") {
            sorpresa.actual = null;
            pintarPlatoSorpresa();
        }
        //Cada vez que se entra en la galletita hay una nueva entera.
        if (vista === "galleta") reiniciarGalleta();
        //Atrapa el sushi se para si se sale de su pantalla a mitad de partida; al entrar, ocupa todo el alto.
        if (vista !== "atrapa") detenerAtrapa();
        else requestAnimationFrame(ajustarZonaAtrapa);
        window.scrollTo(0, 0);
        pintarBotonSubir();
    }

    // ------------------------------------------------------------------ CONTADOR MAKI

    const audioNuke = new Audio("audio/tactical_nuke.mp3");
    const audioCR7 = new Audio("audio/aficion_CR7.mp3");

    function pintarContador() {
        $("#makiValor").textContent = contador;
        $("#makiValor").setAttribute("aria-label", "Makis contados: " + contador + ". Toca para escribir el número");
        //La barra crece con transform (mas fluido que animar el ancho).
        $("#makiBarra").style.transform = "scaleX(" + (contador / MAX_CONTADOR) + ")";
    }

    //sinSonido: al mantener pulsado el "-" no suena el audio de los 30 al pasar por el.
    function setContador(valor, sinSonido) {
        const antes = contador;
        contador = Math.min(Math.max(valor, 0), MAX_CONTADOR);
        guardarContadorStorage(contador);
        pintarContador();
        if (sinSonido) return;

        [audioNuke, audioCR7].forEach(function (a) { a.pause(); a.currentTime = 0; });
        if (contador === 30) audioNuke.play().catch(function () { });
        if (contador === 100) audioCR7.play().catch(function () { });
        //Al llegar a 100 (no si ya estaba), confeti por toda la pantalla.
        if (contador === 100 && antes !== 100) lanzarConfeti();
    }

    // ------------------------------------------------------------------ CONFETI

    //Un lienzo a pantalla completa que no captura toques: lluvia desde arriba y dos cañonazos desde las esquinas
    //de abajo. Si se vuelve a lanzar mientras cae, se suman piezas al mismo lienzo.
    const COLORES_CONFETI = ["#e23b2e", "#f5c542", "#ffffff", "#ff8b80", "#3fbf7f", "#4aa3ff"];
    let confeti = null;

    function lanzarConfeti() {
        if (!confeti) {
            const lienzo = document.createElement("canvas");
            lienzo.className = "confeti";
            lienzo.setAttribute("aria-hidden", "true");
            document.body.appendChild(lienzo);
            confeti = { lienzo: lienzo, ctx: lienzo.getContext("2d"), piezas: [], ultimo: performance.now() };
            ajustarConfeti();
            requestAnimationFrame(moverConfeti);
        }
        const ancho = window.innerWidth;
        const alto = window.innerHeight;
        function pieza(x, y, vx, vy, espera) {
            confeti.piezas.push({
                x: x, y: y, vx: vx, vy: vy, espera: espera,
                giro: Math.random() * Math.PI * 2,
                velGiro: (Math.random() - 0.5) * 12,
                vaiven: Math.random() * Math.PI * 2,
                tam: 6 + Math.random() * 6,
                redonda: Math.random() < 0.25,
                color: COLORES_CONFETI[numeroAlAzar(COLORES_CONFETI.length)]
            });
        }
        //Lluvia: repartida por todo el ancho, saliendo poco a poco durante el primer segundo.
        for (let i = 0; i < 140; i++) {
            pieza(Math.random() * ancho, -20 - Math.random() * 60, (Math.random() - 0.5) * 60, 60 + Math.random() * 120, Math.random() * 1.1);
        }
        //Cañonazos desde las esquinas de abajo, hacia arriba y hacia el centro.
        [0, 1].forEach(function (lado) {
            for (let i = 0; i < 70; i++) {
                const angulo = (lado ? 110 : 70) + (Math.random() - 0.5) * 34;
                const fuerza = alto * (1.9 + Math.random() * 1.3);
                const rad = angulo * Math.PI / 180;
                pieza(lado ? ancho + 10 : -10, alto + 10, Math.cos(rad) * fuerza, -Math.sin(rad) * fuerza, Math.random() * 0.15);
            }
        });
        vibrar([60, 40, 60, 40, 120]);
    }

    function ajustarConfeti() {
        if (!confeti) return;
        const escala = window.devicePixelRatio || 1;
        confeti.lienzo.width = Math.round(window.innerWidth * escala);
        confeti.lienzo.height = Math.round(window.innerHeight * escala);
        confeti.ctx.setTransform(escala, 0, 0, escala, 0, 0);
    }
    window.addEventListener("resize", ajustarConfeti);

    function moverConfeti(ahora) {
        if (!confeti) return;
        const dt = Math.min((ahora - confeti.ultimo) / 1000, 0.05);
        confeti.ultimo = ahora;
        const ctx = confeti.ctx;
        const alto = window.innerHeight;
        ctx.clearRect(0, 0, window.innerWidth, alto);

        confeti.piezas = confeti.piezas.filter(function (p) {
            if (p.espera > 0) {
                p.espera -= dt;
                return true;
            }
            //Gravedad y rozamiento del aire: los cañonazos frenan y caen flotando como el resto.
            p.vy += 900 * dt;
            p.vx *= Math.pow(0.02, dt);
            p.vy *= Math.pow(0.02, dt);
            p.vaiven += dt * 5;
            p.x += (p.vx + Math.sin(p.vaiven) * 40) * dt;
            p.y += p.vy * dt;
            p.giro += p.velGiro * dt;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.giro);
            //El coseno del vaiven hace que el papelito "gire" sobre si mismo (se ve de canto y de frente).
            ctx.scale(1, Math.cos(p.vaiven));
            ctx.fillStyle = p.color;
            if (p.redonda) {
                ctx.beginPath();
                ctx.arc(0, 0, p.tam / 2.4, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillRect(-p.tam / 2, -p.tam / 4, p.tam, p.tam / 2);
            }
            ctx.restore();
            return p.y < alto + 30;
        });

        if (confeti.piezas.length) {
            requestAnimationFrame(moverConfeti);
        } else {
            confeti.lienzo.remove();
            confeti = null;
        }
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

        //Ya en 100: no se suma ni se repite el audio, solo una regañina.
        if (contador >= MAX_CONTADOR) {
            avisar("¡Para ya, animal, no abuses del buffet!");
            return;
        }
        setContador(contador + 1);
    });

    //"-": un toque resta 1; mantenido, tras medio segundo resta seguido y cada vez mas rapido.
    //Con raton o dedo lo gestiona pointerdown; el click solo cuenta si viene del teclado (detail 0).
    const makiMenos = $("#makiMenos");
    let restaSeguida = null;

    function pararResta() {
        clearTimeout(restaSeguida);
        restaSeguida = null;
    }

    function restarMantenido(espera) {
        restaSeguida = setTimeout(function () {
            if (contador <= 0) return pararResta();
            setContador(contador - 1, true);
            vibrar(8);
            restarMantenido(Math.max(40, espera * 0.85));
        }, espera);
    }

    makiMenos.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        pararResta();
        setContador(contador - 1);
        restaSeguida = setTimeout(function () { restarMantenido(110); }, 450);
    });
    ["pointerup", "pointerleave", "pointercancel", "blur"].forEach(function (evento) {
        makiMenos.addEventListener(evento, pararResta);
    });
    makiMenos.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    makiMenos.addEventListener("click", function (e) {
        if (e.detail === 0) setContador(contador - 1);
    });

    //Tocar el numero lo cambia por un campo para escribirlo. Enter o salir del campo lo guarda; Escape cancela.
    const makiValor = $("#makiValor");
    const makiCampo = $("#makiCampo");

    makiValor.addEventListener("click", function () {
        makiCampo.value = contador;
        makiValor.hidden = true;
        makiCampo.hidden = false;
        makiCampo.focus();
        makiCampo.select();
    });

    function cerrarCampoMaki(guardar) {
        if (makiCampo.hidden) return;
        makiCampo.hidden = true;
        makiValor.hidden = false;
        //Si se deja vacio, cuenta como 0.
        const valor = parseInt(makiCampo.value.replace(/\D/g, ""), 10) || 0;
        if (guardar && valor !== contador) setContador(valor);
    }

    //Solo cifras (en algunos teclados se pueden colar otros caracteres).
    makiCampo.addEventListener("input", function () {
        const limpio = makiCampo.value.replace(/\D/g, "").slice(0, 3);
        if (limpio !== makiCampo.value) makiCampo.value = limpio;
    });
    makiCampo.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            e.preventDefault();
            cerrarCampoMaki(true);
            makiValor.focus();
        } else if (e.key === "Escape") {
            e.preventDefault();
            cerrarCampoMaki(false);
            makiValor.focus();
        }
    });
    makiCampo.addEventListener("blur", function () { cerrarCampoMaki(true); });
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

    // ------------------------------------------------------------------ RULETA RUSA

    //Los nombres y el ultimo reto se guardan en el dispositivo (la proxima vez suele ser la misma mesa).
    const CLAVE_RULETA = "ruletaNakoya";
    const MAX_JUGADORES = 12;
    const RETOS_PROPUESTOS = [
        "¿Quién canta la comanda?",
        "¿Quién se pide un chupito para cerrar con broche de oro?",
        "¿Quién se pide para antes del postre unas bolitas de arroz?",
        "¿Quién paga la cena?"
    ];
    //Colores de los trozos: rojo de la casa y grises de la app, alternos.
    //Estilo casino: trozos rojo y negro, y un rojo oscuro para el ultimo si hay un numero impar de personas.
    const COLORES_RULETA = ["#e23b2e", "#141110"];
    const COLOR_RULETA_EXTRA = "#8f2a22";
    const BOMBILLAS_RULETA = 20;

    let ruleta = cargarRuleta();
    let giroRuleta = 0;
    let ruletaGirando = false;

    function cargarRuleta() {
        try {
            const datos = JSON.parse(leerStorage(CLAVE_RULETA));
            if (datos && Array.isArray(datos.nombres)) {
                return {
                    nombres: datos.nombres.filter(function (n) { return typeof n === "string" && n.trim(); }).slice(0, MAX_JUGADORES),
                    reto: typeof datos.reto === "string" ? datos.reto : ""
                };
            }
        } catch (e) { }
        return { nombres: [], reto: "" };
    }

    function guardarRuleta() {
        escribirStorage(CLAVE_RULETA, JSON.stringify(ruleta));
    }

    //Numero al azar entre 0 y n-1 con el generador criptografico (sorteo justo).
    function numeroAlAzar(n) {
        if (window.crypto && window.crypto.getRandomValues) {
            return window.crypto.getRandomValues(new Uint32Array(1))[0] % n;
        }
        return Math.floor(Math.random() * n);
    }

    function pintarJugadores() {
        const n = ruleta.nombres.length;
        $("#ruletaTotal").textContent = n > 0 ? n + (n === 1 ? " persona" : " personas") : "";
        $("#ruletaJugadores").innerHTML = n === 0
            ? "<li class=\"ruleta-vacio\">Añade al menos 2 nombres para poder girar la ruleta.</li>"
            : ruleta.nombres.map(function (nombre, i) {
                const visible = escaparHtml(nombre.trim());
                return "<li class=\"jugador\"><span>" + visible + "</span>" +
                    "<button type=\"button\" data-quitar-jugador=\"" + i + "\" aria-label=\"Quitar a " + visible + "\"><i class=\"bi bi-x\" aria-hidden=\"true\"></i></button></li>";
            }).join("");
        const lleno = n >= MAX_JUGADORES;
        $("#ruletaNombre").disabled = lleno;
        $("#ruletaNombre").placeholder = lleno ? "Máximo " + MAX_JUGADORES + " personas" : "Nombre…";
        $("#ruletaGirar").disabled = n < 2 || ruletaGirando;
        pintarRueda();
    }

    function pintarSugerencias() {
        $("#ruletaSugerencias").innerHTML = RETOS_PROPUESTOS.map(function (reto) {
            return "<button type=\"button\" class=\"sugerencia\" data-reto=\"" + escaparHtml(reto) + "\"" +
                (reto === ruleta.reto ? " aria-pressed=\"true\"" : " aria-pressed=\"false\"") + ">" + escaparHtml(reto) + "</button>";
        }).join("");
    }

    //Punto de la circunferencia: angulo en grados desde arriba, en sentido horario.
    function puntoRueda(angulo, radio) {
        const rad = angulo * Math.PI / 180;
        return (radio * Math.sin(rad)).toFixed(2) + " " + (-radio * Math.cos(rad)).toFixed(2);
    }

    //La rueda en SVG: un trozo por persona con su nombre en el radio.
    //La rueda en SVG, estilo casino: aro dorado con bombillas, trozos rojo y negro con separadores dorados,
    //el nombre de cada uno en su trozo y el centro dorado con la N de Nakoya.
    function pintarRueda() {
        const nombres = ruleta.nombres;
        const n = nombres.length;
        let svg = "<svg viewBox=\"-120 -120 240 240\" role=\"img\" aria-label=\"Ruleta con " + n + (n === 1 ? " nombre" : " nombres") + "\">" +
            "<defs><radialGradient id=\"oroRuleta\"><stop offset=\"0\" stop-color=\"#ffe08a\"/><stop offset=\"1\" stop-color=\"#c98a12\"/></radialGradient></defs>" +
            //Aro dorado y fondo negro de la rueda.
            "<circle r=\"116\" fill=\"#7a5a12\"/><circle r=\"112\" fill=\"url(#oroRuleta)\"/><circle r=\"98\" fill=\"#0b0a09\"/>";

        if (n < 2) {
            //Sin nombres la rueda vuelve recta (si se habia girado antes, el texto saldria torcido).
            giroRuleta = 0;
            $("#ruletaRueda").style.transition = "none";
            $("#ruletaRueda").style.transform = "none";
            //El texto va por encima del circulo central para que no lo tape.
            svg += "<circle r=\"96\" fill=\"#1c1817\"/><text class=\"ruleta-texto-vacio\" y=\"-46\" text-anchor=\"middle\" dominant-baseline=\"middle\">Añade nombres</text>";
        } else {
            const paso = 360 / n;
            const tamLetra = n <= 4 ? 14 : (n <= 8 ? 12 : 10);
            let separadores = "";
            nombres.forEach(function (nombre, i) {
                const desde = i * paso;
                const hasta = desde + paso;
                //Con un numero impar de personas, el ultimo trozo usa un tercer color para no repetir junto al primero.
                const color = (n % 2 === 1 && i === n - 1) ? COLOR_RULETA_EXTRA : COLORES_RULETA[i % 2];
                svg += "<path d=\"M0 0 L" + puntoRueda(desde, 96) + " A96 96 0 0 1 " + puntoRueda(hasta, 96) + " Z\" fill=\"" + color + "\"/>";
                separadores += "<line x1=\"0\" y1=\"0\" x2=\"" + puntoRueda(desde, 96).replace(" ", "\" y2=\"") + "\" stroke=\"#f5c542\" stroke-width=\"2\"/>";
                const medio = desde + paso / 2;
                const limpio = nombre.trim();
                const etiqueta = limpio.length > 10 ? limpio.slice(0, 9) + "…" : limpio;
                //En la mitad izquierda el texto se gira media vuelta para que no quede boca abajo.
                const izquierda = medio > 180;
                const giroTexto = izquierda ? medio + 90 : medio - 90;
                svg += "<text transform=\"rotate(" + giroTexto + ") translate(" + (izquierda ? -60 : 60) + " 0)\" text-anchor=\"middle\" dominant-baseline=\"middle\" font-size=\"" + tamLetra + "\">" + escaparHtml(etiqueta) + "</text>";
            });
            svg += separadores;
        }

        //Bombillas del aro, alternando dos tonos.
        for (let k = 0; k < BOMBILLAS_RULETA; k++) {
            const punto = puntoRueda(k * 360 / BOMBILLAS_RULETA, 105).split(" ");
            svg += "<circle class=\"bombilla" + (k % 2 ? " par" : "") + "\" cx=\"" + punto[0] + "\" cy=\"" + punto[1] + "\" r=\"3\"/>";
        }
        //El centro dorado con la N va fuera de la rueda (no gira, asi la N siempre se lee recta).
        svg += "</svg>";
        $("#ruletaRueda").innerHTML = svg;
    }

    function girarRuleta() {
        const n = ruleta.nombres.length;
        if (ruletaGirando || n < 2) return;

        const paso = 360 / n;
        //Truco secreto: quien se apunto con un espacio al final ("Cavani ") nunca pierde.
        //Si todos lo tienen, se sortea entre todos para que la ruleta siempre de un resultado.
        const elegibles = [];
        ruleta.nombres.forEach(function (nombre, i) {
            if (!/\s$/.test(nombre)) elegibles.push(i);
        });
        const ganador = elegibles.length > 0 ? elegibles[numeroAlAzar(elegibles.length)] : numeroAlAzar(n);
        //Punto al azar dentro del trozo ganador (sin caer justo en la raya entre dos trozos).
        const destino = ganador * paso + paso * (0.15 + 0.7 * Math.random());
        //Con "Reducir movimiento" el giro es mas corto, pero se mantiene: es la gracia del juego.
        const sinMovimiento = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const duracion = sinMovimiento ? 1600 : 4200;
        const vueltas = sinMovimiento ? 2 : 6;

        //Girar en sentido horario lleva el punto "destino" de la rueda hasta el puntero de arriba.
        const desde = giroRuleta;
        giroRuleta = giroRuleta - (giroRuleta % 360) + vueltas * 360 + (360 - destino);
        const rueda = $("#ruletaRueda");
        const final = "rotate(" + giroRuleta + "deg)";
        //Se anima con la API de animaciones (element.animate): en iPhone (Safari) una transicion CSS a veces no
        //llegaba a girar, y la regla general de "Reducir movimiento" tambien la anulaba.
        rueda.style.transition = "none";
        if (rueda.animate) {
            const animacion = rueda.animate(
                [{ transform: "rotate(" + desde + "deg)" }, { transform: final }],
                { duration: duracion, easing: "cubic-bezier(0.12, 0.8, 0.18, 1)", fill: "forwards" }
            );
            animacion.onfinish = function () {
                rueda.style.transform = final;
                animacion.cancel();
            };
        } else {
            rueda.style.transform = final;
        }

        ruletaGirando = true;
        $("#ruletaGirar").disabled = true;
        $("#ruletaResultado").innerHTML = "";

        setTimeout(function () {
            ruletaGirando = false;
            $("#ruletaGirar").disabled = ruleta.nombres.length < 2;
            mostrarResultadoRuleta(ruleta.nombres[ganador]);
        }, duracion);
    }

    function mostrarResultadoRuleta(nombre) {
        if (navigator.vibrate) navigator.vibrate([80, 60, 160]);
        const reto = ruleta.reto.trim();
        //Primero el reto (suele ser una pregunta: "¿Quién paga la cena?") y debajo la respuesta.
        $("#ruletaResultado").innerHTML =
            (reto ? "<p class=\"ruleta-castigo\">" + escaparHtml(reto) + "</p>" : "") +
            "<p class=\"ruleta-ganador\">Le toca a <b>" + escaparHtml(nombre.trim()) + "</b></p>";
    }

    $("#ruletaForm").addEventListener("submit", function (e) {
        e.preventDefault();
        const campo = $("#ruletaNombre");
        //Se limpian los espacios, pero si el nombre terminaba en espacio se conserva uno (el truco secreto).
        const limpio = campo.value.replace(/\s+/g, " ").trim();
        const nombre = limpio && /\s$/.test(campo.value) ? limpio + " " : limpio;
        if (!nombre || ruleta.nombres.length >= MAX_JUGADORES || ruletaGirando) return;
        ruleta.nombres.push(nombre);
        guardarRuleta();
        campo.value = "";
        pintarJugadores();
        if (!campo.disabled) campo.focus();
    });

    $("#ruletaJugadores").addEventListener("click", function (e) {
        const boton = e.target.closest("[data-quitar-jugador]");
        if (!boton || ruletaGirando) return;
        ruleta.nombres.splice(parseInt(boton.dataset.quitarJugador, 10), 1);
        guardarRuleta();
        $("#ruletaResultado").innerHTML = "";
        pintarJugadores();
    });

    $("#ruletaReto").addEventListener("input", function () {
        ruleta.reto = this.value;
        guardarRuleta();
        pintarSugerencias();
    });

    $("#ruletaSugerencias").addEventListener("click", function (e) {
        const boton = e.target.closest("[data-reto]");
        if (!boton) return;
        ruleta.reto = boton.dataset.reto;
        $("#ruletaReto").value = ruleta.reto;
        guardarRuleta();
        pintarSugerencias();
    });

    $("#ruletaGirar").addEventListener("click", girarRuleta);
    //Tocar la propia rueda tambien la gira (girarRuleta ya no hace nada si esta girando o hay menos de 2 nombres).
    $(".ruleta").addEventListener("click", girarRuleta);

    $("#ruletaReto").value = ruleta.reto;
    pintarSugerencias();
    pintarJugadores();

    // ------------------------------------------------------------------ SONIDOS DE LOS JUEGOS

    //Pitidos generados por el navegador (sin archivos de audio). El contexto se crea en el primer toque.
    let contextoAudio = null;
    function pitido(frecuencia, duracion) {
        try {
            const Contexto = window.AudioContext || window.webkitAudioContext;
            if (!Contexto) return;
            contextoAudio = contextoAudio || new Contexto();
            const t = contextoAudio.currentTime;
            const oscilador = contextoAudio.createOscillator();
            const volumen = contextoAudio.createGain();
            oscilador.type = "triangle";
            oscilador.frequency.value = frecuencia;
            volumen.gain.setValueAtTime(0.2, t);
            volumen.gain.exponentialRampToValueAtTime(0.001, t + duracion);
            oscilador.connect(volumen);
            volumen.connect(contextoAudio.destination);
            oscilador.start(t);
            oscilador.stop(t + duracion);
        } catch (e) { }
    }

    function vibrar(patron) {
        if (navigator.vibrate) navigator.vibrate(patron);
    }

    //Mezcla una lista al azar (Fisher-Yates con el generador criptografico).
    function barajar(lista) {
        for (let i = lista.length - 1; i > 0; i--) {
            const j = numeroAlAzar(i + 1);
            const tmp = lista[i];
            lista[i] = lista[j];
            lista[j] = tmp;
        }
        return lista;
    }

    // ------------------------------------------------------------------ DUELO DE REFLEJOS

    //Gana el duelo el primero que llega a 3 rondas ganadas (al mejor de 5); en cuanto llega, se acaba.
    //Estados: "espera" (no tocar), "ya" (rojo: gana el primero), "fin" (resultado), "listo" (toca para seguir).
    //"rondas" es el marcador del duelo en curso; "puntos", los duelos ganados (el marcador de la pantalla).
    const RONDAS_PARA_GANAR = 3;
    const GRACIA_DUELO = 800;
    const duelo = { puntos: [0, 0], rondas: [0, 0], estado: "parado", temporizador: null, inicio: 0, graciaHasta: 0 };
    const arena = $("#arena");
    const ladosArena = $$(".arena-lado");
    const formatoSegundos = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

    function textoLado(n, html) {
        ladosArena[n - 1].querySelector(".arena-texto").innerHTML = html;
    }

    function pintarMarcadorDuelo() {
        $("#dueloPuntos1").textContent = duelo.puntos[0];
        $("#dueloPuntos2").textContent = duelo.puntos[1];
    }

    //Rondas del duelo en curso vistas por cada jugador: "Vas 1 – 0".
    function marcadorDesde(n) {
        const mios = duelo.rondas[n - 1];
        const suyos = duelo.rondas[n === 1 ? 1 : 0];
        return "<small class=\"arena-marcador\">Vas " + mios + " – " + suyos + "</small>";
    }

    function dueloTerminado() {
        return duelo.rondas[0] >= RONDAS_PARA_GANAR || duelo.rondas[1] >= RONDAS_PARA_GANAR;
    }

    function nuevaRondaDuelo() {
        clearTimeout(duelo.temporizador);
        //Si el duelo anterior ya se decidio, esta ronda abre la revancha desde 0 – 0.
        if (dueloTerminado()) duelo.rondas = [0, 0];
        const ronda = duelo.rondas[0] + duelo.rondas[1] + 1;
        duelo.estado = "espera";
        //Para seguir suelen tocar los dos: el toque del segundo (un instante despues) no cuenta como adelantarse.
        duelo.graciaHasta = performance.now() + GRACIA_DUELO;
        arena.dataset.estado = "espera";
        ladosArena.forEach(function (l) { l.classList.remove("gana", "pierde"); });
        const cabecera = "<small class=\"arena-ronda\">Ronda " + ronda + " · gana quien llegue a " + RONDAS_PARA_GANAR + "</small>";
        textoLado(1, "Espera…" + cabecera + marcadorDesde(1));
        textoLado(2, "Espera…" + cabecera + marcadorDesde(2));
        //Entre 1,5 y 5 segundos al azar para que nadie pueda adivinar el momento.
        duelo.temporizador = setTimeout(function () {
            duelo.estado = "ya";
            duelo.inicio = performance.now();
            arena.dataset.estado = "ya";
            textoLado(1, "¡TOCA!");
            textoLado(2, "¡TOCA!");
            pitido(880, 0.15);
            vibrar(60);
        }, 1500 + numeroAlAzar(3500));
    }

    function terminarRondaDuelo(ganador, adelantado) {
        clearTimeout(duelo.temporizador);
        const tiempo = (performance.now() - duelo.inicio) / 1000;
        const perdedor = ganador === 1 ? 2 : 1;
        duelo.estado = "fin";
        arena.dataset.estado = "fin";
        duelo.rondas[ganador - 1]++;
        const final = dueloTerminado();
        if (final) {
            duelo.puntos[ganador - 1]++;
            pintarMarcadorDuelo();
        }
        ladosArena[ganador - 1].classList.add("gana");
        ladosArena[perdedor - 1].classList.add("pierde");

        //Titulares: la ronda o, si se decide el duelo, el duelo entero.
        const tituloGanador = final ? "¡Ganas el duelo!" : "¡Ganas la ronda!";
        const tituloPerdedor = final ? "Pierdes el duelo" : (adelantado ? "¡Te has adelantado!" : "Pierdes la ronda");
        const detalle = adelantado ? "<small>El otro se ha adelantado</small>" : "<small>" + formatoSegundos.format(tiempo) + " s</small>";
        textoLado(ganador, tituloGanador + detalle + marcadorDesde(ganador));
        textoLado(perdedor, tituloPerdedor + (final && adelantado ? "<small>Te has adelantado</small>" : "") + marcadorDesde(perdedor));

        if (final) {
            [523, 659, 784].forEach(function (f, i) { setTimeout(function () { pitido(f, 0.2); }, i * 140); });
            vibrar([80, 50, 80, 50, 200]);
        } else {
            pitido(adelantado ? 220 : 660, 0.3);
            vibrar([80, 50, 80]);
        }
        //Duelo decidido: se ensena el resultado un momento y se vuelve solo a la pantalla del juego.
        if (final) {
            const quien = ganador === 1 ? "el jugador de arriba" : "el jugador de abajo";
            $("#dueloUltimo").textContent = "Último duelo: ganó " + quien + " " + duelo.rondas[ganador - 1] + " – " + duelo.rondas[perdedor - 1];
            duelo.temporizador = setTimeout(function () { arena.close(); }, 2500);
            return;
        }
        //Pausa corta antes de seguir (asi un toque tardio no empieza la siguiente ronda sin querer).
        duelo.temporizador = setTimeout(function () {
            duelo.estado = "listo";
            ladosArena.forEach(function (l) {
                l.querySelector(".arena-texto").insertAdjacentHTML("beforeend", "<small class=\"arena-otra\">Toca para la siguiente ronda</small>");
            });
        }, 1200);
    }

    ladosArena.forEach(function (lado) {
        //pointerdown responde al instante (sin esperar al "click") y admite los dos dedos a la vez.
        lado.addEventListener("pointerdown", function (e) {
            e.preventDefault();
            const n = parseInt(lado.dataset.lado, 10);
            if (duelo.estado === "espera") {
                if (performance.now() < duelo.graciaHasta) return;
                terminarRondaDuelo(n === 1 ? 2 : 1, true);
            }
            else if (duelo.estado === "ya") terminarRondaDuelo(n, false);
            else if (duelo.estado === "listo") nuevaRondaDuelo();
        });
    });

    //Cada vez que se entra en la arena empieza un duelo nuevo desde 0 – 0.
    $("#dueloEmpezar").addEventListener("click", function () {
        duelo.rondas = [0, 0];
        abrirVentana(arena);
        nuevaRondaDuelo();
    });

    $("#arenaCerrar").addEventListener("click", function () { arena.close(); });

    arena.addEventListener("close", function () {
        clearTimeout(duelo.temporizador);
        duelo.estado = "parado";
    });

    $("#dueloReiniciar").addEventListener("click", function () {
        duelo.puntos = [0, 0];
        duelo.rondas = [0, 0];
        pintarMarcadorDuelo();
        $("#dueloUltimo").textContent = "";
    });

    // ------------------------------------------------------------------ PIEDRA, PAPEL O TIJERA

    //Dos jugadores con un solo movil, por turnos: primero elige el jugador 1 (sin que se vea que eligio),
    //luego el jugador 2 y entonces se cuenta "Piedra… Papel… ¡Tijera!" y se ensenan las dos manos.
    //Fases: "j1" (elige el 1), "j2" (elige el 2), "cuenta" (animacion) y "fin" (resultado, boton "Otra ronda").
    const MANOS = { piedra: "✊", papel: "✋", tijera: "✌️" };
    const GANA_A = { piedra: "tijera", papel: "piedra", tijera: "papel" };
    const jkp = { puntos: [0, 0], rondas: 0, fase: "j1", eleccion1: null };

    //Marcador y rondas jugadas (los empates tambien cuentan como ronda).
    function pintarMarcadorJkp() {
        $("#jkpPuntos1").textContent = jkp.puntos[0];
        $("#jkpPuntos2").textContent = jkp.puntos[1];
        $("#jkpRondas").textContent = jkp.rondas;
    }

    //Texto del turno, botones activos y el jugador al que le toca resaltado.
    function pintarTurnoJkp() {
        const turno = $("#jkpTurno");
        if (jkp.fase === "j1") {
            turno.className = "jkp-turno";
            turno.innerHTML = "Turno del <b>Jugador 1</b>: elige sin que mire el otro";
        } else if (jkp.fase === "j2") {
            turno.className = "jkp-turno";
            turno.innerHTML = "Jugador 1 ya ha elegido. Pasa el móvil: turno del <b>Jugador 2</b>";
        }
        const eligiendo = jkp.fase === "j1" || jkp.fase === "j2";
        $$(".jkp-opcion").forEach(function (b) { b.disabled = !eligiendo; });
        $("#jkpOpciones").hidden = jkp.fase === "fin";
        $("#jkpOtra").hidden = jkp.fase !== "fin";
        $("#jkpLado1").classList.toggle("activo", jkp.fase === "j1");
        $("#jkpLado2").classList.toggle("activo", jkp.fase === "j2");
    }

    function nuevaRondaJkp() {
        jkp.fase = "j1";
        jkp.eleccion1 = null;
        $("#jkpMano1").textContent = MANOS.piedra;
        $("#jkpMano2").textContent = MANOS.piedra;
        $("#jkpTexto").textContent = "VS";
        $("#jkpLado1").classList.remove("ganador");
        $("#jkpLado2").classList.remove("ganador");
        pintarTurnoJkp();
    }

    function jugarJkp(eleccion1, eleccion2) {
        jkp.fase = "cuenta";
        pintarTurnoJkp();
        const mano1 = $("#jkpMano1");
        const mano2 = $("#jkpMano2");
        const texto = $("#jkpTexto");
        const turno = $("#jkpTurno");
        turno.textContent = "";
        [mano1, mano2].forEach(function (m) {
            m.textContent = MANOS.piedra;
            m.classList.remove("agitar");
            void m.offsetWidth;
            m.classList.add("agitar");
        });

        //"Piedra… Papel… ¡Tijera!" con un pitido en cada palabra; en "¡Tijera!" se ensenan las manos.
        const pasos = [["Piedra", 523], ["Papel", 587], ["¡Tijera!", 784]];
        pasos.forEach(function (paso, i) {
            setTimeout(function () {
                texto.textContent = paso[0];
                pitido(paso[1], i === 2 ? 0.25 : 0.12);
                if (i < 2) return;

                mano1.textContent = MANOS[eleccion1];
                mano2.textContent = MANOS[eleccion2];
                jkp.rondas++;
                turno.className = "jkp-turno jkp-resultado";
                if (eleccion1 === eleccion2) {
                    turno.textContent = "Empate";
                } else {
                    const ganador = GANA_A[eleccion1] === eleccion2 ? 1 : 2;
                    jkp.puntos[ganador - 1]++;
                    turno.textContent = "Gana el Jugador " + ganador;
                    $("#jkpLado" + ganador).classList.add("ganador");
                    vibrar([60, 40, 60]);
                }
                pintarMarcadorJkp();
                jkp.fase = "fin";
                pintarTurnoJkp();
            }, i * 450);
        });
    }

    $$(".jkp-opcion").forEach(function (boton) {
        boton.addEventListener("click", function () {
            if (jkp.fase === "j1") {
                //La eleccion del jugador 1 no se marca en pantalla, para que el jugador 2 no la vea.
                jkp.eleccion1 = boton.dataset.mano;
                jkp.fase = "j2";
                pitido(440, 0.08);
                vibrar(30);
                pintarTurnoJkp();
            } else if (jkp.fase === "j2") {
                jugarJkp(jkp.eleccion1, boton.dataset.mano);
            }
        });
    });

    $("#jkpOtra").addEventListener("click", nuevaRondaJkp);

    $("#jkpReiniciar").addEventListener("click", function () {
        jkp.puntos = [0, 0];
        jkp.rondas = 0;
        pintarMarcadorJkp();
        nuevaRondaJkp();
    });

    nuevaRondaJkp();

    // ------------------------------------------------------------------ ADIVINA EL PLATO

    //Preguntas sin fin: unas veces el nombre (¿que numero tiene?) y otras el numero (¿que plato es?).
    //Se cuentan aciertos, fallos y la racha de aciertos seguidos; la mejor racha se guarda como record.
    const CLAVE_ADIVINA = "rachaAdivinaNakoya";
    const SIN_REPETIR = 10; //No vuelven a salir los platos de las ultimas 10 preguntas.
    const adivina = { pregunta: null, recientes: [], aciertos: 0, fallos: 0, racha: 0, respondida: false };

    function recordAdivina() {
        const guardado = parseInt(leerStorage(CLAVE_ADIVINA), 10);
        return guardado > 0 ? guardado : 0;
    }

    //Opciones falsas: para "¿que numero tiene?" se eligen numeros cercanos, que es mas dificil.
    function crearPregunta(plato) {
        const tipo = numeroAlAzar(2) === 0 ? "numero" : "nombre";
        let candidatos = platos.filter(function (p) { return p.codigo !== plato.codigo; });
        if (tipo === "numero") {
            candidatos.sort(function (a, b) {
                return Math.abs(numeroPlato(a.codigo) - numeroPlato(plato.codigo)) - Math.abs(numeroPlato(b.codigo) - numeroPlato(plato.codigo));
            });
            candidatos = candidatos.slice(0, 10);
        }
        const falsas = barajar(candidatos).slice(0, 3);
        return { plato: plato, tipo: tipo, opciones: barajar([plato].concat(falsas)) };
    }

    //Siguiente pregunta: un plato al azar que no haya salido en las ultimas preguntas.
    function siguientePreguntaAdivina() {
        const posibles = platos.filter(function (p) { return !adivina.recientes.includes(p.codigo); });
        const plato = posibles[numeroAlAzar(posibles.length)];
        adivina.recientes.push(plato.codigo);
        if (adivina.recientes.length > SIN_REPETIR) adivina.recientes.shift();
        adivina.pregunta = crearPregunta(plato);
        pintarPreguntaAdivina();
    }

    function pintarCabeceraAdivina() {
        $("#adivinaProgreso").innerHTML = "Aciertos <b>" + adivina.aciertos + "</b> · Fallos <b>" + adivina.fallos + "</b>";
        $("#adivinaAciertos").innerHTML = "Racha <b>" + adivina.racha + "</b> · Récord <b>" + recordAdivina() + "</b>";
    }

    function pintarPreguntaAdivina() {
        const pregunta = adivina.pregunta;
        adivina.respondida = false;
        pintarCabeceraAdivina();
        const enunciado = pregunta.tipo === "numero"
            ? "¿Qué número tiene <b>«" + escaparHtml(pregunta.plato.nombre) + "»</b>?"
            : "¿Qué plato es el <b class=\"num\">" + pregunta.plato.codigo + "</b>?";
        $("#adivinaJuego").innerHTML = "<p class=\"adivina-pregunta\">" + enunciado + "</p>" +
            "<div class=\"adivina-opciones\">" + pregunta.opciones.map(function (p) {
                return "<button type=\"button\" class=\"adivina-opcion" + (pregunta.tipo === "numero" ? " num" : "") + "\" data-opcion=\"" + p.codigo + "\">" +
                    (pregunta.tipo === "numero" ? p.codigo : escaparHtml(p.nombre)) + "</button>";
            }).join("") + "</div>" +
            "<div class=\"adivina-pie\" id=\"adivinaPie\"></div>";
    }

    function responderAdivina(codigo) {
        if (adivina.respondida) return;
        adivina.respondida = true;
        const pregunta = adivina.pregunta;
        const acierto = codigo === pregunta.plato.codigo;
        let nuevoRecord = false;
        if (acierto) {
            adivina.aciertos++;
            adivina.racha++;
            if (adivina.racha > recordAdivina()) {
                escribirStorage(CLAVE_ADIVINA, adivina.racha);
                nuevoRecord = adivina.racha > 1;
            }
        } else {
            adivina.fallos++;
            adivina.racha = 0;
        }
        pitido(acierto ? 784 : 220, 0.2);
        vibrar(acierto ? (nuevoRecord ? [60, 40, 60] : 30) : 80);

        $$("#adivinaJuego .adivina-opcion").forEach(function (b) {
            b.disabled = true;
            if (b.dataset.opcion === pregunta.plato.codigo) b.classList.add("correcta");
            else if (b.dataset.opcion === codigo) b.classList.add("fallo");
        });
        pintarCabeceraAdivina();

        const nombre = pregunta.plato.nombre;
        $("#adivinaPie").innerHTML =
            (nuevoRecord ? "<p class=\"adivina-record\">¡Nuevo récord: " + adivina.racha + " seguidos!</p>" : "") +
            "<p class=\"adivina-solucion\">" + (acierto ? "¡Correcto! " : "Era ") + "<b class=\"num\">" + pregunta.plato.codigo + "</b> · " + escaparHtml(nombre) + "</p>" +
            "<a class=\"accion-texto\" href=\"https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(nombre.replace(/"/g, "")) + "\" target=\"_blank\" rel=\"noopener\">Ver fotos del plato</a>" +
            "<button type=\"button\" class=\"btn btn-principal juego-boton\" data-adivina=\"siguiente\">Siguiente</button>";
    }

    $("#adivinaJuego").addEventListener("click", function (e) {
        const opcion = e.target.closest("[data-opcion]");
        if (opcion) {
            responderAdivina(opcion.dataset.opcion);
            return;
        }
        if (e.target.closest("[data-adivina=\"siguiente\"]")) siguientePreguntaAdivina();
    });

    //"Empezar de cero": contadores a 0 (el record de racha se conserva).
    $("#adivinaReiniciar").addEventListener("click", function () {
        adivina.aciertos = 0;
        adivina.fallos = 0;
        adivina.racha = 0;
        siguientePreguntaAdivina();
    });

    siguientePreguntaAdivina();

    // ------------------------------------------------------------------ PLATO SORPRESA

    const sorpresa = { actual: null, animando: false };

    //Platos que se pueden sortear: los que se sirven ahora (aunque ya esten en el pedido).
    function platosSorteables(excluir) {
        return platos.filter(function (p) {
            return disponible(p) && !(excluir || []).includes(p.codigo);
        });
    }

    function htmlPlatoSorpresa(p) {
        return "<span class=\"sorpresa-codigo num\" translate=\"no\">" + p.codigo + "</span>" +
            "<span class=\"sorpresa-nombre\">" + nombreConEmojis(p) + "</span>";
    }

    function pintarBotonSorpresa() {
        const boton = $("#sorpresaAnadir");
        const dentro = sorpresa.actual && enPedido(sorpresa.actual.codigo);
        boton.disabled = !sorpresa.actual || dentro || sorpresa.animando;
        boton.innerHTML = dentro
            ? "<i class=\"bi bi-check-lg\" aria-hidden=\"true\"></i>Añadido"
            : "<i class=\"bi bi-plus-lg\" aria-hidden=\"true\"></i>Añadir al pedido";
    }

    //Sin plato (al entrar en la pantalla): una incognita hasta que se pulse "Sortear plato".
    function pintarPlatoSorpresa() {
        const caja = $("#sorpresaPlato");
        $("#sorpresaOtro").innerHTML = "<i class=\"bi bi-shuffle\" aria-hidden=\"true\"></i>" + (sorpresa.actual ? "Otro plato" : "Sortear plato");
        if (!sorpresa.actual) {
            caja.innerHTML = "<span class=\"sorpresa-codigo sorpresa-incognita\" aria-hidden=\"true\">?</span>" +
                "<span class=\"sorpresa-nombre sorpresa-pista\">¿Qué te toca hoy?</span>";
        } else {
            caja.innerHTML = htmlPlatoSorpresa(sorpresa.actual) +
                "<a class=\"accion-texto\" href=\"https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(sorpresa.actual.nombre.replace(/"/g, "")) +
                "\" target=\"_blank\" rel=\"noopener\">Ver fotos del plato</a>";
        }
        pintarBotonSorpresa();
    }

    //Sortea un plato. Con animacion, los nombres pasan rapido unas decimas antes de pararse.
    function sortearPlato(animar) {
        const candidatos = platosSorteables(sorpresa.actual ? [sorpresa.actual.codigo] : []);
        const lista = candidatos.length ? candidatos : platosSorteables();
        if (lista.length === 0) {
            sorpresa.actual = null;
            pintarPlatoSorpresa();
            return;
        }
        const elegido = lista[numeroAlAzar(lista.length)];
        //El paso de nombres es parte del juego: se hace tambien con "Reducir movimiento".
        if (!animar || sorpresa.animando) {
            sorpresa.actual = elegido;
            pintarPlatoSorpresa();
            return;
        }
        sorpresa.animando = true;
        pintarBotonSorpresa();
        const caja = $("#sorpresaPlato");
        caja.classList.add("barajando");
        let pasos = 0;
        //Mientras pasan los nombres, un toque de vibracion corto en cada uno (como una tragaperras)
        //y al pararse, una vibracion mas larga.
        const intervalo = setInterval(function () {
            caja.innerHTML = htmlPlatoSorpresa(lista[numeroAlAzar(lista.length)]);
            vibrar(15);
            if (++pasos >= 12) {
                clearInterval(intervalo);
                caja.classList.remove("barajando");
                sorpresa.animando = false;
                sorpresa.actual = elegido;
                pintarPlatoSorpresa();
                pitido(660, 0.15);
                vibrar([40, 30, 90]);
            }
        }, 70);
    }

    $("#sorpresaOtro").addEventListener("click", function () { sortearPlato(true); });

    $("#sorpresaAnadir").addEventListener("click", function () {
        if (!sorpresa.actual || enPedido(sorpresa.actual.codigo)) return;
        pedido.push({ codigo: sorpresa.actual.codigo, cantidad: 1 });
        guardarYPintarPedido(sorpresa.actual.codigo);
        avisar(sorpresa.actual.codigo + " añadido al pedido");
        pintarBotonSorpresa();
    });

    // ------------------------------------------------------------------ EL DEDO ELEGIDO

    //Cada dedo en la pantalla es un circulo. Con 2 o mas dedos quietos (sin poner ni quitar ninguno)
    //durante 3 segundos, se elige uno al azar. Al levantar todos los dedos se puede repetir.
    const ESPERA_DEDOS = 3000;
    const COLORES_DEDO = ["#ffffff", "#e5a93b", "#7ee2a8", "#7cb4ff", "#d58cff", "#ff8b80"];
    const dedos = { toques: new Map(), estado: "esperando", temporizador: null, colores: 0 };
    const capaDedos = $("#dedos");

    function textoDedos() {
        const n = dedos.toques.size;
        const texto = $("#dedosTexto");
        if (dedos.estado === "elegido") texto.textContent = "¡Elegido! Levantad los dedos para repetir";
        else if (n === 0) texto.textContent = "Poned un dedo cada uno";
        else if (n === 1) texto.textContent = "Falta al menos otro dedo";
        else texto.textContent = "¡Quietos!…";
    }

    //Cada vez que entra o sale un dedo, la cuenta de 3 segundos vuelve a empezar.
    function programarEleccionDedo() {
        clearTimeout(dedos.temporizador);
        capaDedos.classList.remove("contando");
        if (dedos.estado !== "esperando" || dedos.toques.size < 2) return;
        void capaDedos.offsetWidth;
        capaDedos.classList.add("contando");
        dedos.temporizador = setTimeout(elegirDedo, ESPERA_DEDOS);
    }

    function elegirDedo() {
        const ids = Array.from(dedos.toques.keys());
        const elegido = ids[numeroAlAzar(ids.length)];
        dedos.estado = "elegido";
        capaDedos.classList.remove("contando");
        dedos.toques.forEach(function (toque, id) {
            toque.el.classList.add(id === elegido ? "elegido" : "descartado");
        });
        pitido(784, 0.3);
        vibrar([100, 50, 200]);
        textoDedos();
    }

    function colocarDedo(el, e) {
        el.style.left = e.clientX + "px";
        el.style.top = e.clientY + "px";
    }

    function reiniciarDedos() {
        clearTimeout(dedos.temporizador);
        dedos.toques.forEach(function (toque) { toque.el.remove(); });
        dedos.toques.clear();
        dedos.estado = "esperando";
        dedos.colores = 0;
        capaDedos.classList.remove("contando");
        textoDedos();
    }

    capaDedos.addEventListener("pointerdown", function (e) {
        if (e.target.closest(".arena-cerrar")) return;
        e.preventDefault();
        if (dedos.estado === "elegido") return;
        const el = document.createElement("span");
        el.className = "dedo anima-juego";
        el.style.setProperty("--color", COLORES_DEDO[dedos.colores++ % COLORES_DEDO.length]);
        colocarDedo(el, e);
        capaDedos.appendChild(el);
        dedos.toques.set(e.pointerId, { el: el });
        vibrar(20);
        textoDedos();
        programarEleccionDedo();
    });

    capaDedos.addEventListener("pointermove", function (e) {
        const toque = dedos.toques.get(e.pointerId);
        if (toque) colocarDedo(toque.el, e);
    });

    function soltarDedo(e) {
        const toque = dedos.toques.get(e.pointerId);
        if (!toque) return;
        toque.el.remove();
        dedos.toques.delete(e.pointerId);
        if (dedos.estado === "elegido") {
            if (dedos.toques.size === 0) reiniciarDedos();
            return;
        }
        textoDedos();
        programarEleccionDedo();
    }
    capaDedos.addEventListener("pointerup", soltarDedo);
    capaDedos.addEventListener("pointercancel", soltarDedo);

    $("#dedoEmpezar").addEventListener("click", function () {
        reiniciarDedos();
        abrirVentana(capaDedos);
    });
    $("#dedosCerrar").addEventListener("click", function () { capaDedos.close(); });
    capaDedos.addEventListener("close", reiniciarDedos);

    // ------------------------------------------------------------------ CARA O CRUZ

    //La moneda sube, gira sobre si misma y cae en cara (N de Nakoya) o cruz.
    const moneda = { caras: 0, cruces: 0, giro: 0, lanzando: false };

    function pintarMarcadorMoneda() {
        $("#monedaCaras").textContent = moneda.caras;
        $("#monedaCruces").textContent = moneda.cruces;
    }

    $("#monedaLanzar").addEventListener("click", function () {
        if (moneda.lanzando) return;
        moneda.lanzando = true;
        const cara = numeroAlAzar(2) === 0;
        const sinMovimiento = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        //Con "Reducir movimiento" el lanzamiento es mas corto, pero se ve girar (es la gracia del juego).
        const duracion = sinMovimiento ? 900 : 1400;
        const vueltas = sinMovimiento ? 3 : 6;
        const pieza = $("#moneda");
        const vuelo = $("#monedaVuelo");

        moneda.giro = moneda.giro - (moneda.giro % 360) + vueltas * 360 + (cara ? 0 : 180);
        pieza.style.transition = "transform " + duracion + "ms cubic-bezier(0.25, 0.6, 0.35, 1)";
        pieza.style.transform = "rotateX(" + moneda.giro + "deg)";
        vuelo.style.animationDuration = duracion + "ms";
        vuelo.classList.remove("lanzando");
        void vuelo.offsetWidth;
        vuelo.classList.add("lanzando");
        $("#monedaResultado").textContent = "";
        $("#monedaLanzar").disabled = true;
        pitido(523, 0.08);

        setTimeout(function () {
            if (cara) moneda.caras++;
            else moneda.cruces++;
            pintarMarcadorMoneda();
            $("#monedaResultado").textContent = cara ? "¡Cara!" : "¡Cruz!";
            pitido(cara ? 784 : 659, 0.2);
            vibrar(60);
            moneda.lanzando = false;
            $("#monedaLanzar").disabled = false;
        }, duracion);
    });

    //Tocar la propia moneda tambien la lanza (igual que el boton; mientras esta en el aire no hace nada).
    $(".moneda-escena").addEventListener("click", function () {
        $("#monedaLanzar").click();
    });

    $("#monedaReiniciar").addEventListener("click", function () {
        moneda.caras = 0;
        moneda.cruces = 0;
        pintarMarcadorMoneda();
        $("#monedaResultado").textContent = "";
    });

    // ------------------------------------------------------------------ GALLETITA DE LA SUERTE

    //Hay que darle unos cuantos toques (entre 5 y 8, al azar) para romperla; luego sale el papelito.
    const FRASES_GALLETA = [
        "La paciencia es amarga, pero su fruto es dulce.",
        "Un viaje de mil millas comienza con un solo paso.",
        "La suerte favorece a los valientes.",
        "Pronto recibirás una buena noticia.",
        "Alguien piensa en ti más de lo que imaginas.",
        "Lo mejor está por llegar.",
        "Tu sonrisa es tu mejor carta de presentación.",
        "Una oportunidad inesperada llamará a tu puerta.",
        "El que no arriesga, no gana.",
        "Hoy es un buen día para empezar algo nuevo.",
        "Tus esfuerzos pronto darán fruto.",
        "La felicidad no es un destino, es el camino.",
        "Confía en tu intuición: rara vez se equivoca.",
        "Un amigo fiel es un tesoro.",
        "Las grandes cosas empiezan siendo pequeñas.",
        "Tu generosidad será recompensada.",
        "Cae siete veces, levántate ocho.",
        "El bambú que se dobla es más fuerte que el roble que resiste.",
        "Aprende de ayer, vive el hoy y sueña con el mañana.",
        "El sabio no lo dice todo, pero todo lo que dice es sabio.",
        "Tu próximo gran éxito está más cerca de lo que crees.",
        "Pronto harás un viaje que recordarás siempre.",
        "Grandes cambios se acercan a tu vida.",
        "Tu talento será reconocido muy pronto.",
        "Una sorpresa agradable te espera esta semana.",
        "Hoy la suerte se sienta a tu mesa.",
        "Pide otra ronda: la fortuna sonríe a los hambrientos.",
        "Quien pide makis de atún picante nunca pide en vano.",
        "Esta noche no te quedarás con hambre.",
        "Un plato más nunca hizo daño a nadie.",
        "El postre te está esperando.",
        "Hoy no pagas tú… o eso dice la galleta.",
        "Lo que buscas está en la carta: solo tienes que pedirlo.",
        "El dinero va y viene, pero el sushi se come ahora.",
        "Serás feliz y comerás perdices… o makis.",
        "¡Socorro, estoy atrapado en una fábrica de galletas de la suerte!",
        "Esta galleta no tiene fortuna. Prueba con otra.",
        "Ignora la galleta anterior."
    ];

    const galleta = { toques: 0, necesarios: 6, rota: false, recientes: [] };
    const galletaBoton = $("#galleta");
    const galletaGrieta = $("#galletaGrieta");
    let largoGrieta = 140;
    try { largoGrieta = galletaGrieta.getTotalLength(); } catch (e) { /* se queda la medida aproximada */ }

    function pintarGrieta() {
        //La grieta se dibuja poco a poco: el primer toque no agrieta, el ultimo la deja casi entera.
        const avance = Math.max(0, galleta.toques) / galleta.necesarios;
        galletaGrieta.style.strokeDasharray = largoGrieta;
        galletaGrieta.style.strokeDashoffset = largoGrieta * (1 - avance);
    }

    function reiniciarGalleta() {
        galleta.toques = 0;
        galleta.necesarios = 5 + numeroAlAzar(4);
        galleta.rota = false;
        galletaBoton.classList.remove("rota", "golpe");
        galletaBoton.hidden = false;
        galletaBoton.disabled = false;
        $("#galletaPapel").hidden = true;
        $("#galletaOtra").hidden = true;
        $("#galletaPista").textContent = "Toca la galletita varias veces para romperla.";
        pintarGrieta();
    }

    function soltarMigas(x, y) {
        const escena = $("#galletaEscena");
        for (let i = 0; i < 4; i++) {
            const miga = document.createElement("span");
            miga.className = "miga anima-juego";
            miga.style.left = (x - 3) + "px";
            miga.style.top = (y - 3) + "px";
            escena.appendChild(miga);
            const angulo = Math.random() * Math.PI * 2;
            const distancia = 26 + Math.random() * 30;
            const animacion = miga.animate([
                { transform: "translate(0, 0) rotate(0)", opacity: 1 },
                { transform: "translate(" + Math.cos(angulo) * distancia + "px, " + (Math.sin(angulo) * distancia + 30) + "px) rotate(" + (Math.random() * 360) + "deg)", opacity: 0 }
            ], { duration: 520, easing: "cubic-bezier(0.2, 0.6, 0.4, 1)" });
            animacion.onfinish = function () { miga.remove(); };
        }
    }

    function romperGalleta() {
        galleta.rota = true;
        galletaBoton.classList.add("rota");
        galletaBoton.disabled = true;

        //Frase al azar sin repetir ninguna de las ultimas 10.
        const posibles = FRASES_GALLETA.filter(function (f) { return !galleta.recientes.includes(f); });
        const frase = posibles[numeroAlAzar(posibles.length)];
        galleta.recientes = galleta.recientes.concat(frase).slice(-10);

        $("#galletaFrase").textContent = frase;
        $("#galletaPista").textContent = "¡Crac! Esto es lo que te depara la suerte:";
        $("#galletaPapel").hidden = false;
        $("#galletaOtra").hidden = false;
        pitido(660, 0.1);
        setTimeout(function () { pitido(880, 0.25); }, 110);
        vibrar([30, 40, 90]);
        //Cuando las mitades ya no se ven, la galleta deja de ocupar sitio.
        setTimeout(function () { if (galleta.rota) galletaBoton.hidden = true; }, 650);
    }

    galletaBoton.addEventListener("click", function (e) {
        if (galleta.rota) return;
        galleta.toques++;
        //Miguitas donde se ha tocado (con teclado, desde el centro).
        const escena = $("#galletaEscena").getBoundingClientRect();
        const caja = galletaBoton.getBoundingClientRect();
        const x = e.clientX ? e.clientX - escena.left : caja.left - escena.left + caja.width / 2;
        const y = e.clientY ? e.clientY - escena.top : caja.top - escena.top + caja.height / 2;
        soltarMigas(x, y);

        if (galleta.toques >= galleta.necesarios) {
            pintarGrieta();
            romperGalleta();
            return;
        }
        pintarGrieta();
        galletaBoton.classList.remove("golpe");
        void galletaBoton.offsetWidth;
        galletaBoton.classList.add("golpe");
        pitido(180 + galleta.toques * 40, 0.05);
        vibrar(15);
        const queda = galleta.necesarios - galleta.toques;
        $("#galletaPista").textContent = queda <= 1 ? "¡Ya casi está!" : galleta.toques <= 2 ? "Cruje… ¡sigue!" : "¡Más fuerte!";
    });

    $("#galletaOtra").addEventListener("click", reiniciarGalleta);
    reiniciarGalleta();

    // ------------------------------------------------------------------ ATRAPA EL SUSHI

    //Caen piezas y hay que tocarlas antes de que lleguen abajo; cada una atrapada acelera el juego.
    // - Sushi normal: +1. Si se escapa, una vida menos.
    // - Bento dorado (de vez en cuando): +5.
    // - Bomba (desde 10 puntos): si se toca, una vida menos; si se deja caer, no pasa nada.
    //3 vidas; el record se guarda en el dispositivo. Durante la partida la pagina no hace scroll.
    const PIEZAS_SUSHI = ["\u{1F363}", "\u{1F364}", "\u{1F359}", "\u{1F95F}", "\u{1F365}"];
    const BENTO = "\u{1F371}";
    const BOMBA = "\u{1F4A3}";
    const EXPLOSION = "\u{1F4A5}";
    const CORAZON = "❤️";
    const CLAVE_ATRAPA = "recordAtrapaNakoya";
    const VIDAS_ATRAPA = 3;
    const PUNTOS_ACELERON = 150;
    const atrapa = {
        jugando: false, partida: 0, puntos: 0, vidas: VIDAS_ATRAPA, piezas: [],
        ultimo: 0, espera: 0, alto: 0, animacion: null, avisoAceleron: false
    };
    const zonaAtrapa = $("#atrapaZona");
    function recordAtrapa() {
        const guardado = parseInt(leerStorage(CLAVE_ATRAPA), 10);
        return guardado > 0 ? guardado : 0;
    }

    //Velocidad en "alturas de la zona por segundo" (igual de dificil en cualquier pantalla):
    //sube rapido hasta 50 puntos, luego muy poco y, a partir de 150, el triple de deprisa.
    function velocidadAtrapa(p) {
        let v = 0.28 + Math.min(p, 48) * 0.015;
        if (p > 48) v += (Math.min(p, PUNTOS_ACELERON) - 48) * 0.002;
        if (p > PUNTOS_ACELERON) v += (p - PUNTOS_ACELERON) * 0.006;
        return Math.min(v, 2.2);
    }

    //Milisegundos entre piezas: cada vez mas seguidas; a partir de 150, todavia mas.
    function intervaloAtrapa(p) {
        if (p <= PUNTOS_ACELERON) return Math.max(1100 - p * 28, 380);
        return Math.max(380 - (p - PUNTOS_ACELERON) * 1.5, 250);
    }

    function pintarAtrapa() {
        $("#atrapaPuntos").textContent = atrapa.puntos;
        $("#atrapaRecord").textContent = recordAtrapa();
        let corazones = "";
        for (let i = 0; i < VIDAS_ATRAPA; i++) {
            corazones += "<span class=\"" + (i < atrapa.vidas ? "vida" : "vida perdida") + "\">" + CORAZON + "</span>";
        }
        $("#atrapaVidas").innerHTML = corazones;
        $("#atrapaVidas").setAttribute("aria-label", atrapa.vidas + (atrapa.vidas === 1 ? " vida" : " vidas"));
    }

    function quitarPiezas() {
        atrapa.piezas.forEach(function (p) { p.el.remove(); });
        atrapa.piezas = [];
        $$("#atrapaZona .pieza, #atrapaZona .atrapa-flotante").forEach(function (el) { el.remove(); });
    }

    //Texto que salta donde se toca ("+1", "+5", "-❤️") o en el centro ("¡Más rápido!").
    function textoFlotante(texto, x, y, clase) {
        const el = document.createElement("span");
        el.className = "atrapa-flotante anima-juego" + (clase ? " " + clase : "");
        el.textContent = texto;
        //Sin salirse de la zona: cerca del borde de arriba o de los lados quedaria cortado.
        el.style.left = Math.min(Math.max(x, 40), zonaAtrapa.clientWidth - 40) + "px";
        el.style.top = Math.max(y, 30) + "px";
        zonaAtrapa.appendChild(el);
        setTimeout(function () { el.remove(); }, 1200);
    }

    function crearPieza() {
        const p = atrapa.puntos;
        const azar = numeroAlAzar(100);
        const probBomba = p < 10 ? 0 : (p > PUNTOS_ACELERON ? 20 : 14);
        let tipo = "sushi";
        if (azar < probBomba) tipo = "bomba";
        else if (azar < probBomba + 5) tipo = "bento";

        const el = document.createElement("span");
        el.className = "pieza anima-juego pieza-" + tipo;
        el.textContent = tipo === "bomba" ? BOMBA : (tipo === "bento" ? BENTO : PIEZAS_SUSHI[numeroAlAzar(PIEZAS_SUSHI.length)]);
        el.style.left = numeroAlAzar(Math.max(1, zonaAtrapa.clientWidth - 52)) + "px";
        el.style.transform = "translate3d(0, -52px, 0)";
        zonaAtrapa.appendChild(el);
        atrapa.piezas.push({ el: el, y: -52, tipo: tipo });
    }

    function destelloAtrapa() {
        if (zonaAtrapa.animate) {
            zonaAtrapa.animate([{ boxShadow: "inset 0 0 0 4px #e23b2e" }, { boxShadow: "inset 0 0 0 4px transparent" }], { duration: 350 });
        }
    }

    function perderVida() {
        atrapa.vidas--;
        destelloAtrapa();
        vibrar(140);
        pintarAtrapa();
    }

    //Bucle de animacion. "partida" evita que queden dos bucles a la vez si se empieza otra rapido.
    function bucleAtrapa(partida, t) {
        if (!atrapa.jugando || partida !== atrapa.partida) return;
        //Con el movil lento el paso se limita a 0,1 s: el juego no da saltos ni va a camara lenta.
        const dt = Math.min(0.1, Math.max(0, (t - atrapa.ultimo) / 1000));
        atrapa.ultimo = t;
        atrapa.espera -= dt * 1000;
        if (atrapa.espera <= 0) {
            crearPieza();
            atrapa.espera = intervaloAtrapa(atrapa.puntos);
        }
        const avance = velocidadAtrapa(atrapa.puntos) * atrapa.alto * dt;
        const quedan = [];
        for (let i = 0; i < atrapa.piezas.length; i++) {
            const p = atrapa.piezas[i];
            p.y += avance;
            if (p.y < atrapa.alto) {
                p.el.style.transform = "translate3d(0, " + p.y + "px, 0)";
                quedan.push(p);
                continue;
            }
            p.el.remove();
            //Se ha escapado: solo el sushi (y el bento) quitan vida; la bomba no.
            if (p.tipo !== "bomba") {
                pitido(196, 0.2);
                perderVida();
            }
        }
        atrapa.piezas = quedan;
        if (atrapa.vidas <= 0) {
            finAtrapa();
            return;
        }
        atrapa.animacion = requestAnimationFrame(function (t2) { bucleAtrapa(partida, t2); });
    }

    // --- Bloqueo del scroll durante la partida (tambien en iPhone, donde overflow:hidden no basta)
    function evitarScroll(e) {
        if (atrapa.jugando || $("#atrapaPortada").dataset.contando === "1") e.preventDefault();
    }
    function bloquearScroll(bloquear) {
        document.documentElement.classList.toggle("sin-scroll", bloquear);
        if (bloquear) document.addEventListener("touchmove", evitarScroll, { passive: false });
        else document.removeEventListener("touchmove", evitarScroll);
    }

    //Cuenta atras "3, 2, 1" y a jugar. Antes se centra la zona de juego en la pantalla.
    function empezarAtrapa() {
        cancelAnimationFrame(atrapa.animacion);
        quitarPiezas();
        atrapa.partida++;
        const partida = atrapa.partida;
        atrapa.puntos = 0;
        atrapa.vidas = VIDAS_ATRAPA;
        atrapa.espera = 0;
        atrapa.avisoAceleron = false;
        pintarAtrapa();

        $(".atrapa-panel").scrollIntoView({ block: "center" });
        bloquearScroll(true);
        const portada = $("#atrapaPortada");
        portada.dataset.contando = "1";
        $("#atrapaEmpezar").hidden = true;
        let cuenta = 3;
        const mensaje = $("#atrapaMensaje");
        mensaje.innerHTML = "<b class=\"atrapa-total num\">" + cuenta + "</b>";
        pitido(523, 0.1);
        const reloj = setInterval(function () {
            if (partida !== atrapa.partida) { clearInterval(reloj); return; }
            cuenta--;
            if (cuenta > 0) {
                mensaje.innerHTML = "<b class=\"atrapa-total num\">" + cuenta + "</b>";
                pitido(523, 0.1);
                return;
            }
            clearInterval(reloj);
            pitido(784, 0.15);
            portada.dataset.contando = "";
            portada.hidden = true;
            $("#atrapaEmpezar").hidden = false;
            atrapa.alto = zonaAtrapa.clientHeight;
            atrapa.jugando = true;
            atrapa.ultimo = performance.now();
            atrapa.animacion = requestAnimationFrame(function (t) { bucleAtrapa(partida, t); });
        }, 650);
    }

    function finAtrapa() {
        atrapa.jugando = false;
        cancelAnimationFrame(atrapa.animacion);
        quitarPiezas();
        bloquearScroll(false);
        const anterior = recordAtrapa();
        const nuevoRecord = atrapa.puntos > anterior;
        if (nuevoRecord) escribirStorage(CLAVE_ATRAPA, atrapa.puntos);
        pintarAtrapa();
        $("#atrapaMensaje").innerHTML = "<b class=\"atrapa-total num\">" + atrapa.puntos + "</b>" +
            (atrapa.puntos === 1 ? "punto" : "puntos") +
            (nuevoRecord ? "<span class=\"adivina-record\">¡Nuevo récord!</span>" : "");
        $("#atrapaEmpezar").innerHTML = "<i class=\"bi bi-arrow-repeat\" aria-hidden=\"true\"></i>Jugar otra vez";
        $("#atrapaPortada").hidden = false;
        if (nuevoRecord) vibrar([60, 40, 60, 40, 120]);
    }

    //Si se sale de la pantalla (o se cambia de app) a mitad de partida, el juego se para.
    function detenerAtrapa() {
        const contando = $("#atrapaPortada").dataset.contando === "1";
        if (!atrapa.jugando && !contando) return;
        atrapa.jugando = false;
        atrapa.partida++;
        cancelAnimationFrame(atrapa.animacion);
        quitarPiezas();
        bloquearScroll(false);
        $("#atrapaPortada").dataset.contando = "";
        $("#atrapaMensaje").textContent = "Partida interrumpida. ¿Otra?";
        $("#atrapaEmpezar").innerHTML = "<i class=\"bi bi-play-fill\" aria-hidden=\"true\"></i>Empezar";
        $("#atrapaEmpezar").hidden = false;
        $("#atrapaPortada").hidden = false;
    }

    //Se atrapa al tocar (pointerdown responde al instante, sin esperar al "click").
    zonaAtrapa.addEventListener("pointerdown", function (e) {
        if (!atrapa.jugando) return;
        e.preventDefault();
        const el = e.target.closest(".pieza");
        if (!el || el.classList.contains("atrapada")) return;
        const pieza = atrapa.piezas.find(function (p) { return p.el === el; });
        if (!pieza) return;
        atrapa.piezas = atrapa.piezas.filter(function (p) { return p !== pieza; });

        const zona = zonaAtrapa.getBoundingClientRect();
        const x = e.clientX - zona.left;
        const y = e.clientY - zona.top;

        if (pieza.tipo === "bomba") {
            el.textContent = EXPLOSION;
            el.classList.add("atrapada", "explota");
            setTimeout(function () { el.remove(); }, 300);
            textoFlotante("-" + CORAZON, x, y, "flotante-malo");
            pitido(110, 0.35);
            perderVida();
            if (atrapa.vidas <= 0) finAtrapa();
            return;
        }

        el.classList.add("atrapada");
        setTimeout(function () { el.remove(); }, 200);
        const suma = pieza.tipo === "bento" ? 5 : 1;
        const antes = atrapa.puntos;
        atrapa.puntos += suma;
        textoFlotante("+" + suma, x, y, suma > 1 ? "flotante-bonus" : "");
        pitido(suma > 1 ? 988 : 660 + Math.min(atrapa.puntos, 30) * 10, suma > 1 ? 0.15 : 0.06);
        if (suma > 1) vibrar(40);
        //Aviso al pasar de 150 puntos: a partir de aqui acelera mas.
        if (antes < PUNTOS_ACELERON && atrapa.puntos >= PUNTOS_ACELERON && !atrapa.avisoAceleron) {
            atrapa.avisoAceleron = true;
            textoFlotante("¡Más rápido!", zona.width / 2, zona.height / 2, "flotante-aviso");
            vibrar([60, 40, 60]);
        }
        pintarAtrapa();
    });

    $("#atrapaEmpezar").addEventListener("click", empezarAtrapa);

    document.addEventListener("visibilitychange", function () {
        if (document.hidden) detenerAtrapa();
    });

    //La zona de juego llena exactamente el alto que queda en la pantalla (sin scroll): desde donde empieza
    //hasta el borde de abajo, descontando el relleno del panel y del lienzo (que en movil deja sitio al menu).
    function ajustarZonaAtrapa() {
        if ($("#vista-atrapa").hidden) return;
        const relleno = parseFloat(getComputedStyle($(".atrapa-panel")).paddingBottom) +
            parseFloat(getComputedStyle($(".lienzo")).paddingBottom);
        const arriba = zonaAtrapa.getBoundingClientRect().top + window.scrollY;
        const alto = Math.max(240, Math.floor(window.innerHeight - arriba - relleno));
        zonaAtrapa.style.height = alto + "px";
        if (atrapa.jugando) atrapa.alto = zonaAtrapa.clientHeight;
    }

    //Si cambia el tamano de la ventana (girar el movil, barra del navegador...), se recalcula.
    window.addEventListener("resize", ajustarZonaAtrapa);

    pintarAtrapa();

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

    // ------------------------------------------------------------------ BOTON PARA SUBIR

    //Solo en la Carta: aparece al bajar mas de 400px y al pulsarlo sube suavemente al principio.
    const botonSubir = $("#subir");
    function pintarBotonSubir() {
        const visible = vistaActual === "carta" && window.scrollY > 400;
        botonSubir.classList.toggle("visible", visible);
        botonSubir.tabIndex = visible ? 0 : -1;
    }
    window.addEventListener("scroll", pintarBotonSubir, { passive: true });
    botonSubir.addEventListener("click", function () {
        const sinMovimiento = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: sinMovimiento ? "auto" : "smooth" });
    });

    // ------------------------------------------------------------------ ARRANQUE

    pintarPostres();
    pintarContador();
    mostrarVista();
    actualizarTodo();
    pintarRondas();
    importarPedidoCompartido();
    //El plato sorpresa empieza sin plato (la incognita).
    pintarPlatoSorpresa();

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
