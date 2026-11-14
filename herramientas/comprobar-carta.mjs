//COMPRUEBA SI LA CARTA DE LA WEB OFICIAL DEL NAKOYA HA CAMBIADO.
//
//Lo ejecuta cada dia GitHub Actions (.github/workflows/comprobar-carta.yml), pero tambien se puede lanzar a mano:
//   node herramientas/comprobar-carta.mjs          -> compara con la foto y, si hay cambios, los aplica
//   node herramientas/comprobar-carta.mjs --foto   -> solo guarda la foto actual de la web (sin tocar la carta)
//   node herramientas/comprobar-carta.mjs --html pagina.html   -> usa una copia local (para pruebas)
//
//No se compara con js/carta.js (alli los nombres estan corregidos a mano), sino con la "foto" de lo que ponia
//la web la ultima vez (herramientas/carta-oficial.json). Asi solo avisa cuando la web cambia de verdad.
//
//Si hay cambios:
// - Se aplican solos en js/carta.js: platos nuevos, platos quitados, la estrella de noche y los precios.
// - Se listan para revisar a mano: nombres cambiados, postres, normas y horario.
// - Se escribe el informe en herramientas/informe-carta.md (es el texto de la Pull Request).

import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const URL_CARTA = "http://m.restaurantejaponesnakoya.com/col.jsp?id=112";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RUTA_FOTO = join(AQUI, "carta-oficial.json");
const RUTA_INFORME = join(AQUI, "informe-carta.md");
const RUTA_CARTA = join(AQUI, "..", "js", "carta.js");
const ESTRELLA = "⭐";
const MINIMO_PLATOS = 30; //Si salen menos, la web ha cambiado de formato: mejor fallar que borrar la carta.
//Un plato nuevo es sushi si su nombre lleva alguna de estas palabras. Con la carta de 2026 acierta 27 de 28
//y no confunde ningun otro plato; el que se escapa (A201 "Taco de salmon y mango") hay que marcarlo a mano.
const PALABRAS_SUSHI = /sushi|maki|sashimi|nigiri|gunkan|temaki|uramaki|california|aburi/i;

// ------------------------------------------------------------------ LEER LA WEB

async function descargar() {
    const respuesta = await fetch(URL_CARTA, { headers: { "User-Agent": "Mozilla/5.0 (comprobador de carta)" } });
    if (!respuesta.ok) throw new Error("La web oficial respondio " + respuesta.status);
    return respuesta.text();
}

//Pasa el HTML a lineas de texto limpio.
function lineasDeTexto(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, " ")
        .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|td)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .split("\n")
        .map(function (l) { return l.replace(/\s+/g, " ").trim(); })
        .filter(Boolean);
}

function numero(texto) {
    const m = texto.match(/(\d+(?:[.,]\d+)?)\s*€/);
    return m ? Math.round(parseFloat(m[1].replace(",", ".")) * 100) / 100 : null;
}

//Extrae platos, postres, precios, normas y horario de la pagina.
function leerCarta(html) {
    const lineas = lineasDeTexto(html);
    const iInicio = lineas.findIndex(function (l) { return /CARTA DE BUFFET LIBRE/i.test(l); });
    const iFinPlatos = lineas.findIndex(function (l) { return /^Los que llevan/i.test(l); });
    const iPostres = lineas.findIndex(function (l) { return /^Postre incluido/i.test(l); });
    if (iInicio < 0 || iFinPlatos < 0) throw new Error("No se encuentra la lista de platos: la web ha cambiado de formato");

    //Platos: todo el texto entre el titulo y la nota de las estrellas, cortado por los codigos "A12."
    const bloque = lineas.slice(iInicio + 1, iFinPlatos).join(" ");
    const platos = {};
    const re = /\b(A\d{1,3})\s*\.\s*(.*?)(?=\bA\d{1,3}\s*\.|$)/g;
    let m;
    while ((m = re.exec(bloque))) {
        const textoPlato = m[2].trim();
        if (platos[m[1]]) continue;
        platos[m[1]] = {
            nombre: textoPlato.replace(new RegExp(ESTRELLA, "g"), "").replace(/\s+/g, " ").trim(),
            noche: textoPlato.includes(ESTRELLA)
        };
    }
    if (Object.keys(platos).length < MINIMO_PLATOS) {
        throw new Error("Solo se han leido " + Object.keys(platos).length + " platos: la web ha cambiado de formato");
    }

    //Postres: lineas "1. Bola de helado" despues de "Postre incluido...".
    const postres = [];
    if (iPostres >= 0) {
        for (let i = iPostres + 1; i < lineas.length && /^\d+\s*\./.test(lineas[i]); i++) {
            postres.push(lineas[i].replace(/^\d+\s*\.\s*/, ""));
        }
    }

    //Precios: las cuatro lineas con € despues de los postres, siempre en este orden.
    const lineasPrecio = lineas.slice(iPostres >= 0 ? iPostres : iFinPlatos).filter(function (l) { return /€/.test(l); }).slice(0, 4);
    const valores = lineasPrecio.map(numero);
    const precios = {
        mediodia: { adultos: valores[0], ninos: valores[1] },
        noche: { adultos: valores[2], ninos: valores[3] }
    };

    //Normas (lineas que empiezan por "-") y horario (franjas "12:00-16:00").
    const normas = lineas.filter(function (l) { return /^-\s*\S/.test(l); }).map(function (l) { return l.replace(/^-\s*/, ""); });
    const horario = lineas.filter(function (l) { return /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(l); });

    return { platos: platos, postres: postres, precios: precios, normas: normas, horario: horario };
}

// ------------------------------------------------------------------ COMPARAR

function numeroCodigo(c) { return parseInt(c.slice(1), 10); }

function comparar(antes, ahora) {
    const cambios = { nuevos: [], quitados: [], renombrados: [], noche: [], precios: [], postres: null, normas: null, horario: null };
    const codigos = new Set(Object.keys(antes.platos).concat(Object.keys(ahora.platos)));
    Array.from(codigos).sort(function (a, b) { return numeroCodigo(a) - numeroCodigo(b); }).forEach(function (c) {
        const a = antes.platos[c];
        const b = ahora.platos[c];
        if (!a) cambios.nuevos.push({ codigo: c, nombre: b.nombre, noche: b.noche, sushi: PALABRAS_SUSHI.test(b.nombre) });
        else if (!b) cambios.quitados.push({ codigo: c, nombre: a.nombre });
        else {
            if (a.nombre !== b.nombre) cambios.renombrados.push({ codigo: c, antes: a.nombre, ahora: b.nombre });
            if (a.noche !== b.noche) cambios.noche.push({ codigo: c, nombre: b.nombre, noche: b.noche });
        }
    });
    ["mediodia", "noche"].forEach(function (turno) {
        ["adultos", "ninos"].forEach(function (tipo) {
            const a = antes.precios[turno][tipo];
            const b = ahora.precios[turno][tipo];
            if (b !== null && a !== b) cambios.precios.push({ turno: turno, tipo: tipo, antes: a, ahora: b });
        });
    });
    if (JSON.stringify(antes.postres) !== JSON.stringify(ahora.postres)) cambios.postres = { antes: antes.postres, ahora: ahora.postres };
    if (JSON.stringify(antes.normas) !== JSON.stringify(ahora.normas)) cambios.normas = { antes: antes.normas, ahora: ahora.normas };
    if (JSON.stringify(antes.horario) !== JSON.stringify(ahora.horario)) cambios.horario = { antes: antes.horario, ahora: ahora.horario };
    return cambios;
}

function hayCambios(c) {
    return c.nuevos.length || c.quitados.length || c.renombrados.length || c.noche.length || c.precios.length ||
        c.postres || c.normas || c.horario;
}

// ------------------------------------------------------------------ APLICAR EN js/carta.js

function aplicarEnCarta(cambios) {
    let carta = readFileSync(RUTA_CARTA, "utf8");
    const nl = carta.includes("\r\n") ? "\r\n" : "\n";
    let lineas = carta.split(nl);
    const reLinea = /^\s*\["(A\d+)", "(.*)"\],?\s*$/;

    const iMapa = lineas.findIndex(function (l) { return /const mapMenu = new Map\(\[/.test(l); });
    let iCierre = lineas.findIndex(function (l, i) { return i > iMapa && /^\]\);/.test(l); });

    //Platos quitados: fuera del mapa y de las listas de favoritos y sushi.
    cambios.quitados.forEach(function (p) {
        lineas = lineas.filter(function (l, i) {
            const m = l.match(reLinea);
            return !(i > iMapa && i < iCierre && m && m[1] === p.codigo);
        });
        iCierre = lineas.findIndex(function (l, i) { return i > iMapa && /^\]\);/.test(l); });
        lineas = lineas.map(function (l) {
            if (!/const platos(Favoritos|Sushi) =|^\s+"A\d/.test(l)) return l;
            return l.replace(new RegExp("\"" + p.codigo + "\",\\s*"), "").replace(new RegExp(",\\s*\"" + p.codigo + "\""), "");
        });
    });

    //Estrella de noche: se pone o se quita en el nombre de la app (respetando las medallas).
    cambios.noche.forEach(function (p) {
        lineas = lineas.map(function (l, i) {
            const m = l.match(reLinea);
            if (!(i > iMapa && i < iCierre && m && m[1] === p.codigo)) return l;
            let nombre = m[2].replace(new RegExp("\\s*" + ESTRELLA, "g"), "");
            if (p.noche) {
                //La estrella va justo despues del texto y antes de las medallas o del 🤢.
                const t = nombre.match(/^(.*?)(\s*[\u{1F947}\u{1F948}\u{1F949}\u{1F922}].*)?$/u);
                nombre = t[1].trimEnd() + " " + ESTRELLA + (t[2] ? t[2].trim() : "");
            }
            return l.replace("\"" + m[2] + "\"", "\"" + nombre + "\"");
        });
    });

    //Platos nuevos: se insertan en su sitio por numero, con el nombre de la web (si la app no lo tenia ya).
    cambios.nuevos.forEach(function (p) {
        const yaEsta = lineas.some(function (l, i) {
            const m = l.match(reLinea);
            return i > iMapa && i < iCierre && m && m[1] === p.codigo;
        });
        if (yaEsta) return;
        const texto = "    [\"" + p.codigo + "\", \"" + p.nombre.replace(/"/g, "\\\"") + (p.noche ? " " + ESTRELLA : "") + "\"]";
        let iInsertar = iCierre;
        for (let i = iMapa + 1; i < iCierre; i++) {
            const m = lineas[i].match(reLinea);
            if (m && numeroCodigo(m[1]) > numeroCodigo(p.codigo)) { iInsertar = i; break; }
        }
        lineas.splice(iInsertar, 0, texto + ",");
        iCierre++;
    });

    //Comas: todas las filas del mapa llevan coma menos la ultima.
    const filas = [];
    for (let i = iMapa + 1; i < iCierre; i++) if (reLinea.test(lineas[i])) filas.push(i);
    filas.forEach(function (i, k) {
        const sinComa = lineas[i].replace(/\],?\s*$/, "]");
        lineas[i] = k === filas.length - 1 ? sinComa : sinComa + ",";
    });

    carta = lineas.join(nl);

    //Platos nuevos que por su nombre son sushi: se anaden a la lista de sushi (ordenada por numero).
    const nuevosSushi = cambios.nuevos.filter(function (p) { return p.sushi; }).map(function (p) { return p.codigo; });
    if (nuevosSushi.length) {
        carta = carta.replace(/const platosSushi = \[([\s\S]*?)\];/, function (todo, dentro) {
            const codigos = (dentro.match(/A\d+/g) || []).concat(nuevosSushi)
                .filter(function (c, i, lista) { return lista.indexOf(c) === i; })
                .sort(function (a, b) { return numeroCodigo(a) - numeroCodigo(b); })
                .map(function (c) { return "\"" + c + "\""; });
            //De 10 en 10 por linea, como estaba escrita la lista.
            const filasSushi = [];
            for (let i = 0; i < codigos.length; i += 10) filasSushi.push(codigos.slice(i, i + 10).join(", "));
            return "const platosSushi = [" + filasSushi.join("," + nl + "    ") + "];";
        });
    }

    //Precios del buffet.
    cambios.precios.forEach(function (p) {
        const re = new RegExp("(" + p.turno + ": \\{[^}]*" + p.tipo + ": )[\\d.]+");
        carta = carta.replace(re, "$1" + p.ahora.toFixed(2));
    });

    writeFileSync(RUTA_CARTA, carta);
}

// ------------------------------------------------------------------ INFORME

const NOMBRE_TURNO = { mediodia: "Mediodía", noche: "Noche, fines de semana y festivos" };
const NOMBRE_TIPO = { adultos: "adultos", ninos: "menores de 7" };

function euros(n) { return n === null || n === undefined ? "?" : n.toFixed(2).replace(".", ",") + " €"; }

function informe(c) {
    const t = ["La carta de la [web oficial del Nakoya](" + URL_CARTA + ") ha cambiado desde la última comprobación.", ""];
    const aplicados = c.nuevos.length || c.quitados.length || c.noche.length || c.precios.length;
    if (aplicados) {
        t.push("## Ya aplicado en `js/carta.js`", "");
        c.nuevos.forEach(function (p) {
            t.push("- **Plato nuevo** " + p.codigo + ": " + p.nombre + (p.noche ? " " + ESTRELLA : "") +
                (p.sushi ? " · añadido a **sushi** por su nombre" : ""));
        });
        c.quitados.forEach(function (p) { t.push("- **Plato quitado** " + p.codigo + ": " + p.nombre + " (también se quita de favoritos y sushi si estaba)"); });
        c.noche.forEach(function (p) { t.push("- **" + p.codigo + " " + p.nombre + "** " + (p.noche ? "pasa a ser solo de noche " + ESTRELLA : "ya no es solo de noche")); });
        c.precios.forEach(function (p) { t.push("- **Precio " + NOMBRE_TURNO[p.turno] + ", " + NOMBRE_TIPO[p.tipo] + ":** " + euros(p.antes) + " → " + euros(p.ahora)); });
        t.push("");
    }
    const revisar = c.renombrados.length || c.postres || c.normas || c.horario;
    if (revisar) {
        t.push("## Para revisar a mano", "", "No se aplican solos porque en la app están escritos a mano (corregidos o con otro texto).", "");
        c.renombrados.forEach(function (p) { t.push("- **" + p.codigo + "** cambia de nombre en la web: «" + p.antes + "» → «" + p.ahora + "»"); });
        if (c.postres) t.push("- **Postres** antes: " + c.postres.antes.join(" · "), "  ahora: " + c.postres.ahora.join(" · "));
        if (c.normas) t.push("- **Normas** antes: " + c.normas.antes.join(" · "), "  ahora: " + c.normas.ahora.join(" · "));
        if (c.horario) t.push("- **Horario** antes: " + c.horario.antes.join(", ") + " → ahora: " + c.horario.ahora.join(", "));
        t.push("");
    }
    if (c.nuevos.length) {
        t.push("Los platos nuevos entran con el nombre de la web: revisa si hay que corregirlo, si va a favoritos " +
            "y si alguno es sushi aunque su nombre no lo diga (se añade a mano a `platosSushi`).", "");
    }
    t.push("Al aceptar (Merge) esta Pull Request, Vercel publica la carta nueva en un minuto.");
    return t.join("\n");
}

// ------------------------------------------------------------------ PRINCIPAL

function salidaGitHub(clave, valor) {
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, clave + "=" + valor + "\n");
}

function guardarFoto(carta) {
    writeFileSync(RUTA_FOTO, JSON.stringify(carta, null, 2) + "\n");
}

//Para pruebas: --html archivo.html lee una copia local de la pagina en vez de descargarla.
const iHtml = process.argv.indexOf("--html");
const html = iHtml > 0 ? readFileSync(process.argv[iHtml + 1], "utf8") : await descargar();
const ahora = leerCarta(html);

if (process.argv.includes("--foto") || !existsSync(RUTA_FOTO)) {
    guardarFoto(ahora);
    console.log("Foto guardada: " + Object.keys(ahora.platos).length + " platos, " + ahora.postres.length + " postres.");
    salidaGitHub("cambios", "false");
} else {
    const antes = JSON.parse(readFileSync(RUTA_FOTO, "utf8"));
    const cambios = comparar(antes, ahora);
    if (!hayCambios(cambios)) {
        console.log("La carta oficial no ha cambiado (" + Object.keys(ahora.platos).length + " platos).");
        salidaGitHub("cambios", "false");
    } else {
        aplicarEnCarta(cambios);
        guardarFoto(ahora);
        const texto = informe(cambios);
        writeFileSync(RUTA_INFORME, texto + "\n");
        console.log(texto);
        salidaGitHub("cambios", "true");
    }
}
