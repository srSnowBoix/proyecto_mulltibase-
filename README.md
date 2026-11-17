# Proyecto Multibase de Datos — Tienda en línea

Web Service REST (Node.js + Express) que trabaja con **tres motores de base de datos a la vez**:

|Motor|Tipo|Se usa para|
|-|-|-|
|**PostgreSQL**|Relacional|Usuarios, Productos, Pedidos|
|**MongoDB**|NoSQL (documentos)|Reseñas|
|**Redis**|Clave-Valor|Sesiones, Carrito|

Cada recurso implementa **GET, POST, PATCH y DELETE**, y el borrado es siempre **lógico**
(el registro no se elimina; solo se marca como borrado).

\---

## Requisitos previos

* [Node.js](https://nodejs.org/) v18 o superior (incluye `npm`)
* [Docker](https://www.docker.com/products/docker-desktop/) y Docker Compose (para levantar las bases de datos)
* [Git](https://git-scm.com/)

## Instalación y ejecución

```bash

# 1. Instalar dependencias
npm install

# 2. Crear el archivo de variables de entorno
cp .env.example .env          # En Windows (CMD): copy .env.example .env

# 3. Levantar PostgreSQL, MongoDB y Redis
docker compose up -d

# 4. Iniciar el servidor
npm start                     # o "npm run dev" para recargar con cada cambio
```

Si todo salió bien verás en la consola:

```
#MongoDB conectado
# Redis conectado


&#x20;Servidor en http://localhost:3000
```

Abre [http://localhost:3000/](http://localhost:3000/) para ver la lista de recursos.

> \\\\\\\*\\\\\\\*Las tablas de PostgreSQL se crean solas\\\\\\\*\\\\\\\* la primera vez que arranca el contenedor
> (usa `src/sql/init.sql`). Si ya tenías el contenedor creado de antes y faltan tablas
> (por ejemplo `pedido\\\\\\\_items`), reinícialo desde cero:
> ```bash
> docker compose down -v
> docker compose up -d
> ```
> !Esto borra los datos guardados en las bases!

Para detener las bases de datos: `docker compose down`.

## &#x20;#Variables de entorno (`.env`)

|Variable|Valor por defecto|Descripción|
|-|-|-|
|`PORT`|`3000`|Puerto del servidor|
|`PG\\\\\\\_HOST` / `PG\\\\\\\_PORT`|`localhost` / `5432`|Conexión a PostgreSQL|
|`PG\\\\\\\_USER` / `PG\\\\\\\_PASSWORD` / `PG\\\\\\\_DATABASE`|`admin` / `admin123` / `tienda`|Credenciales de PostgreSQL|
|`MONGO\\\\\\\_URI`|`mongodb://localhost:27017/tienda`|Conexión a MongoDB|
|`REDIS\\\\\\\_HOST` / `REDIS\\\\\\\_PORT`|`localhost` / `6379`|Conexión a Redis|
|`SESSION\\\\\\\_TTL\\\\\\\_SECONDS`|`3600`|Duración de una sesión (en segundos)|

\---

## \# Recursos de la API

|#|Recurso|Ruta base|Base de datos|
|-|-|-|-|
|1|Usuarios|`/api/usuarios`|PostgreSQL|
|2|Productos|`/api/productos`|PostgreSQL|
|3|Pedidos|`/api/pedidos`|PostgreSQL|
|4|Reseñas|`/api/resenas`|MongoDB|
|5|Sesiones|`/api/sesiones`|Redis|
|6|Carrito|`/api/carrito`|Redis|

Todos los recursos responden en JSON. Los errores tienen la forma `{ "error": "mensaje" }`.

### Endpoints

Cada recurso expone los mismos cinco endpoints (`:id` es el identificador del recurso;
en Sesiones es el `token` y en Carrito es el `usuario\\\\\\\_id`):

|Método|Ruta|Descripción|
|-|-|-|
|`GET`|`/api/<recurso>`|Lista los registros activos|
|`GET`|`/api/<recurso>/:id`|Obtiene un registro|
|`POST`|`/api/<recurso>`|Crea un registro|
|`PATCH`|`/api/<recurso>/:id`|Actualiza parcialmente un registro|
|`DELETE`|`/api/<recurso>/:id`|Borrado lógico|

### Cuerpos (body) de ejemplo

**Usuarios** — `POST /api/usuarios`

```json
{ "nombre": "Ana", "email": "ana@correo.com", "password": "1234" }
```

**Productos** — `POST /api/productos`

```json
{ "nombre": "Laptop", "descripcion": "15 pulgadas", "precio": 12500.50, "stock": 10 }
```

**Pedidos** — `POST /api/pedidos`
Calcula el total con los precios actuales, **descuenta el stock** y todo ocurre en una transacción.

```json
{ "usuario\\\\\\\_id": 1, "items": \\\\\\\[ { "producto\\\\\\\_id": 1, "cantidad": 2 }, { "producto\\\\\\\_id": 2, "cantidad": 1 } ] }
```

`PATCH /api/pedidos/:id` cambia el estado (`pendiente`, `pagado`, `enviado`, `entregado`, `cancelado`).
Al **cancelar**, el stock se devuelve a los productos.

```json
{ "estado": "pagado" }
```

Filtros opcionales en el listado: `GET /api/pedidos?usuario\\\\\\\_id=1\\\\\\\&estado=pendiente`

**Reseñas** — `POST /api/resenas` (valida en PostgreSQL que existan el usuario y el producto)

```json
{ "producto\\\\\\\_id": 1, "usuario\\\\\\\_id": 1, "calificacion": 5, "comentario": "Excelente producto" }
```

`PATCH` acepta `calificacion` (1 a 5) y/o `comentario`.
Filtros opcionales: `GET /api/resenas?producto\\\\\\\_id=1`

**Sesiones** — `POST /api/sesiones` (login; devuelve un `token`)

```json
{ "email": "ana@correo.com", "password": "1234" }
```

* `GET /api/sesiones/:token` valida si la sesión sigue vigente y cuánto le queda.
* `PATCH /api/sesiones/:token` renueva el tiempo de vida y guarda datos extra: `{ "datos": { "tema": "oscuro" } }`
* `DELETE /api/sesiones/:token` cierra la sesión.

**Carrito** — `POST /api/carrito` (agrega un producto; si ya estaba, suma la cantidad)

```json
{ "usuario\\\\\\\_id": 1, "producto\\\\\\\_id": 1, "cantidad": 2 }
```

* `GET /api/carrito/:usuario\\\\\\\_id` devuelve el carrito con su total.
* `PATCH /api/carrito/:usuario\\\\\\\_id` cambia la cantidad de un producto (con `0` lo quita): `{ "producto\\\\\\\_id": 1, "cantidad": 3 }`
* `DELETE /api/carrito/:usuario\\\\\\\_id` elimina el carrito.

> En el archivo \\\\\\\[`requests.http`](requests.http) hay un ejemplo de cada petición listo para
> probar con la extensión \\\\\\\*\\\\\\\*REST Client\\\\\\\*\\\\\\\* de VS Code (también puedes usar Postman o Insomnia).

\---

## \#Borrado lógico

Ningún registro se elimina físicamente. Un `DELETE` solo marca el registro como borrado y
los `GET` lo dejan de mostrar:

|Motor|Cómo se marca|
|-|-|
|PostgreSQL|Columna `deleted\\\\\\\_at` con la fecha del borrado (`NULL` = activo)|
|MongoDB|Campo `deleted\\\\\\\_at` en el documento|
|Redis|Campo `deleted\\\\\\\_at` dentro del valor JSON de la llave|

Redis conserva la llave de la sesión hasta que expira por su propio tiempo de vida (TTL).

## 

## \#Estructura del proyecto

```
.
├── docker-compose.yml        # PostgreSQL + MongoDB + Redis
├── requests.http             # Peticiones de ejemplo
├── .env.example
├── package.json
└── src
    ├── app.js                # Servidor Express y registro de rutas
    ├── config/               # Conexiones: postgres.js, mongo.js, redis.js
    ├── sql/init.sql          # Tablas de PostgreSQL
    ├── models/               # Esquemas de Mongoose (reseñas)
    ├── controllers/          # Lógica de cada recurso
    └── routes/               # Rutas de cada recurso
```

## \# Trabajo en equipo con Git

```bash
git pull                              # traer lo último antes de empezar
git checkout -b feature/mi-cambio     # trabajar en una rama propia
git add .
git commit -m 
git push -u origin feature/mi-cambio  
```



Configurarcion de identidad para que los commits aparescan con el nombre respectivo

```bash
git config user.name  "XFNeons"
git config user.email "269336923+XFNeons@users.noreply.github.com"
```

## \# Tecnologías

Node.js · Express 5 · PostgreSQL 16 (`pg`) · MongoDB 7 (`mongoose`) · Redis 7 (`redis`) · Docker Compose

