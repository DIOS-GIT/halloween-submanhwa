# Evento de Halloween · SubManhwa

Sitio estático (GitHub Pages) con datos en Firebase (Firestore + Authentication).

- **Página pública** (`index.html`): ronda activa, contador, normas, elección de carta con panel para escribir el usuario y nombres de quienes ya eligieron bajo cada carta. Responsive, pensada primero para móvil.
- **Panel admin** (`admin.html`): login, edición del evento y las normas, rondas y cartas, participantes (marcar entregado, quitar, exportar CSV).

## Cómo funciona el evento

- El evento se divide en **rondas**. Cada ronda tiene **3 cartas** (cada una es una carta o una cantidad de kakeras) y su propio contador.
- Cada persona elige **una sola vez por ronda**. Un mismo usuario no puede repetir en la misma ronda.
- Al activar una ronda nueva, la anterior se cierra: sus cartas pasan a «Cartas retiradas» y **ya no se pueden conseguir**.
- Los premios se envían después; en el panel marcas «Entregado» por participante.

## Estructura

```
├── index.html            Página pública
├── admin.html            Panel de administración
├── css/
│   ├── styles.css        Tema (negro, carmesí, violeta) y componentes
│   └── admin.css         Estilos del panel
├── js/
│   ├── firebase-config.js  ← AQUÍ pegas la configuración de Firebase
│   ├── app.js              Lógica pública
│   ├── admin.js            Lógica del panel
│   ├── countdown.js        Contador (se alinea con la hora del servidor)
│   └── utils.js            Ayudas compartidas
├── assets/
│   ├── cards/            Imágenes de las cartas (hay 3 de ejemplo en SVG)
│   ├── bg/  icons/
├── firestore.rules       ← AQUÍ pones el UID del admin y lo publicas
└── .nojekyll
```

## Puesta en marcha

### 1. Proyecto Firebase
1. En [console.firebase.google.com](https://console.firebase.google.com) crea un proyecto nuevo.
2. **Firestore Database** → Crear base de datos (modo producción, región cercana, por ejemplo `us-east1` o `southamerica-east1`).
3. **Authentication** → Comenzar → habilita **Correo electrónico/contraseña**.
4. **Authentication → Usuarios → Agregar usuario**: crea el usuario admin (correo y contraseña fuertes). Copia su **UID**.
5. **Authentication → Configuración → Dominios autorizados**: agrega `TU_USUARIO.github.io`.
6. **Configuración del proyecto → Tus apps → Web (`</>`)**: registra la app y copia el objeto `firebaseConfig`.

### 2. Configurar el código
1. Pega esos valores en `js/firebase-config.js`.
2. En `firestore.rules` reemplaza `ADMIN_UID_AQUI` por el UID del admin.
3. En Firebase Console → Firestore → **Reglas**, pega el contenido de `firestore.rules` y pulsa **Publicar**.

### 3. Subir a GitHub Pages
1. Crea el repositorio y sube todo el contenido de esta carpeta a la rama `main`.
2. Repositorio → Settings → Pages → Source: `main` / `(root)`.
3. La web queda en `https://TU_USUARIO.github.io/NOMBRE_DEL_REPO/` y el panel en `.../admin.html`.

### 4. Primer uso
1. Entra a `admin.html` con el usuario admin.
2. Pestaña **Evento**: revisa título, normas y el cierre general (por defecto 1 de noviembre, 23:59) → **Guardar configuración**.
3. Pestaña **Rondas y cartas** → **Nueva ronda**: nombre, tipo, imagen de las 3 cartas y fechas de inicio y cierre → **Guardar ronda** → **Activar**.
4. Para cada rotación (cada 3 o 4 días): sube las 3 imágenes nuevas a `assets/cards/`, crea la ronda siguiente y actívala. La anterior se cierra sola.

## Imágenes de las cartas

- Súbelas al repositorio en `assets/cards/` y escribe la ruta en el panel (por ejemplo `assets/cards/r2-c1.webp`).
- Recomendado: formato **WebP**, proporción 2:3 (por ejemplo 600×900 px), menos de 200 KB cada una.
- Las 3 cartas de ejemplo (`carta1.svg` a `carta3.svg`) son solo marcadores; reemplázalas por las reales.
- Después de subir imágenes nuevas, GitHub Pages tarda 1 o 2 minutos en publicarlas.

## Caché: cómo se evita que se vea contenido viejo

GitHub Pages guarda los archivos en caché unos 10 minutos y esa cabecera no se puede cambiar. Para que un cambio de cartas se vea siempre, el proyecto trabaja así:

| Qué cambia | Cómo se actualiza |
|---|---|
| Cartas, fechas, normas, estado de la ronda, nombres | Vienen de Firestore en vivo; no pasan por la caché del navegador. Se actualizan incluso con la página abierta. |
| `app.js`, `admin.js` y los demás `.js` | Se cargan siempre con una versión nueva (`?v=hora actual`), así que cada recarga baja la última versión. |
| `styles.css` y `admin.css` | Igual: se piden con `?v=hora actual`. |
| Imágenes de las cartas | Llevan `?v=` con la versión de la ronda, que cambia cada vez que guardas la ronda en el panel. |
| `index.html` y `admin.html` | Llevan metaetiquetas de no-caché, pero GitHub Pages puede servirlos hasta ~10 minutos desde su CDN. Son una carcasa casi fija; solo importa si editas el propio HTML. |

**Al cambiar cartas (lo normal):**
1. Sube las imágenes nuevas a `assets/cards/` con **nombres nuevos** (por ejemplo `r2-c1.webp`). Un nombre nuevo nunca puede estar en caché.
2. Espera a que GitHub Pages termine de publicar (pestaña **Actions** del repositorio, 1 o 2 minutos).
3. Crea o edita la ronda en el panel y guarda. Eso actualiza la versión de las imágenes.

**Si reemplazas una imagen conservando el mismo nombre:** cuando GitHub Pages haya terminado de publicar, guarda de nuevo la ronda o pulsa **«Limpiar caché de imágenes de todos»** (pestaña Evento). Si lo haces antes de que termine la publicación, la CDN puede guardar la imagen vieja con la versión nueva.

## Seguridad: qué garantiza cada parte

| Qué | Cómo |
|---|---|
| Solo el admin modifica evento, rondas y cartas | Las reglas exigen el UID del admin (`isAdmin()`); esconder el botón no es la protección. |
| Un voto por persona y ronda | El documento se llama `{ronda}_{usuario en minúsculas}`; las reglas solo permiten **crear**, así que un segundo intento con el mismo nombre falla. |
| Solo cartas de la ronda activa | Las reglas comprueban que la ronda esté `activa`, que la carta exista en ella y que no se haya pasado el cierre general. |
| El contador no se salta cambiando la hora del teléfono | El plazo lo valida Firestore con la hora del servidor. |
| Nadie edita ni borra votos | Solo el admin puede hacerlo. |

### Límites que conviene conocer

- **Los nombres no se verifican contra SubManhwa.** Alguien podría escribir el usuario de otra persona. Revisa la lista al cerrar cada ronda y usa **Quitar** en los nombres falsos; esa persona podrá volver a elegir.
- Una persona con varias cuentas puede participar con cada una. Las normas dicen que se anulan los duplicados; el CSV ayuda a detectarlos.
- Las reglas usan `lower()` para comprobar el nombre en minúsculas. Si un usuario con caracteres muy raros recibe «permiso denegado», regístralo tú manualmente o pídele otro formato.

### Cuota gratuita de Firestore (plan Spark)

El plan gratuito permite unas 50 000 lecturas al día. Con `votosEnVivo: true` (en `js/firebase-config.js`) cada visitante lee todos los votos de la ronda activa al entrar. Si esperas mucho tráfico, pon `votosEnVivo: false`: los nombres se cargan una vez al abrir y tras votar, con muchas menos lecturas. El historial de rondas retiradas solo se carga cuando alguien pulsa «Ver quién las consiguió».

## Datos en Firestore

| Documento | Campos principales |
|---|---|
| `config/evento` | `titulo`, `subtitulo`, `normas[]`, `finEvento`, `activo`, `rondaActiva` |
| `rondas/ronda1…` | `numero`, `inicio`, `fin`, `estado` (`proxima`/`activa`/`cerrada`), `cartas{c1,c2,c3}` |
| `votos/{rondaId}_{usuario}` | `usuario`, `usuarioLower`, `rondaId`, `cartaId`, `creado`, `entregado` |

## Problemas frecuentes

- **«Falta configurar Firebase»**: no has reemplazado los valores `TU_...` en `js/firebase-config.js`.
- **No puedo entrar al panel**: revisa que el dominio de GitHub Pages esté en los dominios autorizados de Authentication.
- **«Sin permiso» al guardar en el panel**: el UID en `firestore.rules` no coincide con el del usuario con el que entraste, o las reglas no están publicadas.
- **Nadie puede votar**: comprueba que la ronda esté **activa**, que la fecha de inicio ya haya pasado, que el cierre general (pestaña Evento) sea posterior a hoy y que el evento esté marcado como activo.
