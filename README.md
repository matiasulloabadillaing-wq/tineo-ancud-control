# TINEO-ANCUD - Prototipo Next.js

Este proyecto es una primera maqueta funcional en Next.js para presentar el software TINEO-ANCUD como web app moderna.

## Que es Next.js

Next.js es una tecnologia para crear paginas y aplicaciones web. A diferencia de Apps Script, permite construir interfaces mas profesionales, con mejor control visual, modales, dashboards, Gantt, filtros, vistas moviles y despliegue como pagina web.

## Que necesita el usuario final

Nada instalado.

Cuando la aplicacion este publicada, los usuarios entran con un link, por ejemplo:

```text
https://tineo-ancud.vercel.app
```

Desde celular tambien se puede instalar como PWA, que funciona como acceso directo con aspecto de app.

## Que necesita el desarrollador

Para ejecutar o modificar el proyecto localmente en un Mac se necesita:

- Node.js
- npm, que viene incluido con Node.js

Descarga oficial:

```text
https://nodejs.org
```

Se recomienda instalar la version LTS.

## Instalacion paso a paso en Mac

### 1. Instalar Node.js

1. Abre Safari/Chrome.
2. Entra a:

```text
https://nodejs.org
```

3. Descarga la version marcada como **LTS**.
4. Abre el archivo descargado `.pkg`.
5. Sigue el instalador con `Continuar` hasta terminar.
6. Cuando finalice, cierra y vuelve a abrir Terminal si ya estaba abierta.

### 2. Verificar instalacion

Abre la aplicacion **Terminal** en tu Mac.

Puedes encontrarla en:

```text
Aplicaciones > Utilidades > Terminal
```

O buscarla con Spotlight:

```text
Cmd + Espacio
```

Luego escribe:

```bash
node -v
```

Debe aparecer algo parecido a:

```text
v22.x.x
```

Despues escribe:

```bash
npm -v
```

Debe aparecer algo parecido a:

```text
10.x.x
```

Si ambos comandos responden con version, la instalacion esta lista.

## Como ejecutar localmente la aplicacion

### 1. Abrir Terminal en la carpeta del proyecto

La carpeta del proyecto es:

```text
/Users/matias/Documents/Codex/2026-06-15/desarrollar-un-software-mediante-app-script/outputs/tineo-ancud-next
```

En Terminal, ejecuta:

```bash
cd /Users/matias/Documents/Codex/2026-06-15/desarrollar-un-software-mediante-app-script/outputs/tineo-ancud-next
```

Para confirmar que estas en la carpeta correcta:

```bash
pwd
```

Y puedes listar los archivos:

```bash
ls
```

Deberias ver archivos como:

```text
package.json
app
data
README.md
```

### 2. Instalar dependencias

La primera vez hay que instalar los paquetes que usa Next.js:

```bash
npm install
```

Esto puede demorar algunos minutos. Al terminar se creara una carpeta llamada:

```text
node_modules
```

Esa carpeta no se edita manualmente; es donde quedan las dependencias.

### 3. Ejecutar la aplicacion

Luego ejecuta:

```bash
npm run dev
```

Si todo esta correcto, Terminal mostrara algo parecido a:

```text
Local: http://localhost:3000
```

Abre en el navegador:

```text
http://localhost:3000
```

### 4. Detener la aplicacion

Cuando quieras detener el servidor local:

1. Vuelve a Terminal.
2. Presiona:

```text
Ctrl + C
```

Si pregunta si deseas terminar, responde `y` y presiona Enter.

## Errores comunes

### Error: `npm: command not found`

Significa que Node.js/npm no esta instalado o Terminal no lo reconocio.

Solucion:

1. Instalar Node.js desde `https://nodejs.org`.
2. Cerrar Terminal.
3. Abrir Terminal nuevamente.
4. Probar:

```bash
npm -v
```

### Error: `EADDRINUSE: address already in use`

Significa que el puerto `3000` ya esta ocupado por otra aplicacion.

Solucion simple:

```bash
npm run dev -- -p 3001
```

Y abrir:

```text
http://localhost:3001
```

### Error despues de modificar archivos

Normalmente Next.js actualiza solo. Si algo queda pegado:

1. Detener con `Ctrl + C`.
2. Ejecutar nuevamente:

```bash
npm run dev
```

### Pantalla en blanco

Revisar Terminal. Si hay errores, normalmente aparecen ahi con archivo y linea.

## Que archivos se editan normalmente

| Archivo | Uso |
|---|---|
| `app/page.jsx` | Pantallas, botones, logica visual |
| `app/globals.css` | Colores, tamanos, diseno |
| `data/mockData.js` | Datos simulados de la demo |
| `app/layout.jsx` | Titulo general y estructura base |

## Que NO se edita manualmente

| Carpeta/archivo | Motivo |
|---|---|
| `node_modules` | Dependencias instaladas automaticamente |
| `.next` | Carpeta generada por Next.js al ejecutar |
| `package-lock.json` | Archivo tecnico generado por npm |

## Como publicar

La opcion recomendada es Vercel:

1. Crear cuenta en Vercel.
2. Subir el proyecto a GitHub.
3. Conectar GitHub con Vercel.
4. Publicar.

Vercel entrega una URL gratis tipo:

```text
https://tineo-ancud.vercel.app
```

Dominio propio es opcional.

## Alcance de esta maqueta

Incluye pantallas visuales para:

- Login.
- Reporte rapido terreno.
- Dashboard - Control de Estructuras.
- Dashboard - Vision General.
- Modal de estructura.
- Programacion temporal.
- Inspeccion de procesos.
- Carta Gantt general.
- Programacion de cuadrillas.
- Reportabilidad - Planificacion manana.
- Reportabilidad - Historial y PDF.

Los datos son simulados, basados en la estructura de la hoja Google actual.

## Siguiente etapa

Para convertir esto en sistema real hay que conectar:

- Base de datos Supabase o Firebase.
- Usuarios y permisos reales.
- Importacion inicial desde Google Sheets.
- Reportes reales RPT.
- Planificacion diaria PLA.
- Generacion de PDF.
- Publicacion en Vercel.
