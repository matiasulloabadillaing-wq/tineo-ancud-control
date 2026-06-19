# Conexion Google Sheets

La aplicacion ya tiene dos modos de datos:

1. **Modo local**: si no existe `APPS_SCRIPT_WEBAPP_URL`, guarda cambios en `data/runtime-db.json`.
2. **Modo Google Sheets**: si existe `APPS_SCRIPT_WEBAPP_URL`, envia altas/modificaciones/reportes al Apps Script.

## Pegar backend en Apps Script

1. Abra el Google Sheet maestro.
2. Vaya a `Extensiones > Apps Script`.
3. Cree o reemplace el archivo `Code.gs` con:

   `google-sheets-backend/Code.gs`

4. Guarde.
5. Presione `Implementar > Nueva implementacion`.
6. Tipo: `Aplicacion web`.
7. Ejecutar como: `Yo`.
8. Quien tiene acceso: segun su prueba, puede ser `Cualquier usuario con el enlace`.
9. Copie la URL de la aplicacion web.

## Activar conexion en Next.js

1. En la carpeta `tineo-ancud-next`, cree un archivo llamado `.env.local`.
2. Agregue:

```bash
APPS_SCRIPT_WEBAPP_URL=https://script.google.com/macros/s/XXXXXXXX/exec
```

3. Detenga el servidor con `Control + C`.
4. Vuelva a ejecutar:

```bash
npm run dev
```

Desde ese momento, los usuarios, capataces, comentarios, programaciones y reportes se guardan en Google Sheets.
