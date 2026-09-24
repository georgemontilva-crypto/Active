# ACTIVE — Product Authentication

Sitio de verificación de autenticidad de producto. Dos páginas públicas y un panel
de administración:

- `/` — **Lab Reports** (home): certificados de análisis (PDF) agrupados por producto.
- `/verify` — **Verify Your Code**: el cliente escribe el código de la etiqueta rascable.
- `/admin` — panel: códigos, productos, reportes, logs y cuentas de admin.

Marca: **ACTIVE** — negro (`#08060d`), magenta (`#ec008c`) y amarillo (`#f5e400`),
con la textura de píxeles del empaque. El amarillo se reserva para señales (CTA,
estado, foco): repartido por toda la página deja de leerse como señal.

Tipografías: **Chakra Petch** (títulos, itálica), **Inter** (texto) y
**JetBrains Mono** (códigos).

Base clonada de `georgemontilva-crypto/9tabz`; misma lógica y mismo panel, otro
diseño.

---

## Stack

React 19 + Vite + wouter · tRPC 11 + Express · Drizzle ORM + MySQL · Cloudflare R2 ·
Tailwind 4 · desplegado en Railway.

---

`/lab-reports` redirige a `/`, y `/?code=XXXX` reenvía a `/verify?code=XXXX`:
los códigos impresos en el empaque sobreviven a los cambios de rutas del sitio,
así que un QR viejo apuntando a la raíz no debe dejar al cliente en una lista de
PDF con su código descartado en silencio.

## Cómo funciona la verificación

Cada código puede consultarse un número limitado de veces (**3 por defecto**).

| Situación | Lo que ve el cliente | Lo que se guarda en el log |
|---|---|---|
| Código válido, 1ª consulta | Auténtico | `valid` |
| Código válido, 2ª y 3ª | Auténtico + aviso "Previously verified" con el conteo | `valid` |
| Código válido, 4ª en adelante | **Código no válido** | `limit_reached` |
| Código desactivado por el admin | **Código no válido** | `disabled` |
| Código que no existe | **Código no válido** | `not_found` |

Las tres formas de fallo se ven **idénticas** para el público, a propósito: decirle a
alguien que está probando etiquetas copiadas "este código es real pero está agotado"
le confirma cuál vale la pena reimprimir. La distinción sí queda en el log, donde es
útil y no es visible para quien prueba códigos.

### Por qué el contador es un solo UPDATE

El incremento vive en una única sentencia condicional (`db.consumeVerification`):

```sql
UPDATE auth_codes
   SET verificationCount = verificationCount + 1, ...
 WHERE id = ? AND disabled = false AND verificationCount < maxVerifications
```

Si dos personas consultan el mismo código en el mismo instante, con un
leer-y-después-escribir ambas leerían `verificationCount = 2`, ambas verían margen
bajo el límite de 3, y ambas escribirían 3: cuatro consultas exitosas en un código
que permite tres. Dejando que MySQL evalúe la guarda y el incremento en una sola
sentencia, el `UPDATE` que llega segundo no coincide con ninguna fila y se reporta
como agotado.

---

## Variables de entorno

| Variable | Para qué | Obligatoria |
|---|---|---|
| `DATABASE_URL` | MySQL. En Railway va con la referencia `${{MySQL.MYSQL_URL}}` | Sí |
| `JWT_SECRET` | Firma de la sesión del admin | Sí |
| `ADMIN_SETUP_TOKEN` | Secreto para crear el **primer** admin. Ver abajo | Sí, al inicio |
| `SEED_CATALOG` | `true` carga el catálogo inicial al arrancar. Borrar después | No |
| `MIRROR_REPORTS` | `true` copia a R2 los PDF enlazados. Borrar después | No |
| `R2_ACCOUNT_ID` | Cloudflare R2 | Para subir PDF |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 | Para subir PDF |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 | Para subir PDF |
| `R2_BUCKET` | Nombre del bucket | Para subir PDF |
| `R2_PUBLIC_URL` | URL pública del bucket, sin barra final | Para subir PDF |
| `PORT` | Lo inyecta Railway | No |

### Sobre `ADMIN_SETUP_TOKEN`

El endpoint de creación del primer admin solo se ofrece cuando la tabla `admin_users`
está vacía **y** esta variable existe. Sin ella, cualquier visitante anónimo podría
reclamar el panel durante toda la ventana entre que arranca el contenedor y que
alguien se da cuenta.

1. Pon la variable en Railway con un valor largo y aleatorio.
2. Entra a `/admin/login` y crea tu cuenta.
3. **Borra la variable de Railway.**

Si `R2_PUBLIC_URL` cambia después de haber subido archivos, los enlaces ya guardados
se rompen: las URLs se guardan completas en la base de datos. Conecta el dominio
propio del bucket **antes** de subir los reportes de producción.

---

## Base de datos

Las migraciones se aplican solas al arrancar el servidor, con el migrador de Drizzle
(`server/migrate.ts`). Una base vacía se provisiona sola en el primer deploy.

**No uses `drizzle-kit push`**: compara el esquema vivo contra `schema.ts` y ofrece
truncar tablas cuando ve una diferencia que no sabe reconciliar.

Para cambiar el esquema:

```bash
# 1. editar drizzle/schema.ts
# 2. generar el SQL
DATABASE_URL="..." npx drizzle-kit generate --name descripcion_del_cambio
# 3. commitear el .sql generado junto con el cambio de schema.ts
```

---

## Desarrollo local

```bash
pnpm install
cp .env.example .env      # y rellenar
pnpm dev                  # http://localhost:3000
```

```bash
pnpm check                # tsc --noEmit
pnpm test                 # vitest
pnpm build                # cliente + bundle del servidor
```

### Cargar el catálogo inicial

Dos formas, la misma lógica en las dos.

**En el servidor** (no necesitas alcanzar la base desde tu máquina): pon
`SEED_CATALOG=true` en Railway, espera el deploy, comprueba en los logs que
dice `[Seed] Done.`, y **borra la variable**. Está detrás de una variable para
que un reinicio del contenedor no lo vuelva a disparar cada vez.

**Desde tu máquina**, si puedes conectarte a la base:

```bash
DATABASE_URL="..." pnpm seed
```

Los COA viven en `client/public/lab-reports/`, servidos por el propio sitio:
enlazarlos a un dominio ajeno los deja fuera de nuestro control, y si ese sitio
los mueve se rompen los cuatro a la vez.

`SEED_CATALOG=true` carga lo que falte sin tocar lo existente.
`SEED_CATALOG=refresh` además **reapunta** los reportes de estos cuatro
productos a los PDF de `seed.ts` — es lo que hay que usar cuando el laboratorio
manda una versión nueva del mismo COA, porque crear otro dejaría dos enlaces
publicados para el mismo lote. Pisa lo que el panel tenga guardado para esos
cuatro, por eso no es el comportamiento por defecto.

Crea el producto de línea **Quantum Complex** (sin publicar, sin COA: es a
donde apuntan los códigos de verificación, que se imprimen para la línea y no
para un sabor) y los cuatro sabores de **QUANTUM COMPLEX** (Strawberry, Cherry Berry,
Blue Razz, Watermelon) con su COA de California, enlazado en
`getactivequantum.com`. Las imágenes de producto son estáticas, en
`client/public/products/`.

Es idempotente y aditivo: un producto cuyo slug ya existe se deja intacto, y un
reporte cuya URL ya está registrada no se vuelve a insertar. Correrlo de nuevo
sobre una base que el cliente ya editó no deshace su trabajo.

---

## Flujo de uso del panel

El orden importa: los reportes y los códigos cuelgan de un producto.

1. **Products** — crear el producto. Tres campos definen cómo se ve en la página
   pública:
   - **Product line** (ej. `QUANTUM COMPLEX`) es el encabezado bajo el que se
     agrupan las tarjetas. Es texto libre: los productos con el mismo texto caen
     en el mismo grupo. Los que no tengan ninguno van a "Other products".
   - **Name** es el sabor o variante (ej. `Strawberry`).
   - **Subtitle** es la línea secundaria de la tarjeta (ej. `10 COUNT DISPLAY —
     80MG PER TAB`).
2. **Lab Reports** — subir el PDF, asociarlo al producto y anotar el lote.
   En el panel, cada reporte se puede **subir** (va a R2) o **enlazar** por URL
   si ya está alojado en otro lado. Ver "Pasar los enlazados a R2" abajo.
3. **Verification Codes** — elegir producto, lote y número de consultas; después
   importar el archivo del cliente (CSV o TXT, uno por línea o separados por comas)
   o pegar la lista.

La importación del panel va **por bloques de 5.000** desde el navegador, con
barra de progreso: un archivo de cientos de miles de códigos en una sola
petición deja al servidor escribiendo varios minutos con la conexión abierta, y
si el navegador o el proxy se rinden a mitad de camino no hay forma de saber
cuántos entraron. En bloques, lo insertado queda insertado y reintentar es
gratis. Hay que dejar la pestaña abierta mientras corre.

Si el archivo llega antes de saber a qué producto pertenece, se importa sin
producto y después se corrige con **Assign product to existing codes**, que
reasigna producto y lote en bloque: por códigos sin producto, por lote, por
texto, o todos. Antes de escribir muestra cuántos códigos coinciden y pide
confirmación.

Reimportar un lote **no resetea** los códigos que ya existen, los salta. Si los
reseteara, reimportar un archivo para agregar tres códigos faltantes le devolvería
tres consultas frescas a todo el lote que ya está en la calle.

Cada código admite además, desde la tabla:

- **Desactivar** — deja de validar sin importar el conteo.
- **Resetear conteo** — le devuelve su cupo completo, para cuando un cliente
  legítimo reporta que gastó sus consultas por error.

---

## Pasar los enlazados a R2

Un reporte añadido por URL no guarda `fileKey`: el archivo vive en el servidor de
otro. Eso funciona hasta que ese servidor se mueve o caduca, y entonces se rompen
todos los COA del sitio a la vez sin que nada en nuestra base pueda repararlo.

Para quedarnos con copias propias:

**En el servidor**: `MIRROR_REPORTS=true` en Railway, esperar el deploy,
comprobar `[Mirror] Done.` en los logs y **borrar la variable**.

**Desde tu máquina**: `DATABASE_URL="..." pnpm mirror-reports`

Es idempotente: una fila que ya tiene `fileKey` es nuestra y se salta, así que
volver a correrlo después de enlazar dos reportes más solo copia esos dos.

Descarta cualquier respuesta que no empiece con `%PDF`, porque un 404 de
WordPress llega como un 200 con HTML dentro y guardarlo como COA cambiaría un
enlace externo que funciona por uno local roto.

> **Hazlo con el dominio propio ya conectado al bucket.** Las URLs se guardan
> completas: si copias con la Public Development URL (`pub-….r2.dev`) y después
> conectas el dominio, quedan apuntando a la vieja.

---

## Marca

Todo lo que lee el visitante y no se administra desde el panel está en
`shared/const.ts`: `BRAND_NAME`, `BRAND_DOMAIN`, `SUPPORT_EMAIL` y
`DEFAULT_MAX_VERIFICATIONS`. Renombrar el sitio es editar ahí, más el `<title>` de
`client/index.html`.

El logo está en `client/public/brand/logo.png` (PNG con transparencia, recortado
del original sobre blanco). Se usa en el header y en el footer.

El disclaimer de la FDA y la línea de copyright están en el componente
`SiteFooter` de `client/src/components/PublicLayout.tsx`.
