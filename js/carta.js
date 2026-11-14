//DATOS DE LA CARTA DEL BUFFET LIBRE NAKOYA.
//Compartidos por la version Legacy (index.html) y la Moderna (moderna.html):
//cuando cambie la carta del restaurante, solo hay que actualizar este archivo.

//MAPA CON LOS PLATOS DEL MENU Y SU CORRESPONDIENTE CODIGO.
//⭐ = solo disponible por la noche, fines de semana y festivos.
const mapMenu = new Map([
    ["A2", "Ensalada de la casa (algas)"],
    ["A3", "Ensalada china de lechuga"],
    ["A4", "Ensalada china de col"],
    ["A5", "Sopa miso"],
    ["A6", "Sopa de maíz con carne de cangrejo"],
    ["A7", "Sopa de aleta de tiburón"],
    ["A9", "Rollitos de gambas"],
    ["A10", "Rollitos vietnamitas"],
    ["A11", "Rollito de pollo con queso fundido"],
    ["A12", "Rollo de primavera"],
    ["A13", "Medallones de pollo con trufa ⭐"],
    ["A14", "Wan Tun frito"],
    ["A15", "Langostinos crujientes ⭐"],
    ["A17", "Bolas de arroz frito"],
    ["A18", "Pan chino frito"],
    ["A20", "Entrecot rollo con queso ⭐🥈"],
    ["A21", "Bao crujiente ternera y queso ⭐"],
    ["A22", "Tempura de langostinos"],
    ["A23", "Tempura de atún"],
    ["A25", "Bolas de queso fundido ⭐"],
    ["A26", "Sau mai frito"],
    ["A28", "Yakitori de gambas ⭐"],
    ["A29", "Gambas laqueadas ⭐"],
    ["A30", "Pollo laqueado"],
    ["A31", "Triángulos de ternera con curry"],
    ["A33", "Tallarines teppanyaki"],
    ["A34", "Arroz teppanyaki"],
    ["A35", "Teppanyaki de pollo"],
    ["A36", "Teppanyaki de gambas ⭐"],
    ["A41", "Arroz frito tres delicias"],
    ["A42", "Arroz de la casa"],
    ["A43", "Arroz coreano (picante)"],
    ["A44", "Tallarines tres delicias"],
    ["A47", "Fideos de arroz"],
    ["A50", "Pollo con sésamo"],
    ["A52", "Pollo con almendras"],
    ["A53", "Pollo al limón"],
    ["A54", "Pollo picante"],
    ["A55", "Bolas de pollo frito"],
    ["A57", "Carne de cerdo agridulce"],
    ["A58", "Gambas con bambú y setas ⭐"],
    ["A61", "Ternera crujiente"],
    ["A63", "Ternera con bambú y setas"],
    ["A66", "Pato asado “PeKin” ⭐"],
    ["A67", "Pato japonés ⭐🥉"],
    ["A74", "Empanadillas con carne"],
    ["A78", "Sushi salmón y aguacate"],
    ["A79", "Maki tempura Nakoya"],
    ["A81", "Sushis variados"],
    ["A85", "Maki salmón"],
    ["A86", "Maki atún"],
    ["A87", "Maki aguacate y pepino"],
    ["A88", "Maki gambas"],
    ["A89", "California maki"],
    ["A90", "Futo maki"],
    ["A91", "Maki tempura"],
    ["A92", "Sashimi salmón ⭐"],
    ["A93", "Sashimi atún ⭐"],
    ["A94", "Maki cono"],
    ["A98", "Maki queso cremoso"],
    ["A99", "Tarta sushi ⭐🤢"],
    ["A101", "Aburi sushi salmón ⭐"],
    ["A105", "Maki pollo desmenuzado"],
    ["A106", "Maki pollo mayonesa"],
    ["A107", "Maki pollo desmenuzado y salmón ⭐"],
    ["A109", "Maki atún picante"],
    ["A111", "Maki salmón y aguacate 🥇"],
    ["A112", "Maki palito de cangrejo, pepino y aguacate"],
    ["A196", "Sushi salmón con trufa ⭐"],
    ["A201", "Taco de salmón y mango ⭐"],
    ["A202", "Gunkan sushi ⭐"],
    ["A204", "Sushi de salmón glaseado ⭐"],
    ["A207", "Maki de atún crujiente"],
    ["A209", "Sushi de plátano flameado"]
]);

//MAPA CON LOS POSTRES.
const mapPostres = new Map([
    ["1.", "Bola de helado"],
    ["2.", "Flan"],
    ["3.", "Pastel de calabaza con chocolate"],
    ["4.", "Mini rollito de plátano y chocolate (2 uds.)"],
    ["5.", "Profiteroles (2 uds.)"],
    ["6.", "Crepe con nata y chocolate"]
]);

//LISTAS DE PLATOS PARA LOS FILTROS Y LOS PEDIDOS HABITUALES.
const platosFavoritos = ["A15", "A20", "A22", "A28", "A30", "A50", "A53", "A67", "A78", "A196", "A201"];
const platosSushi = ["A78", "A79", "A81", "A85", "A86", "A87", "A88", "A89", "A90", "A91",
    "A92", "A93", "A94", "A98", "A99", "A101", "A105", "A106", "A107", "A109", "A111", "A112",
    "A196", "A201", "A202", "A204", "A207", "A209"];
//Los habituales son los mismos platos que los favoritos.
const platosHabituales = platosFavoritos;

//DETALLE DE ALGUNOS POSTRES (la version moderna lo muestra en una segunda linea).
const detallesPostres = new Map([
    ["1.", "(chocolate, fresa, vainilla, etc.)"]
]);

//PRECIOS DEL BUFFET (en euros). La bebida no esta incluida.
const precios = {
    mediodia: { adultos: 15.80, ninos: 9.00 },
    noche: { adultos: 18.80, ninos: 10.00 },
    bebidas: { agua: 3.50, refresco: 2.20 }
};

//Formatea un precio al estilo español: 15.8 -> "15,80 €".
function formatoPrecio(valor) {
    return valor.toFixed(2).replace(".", ",") + " €";
}
