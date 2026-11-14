//ALMACENAMIENTO DEL PEDIDO EN CURSO Y DEL CONTADOR MAKI.
//Compartido por la version Legacy y la Moderna: al cambiar de version el pedido se conserva.
//Necesita que js/carta.js este cargado antes (usa mapMenu).

//CLAVES DEL LOCALSTORAGE.
const CLAVE_PEDIDOS = "pedidosNakoya";
const CLAVE_CONTADOR = "valorContador";
const CADUCIDAD_PEDIDOS = 24 * 60 * 60 * 1000; //24 horas.
const MAX_CONTADOR = 100;

//El localStorage puede lanzar excepciones (modo privado, almacenamiento bloqueado...), asi que lo envolvemos.
function leerStorage(clave) {
    try {
        return localStorage.getItem(clave);
    } catch (e) {
        return null;
    }
}

function escribirStorage(clave, valor) {
    try {
        localStorage.setItem(clave, valor);
    } catch (e) { }
}

function borrarStorage(clave) {
    try {
        localStorage.removeItem(clave);
    } catch (e) { }
}

//Guarda el pedido en curso: array de {codigo, cantidad}.
function guardarPedidosStorage(pedidos) {
    if (!pedidos || pedidos.length == 0) {
        borrarStorage(CLAVE_PEDIDOS);
        return;
    }

    escribirStorage(CLAVE_PEDIDOS, JSON.stringify({
        timestamp: new Date().getTime(),
        pedidos: pedidos
    }));
}

//Devuelve el pedido guardado (si tiene menos de 24 horas) como array de {codigo, cantidad}.
//Descarta platos que ya no esten en la carta y corrige cantidades no validas.
function cargarPedidosStorage() {
    //Borramos las claves del formato antiguo (guardaba el HTML del listado).
    borrarStorage("contenidoListaPedidos");
    borrarStorage("valoresInputsListaPedidos");
    borrarStorage("timestampListaPedidos");

    let datos = null;
    try {
        datos = JSON.parse(leerStorage(CLAVE_PEDIDOS));
    } catch (e) { }

    if (!datos || !Array.isArray(datos.pedidos) || (new Date().getTime() - datos.timestamp >= CADUCIDAD_PEDIDOS)) {
        return [];
    }

    const codigosVistos = new Set();

    return datos.pedidos.filter(function (pedido) {
        if (!pedido || !mapMenu.has(pedido.codigo) || codigosVistos.has(pedido.codigo)) {
            return false;
        }
        codigosVistos.add(pedido.codigo);
        return true;
    }).map(function (pedido) {
        const cantidad = parseInt(pedido.cantidad, 10);
        return {
            codigo: pedido.codigo,
            cantidad: (cantidad > 0 && cantidad <= 99) ? cantidad : 1
        };
    });
}

//Devuelve el valor guardado del contador maki (0 - 100).
function cargarContadorStorage() {
    const guardado = parseInt(leerStorage(CLAVE_CONTADOR), 10);
    return (guardado >= 0 && guardado <= MAX_CONTADOR) ? guardado : 0;
}

function guardarContadorStorage(valor) {
    escribirStorage(CLAVE_CONTADOR, valor);
}
