const SPREADSHEET_ID = '1Cy-qHoKwrIfjn4D8GkD0Ylyj7mgvefxQeNy57GFgnZs';
const GENERAL_PROCESSES = [
  { item: '1', name: 'Liberacion', weight: 5 },
  { item: '2', name: 'Perturbacion Controlada', weight: 5 },
  { item: '3', name: 'Tala y Roce', weight: 10 },
  { item: '4', name: 'Construccion de Acceso', weight: 10 },
  { item: '5', name: 'Replanteo y Trazado', weight: 5 },
  { item: '6.1', name: 'OOCC Detallado', weight: 24.3 },
  { item: '6.2', name: 'OOMM Montaje', weight: 30.7 },
  { item: '7', name: 'Malla Puesta a Tierra', weight: 10 }
];

function doPost(e) {
  const body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : '{}');
  const action = body.action || 'getData';
  const payload = body.payload || {};
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  if (action === 'createUser') {
    appendUser_(ss, payload);
  }

  if (action === 'deleteUser') {
    deleteByColumn_(ss, 'SIS_USUARIOS', 'nombre', payload.name);
  }

  if (action === 'updateUser') {
    updateUser_(ss, payload);
  }

  if (action === 'createForeman') {
    appendForeman_(ss, payload);
  }

  if (action === 'deleteForeman') {
    deleteByColumn_(ss, 'DATA_CAPATAZ', 'NOMBRES', payload.name);
  }

  if (action === 'updateForeman') {
    updateForeman_(ss, payload);
  }

  if (action === 'createReport') {
    appendReport_(ss, payload);
  }

  if (action === 'createPlan') {
    appendDailyPlan_(ss, payload);
  }

  if (action === 'updateStructure') {
    upsertStructureState_(ss, payload);
    if (payload.programRows) appendProgram_(ss, payload);
  }

  if (action === 'createComment') {
    appendComment_(ss, payload);
  }

  if (action === 'repairProgramData') {
    repairProgramData_(ss);
  }

  return json_({ ok: true, data: getData_(ss) });
}

function doGet() {
  return json_({ ok: true, data: getData_(SpreadsheetApp.openById(SPREADSHEET_ID)) });
}

function getData_(ss) {
  return {
    users: readUsers_(ss),
    foremen: readForemen_(ss),
    structures: readStructures_(ss),
    documents: readDocuments_(ss),
    reports: readSheetObjects_(ss, 'SIS_REPORTES'),
    plans: readPlans_(ss),
    comments: readComments_(ss),
    processCatalog: readProcessCatalog_(ss),
    generalProcesses: [],
    tomorrowPlan: []
  };
}

function readUsers_(ss) {
  return readSheetObjects_(ss, 'SIS_USUARIOS').map((row) => ({
    name: row.nombre || row.usuario || row.USUARIO || '',
    password: String(row.clave || row.password || row.CLAVE || ''),
    role: row.rol || row.ROLE || 'VISUALIZADOR'
  })).filter((row) => row.name && row.password);
}

function readForemen_(ss) {
  return readSheetObjects_(ss, 'DATA_CAPATAZ').map((row) => ({
    name: row.NOMBRES || row.nombre || row.capataz || '',
    specialty: row.ESPECIALIDAD || row.especialidad || 'OOCC'
  })).filter((row) => row.name);
}

function readStructures_(ss) {
  const genera = readSheetObjects_(ss, 'DATA_GENERA');
  const states = readSheetObjects_(ss, 'SIS_ESTADO_ESTRUCTURA');
  const programs = readProgramsByStructure_(ss);
  const byStructure = {};
  states.forEach((row) => {
    const id = String(row.estructura || row['N° Estructura'] || '').trim();
    if (id) byStructure[id] = row;
  });

  return genera.map((row) => {
    const id = String(row['N° Estructura'] || row.estructura || row.Estructura || '').trim();
    const state = byStructure[id] || {};
    return {
      id,
      type: row.Tipo || row.tipo || '',
      towerId: row['ID. Torre'] || row.id_torre || '',
      foundation: row['Tipo OOCC'] || row.tipo_oocc || '',
      mountingType: row['Tipo OOMM'] || row.tipo_oomm || 'Pendiente',
      legal: state.estado_legal || state.legal || 'PENDIENTE',
      programmed: toBoolOrNull_(state.programada || state.programado),
      real: toNumberOrNull_(state.avance_real_global || state.real),
      planned: toNumberOrNull_(state.avance_programado_global || state.programado),
      programRows: programs[id] || []
    };
  }).filter((row) => row.id);
}

function readDocuments_(ss) {
  const reports = readSheetObjects_(ss, 'SIS_REPORTES').map((row) => ({
    id: row.reporte_id || row.id || '',
    structure: row.estructura || '',
    date: String(row.fecha_hora || '').slice(0, 10),
    owner: row.reportado_por || '',
    type: row.partida || 'Avance Real (Terreno)'
  })).filter((row) => row.id);
  const plans = readPlans_(ss).map((row) => ({
    id: row.id,
    structure: (row.items || []).map((item) => item.structureId).filter(Boolean).join(', '),
    date: row.date || '',
    owner: row.createdBy || '',
    type: 'Planificacion (Ejecucion: ' + (row.date || '') + ')'
  })).filter((row) => row.id);
  return reports.concat(plans).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function readPlans_(ss) {
  const grouped = {};
  readSheetObjects_(ss, 'SIS_PLAN_DIARIO').forEach((row) => {
    const id = row.plan_id || row.id || '';
    if (!id) return;
    if (!grouped[id]) {
      grouped[id] = {
        id: id,
        createdAt: row.fecha_creacion || '',
        date: formatDateForClient_(row.fecha_planificada),
        createdBy: row.creado_por || '',
        items: []
      };
    }
    grouped[id].items.push({
      structureId: String(row.estructura || ''),
      specialty: row.especialidad || '',
      activityCode: row.codigo_actividad || '',
      activityName: row.actividad || '',
      foremanName: row.capataz || '',
      note: row.observaciones || ''
    });
  });
  return Object.keys(grouped).map((id) => grouped[id]);
}

function readComments_(ss) {
  return readSheetObjects_(ss, 'SIS_COMENTARIOS').map((row) => ({
    id: row.comentario_id || row.id || '',
    createdAt: row.fecha_hora || '',
    structureId: row.estructura || '',
    processItem: row.item || '',
    processName: row.partida || '',
    responsible: row.responsable || '',
    comment: row.comentario || ''
  })).filter((row) => row.id || row.comment);
}

function readProgramsByStructure_(ss) {
  const rows = readSheetObjects_(ss, 'SIS_PROGRAMA_GENERAL');
  const grouped = {};
  rows.forEach((row) => {
    const id = String(row.estructura || '').trim();
    if (!id) return;
    const item = normalizeProgramItem_(row.item);
    if (!item) return;
    if (!grouped[id]) grouped[id] = {};
    const canonical = getGeneralProcess_(item);
    grouped[id][item] = {
      item: item,
      name: canonical.name,
      weight: canonical.weight,
      start: formatDateForClient_(row.fecha_inicio),
      end: formatDateForClient_(row.fecha_termino),
      completed: toBoolOrNull_(row.finalizada_100) === true
    };
  });
  Object.keys(grouped).forEach((id) => {
    grouped[id] = GENERAL_PROCESSES
      .map((process) => grouped[id][process.item])
      .filter(Boolean);
  });
  return grouped;
}

function readProcessCatalog_(ss) {
  const catalog = { OOCC: {}, OOMM: {}, OOTT: {} };
  readSheetObjects_(ss, 'DATA_PROCESO').forEach((row) => {
    const category = row.CATEGORIA || row.categoria || '';
    const process = row['Proceso'] || row['Tipo'] || row.descripcion_proceso || row['Descripción Proceso'] || row['DESCRIPCIÓN'] || '';
    const activity = row.Actividad || row.actividad || row.Detalle || row.DETALLE || '';
    const code = row.Codigo || row.codigo || row['Código'] || '';
    const weight = toNumberOrNull_(row.Ponderacion || row['% Ponderación'] || row.PONDERACION || row.Ponderación) || 0;
    if (!catalog[category] || !process || !activity) return;
    if (!catalog[category][process]) catalog[category][process] = [];
    catalog[category][process].push({ code, name: activity, weight, real: 0, planned: 0 });
  });
  return catalog;
}

function appendUser_(ss, payload) {
  if (existsByColumn_(ss, 'SIS_USUARIOS', 'nombre', payload.name)) return;
  appendObject_(ss, 'SIS_USUARIOS', {
    usuario_id: nextId_(ss, 'SIS_USUARIOS', 'USR'),
    nombre: payload.name,
    clave: payload.password,
    rol: payload.role || 'VISUALIZADOR',
    activo: 'SI',
    creado_en: new Date(),
    actualizado_en: new Date()
  });
}

function appendForeman_(ss, payload) {
  if (existsByColumn_(ss, 'DATA_CAPATAZ', 'NOMBRES', payload.name)) return;
  appendObject_(ss, 'DATA_CAPATAZ', {
    NOMBRES: payload.name,
    ESPECIALIDAD: payload.specialty || 'OOCC'
  });
}

function updateUser_(ss, payload) {
  const sheet = getOrCreateSheet_(ss, 'SIS_USUARIOS');
  const headers = getHeaders_(sheet, ['usuario_id', 'nombre', 'clave', 'rol', 'activo', 'creado_en', 'actualizado_en']);
  const originalName = payload.originalName || payload.name;
  const targetRow = findRowByColumn_(sheet, headers, 'nombre', originalName);
  const duplicateRow = findRowByColumn_(sheet, headers, 'nombre', payload.name);
  if (duplicateRow && duplicateRow !== targetRow) return;

  if (!targetRow) {
    appendUser_(ss, payload);
    return;
  }

  const current = sheet.getRange(targetRow, 1, 1, headers.length).getValues()[0];
  const object = {};
  headers.forEach((header, index) => object[header] = current[index] || '');
  object.nombre = payload.name;
  object.clave = payload.password;
  object.rol = payload.role || object.rol || 'VISUALIZADOR';
  object.activo = object.activo || 'SI';
  object.actualizado_en = new Date();
  sheet.getRange(targetRow, 1, 1, headers.length).setValues([headers.map((header) => object[header] || '')]);
}

function updateForeman_(ss, payload) {
  const sheet = getOrCreateSheet_(ss, 'DATA_CAPATAZ');
  const headers = getHeaders_(sheet, ['NOMBRES', 'ESPECIALIDAD']);
  const originalName = payload.originalName || payload.name;
  const targetRow = findRowByColumn_(sheet, headers, 'NOMBRES', originalName);
  const duplicateRow = findRowByColumn_(sheet, headers, 'NOMBRES', payload.name);
  if (duplicateRow && duplicateRow !== targetRow) return;

  if (!targetRow) {
    appendForeman_(ss, payload);
    return;
  }

  const current = sheet.getRange(targetRow, 1, 1, headers.length).getValues()[0];
  const object = {};
  headers.forEach((header, index) => object[header] = current[index] || '');
  object.NOMBRES = payload.name;
  object.ESPECIALIDAD = payload.specialty || object.ESPECIALIDAD || 'OOCC';
  sheet.getRange(targetRow, 1, 1, headers.length).setValues([headers.map((header) => object[header] || '')]);
}

function existsByColumn_(ss, sheetName, columnName, value) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return false;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((header) => String(header).trim());
  const column = headers.indexOf(columnName) + 1;
  if (!column) return false;
  const values = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getValues();
  return values.some((row) => String(row[0]).trim().toLowerCase() === String(value || '').trim().toLowerCase());
}

function findRowByColumn_(sheet, headers, columnName, value) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const column = headers.indexOf(columnName) + 1;
  if (!column) return 0;
  const target = String(value || '').trim().toLowerCase();
  if (!target) return 0;
  const values = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getValues();
  for (let index = 0; index < values.length; index++) {
    if (String(values[index][0]).trim().toLowerCase() === target) return index + 2;
  }
  return 0;
}

function appendReport_(ss, payload) {
  const reportId = nextId_(ss, 'SIS_REPORTES', 'RPT');
  const now = new Date();
  const activities = payload.activities || [];
  if (!activities.length) {
    appendReportRow_(ss, reportId, now, payload, {});
    return;
  }
  activities.forEach((activity) => appendReportRow_(ss, reportId, now, payload, activity));
}

function appendDailyPlan_(ss, payload) {
  const planId = payload.id || nextId_(ss, 'SIS_PLAN_DIARIO', 'PLA');
  const now = new Date();
  const items = payload.items || [];
  if (!items.length) {
    appendObject_(ss, 'SIS_PLAN_DIARIO', {
      plan_id: planId,
      fecha_creacion: now,
      fecha_planificada: payload.date || '',
      creado_por: payload.createdBy || '',
      capataz: '',
      especialidad: '',
      estructura: '',
      partida: '',
      codigo_actividad: '',
      actividad: '',
      observaciones: '',
      estado: 'PLANIFICADO',
      reporte_relacionado: ''
    });
    return;
  }
  items.forEach((item) => {
    appendObject_(ss, 'SIS_PLAN_DIARIO', {
      plan_id: planId,
      fecha_creacion: now,
      fecha_planificada: payload.date || '',
      creado_por: payload.createdBy || '',
      capataz: item.foremanName || '',
      especialidad: item.specialty || '',
      estructura: item.structureId || '',
      partida: item.specialty || '',
      codigo_actividad: item.activityCode || '',
      actividad: item.activityName || '',
      observaciones: item.note || '',
      estado: 'PLANIFICADO',
      reporte_relacionado: ''
    });
  });
}

function upsertStructureState_(ss, payload) {
  const sheet = getOrCreateSheet_(ss, 'SIS_ESTADO_ESTRUCTURA');
  const headers = getHeaders_(sheet, ['estructura', 'estado_legal', 'programada', 'avance_real_global', 'avance_programado_global', 'desviacion_global', 'actualizado_en']);
  const estructuraCol = headers.indexOf('estructura') + 1;
  let targetRow = 0;
  if (sheet.getLastRow() >= 2 && estructuraCol) {
    const values = sheet.getRange(2, estructuraCol, sheet.getLastRow() - 1, 1).getValues();
    values.forEach((row, index) => {
      if (String(row[0]).trim() === String(payload.id).trim()) targetRow = index + 2;
    });
  }
  if (!targetRow) targetRow = sheet.getLastRow() + 1;
  const current = targetRow <= sheet.getLastRow()
    ? sheet.getRange(targetRow, 1, 1, headers.length).getValues()[0]
    : [];
  const object = {};
  headers.forEach((header, index) => object[header] = current[index] || '');
  object.estructura = payload.id;
  if (payload.legal !== undefined) object.estado_legal = payload.legal;
  if (payload.programmed !== undefined) object.programada = payload.programmed ? 'SI' : 'NO';
  if (payload.real !== undefined) object.avance_real_global = payload.real;
  if (payload.planned !== undefined) object.avance_programado_global = payload.planned;
  object.actualizado_en = new Date();
  sheet.getRange(targetRow, 1, 1, headers.length).setValues([headers.map((header) => object[header] || '')]);
}

function appendProgram_(ss, payload) {
  var sheet = getOrCreateSheet_(ss, 'SIS_PROGRAMA_GENERAL');
  var headers = getHeaders_(sheet, ['programa_id', 'estructura', 'item', 'partida', 'peso', 'fecha_inicio', 'fecha_termino', 'finalizada_100', 'actualizado_por', 'actualizado_en', 'creado_en']);
  var normalizedRows = normalizeProgramRows_(payload.programRows || []);
  var structureId = String(payload.id).trim();
  var now = new Date();

  var existingByItem = {};
  if (sheet.getLastRow() >= 2) {
    var colEstructura = headers.indexOf('estructura') + 1;
    var colItem = headers.indexOf('item') + 1;
    if (colEstructura && colItem) {
      var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
      for (var i = 0; i < data.length; i++) {
        var rowStructure = String(data[i][colEstructura - 1]).trim();
        var rowItem = String(data[i][colItem - 1]).trim().replace(',', '.');
        if (rowStructure === structureId) {
          existingByItem[rowItem] = i + 2;
        }
      }
    }
  }

  var planId = nextId_(ss, 'SIS_PROGRAMA_GENERAL', 'PROG');
  normalizedRows.forEach(function(row) {
    var object = {
      programa_id: planId,
      estructura: structureId,
      item: row.item,
      partida: row.name,
      peso: row.weight,
      fecha_inicio: row.start || '',
      fecha_termino: row.end || '',
      finalizada_100: row.completed ? 'SI' : 'NO',
      actualizado_en: now,
      creado_en: now
    };
    var targetRow = existingByItem[String(row.item).trim()];
    if (targetRow) {
      var current = sheet.getRange(targetRow, 1, 1, headers.length).getValues()[0];
      var merged = {};
      headers.forEach(function(h, idx) { merged[h] = current[idx] || ''; });
      merged.partida = object.partida;
      merged.peso = object.peso;
      merged.fecha_inicio = object.fecha_inicio;
      merged.fecha_termino = object.fecha_termino;
      merged.finalizada_100 = object.finalizada_100;
      merged.actualizado_en = now;
      sheet.getRange(targetRow, 1, 1, headers.length).setValues([headers.map(function(h) { return merged[h] !== undefined ? merged[h] : ''; })]);
    } else {
      sheet.appendRow(headers.map(function(h) { return object[h] !== undefined ? object[h] : ''; }));
    }
  });
}

function repairProgramData_(ss) {
  const sheet = getOrCreateSheet_(ss, 'SIS_PROGRAMA_GENERAL');
  const headers = getHeaders_(sheet, ['programa_id', 'estructura', 'item', 'partida', 'peso', 'fecha_inicio', 'fecha_termino', 'finalizada_100', 'avance_programado', 'actualizado_por', 'actualizado_en', 'creado_en']);
  const programsByStructure = readProgramsByStructure_(ss);
  const structureIds = readStructures_(ss)
    .map((structure) => String(structure.id || '').trim())
    .filter(Boolean);
  const rows = [];

  structureIds.forEach((structureId) => {
    const existingRows = programsByStructure[structureId] || [];
    const normalizedRows = normalizeProgramRows_(existingRows);
    const planId = nextId_(ss, 'SIS_PROGRAMA_GENERAL', 'PROG');
    normalizedRows.forEach((row) => {
      const object = {
        programa_id: planId,
        estructura: structureId,
        item: row.item,
        partida: row.name,
        peso: row.weight,
        fecha_inicio: row.start || '',
        fecha_termino: row.end || '',
        finalizada_100: row.completed ? 'SI' : 'NO',
        creado_en: new Date()
      };
      rows.push(headers.map((header) => object[header] || ''));
    });
  });

  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function normalizeProgramRows_(rows) {
  const byItem = {};
  GENERAL_PROCESSES.forEach((process) => {
    byItem[process.item] = {
      item: process.item,
      name: process.name,
      weight: process.weight,
      start: '',
      end: '',
      completed: false
    };
  });
  rows.forEach((row) => {
    const item = normalizeProgramItem_(row.item);
    if (!item || !byItem[item]) return;
    const process = getGeneralProcess_(item);
    byItem[item] = {
      item: item,
      name: process.name,
      weight: process.weight,
      start: formatDateForClient_(row.start || row.fecha_inicio),
      end: formatDateForClient_(row.end || row.fecha_termino),
      completed: row.completed === true || toBoolOrNull_(row.finalizada_100) === true
    };
  });
  return GENERAL_PROCESSES.map((process) => byItem[process.item]);
}

function normalizeProgramItem_(value) {
  const text = String(value == null ? '' : value).trim().replace(',', '.');
  var match = GENERAL_PROCESSES.filter(function(process) { return process.item === text; });
  return match.length ? match[0].item : '';
}

function getGeneralProcess_(item) {
  return GENERAL_PROCESSES.find((process) => process.item === item) || { item: item, name: '', weight: 0 };
}

function appendComment_(ss, payload) {
  appendObject_(ss, 'SIS_COMENTARIOS', {
    comentario_id: nextId_(ss, 'SIS_COMENTARIOS', 'COM'),
    fecha_hora: new Date(),
    estructura: payload.structureId,
    item: payload.processItem,
    partida: payload.processName,
    responsable: payload.responsible || '',
    comentario: payload.comment
  });
}

function appendReportRow_(ss, reportId, now, payload, activity) {
  appendObject_(ss, 'SIS_REPORTES', {
    reporte_id: reportId,
    fecha_hora: now,
    origen: 'WEB',
    reportado_por: payload.foreman && payload.foreman.name,
    especialidad: payload.foreman && payload.foreman.specialty,
    estructura: payload.structure && payload.structure.id,
    partida: payload.detailTitle || '',
    codigo_actividad: activity.code || '',
    actividad: activity.name || '',
    avance_anterior: activity.previous || 0,
    avance_nuevo: activity.value || 0,
    comentario: payload.comment || ''
  });
}

function appendObject_(ss, sheetName, object) {
  const sheet = getOrCreateSheet_(ss, sheetName);
  const headers = getHeaders_(sheet, Object.keys(object));
  const row = headers.map((header) => object[header] !== undefined ? object[header] : '');
  sheet.appendRow(row);
}

function readSheetObjects_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) return [];
  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headers = values.shift().map((header) => String(header).trim());
  return values.map((row) => {
    const object = {};
    headers.forEach((header, index) => object[header] = row[index]);
    return object;
  });
}

function getHeaders_(sheet, fallbackHeaders) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(fallbackHeaders);
    return fallbackHeaders;
  }
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), fallbackHeaders.length)).getValues()[0].map((header) => String(header).trim());
  fallbackHeaders.forEach((header) => {
    if (!headers.includes(header)) {
      sheet.getRange(1, headers.length + 1).setValue(header);
      headers.push(header);
    }
  });
  return headers;
}

function getOrCreateSheet_(ss, sheetName) {
  return ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
}

function deleteByColumn_(ss, sheetName, columnName, value) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((header) => String(header).trim());
  const column = headers.indexOf(columnName) + 1;
  if (!column) return;
  for (let row = sheet.getLastRow(); row >= 2; row--) {
    if (String(sheet.getRange(row, column).getValue()).trim().toLowerCase() === String(value || '').trim().toLowerCase()) {
      sheet.deleteRow(row);
    }
  }
}

function nextId_(ss, sheetName, prefix) {
  const rows = readSheetObjects_(ss, sheetName);
  const max = rows.map((row) => String(row.reporte_id || row.plan_id || row.programa_id || row.comentario_id || row.usuario_id || row.id || ''))
    .filter((id) => id.indexOf(prefix + '-') === 0)
    .map((id) => Number(String(id).split('-').pop()))
    .filter((number) => !isNaN(number))
    .reduce((highest, number) => Math.max(highest, number), 0);
  if (prefix === 'PLA') return prefix + '-' + new Date().getFullYear() + '-' + String(max + 1).padStart(4, '0');
  return prefix + '-' + String(max + 1).padStart(4, '0');
}

function toBoolOrNull_(value) {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return null;
  if (['SI', 'SÍ', 'TRUE', 'VERDADERO', 'PROGRAMADA'].includes(text)) return true;
  if (['NO', 'FALSE', 'FALSO', 'NO PROGRAMADA'].includes(text)) return false;
  return null;
}

function toNumberOrNull_(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(String(value).replace('%', '').replace(',', '.'));
  return isNaN(number) ? null : number;
}

function formatDateForClient_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const text = String(value);
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : text;
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
