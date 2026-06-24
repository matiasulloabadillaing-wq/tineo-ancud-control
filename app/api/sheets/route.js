import { promises as fs } from "fs";
import path from "path";
import {
  crewSchedule,
  documents,
  foremen,
  generalProcesses,
  processCatalog,
  structures,
  tomorrowPlan,
  users
} from "../../../data/mockData";

export const runtime = "nodejs";

const dbPath = path.join(process.cwd(), "data", "runtime-db.json");

function defaultData() {
  return {
    users,
    foremen,
    structures,
    documents,
    processCatalog,
    generalProcesses,
    crewSchedule,
    tomorrowPlan,
    plans: [],
    reports: [],
    comments: []
  };
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { action = "getData", payload = {} } = body;

  const sheetUrl = process.env.APPS_SCRIPT_WEBAPP_URL;
  if (sheetUrl) {
    try {
      const sheetResponse = await fetch(sheetUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, payload })
      });
      if (sheetResponse.ok) {
        const result = await sheetResponse.json();
        if (result?.ok !== false) {
          if (result.data?.structures) {
            const debugStructure = result.data.structures.find((s) => (s.programRows || []).length > 0);
            if (debugStructure) {
              console.log(`[route.js] RAW programRows de Google Sheets para estructura ${debugStructure.id}:`);
              (debugStructure.programRows || []).forEach((row) => {
                console.log(`  item=${JSON.stringify(row.item)} (${typeof row.item}) start=${JSON.stringify(row.start)} end=${JSON.stringify(row.end)} fecha_inicio=${JSON.stringify(row.fecha_inicio)} fecha_termino=${JSON.stringify(row.fecha_termino)} completed=${JSON.stringify(row.completed)}`);
              });
              console.log(`  Total filas raw: ${(debugStructure.programRows || []).length}`);
            }
            result.data.structures = result.data.structures.map((s) => ({
              ...s,
              programRows: normalizeProgramRows(s.programRows || [])
            }));
            if (debugStructure) {
              const normalized = result.data.structures.find((s) => s.id === debugStructure.id);
              console.log(`[route.js] NORMALIZADO programRows para estructura ${debugStructure.id}:`);
              (normalized?.programRows || []).forEach((row) => {
                console.log(`  item=${JSON.stringify(row.item)} start=${JSON.stringify(row.start)} end=${JSON.stringify(row.end)} completed=${row.completed}`);
              });
            }
          }
          return Response.json({ ...result, source: "google-sheets" });
        }
      }
    } catch (_) {
      // If the sheet bridge is not ready, keep the local fallback alive for the demo.
    }
  }

  try {
    const data = await readLocalDb();
    const nextData = applyLocalAction(data, action, payload);
    await writeLocalDb(nextData);
    return Response.json({ ok: true, source: "local-json", data: nextData });
  } catch (error) {
    return Response.json({ ok: false, message: error.message || "No se pudo guardar." }, { status: 400 });
  }
}

async function readLocalDb() {
  try {
    const file = await fs.readFile(dbPath, "utf8");
    return { ...defaultData(), ...JSON.parse(file) };
  } catch (_) {
    return defaultData();
  }
}

async function writeLocalDb(data) {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2), "utf8");
}

function applyLocalAction(data, action, payload) {
  if (action === "getData") return data;

  if (action === "createUser") {
    const exists = data.users.some((item) => normalize(item.name) === normalize(payload.name));
    if (exists) throw new Error("El usuario ya existe.");
    return {
      ...data,
      users: [...data.users, { name: payload.name, password: payload.password, role: payload.role || "VISUALIZADOR" }]
    };
  }

  if (action === "deleteUser") {
    return {
      ...data,
      users: data.users.filter((item) => normalize(item.name) !== normalize(payload.name))
    };
  }

  if (action === "updateUser") {
    const originalName = payload.originalName || payload.name;
    const duplicated = data.users.some((item) => (
      normalize(item.name) === normalize(payload.name)
      && normalize(item.name) !== normalize(originalName)
    ));
    if (duplicated) throw new Error("El usuario ya existe.");
    return {
      ...data,
      users: data.users.map((item) => (
        normalize(item.name) === normalize(originalName)
          ? { name: payload.name, password: payload.password, role: payload.role || "VISUALIZADOR" }
          : item
      ))
    };
  }

  if (action === "createForeman") {
    const exists = data.foremen.some((item) => normalize(item.name) === normalize(payload.name));
    if (exists) throw new Error("El capataz ya existe.");
    return {
      ...data,
      foremen: [...data.foremen, { name: payload.name, specialty: payload.specialty || "OOCC" }]
    };
  }

  if (action === "deleteForeman") {
    return {
      ...data,
      foremen: data.foremen.filter((item) => normalize(item.name) !== normalize(payload.name))
    };
  }

  if (action === "updateForeman") {
    const originalName = payload.originalName || payload.name;
    const duplicated = data.foremen.some((item) => (
      normalize(item.name) === normalize(payload.name)
      && normalize(item.name) !== normalize(originalName)
    ));
    if (duplicated) throw new Error("El capataz ya existe.");
    return {
      ...data,
      foremen: data.foremen.map((item) => (
        normalize(item.name) === normalize(originalName)
          ? { name: payload.name, specialty: payload.specialty || "OOCC" }
          : item
      ))
    };
  }

  if (action === "updateStructure") {
    const cleanPayload = payload.programRows
      ? { ...payload, programRows: normalizeProgramRows(payload.programRows) }
      : payload;
    return {
      ...data,
      structures: data.structures.map((item) => item.id === payload.id ? { ...item, ...cleanPayload } : item)
    };
  }

  if (action === "repairProgramData") {
    return {
      ...data,
      structures: data.structures.map((item) => ({
        ...item,
        programRows: normalizeProgramRows(item.programRows || [])
      }))
    };
  }

  if (action === "createReport") {
    const now = new Date();
    const reportId = nextId(data.documents, "RPT");
    const doc = {
      id: reportId,
      structure: payload.structure?.id || "",
      date: now.toISOString().slice(0, 10),
      owner: payload.foreman?.name || "",
      type: "Avance Real (Terreno)"
    };
    const report = {
      id: reportId,
      createdAt: now.toISOString(),
      foreman: payload.foreman,
      structure: payload.structure,
      detailTitle: payload.detailTitle,
      activities: payload.activities || [],
      comment: payload.comment || ""
    };
    return {
      ...data,
      documents: [doc, ...data.documents],
      reports: [report, ...(data.reports || [])]
    };
  }

  if (action === "createPlan") {
    const now = new Date();
    const planId = payload.id || nextDocumentId(data.documents, data.plans || [], "PLA");
    const items = payload.items || [];
    const doc = {
      id: planId,
      structure: items.map((item) => item.structureId).filter(Boolean).join(", "),
      date: payload.date || now.toISOString().slice(0, 10),
      owner: payload.createdBy || "",
      type: `Planificacion (Ejecucion: ${payload.date || now.toISOString().slice(0, 10)})`
    };
    const plan = {
      id: planId,
      createdAt: now.toISOString(),
      date: payload.date || now.toISOString().slice(0, 10),
      createdBy: payload.createdBy || "",
      items
    };
    return {
      ...data,
      documents: [doc, ...data.documents],
      plans: [plan, ...(data.plans || [])]
    };
  }

  if (action === "createComment") {
    const now = new Date();
    const comment = {
      id: nextId(data.comments || [], "COM"),
      createdAt: now.toISOString(),
      structureId: payload.structureId,
      processItem: payload.processItem,
      processName: payload.processName,
      responsible: payload.responsible || "",
      comment: payload.comment
    };
    return {
      ...data,
      comments: [comment, ...(data.comments || [])]
    };
  }

  return data;
}

function nextDocumentId(documentsRows, planRows, prefix) {
  const max = [...(documentsRows || []), ...(planRows || [])]
    .map((item) => String(item.id || item.plan_id || item.planId || ""))
    .filter((id) => id.startsWith(`${prefix}-`))
    .map((id) => Number(id.split("-").pop()))
    .filter((value) => Number.isFinite(value))
    .reduce((highest, value) => Math.max(highest, value), 0);
  return `${prefix}-${new Date().getFullYear()}-${String(max + 1).padStart(4, "0")}`;
}

function nextId(rows, prefix) {
  const max = rows
    .map((item) => String(item.id || ""))
    .filter((id) => id.startsWith(`${prefix}-`))
    .map((id) => Number(id.replace(`${prefix}-`, "")))
    .filter((value) => Number.isFinite(value))
    .reduce((highest, value) => Math.max(highest, value), 0);
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeProgramRows(rows = []) {
  const byItem = new Map(
    generalProcesses.map((process) => [
      String(process.item),
      {
        item: String(process.item),
        name: process.name,
        weight: process.weight,
        start: "",
        end: "",
        real: 0,
        planned: 0,
        completed: false
      }
    ])
  );

  rows.forEach((row) => {
    const item = normalizeProgramItem(row.item);
    if (!item || !byItem.has(item)) return;
    const base = byItem.get(item);
    const completed = readBoolean(row.completed ?? row.finalizada_100);
    const real = Number(row.real ?? row.avance_real);
    const planned = Number(row.planned ?? row.avance_programado);
    byItem.set(item, {
      ...base,
      name: row.name || row.partida || base.name,
      weight: Number(row.weight ?? row.peso ?? base.weight) || base.weight,
      start: cleanIsoDate(row.start || row.fecha_inicio),
      end: cleanIsoDate(row.end || row.fecha_termino),
      real: Number.isFinite(real) ? real : base.real,
      planned: Number.isFinite(planned) ? planned : base.planned,
      completed: completed === null ? base.completed : completed
    });
  });

  return generalProcesses.map((process) => byItem.get(String(process.item)));
}

function normalizeProgramItem(value) {
  const text = String(value ?? "").trim().replace(",", ".");
  return generalProcesses.find((process) => String(process.item) === text)?.item || "";
}

function cleanIsoDate(value) {
  if (!value) return "";
  const text = String(value);
  const iso = text.match(/\d{4}-\d{2}-\d{2}/);
  return iso ? iso[0] : "";
}

function readBoolean(value) {
  if (typeof value === "boolean") return value;
  const text = String(value || "").trim().toUpperCase();
  if (!text) return null;
  if (["SI", "SÍ", "TRUE", "VERDADERO", "FINALIZADA", "LIBERADA"].includes(text)) return true;
  if (["NO", "FALSE", "FALSO"].includes(text)) return false;
  return null;
}
