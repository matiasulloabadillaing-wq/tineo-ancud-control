"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  crewSchedule,
  documents,
  foremen,
  generalProcesses,
  ooccDetail,
  oommDetail,
  processCatalog,
  structures,
  taskLegend,
  tomorrowPlan,
  users
} from "../data/mockData";

const modules = [
  { id: "dashboard", label: "Control de Avance", short: "CA" },
  { id: "gantt", label: "Carta Gantt", short: "CG" },
  { id: "reportabilidad", label: "Reportabilidad", short: "RP" },
  { id: "config", label: "Configuracion", short: "CF" }
];

const GLOBALTEC_LOGO_URL = "/globaltec-logo.png";
const APP_TITLE = "Software control de Proyectos";
const PROJECT_NAME = "LT2x500kVA Tineo-Ancud";
const DEFAULT_DATA = {
  users,
  foremen,
  structures,
  documents,
  processCatalog,
  generalProcesses,
  crewSchedule,
  tomorrowPlan,
  reports: [],
  plans: [],
  comments: []
};

export default function Home() {
  const [appData, setAppData] = useState(DEFAULT_DATA);
  const [syncStatus, setSyncStatus] = useState("Cargando base operativa...");
  const [user, setUser] = useState(null);
  const [module, setModule] = useState("dashboard");
  const [dashboardTab, setDashboardTab] = useState("estructuras");
  const [structureTypeFilter, setStructureTypeFilter] = useState("Todos los Tipos");
  const [weightedView, setWeightedView] = useState("Avance Proyecto Global");
  const [structureOrder, setStructureOrder] = useState("Por Numero de Torre");
  const [ganttTab, setGanttTab] = useState("general");
  const [reportTab, setReportTab] = useState("plan");
  const [selectedStructure, setSelectedStructure] = useState(null);
  const [detailTab, setDetailTab] = useState("programacion");
  const [expanded, setExpanded] = useState("181");
  const [infoPopup, setInfoPopup] = useState(null);
  const [quickReport, setQuickReport] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toast, setToast] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let alive = true;
    serverAction("getData")
      .then((result) => {
        if (!alive) return;
        setAppData(normalizeData(result.data || DEFAULT_DATA));
        setSyncStatus(result.source === "google-sheets" ? "Conectado a Google Sheets" : "Base local activa");
      })
      .catch(() => {
        if (!alive) return;
        setAppData(DEFAULT_DATA);
        setSyncStatus("Base local activa");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function persist(action, payload) {
    const result = await serverAction(action, payload);
    const nextData = normalizeData(result.data || appData);
    setAppData(nextData);
    setSyncStatus(result.source === "google-sheets" ? "Guardado en Google Sheets" : "Guardado local");
    return nextData;
  }

  async function refreshData() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const result = await serverAction("getData");
      setAppData(normalizeData(result.data || DEFAULT_DATA));
      setSyncStatus(result.source === "google-sheets" ? "Datos actualizados desde Google Sheets" : "Datos actualizados desde base local");
      showToast(setToast, "Datos actualizados correctamente.");
    } catch (error) {
      showToast(setToast, error.message || "No se pudieron actualizar los datos.", true);
    } finally {
      setRefreshing(false);
    }
  }

  function loginUser(found) {
    setUser(found);
    setModule("dashboard");
    setDashboardTab("estructuras");
    setReportTab("plan");
  }

  async function updateStructure(payload) {
    const nextData = await persist("updateStructure", payload);
    if (selectedStructure) {
      setSelectedStructure(nextData.structures.find((item) => item.id === selectedStructure.id) || null);
    }
  }

  const filteredStructures = useMemo(() => {
    const byType = appData.structures.filter((item) => (
      structureTypeFilter === "Todos los Tipos" || item.type === structureTypeFilter
    ));

    return [...byType].sort((a, b) => {
      if (structureOrder === "Mayor Avance Real") return numberOrZero(b.real) - numberOrZero(a.real);
      if (structureOrder === "Menor Avance Real") return numberOrZero(a.real) - numberOrZero(b.real);
      if (structureOrder === "Mayor Atraso") return numberOrZero(getDeviation(a)) - numberOrZero(getDeviation(b));
      if (structureOrder === "Estado Critico Primero") return Number(isStructureOk(a)) - Number(isStructureOk(b));
      return Number(a.id) - Number(b.id);
    });
  }, [appData.structures, structureOrder, structureTypeFilter]);

  const kpi = useMemo(() => {
    const total = filteredStructures.length;
    const real = average(filteredStructures.map((item) => item.real));
    const planned = average(filteredStructures.map((item) => item.planned));
    return {
      total,
      real,
      planned,
      deviation: isNumber(real) && isNumber(planned) ? real - planned : null,
      completed: filteredStructures.filter((item) => item.real >= 100).length,
      released: filteredStructures.filter((item) => item.legal === "LIBERADA").length,
      notReleased: filteredStructures.filter((item) => item.legal !== "LIBERADA").length,
      delayed: filteredStructures.filter((item) => {
        const dev = getDeviation(item);
        return isNumber(dev) && dev < 0;
      }).length,
      notProgrammed: filteredStructures.filter((item) => item.programmed !== true).length,
      pending: filteredStructures.filter((item) => isStructurePending(item)).length,
      ok: filteredStructures.filter((item) => isStructureOk(item)).length
    };
  }, [filteredStructures]);

  if (!user) {
    return (
      <Login
        usersList={appData.users}
        data={appData}
        onLogin={loginUser}
        onQuickReport={() => setQuickReport(true)}
        quickReport={quickReport}
        onCloseQuickReport={() => setQuickReport(false)}
        onSaveReport={(payload) => persist("createReport", payload)}
        onNotify={(message, isError) => showToast(setToast, message, isError)}
      />
    );
  }

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <aside className="sidebar">
        <div className="brand">
          <Logo />
          <div>
            <h1>{PROJECT_NAME}</h1>
            <p>Control de Proyecto</p>
          </div>
        </div>

        <button
          className="sidebar-toggle"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? "Expandir menu" : "Minimizar menu"}
        >
          {sidebarCollapsed ? ">" : "<"}
        </button>

        <nav className="nav-list">
          {modules.map((item) => (
            <button
              key={item.id}
              className={module === item.id ? "nav-item active" : "nav-item"}
              onClick={() => setModule(item.id)}
              title={item.label}
            >
              <span className="nav-short">{item.short}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="session-panel">
          <button className="refresh-button" onClick={refreshData} disabled={refreshing}>
            <span className="refresh-full">{refreshing ? "Actualizando..." : "Refrescar datos"}</span>
            <span className="refresh-compact">Ref.</span>
          </button>
          <div className="user-card">
            <span className="user-full">Usuario: {user.name}</span>
            <span className="user-initials">{user.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
            <span className="user-role">{user.role}</span>
          </div>
          <button className="danger-button" onClick={() => setUser(null)}>
            <span className="logout-full">Cerrar Sesion</span>
            <span className="logout-compact">Salir</span>
          </button>
          <small className="designer-credit">Disenado por Matias Ulloa</small>
        </div>
      </aside>

      <main className="workspace">
        {module === "dashboard" && (
          <Dashboard
            tab={dashboardTab}
            setTab={setDashboardTab}
            allStructures={appData.structures}
            structuresList={filteredStructures}
            kpi={kpi}
            weightedView={weightedView}
            setWeightedView={setWeightedView}
            structureTypeFilter={structureTypeFilter}
            setStructureTypeFilter={setStructureTypeFilter}
            structureOrder={structureOrder}
            setStructureOrder={setStructureOrder}
            onOpenStructure={(item) => {
              setSelectedStructure(item);
              setDetailTab("programacion");
            }}
          />
        )}

        {module === "gantt" && (
          <Gantt
            data={appData}
            structuresList={appData.structures}
            tab={ganttTab}
            setTab={setGanttTab}
            expanded={expanded}
            setExpanded={setExpanded}
            onInfo={setInfoPopup}
          />
        )}

        {module === "reportabilidad" && (
          <Reportabilidad
            tab={reportTab}
            setTab={setReportTab}
            data={appData}
            user={user}
            onCreatePlan={(payload) => persist("createPlan", payload)}
            onNotify={(message, isError) => showToast(setToast, message, isError)}
          />
        )}

        {module === "config" && (
          <Configuracion
            user={user}
            data={appData}
            syncStatus={syncStatus}
            onNotify={(message, isError) => showToast(setToast, message, isError)}
            onCreateUser={(payload) => persist("createUser", payload)}
            onCreateForeman={(payload) => persist("createForeman", payload)}
            onUpdateUser={(payload) => persist("updateUser", payload)}
            onDeleteUser={(payload) => persist("deleteUser", payload)}
            onUpdateForeman={(payload) => persist("updateForeman", payload)}
            onDeleteForeman={(payload) => persist("deleteForeman", payload)}
            onRepairProgramData={() => persist("repairProgramData")}
          />
        )}
      </main>

      {selectedStructure && (
        <StructureModal
          structure={selectedStructure}
          data={appData}
          user={user}
          tab={detailTab}
          setTab={setDetailTab}
          onUpdateStructure={async (payload) => {
            try {
              await updateStructure(payload);
              showToast(setToast, "Estado de estructura actualizado correctamente.");
            } catch (error) {
              showToast(setToast, error.message || "No se pudo actualizar la estructura.", true);
            }
          }}
          onSaveProgram={async (payload) => {
            try {
              await updateStructure(payload);
              showToast(setToast, "Programacion guardada correctamente.");
              setSelectedStructure(null);
            } catch (error) {
              showToast(setToast, error.message || "No se pudo guardar la programacion.", true);
            }
          }}
          onCreateComment={async (payload) => {
            try {
              const commentPayload = { ...payload, responsible: user.name };
              const nextData = await persist("createComment", commentPayload);
              const exists = (nextData.comments || []).some((comment) => (
                String(comment.structureId || comment.estructura || "") === String(commentPayload.structureId)
                && String(comment.processItem || comment.item || "") === String(commentPayload.processItem)
                && String(comment.comment || comment.comentario || "") === String(commentPayload.comment)
              ));
              if (!exists) {
                const optimisticComment = {
                  id: `TMP-${Date.now()}`,
                  createdAt: new Date().toISOString(),
                  structureId: commentPayload.structureId,
                  processItem: commentPayload.processItem,
                  processName: commentPayload.processName,
                  responsible: commentPayload.responsible,
                  comment: commentPayload.comment
                };
                setAppData({ ...nextData, comments: [optimisticComment, ...(nextData.comments || [])] });
              }
              showToast(setToast, "Comentario guardado correctamente.");
            } catch (error) {
              showToast(setToast, error.message || "No se pudo guardar el comentario.", true);
            }
          }}
          onClose={() => setSelectedStructure(null)}
        />
      )}

      {infoPopup && (
        <InfoModal data={infoPopup} onClose={() => setInfoPopup(null)} />
      )}

      {toast && <Toast message={toast.message} isError={toast.isError} />}
    </div>
  );
}

function Login({ usersList, data, onLogin, onQuickReport, quickReport, onCloseQuickReport, onSaveReport, onNotify }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit() {
    const found = usersList.find((item) => item.name === name && item.password === password);
    if (!found) {
      setError("Usuario o clave incorrecta");
      return;
    }
    onLogin(found);
  }

  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="login-logo-band">
          <Logo />
        </div>
        <div className="login-heading">
          <div>
            <h1>{APP_TITLE}</h1>
            <p>{PROJECT_NAME}</p>
          </div>
        </div>
        <label>
          Usuario
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ingrese usuario" autoComplete="username" />
        </label>
        <label>
          Clave numerica
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Ingrese clave" autoComplete="current-password" />
        </label>
        {error && <div className="error-text">{error}</div>}
        <button className="primary-button" onClick={submit}>Ingresar</button>
        <button className="outline-button" onClick={onQuickReport}>Reporte Rapido Terreno</button>
        <small className="designer-credit">Disenado por Matias Ulloa</small>
      </section>

      {quickReport && <QuickReportModal data={data} onSaveReport={onSaveReport} onNotify={onNotify} onClose={onCloseQuickReport} />}
    </main>
  );
}

function Logo() {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="globaltec-fallback">
        <span>GLOBAL</span>
        <strong>TEC</strong>
      </div>
    );
  }
  return (
    <img
      className="globaltec-logo"
      src={GLOBALTEC_LOGO_URL}
      alt="Logo Globaltec"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function Dashboard({
  tab,
  setTab,
  allStructures,
  structuresList,
  kpi,
  weightedView,
  setWeightedView,
  structureTypeFilter,
  setStructureTypeFilter,
  structureOrder,
  setStructureOrder,
  onOpenStructure
}) {
  return (
    <section className="module">
      <div className="tabs">
        <button className={tab === "estructuras" ? "active" : ""} onClick={() => setTab("estructuras")}>
          Tablon de Estructuras
        </button>
        <button className={tab === "general" ? "active" : ""} onClick={() => setTab("general")}>
          Vision General
        </button>
      </div>

      <DashboardFilters
        structuresList={allStructures}
        weightedView={weightedView}
        setWeightedView={setWeightedView}
        structureTypeFilter={structureTypeFilter}
        setStructureTypeFilter={setStructureTypeFilter}
        structureOrder={structureOrder}
        setStructureOrder={setStructureOrder}
      />

      {tab === "estructuras" ? (
        <ControlEstructuras structuresList={structuresList} onOpenStructure={onOpenStructure} />
      ) : (
        <ControlGeneral structuresList={structuresList} kpi={kpi} />
      )}
    </section>
  );
}

function DashboardFilters({
  structuresList,
  weightedView,
  setWeightedView,
  structureTypeFilter,
  setStructureTypeFilter,
  structureOrder,
  setStructureOrder
}) {
  const structureTypes = ["Todos los Tipos", ...Array.from(new Set(structuresList.map((item) => item.type)))];
  return (
    <div className="filter-bar">
      <label>
        Visualizacion Ponderada
        <select value={weightedView} onChange={(event) => setWeightedView(event.target.value)}>
          <option>Avance Proyecto Global</option>
          <option>Avance Real</option>
          <option>Avance Programado</option>
          <option>Desviacion</option>
        </select>
      </label>
      <label>
        Tipo de Estructura
        <select value={structureTypeFilter} onChange={(event) => setStructureTypeFilter(event.target.value)}>
          {structureTypes.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label>
        Ordenamiento
        <select value={structureOrder} onChange={(event) => setStructureOrder(event.target.value)}>
          <option>Por Numero de Torre</option>
          <option>Mayor Avance Real</option>
          <option>Menor Avance Real</option>
          <option>Mayor Atraso</option>
          <option>Estado Critico Primero</option>
        </select>
      </label>
    </div>
  );
}

function ControlEstructuras({ structuresList, onOpenStructure }) {
  return (
    <>
      <div className="tower-grid">
        {structuresList.map((item) => (
          <button key={item.id} className={`tower-card ${getStructureTone(item)}`} onClick={() => onOpenStructure(item)}>
            <span className="status-dot" />
            <small>{item.type}</small>
            <strong>{item.id}</strong>
            <div className="state-row">
              <ReleaseBadge item={item} />
              <ProgramBadge item={item} />
            </div>
            <div className="progress-box">
              <span><small>Real</small><b className="real">{fmt(item.real)}</b></span>
              <span><small>Prog.</small><b className="planned">{fmt(item.planned)}</b></span>
              <span><small>Desv.</small><b className={getDeviationTone(item)}>{fmt(getDeviation(item))}</b></span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function ReleaseBadge({ item }) {
  if (item.legal === "PENDIENTE") return <span className="badge red">NO LIBERADA</span>;
  if (item.legal !== "LIBERADA") return <span className="badge red">NO LIBERADA</span>;
  return <span className="badge green">LIBERADA</span>;
}

function ProgramBadge({ item }) {
  if (item.programmed === null) return <span className="badge red">NO PROGRAMADA</span>;
  if (!item.programmed) return <span className="badge red">NO PROGRAMADA</span>;
  return <span className="badge green">PROGRAMADA</span>;
}

function ControlGeneral({ structuresList, kpi }) {
  const [detail, setDetail] = useState(null);
  const lists = {
    "Total Fundaciones": structuresList,
    "Listas al 100%": structuresList.filter((item) => item.real >= 100),
    "Liberadas": structuresList.filter((item) => item.legal === "LIBERADA"),
    "No Liberadas": structuresList.filter((item) => item.legal !== "LIBERADA"),
    "Atrasadas": structuresList.filter((item) => {
      const deviation = getDeviation(item);
      return isNumber(deviation) && deviation < 0;
    }),
    "No Programadas": structuresList.filter((item) => item.programmed !== true),
    "Pendientes": structuresList.filter((item) => isStructurePending(item)),
    "En Verde": structuresList.filter((item) => isStructureOk(item))
  };

  return (
    <>
      <div className="global-summary">
        <div>
          <h2>Avance Global</h2>
          <p>Resumen calculado sobre el listado visible del tablon de estructuras.</p>
        </div>
        <div className="summary-values">
        <Metric label="Real" value={fmt(kpi.real)} />
        <Metric label="Programado" value={fmt(kpi.planned)} tone="planned-text" />
        <Metric label="Desviacion" value={fmt(kpi.deviation)} tone={getValueTone(kpi.deviation)} />
      </div>
    </div>

      <div className="kpi-grid">
        <Kpi label="Total Fundaciones" value={kpi.total} onOpen={() => setDetail({ title: "Total Fundaciones", rows: lists["Total Fundaciones"] })} />
        <Kpi label="Listas al 100%" value={kpi.completed} tone="green-text" onOpen={() => setDetail({ title: "Listas al 100%", rows: lists["Listas al 100%"] })} />
        <Kpi label="Liberadas" value={kpi.released} tone="violet-text" onOpen={() => setDetail({ title: "Liberadas", rows: lists.Liberadas })} />
        <Kpi label="No Liberadas" value={kpi.notReleased} tone="red-text" onOpen={() => setDetail({ title: "No Liberadas", rows: lists["No Liberadas"] })} />
        <Kpi label="Atrasadas" value={kpi.delayed} tone="red-text" onOpen={() => setDetail({ title: "Atrasadas", rows: lists.Atrasadas })} />
        <Kpi label="No Programadas" value={kpi.notProgrammed} tone="red-text" onOpen={() => setDetail({ title: "No Programadas", rows: lists["No Programadas"] })} />
        <Kpi label="Pendientes" value={kpi.pending} tone="planned-text" onOpen={() => setDetail({ title: "Pendientes", rows: lists.Pendientes })} />
        <Kpi label="En Verde" value={kpi.ok} tone="green-text" onOpen={() => setDetail({ title: "En Verde", rows: lists["En Verde"] })} />
      </div>

      {detail && <KpiDetail title={detail.title} rows={detail.rows} onClose={() => setDetail(null)} />}

      <div className="table-card structure-list-card">
        <h3>Listado visible del Tablon</h3>
        <table>
          <thead>
            <tr><th>Torre</th><th>Tipo</th><th>Estado</th><th>Real</th><th>Programado</th><th>Desviacion</th><th>Semaforo</th></tr>
          </thead>
          <tbody>
            {structuresList.map((item) => (
              <tr key={item.id}>
                <td><strong>N {item.id}</strong></td>
                <td>{item.type}</td>
                <td>{getStructureStatusLabel(item)}</td>
                <td>{fmt(item.real)}</td>
                <td>{fmt(item.planned)}</td>
                <td className={getDeviationTone(item)}>{fmt(getDeviation(item))}</td>
                <td><span className={`doc-tag ${getStructureTone(item)}`}>{getSemaphoreLabel(item)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Kpi({ label, value, tone = "blue-text", onOpen }) {
  return (
    <article className="kpi-card">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
      <button onClick={onOpen}>Ver listado</button>
    </article>
  );
}

function KpiDetail({ title, rows, onClose }) {
  return (
    <div className="table-card kpi-detail">
      <div className="detail-heading">
        <h3>{title}</h3>
        <button className="outline-button" onClick={onClose}>Cerrar listado</button>
      </div>
      <table>
        <thead>
          <tr><th>Torre</th><th>Tipo</th><th>Liberacion</th><th>Programa</th><th>Real</th><th>Programado</th><th>Desv.</th></tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id}>
              <td><strong>{item.id}</strong></td>
              <td>{item.type}</td>
              <td>{item.legal === "LIBERADA" ? "Liberada" : "No liberada"}</td>
              <td>{item.programmed === true ? "Programada" : "No programada"}</td>
              <td>{fmt(item.real)}</td>
              <td>{fmt(item.planned)}</td>
              <td className={getDeviationTone(item)}>{fmt(getDeviation(item))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div className="empty-card">Sin estructuras para este criterio.</div>}
    </div>
  );
}

function Metric({ label, value, tone = "" }) {
  return (
    <div>
      <small>{label}</small>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function isAdmin(user) {
  return normalizeText(user?.role) === "admin";
}

function Toast({ message, isError }) {
  return (
    <div className={isError ? "toast error" : "toast"}>
      {message}
    </div>
  );
}

function StructureModal({ structure, data, user, tab, setTab, onUpdateStructure, onSaveProgram, onCreateComment, onClose }) {
  const isReleased = structure.legal === "LIBERADA";
  const [savingLegal, setSavingLegal] = useState(false);

  async function toggleLegalState() {
    if (savingLegal) return;
    setSavingLegal(true);
    const nextReleased = !isReleased;
    const syncedRows = buildProgramRows(structure).map((row) => (
      row.item === "1"
        ? { ...row, completed: nextReleased, start: "", end: "" }
        : row
    ));
    try {
      await onUpdateStructure({
        id: structure.id,
        legal: nextReleased ? "LIBERADA" : "NO LIBERADA",
        programRows: syncedRows
      });
    } finally {
      setSavingLegal(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="structure-modal">
        <header className="modal-header">
          <div>
            <h2>Estructura N {structure.id}</h2>
            <p>Tipo: {structure.type} | Progreso Real: {fmt(structure.real)}</p>
            <div className={isReleased ? "legal-state released" : "legal-state blocked"}>
              Estado legal: {isReleased ? "LIBERADA" : "NO LIBERADA"}
              <button
                disabled={savingLegal}
                onClick={toggleLegalState}
              >
                {savingLegal ? "Actualizando..." : "Cambiar Estado"}
              </button>
            </div>
          </div>
          <button className="outline-button" onClick={onClose}>Cerrar Pantalla</button>
        </header>

        <div className="modal-tabs">
          <button className={tab === "programacion" ? "active" : ""} onClick={() => setTab("programacion")}>
            1. Programacion Temporal (Fechas)
          </button>
          <button className={tab === "inspeccion" ? "active" : ""} onClick={() => setTab("inspeccion")}>
            2. Inspeccion de Procesos
          </button>
        </div>

        <div className="modal-content">
          {tab === "programacion" ? (
            <Programacion structure={structure} user={user} onSaveProgram={onSaveProgram} />
          ) : (
            <Inspeccion structure={structure} data={data} user={user} onCreateComment={onCreateComment} />
          )}
        </div>
      </section>
    </div>
  );
}

function Programacion({ structure, user, onSaveProgram }) {
  const baseRows = buildProgramRows(structure);
  const [rows, setRows] = useState(baseRows);
  const [periodRow, setPeriodRow] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const canEdit = isAdmin(user);
  const allReady = rows.every((row) => row.completed || (row.start && row.end));

  useEffect(() => {
    setRows(buildProgramRows(structure));
    setEditMode(false);
  }, [structure.id, structure.legal, structure.programRows]);

  async function updateRow(item, patch, autosave = false) {
    const nextRows = rows.map((row) => row.item === item ? { ...row, ...patch } : row);
    setRows(nextRows);
    if (!autosave) return;
    const nextReady = nextRows.every((row) => row.completed || (row.start && row.end));
    await saveRows(nextRows, nextReady, item === "1" ? (patch.completed ? "LIBERADA" : "NO LIBERADA") : undefined);
  }

  async function saveRows(nextRows = rows, nextReady = allReady, legal) {
    setSaving(true);
    try {
      await onSaveProgram({
        id: structure.id,
        programmed: nextReady,
        programRows: nextRows,
        planned: nextReady ? 0 : null,
        ...(legal ? { legal } : {})
      });
      setMessage(nextReady ? "Programacion guardada." : "Guardado como no programada: faltan partidas con periodo o 100%.");
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    await saveRows();
    setEditMode(false);
  }

  return (
    <>
      <div className="program-toolbar">
        <div>
          <strong>Programacion temporal</strong>
          <span>{editMode ? "Modo edicion activo" : canEdit ? "Bloqueada para evitar cambios accidentales" : "Solo lectura"}</span>
        </div>
        {canEdit && (
          <button className={editMode ? "outline-button" : "primary-button"} onClick={() => setEditMode(!editMode)}>
            {editMode ? "Cancelar edicion" : "Editar programacion"}
          </button>
        )}
      </div>
      <div className="form-panel">
        <label>
          Tipo de Fundacion (OOCC)
          <select defaultValue={structure.foundation} disabled={!editMode}>
            <option>{structure.foundation}</option>
          </select>
        </label>
      </div>
      <div className="program-list">
        {rows.map((item) => (
          <article key={item.item} className={item.completed ? "program-row completed" : "program-row"}>
            <strong>{item.item}. {item.name}</strong>
            <button className="date-range" disabled={!editMode || item.completed} onClick={() => setPeriodRow(item)}>
              {item.completed ? "Finalizada 100%" : item.start && item.end ? `${formatDateShort(item.start)} - ${formatDateShort(item.end)}` : "Seleccionar periodo"}
            </button>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={item.completed}
                disabled={!editMode}
                onChange={(event) => updateRow(item.item, {
                  completed: event.target.checked,
                  start: event.target.checked ? "" : item.start,
                  end: event.target.checked ? "" : item.end
                }, item.item === "1")}
              />
              Finalizada 100%
            </label>
          </article>
        ))}
      </div>
      {message && <div className="empty-card positive">{message}</div>}
      {editMode && <button className="primary-button" disabled={saving} onClick={save}>{saving ? "Guardando..." : "Guardar Programacion"}</button>}
      {periodRow && (
        <PeriodPicker
          row={periodRow}
          onClose={() => setPeriodRow(null)}
          onSave={(start, end) => {
            updateRow(periodRow.item, { start, end, completed: false });
            setPeriodRow(null);
          }}
        />
      )}
    </>
  );
}

function PeriodPicker({ row, onSave, onClose }) {
  const [start, setStart] = useState(row.start || "");
  const [end, setEnd] = useState(row.end || "");
  const initialDate = start ? new Date(`${start}T00:00:00`) : new Date();
  const [visibleMonth, setVisibleMonth] = useState(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const months = [visibleMonth, addMonths(visibleMonth, 1)];

  function pickDate(value) {
    if (!start || (start && end) || value < start) {
      setStart(value);
      setEnd("");
      return;
    }
    setEnd(value);
  }

  return (
    <div className="sub-modal">
      <section className="period-picker">
        <header>
          <h3>{row.item}. {row.name}</h3>
          <button className="outline-button" onClick={onClose}>Cerrar</button>
        </header>
        <p>Seleccione el periodo de ejecucion.</p>
        <div className="period-grid">
          <label>Inicio<input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label>
          <label>Termino<input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
        </div>
        <div className="calendar-nav">
          <button className="outline-button" onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}>Mes anterior</button>
          <strong>{visibleMonth.toLocaleDateString("es-CL", { month: "long", year: "numeric" })}</strong>
          <button className="outline-button" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}>Mes siguiente</button>
        </div>
        <div className="calendar-range">
          {months.map((month) => (
            <MiniCalendar
              key={`${month.getFullYear()}-${month.getMonth()}`}
              month={month}
              start={start}
              end={end}
              onPick={pickDate}
            />
          ))}
        </div>
        <button className="primary-button" disabled={!start || !end} onClick={() => onSave(start, end)}>Guardar periodo</button>
      </section>
    </div>
  );
}

function MiniCalendar({ month, start, end, onPick }) {
  const days = getCalendarDays(month);
  const label = month.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  return (
    <div className="mini-calendar">
      <strong>{label}</strong>
      <div className="calendar-weekdays">
        {["L", "M", "M", "J", "V", "S", "D"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
      </div>
      <div className="calendar-days">
        {days.map((day) => (
          <button
            key={day.key}
            className={getCalendarDayClass(day.value, start, end, day.inMonth)}
            disabled={!day.inMonth}
            onClick={() => onPick(day.value)}
          >
            {day.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Inspeccion({ structure, data, user, onCreateComment }) {
  const processRows = getStructureProcessRows(structure, data.generalProcesses);
  const real = getWeightedProgress(processRows, "real");
  const planned = getWeightedProgress(processRows, "planned");
  return (
    <>
      <div className="analysis-card">
        <strong>Resumen Analitico Estructura</strong>
        <span>Avance Global - Real: {fmt(real)} | Proyectado: {fmt(planned)} | Desviacion: {fmt(real - planned)}</span>
      </div>
      <div className="process-list">
        {processRows.map((item) => (
          <ProcessInspection key={item.item} item={item} structure={structure} data={data} user={user} onCreateComment={onCreateComment} />
        ))}
      </div>
    </>
  );
}

function ProcessInspection({ item, structure, data, user, onCreateComment }) {
  const [open, setOpen] = useState(item.item === "6.1");
  const [dialog, setDialog] = useState(null);
  const detail = item.item === "6.1"
    ? getReportActivities("OOCC", structure, data.processCatalog)
    : item.item === "6.2"
      ? getReportActivities("OOMM", structure, data.processCatalog)
      : [];
  const comments = (data.comments || []).filter((comment) => (
    String(comment.structureId || comment.estructura || "") === String(structure.id)
    && String(comment.processItem || comment.item || "") === String(item.item)
  ));
  return (
    <article className="process-card">
      <div className="process-head">
        <div>
          <strong>{item.item}. {item.name}</strong>
          <p>
            Avance Real: <b className="blue-text">{fmt(item.real)}</b> | Proyectado: <b className="orange-text">{fmt(item.planned)}</b> | Desviacion: <b className={item.real - item.planned < 0 ? "negative" : "positive"}>{fmt(item.real - item.planned)}</b>
          </p>
        </div>
        <div className="process-actions">
          {detail.length > 0 && <button onClick={() => setOpen(!open)}>Ver Desglose</button>}
          <button onClick={() => setDialog("comment")}>Comentar</button>
          <button onClick={() => setDialog("log")}>Ver Bitacora</button>
        </div>
      </div>
      {open && detail.length > 0 && (
        <div className="detail-table">
          {detail.map((row) => (
            <div key={row.code}>
              <strong>{row.name}</strong>
              <span>Real: {fmt(row.real)}</span>
              <span>Proy: {fmt(row.planned)}</span>
              <span className={row.real - row.planned < 0 ? "negative" : "positive"}>Desv: {fmt(row.real - row.planned)}</span>
            </div>
          ))}
        </div>
      )}
      {dialog === "comment" && (
        <CommentDialog
          structure={structure}
          item={item}
          onClose={() => setDialog(null)}
          onSave={async (comment) => {
            await onCreateComment({ structureId: structure.id, processItem: item.item, processName: item.name, responsible: user.name, comment });
            setDialog(null);
          }}
        />
      )}
      {dialog === "log" && (
        <div className="sub-modal">
          <section className="period-picker">
            <header>
              <h3>Bitacora - {item.item}. {item.name}</h3>
              <button className="outline-button" onClick={() => setDialog(null)}>Cerrar</button>
            </header>
            {comments.length ? (
              <div className="log-list">
                {comments.map((comment, index) => (
                  <article key={`${comment.id || comment.comentario_id || index}`}>
                    <strong>{comment.responsible || comment.responsable || "Sin responsable"}</strong>
                    <span>{formatDateTime(comment.createdAt || comment.fecha_hora)}</span>
                    <p>{comment.comment || comment.comentario}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-card">Sin comentarios aun para esta partida. Los nuevos registros apareceran aca con fecha y responsable.</div>
            )}
          </section>
        </div>
      )}
    </article>
  );
}

function CommentDialog({ structure, item, onSave, onClose }) {
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveComment() {
    if (saving || !comment.trim()) return;
    setSaving(true);
    try {
      await onSave(comment.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sub-modal">
      <section className="period-picker">
        <header>
          <h3>Comentario - Torre {structure.id}</h3>
          <button className="outline-button" onClick={onClose}>Cerrar</button>
        </header>
        <p>{item.item}. {item.name}</p>
        <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Ingrese comentario de terreno..." />
        <button className="primary-button" disabled={saving || !comment.trim()} onClick={saveComment}>
          {saving ? "Guardando..." : "Guardar comentario"}
        </button>
      </section>
    </div>
  );
}

function Gantt({ data, structuresList, tab, setTab, expanded, setExpanded, onInfo }) {
  return (
    <section className="module">
      <h2>Planificacion Temporal (Carta Gantt)</h2>
      <div className="tabs">
        <button className={tab === "general" ? "active" : ""} onClick={() => setTab("general")}>Gantt General</button>
        <button className={tab === "cuadrillas" ? "active" : ""} onClick={() => setTab("cuadrillas")}>Programacion Cuadrillas</button>
      </div>
      {tab === "general" ? (
        <GanttGeneral structuresList={structuresList} expanded={expanded} setExpanded={setExpanded} onInfo={onInfo} />
      ) : (
        <CrewPlanner data={data} />
      )}
    </section>
  );
}

function GanttGeneral({ structuresList, expanded, setExpanded, onInfo }) {
  const [filter, setFilter] = useState("Todas las Partidas");
  const [scale, setScale] = useState("dia");
  const [zoom, setZoom] = useState(42);
  const scrollRef = useRef(null);
  const rows = useMemo(() => buildGanttRows(structuresList, expanded, filter), [structuresList, expanded, filter]);
  const range = useMemo(() => getGanttRange(rows, zoom, scale), [rows, zoom, scale]);
  const days = useMemo(() => buildGanttDays(range.start, range.end, scale), [range.start, range.end, scale]);
  const today = toIsoDate(new Date());
  const todayIndex = days.findIndex((day) => isIsoInPeriod(today, day.start, day.end));

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || todayIndex < 0) return;
    const target = Math.max(0, todayIndex * zoom - node.clientWidth / 2);
    node.scrollLeft = target;
  }, [todayIndex, zoom, scale, rows.length]);

  return (
    <div className="gantt-panel">
      <div className="gantt-toolbar">
        <div className="gantt-legends">
          <span className="legend plan">Linea Base (Proyectada)</span>
          <span className="legend actual">Avance Real</span>
          <span className="legend today">Banda Dia Actual</span>
        </div>
        <label>
          Filtrar Partida:
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option>Todas las Partidas</option>
            {generalProcesses.map((process) => <option key={process.item}>{process.item}. {process.name}</option>)}
          </select>
        </label>
        <label>
          Escala:
          <select value={scale} onChange={(event) => setScale(event.target.value)}>
            <option value="dia">Dia</option>
            <option value="semana">Semana</option>
            <option value="mes">Mes</option>
          </select>
        </label>
        <label>
          Zoom:
          <input type="range" min="28" max="76" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
        </label>
      </div>
      <div className="gantt-scroll" ref={scrollRef}>
        <div className="gantt-board" style={{ "--gantt-columns": days.length, "--gantt-day-width": `${zoom}px` }}>
          <div className="gantt-label-head">Estructura / Partida</div>
          <div className="gantt-calendar-head">
            {days.map((day) => (
              <span key={day.key} className={isIsoInPeriod(today, day.start, day.end) ? "today-cell" : ""}>
                <small>{day.weekday}</small>
                <b>{day.label}</b>
              </span>
            ))}
          </div>
          {rows.length ? rows.map((row) => (
            <div key={row.key} className={row.detail ? "gantt-row detail" : "gantt-row"}>
              <button
                className="gantt-row-title"
                onClick={() => row.detail ? onInfo({ title: row.label, planned: row.planned, real: row.real }) : setExpanded(expanded === row.structureId ? "" : row.structureId)}
              >
                {!row.detail && (expanded === row.structureId ? "▼ " : "▶ ")}
                {row.label}
              </button>
              <button
                className="gantt-row-track"
                onClick={() => onInfo({ title: row.label, planned: row.planned, real: row.real })}
              >
                {days.map((day) => <span key={day.key} className={isIsoInPeriod(today, day.start, day.end) ? "gantt-day today-cell" : "gantt-day"} />)}
                {row.start && row.end && (
                  <>
                    <span className="gantt-bar planned-bar" style={getGanttBarStyle(row.start, row.end, days)} />
                    <span className="gantt-bar actual-bar" style={getGanttActualStyle(row.start, row.end, row.real, days)} />
                  </>
                )}
              </button>
            </div>
          )) : (
            <div className="gantt-empty">Sin estructuras programadas. Cuando guardes periodos en una estructura, aparecera automaticamente en esta carta.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function CrewPlanner({ data }) {
  const days = buildCrewDays();
  const [assignments, setAssignments] = useState({});
  const [cell, setCell] = useState(null);

  function saveAssignment(payload) {
    const key = `${payload.foreman}-${payload.day}`;
    setAssignments((current) => ({ ...current, [key]: payload }));
    setCell(null);
  }

  return (
    <div className="crew-panel">
      <div className="crew-head">
        <h3>Programacion Cuadrillas</h3>
        <p>La alerta solo advierte. El jefe de terreno puede confirmar bajo criterio operativo.</p>
      </div>
      <div className="crew-scroll">
        <div className="crew-grid" style={{ gridTemplateColumns: `220px repeat(${days.length}, minmax(120px, 1fr))` }}>
          <strong>Cuadrillas</strong>
          {days.map((day) => <strong key={day.value}>{day.label}</strong>)}
          {data.foremen.map((foreman) => (
            <CrewRow
              key={`${foreman.name}-${foreman.specialty}`}
              foreman={foreman}
              days={days}
              assignments={assignments}
              onPick={setCell}
            />
          ))}
        </div>
      </div>
      <div className="legend-grid">
        {Object.entries(taskLegend).map(([code, item]) => (
          <span key={code}><i style={{ background: item.color }} />{code} - {item.label}</span>
        ))}
      </div>
      {cell && (
        <CrewAssignmentModal
          cell={cell}
          structuresList={data.structures}
          onClose={() => setCell(null)}
          onSave={saveAssignment}
        />
      )}
    </div>
  );
}

function CrewRow({ foreman, days, assignments, onPick }) {
  return (
    <>
      <div className="crew-name">{foreman.name}<small>{foreman.specialty}</small></div>
      {days.map((day) => {
        const assignment = assignments[`${foreman.name}-${day.value}`];
        const legend = assignment ? taskLegend[assignment.activityCode] : null;
        return (
          <button
            key={`${foreman.name}-${day.value}`}
            className="crew-cell"
            style={{ background: legend?.color || "transparent" }}
            title={assignment ? `${assignment.activityCode} - Torre ${assignment.structureId} - ${assignment.activityName}` : "Click para programar"}
            onClick={() => onPick({ foreman, day, assignment })}
          >
            {assignment ? `${assignment.activityCode} ${assignment.structureId}` : ""}
          </button>
        );
      })}
    </>
  );
}

function CrewAssignmentModal({ cell, structuresList, onSave, onClose }) {
  const [activityCode, setActivityCode] = useState("IA");
  const [structureId, setStructureId] = useState(cell.assignment?.structureId || structuresList[0]?.id || "");
  const activity = taskLegend[activityCode] || taskLegend.IA;
  return (
    <div className="sub-modal">
      <section className="period-picker">
        <header>
          <h3>{cell.foreman.name} - {cell.day.label}</h3>
          <button className="outline-button" onClick={onClose}>Cerrar</button>
        </header>
        <label>
          Actividad
          <select value={activityCode} onChange={(event) => setActivityCode(event.target.value)}>
            {Object.entries(taskLegend).map(([code, item]) => (
              <option key={code} value={code}>{code} - {item.label}</option>
            ))}
          </select>
        </label>
        <label>
          Estructura
          <select value={structureId} onChange={(event) => setStructureId(event.target.value)}>
            {structuresList.map((item) => <option key={item.id} value={item.id}>{item.id} - {item.type}</option>)}
          </select>
        </label>
        <button
          className="primary-button"
          onClick={() => onSave({
            foreman: cell.foreman.name,
            specialty: cell.foreman.specialty,
            day: cell.day.value,
            structureId,
            activityCode,
            activityName: activity.label
          })}
        >
          Guardar asignacion
        </button>
      </section>
    </div>
  );
}

function Reportabilidad({ tab, setTab, data, user, onCreatePlan, onNotify }) {
  return (
    <section className="module">
      <h2>Reportabilidad</h2>
      <div className="tabs">
        <button className={tab === "plan" ? "active" : ""} onClick={() => setTab("plan")}>Reportabilidad</button>
        <button className={tab === "historial" ? "active" : ""} onClick={() => setTab("historial")}>Historial</button>
      </div>
      {tab === "plan" ? (
        <PlanificacionDiaria data={data} user={user} onCreatePlan={onCreatePlan} onNotify={onNotify} />
      ) : (
        <DocumentsHistory data={data} />
      )}
    </section>
  );
}

function PlanificacionDiaria({ data, user, onCreatePlan, onNotify }) {
  const [plan, setPlan] = useState(null);
  const [workDialog, setWorkDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const today = toIsoDate(new Date());
  const planDate = plan?.date || shiftIsoDate(toIsoDate(new Date()), 1);

  function startPlan() {
    const id = nextPlanCode(data.documents || [], data.plans || []);
    setPlan({
      id,
      date: shiftIsoDate(toIsoDate(new Date()), 1),
      createdBy: user?.name || "",
      createdAt: new Date().toISOString(),
      items: []
    });
    setMessage("");
  }

  function addPlanItems(items) {
    if (!plan) return;
    setPlan({
      ...plan,
      items: [...plan.items, ...items.map((item, index) => ({ ...item, lineId: `${Date.now()}-${plan.items.length + index + 1}` }))]
    });
    setWorkDialog(false);
    setMessage("Trabajo agregado a la planificacion. Puedes agregar otra torre con el boton +.");
  }

  function removePlanItem(lineId) {
    if (!plan) return;
    setPlan({ ...plan, items: plan.items.filter((item) => item.lineId !== lineId) });
  }

  async function savePlan() {
    if (!plan || saving) return;
    if (!plan.items.length) {
      onNotify("La planificacion no tiene trabajos cargados.", true);
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await onCreatePlan(plan);
      onNotify(`Planificacion ${plan.id} guardada correctamente.`);
      setMessage(`Planificacion ${plan.id} guardada y registrada en historial.`);
    } catch (error) {
      const errorMessage = error.message || "No se pudo guardar la planificacion.";
      onNotify(errorMessage, true);
      setMessage(errorMessage);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="report-panel">
      <section className="plan-command-card">
        <div>
          <h3>Planificacion diaria de terreno</h3>
          <p>Genera un codigo PLA, define el dia a programar y asigna trabajos por torre, partida y capataz.</p>
        </div>
        <button className="primary-button" onClick={startPlan}>Generar nueva planificacion</button>
      </section>

      {plan ? (
        <>
          <section className="plan-header-card">
            <div>
              <small>Codigo</small>
              <strong>{plan.id}</strong>
            </div>
            <label>
              Dia a programar
              <input
                type="date"
                min={today}
                value={planDate}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value && value < today) {
                    onNotify("El dia a programar no puede ser anterior a hoy.", true);
                    return;
                  }
                  setPlan({ ...plan, date: value });
                }}
              />
            </label>
            <div>
              <small>Responsable</small>
              <strong>{plan.createdBy || "-"}</strong>
            </div>
          </section>

          <section className="table-card">
            <div className="detail-heading">
              <h3>Ingresar trabajo por torre</h3>
              <button className="primary-button plus-button" onClick={() => setWorkDialog(true)}>+ Agregar trabajo</button>
            </div>
            <div className="empty-card">Usa el boton + para seleccionar una torre, marcar una o varias actividades y asignar el capataz de cada trabajo.</div>
          </section>

          <section className="table-card">
            <div className="detail-heading">
              <h3>Trabajos cargados</h3>
              <button className="success-button" disabled={saving || !plan.items.length} onClick={savePlan}>
                {saving ? "Guardando..." : "Guardar planificacion"}
              </button>
            </div>
            {plan.items.length ? (
              <table>
                <thead>
                  <tr><th>Torre</th><th>Tipo</th><th>Actividad</th><th>Capataz</th><th>Observacion</th><th>Accion</th></tr>
                </thead>
                <tbody>
                  {plan.items.map((item) => (
                    <tr key={item.lineId}>
                      <td><strong>{item.structureId}</strong></td>
                      <td>{item.specialty}</td>
                      <td>{item.activityCode} - {item.activityName}</td>
                      <td>{item.foremanName}</td>
                      <td>{item.note || "-"}</td>
                      <td><button className="danger-mini" onClick={() => removePlanItem(item.lineId)}>Quitar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-card">Aun no hay trabajos cargados. Agrega la primera torre para construir la planificacion.</div>
            )}
            {message && <div className={message.includes("guardada") || message.includes("agregado") ? "empty-card positive" : "empty-card blocked-report"}>{message}</div>}
          </section>
        </>
      ) : (
        <div className="empty-card">Presiona "Generar nueva planificacion" para comenzar. El codigo, fecha y responsable se preparan automaticamente.</div>
      )}

      {workDialog && plan && (
        <PlanWorkDialog
          data={data}
          planDate={plan.date}
          onNotify={onNotify}
          onClose={() => setWorkDialog(false)}
          onAdd={addPlanItems}
        />
      )}
    </div>
  );
}

function PlanWorkDialog({ data, planDate, onAdd, onClose, onNotify }) {
  const [structureText, setStructureText] = useState("");
  const [specialty, setSpecialty] = useState("OOCC");
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [customActivity, setCustomActivity] = useState("");
  const [note, setNote] = useState("");
  const structuresList = data.structures || [];
  const activityOptions = getPlanActivityOptions(specialty);
  const selectedStructureId = extractStructureId(structureText);
  const structure = structuresList.find((item) => String(item.id) === String(selectedStructureId));
  const filteredForemen = (data.foremen || []).filter((item) => item.specialty === specialty);

  function toggleCode(code) {
    setSelectedCodes((current) => {
      if (current.includes(code)) {
        const nextAssignments = { ...assignments };
        delete nextAssignments[code];
        setAssignments(nextAssignments);
        return current.filter((item) => item !== code);
      }
      return [...current, code];
    });
  }

  function save() {
    if (!structure) {
      onNotify("Seleccione una torre valida.", true);
      return;
    }
    if (!selectedCodes.length) {
      onNotify("Seleccione al menos una actividad.", true);
      return;
    }
    const missingForeman = selectedCodes.find((code) => !assignments[code]);
    if (missingForeman) {
      onNotify("Cada actividad seleccionada debe tener capataz asignado.", true);
      return;
    }
    if (selectedCodes.includes("ADIC") && !customActivity.trim()) {
      onNotify("Ingrese el detalle de la actividad adicional.", true);
      return;
    }
    const items = selectedCodes.map((code) => {
      const activity = activityOptions.find((item) => item.code === code);
      return {
        structureId: structure.id,
        structureType: structure.type || "",
        planDate,
        specialty,
        activityCode: code,
        activityName: code === "ADIC" ? customActivity.trim() : activity?.label || "",
        foremanName: assignments[code],
        note: note.trim(),
        validation: "Pendiente de comparar con programacion por cuadrillas"
      };
    });
    onAdd(items);
  }

  return (
    <div className="sub-modal">
      <section className="period-picker plan-work-dialog">
        <header>
          <h3>Agregar trabajo por torre</h3>
          <button className="outline-button" onClick={onClose}>Cerrar</button>
        </header>
        <label>
          Seleccionar torre
          <input
            list="plan-structure-options"
            value={structureText}
            onChange={(event) => setStructureText(event.target.value)}
            placeholder="Escribe el numero de torre, ej: 181"
          />
          <datalist id="plan-structure-options">
            {structuresList.map((item) => <option key={item.id} value={`${item.id} - ${item.type}`} />)}
          </datalist>
        </label>
        <label>
          Tipo de trabajo
          <select
            value={specialty}
            onChange={(event) => {
              setSpecialty(event.target.value);
              setSelectedCodes([]);
              setAssignments({});
            }}
          >
            <option>OOCC</option>
            <option>OOMM</option>
          </select>
        </label>
        <div className="activity-checklist">
          <strong>Actividades</strong>
          {activityOptions.map((activity) => (
            <article key={activity.code} className={selectedCodes.includes(activity.code) ? "activity-option selected" : "activity-option"}>
              <label>
                <input type="checkbox" checked={selectedCodes.includes(activity.code)} onChange={() => toggleCode(activity.code)} />
                <span>{activity.code} - {activity.label}</span>
              </label>
              {selectedCodes.includes(activity.code) && (
                <select value={assignments[activity.code] || ""} onChange={(event) => setAssignments({ ...assignments, [activity.code]: event.target.value })}>
                  <option value="">Asignar capataz</option>
                  {filteredForemen.map((foreman) => <option key={`${activity.code}-${foreman.name}`} value={foreman.name}>{foreman.name}</option>)}
                </select>
              )}
            </article>
          ))}
        </div>
        {selectedCodes.includes("ADIC") && (
          <label>
            Detalle actividad adicional
            <input value={customActivity} onChange={(event) => setCustomActivity(event.target.value)} placeholder="Ej: orden y aseo, camino, interferencia..." />
          </label>
        )}
        <label>
          Observacion general
          <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Detalle operacional para esta asignacion..." />
        </label>
        <button className="primary-button" onClick={save}>Agregar a planificacion</button>
      </section>
    </div>
  );
}

function DocumentsHistory({ data }) {
  const [date, setDate] = useState(toIsoDate(new Date()));
  const reports = data.reports || [];
  const documents = data.documents || [];
  const dailyReports = reports.filter((report) => getDocumentDate(report.createdAt || report.fecha_hora) === date);
  const consolidatedRows = dailyReports.flatMap((report) => {
    if (report.activities?.length) {
      return report.activities.map((activity) => ({
        id: report.id,
        structure: report.structure?.id || report.structure || "",
        responsible: report.foreman?.name || report.reportado_por || report.owner || "",
        specialty: report.foreman?.specialty || report.especialidad || "",
        activity: activity.name || activity.actividad || "",
        previous: activity.previous ?? activity.avance_anterior ?? 0,
        value: activity.value ?? activity.avance_nuevo ?? 0,
        comment: report.comment || report.comentario || ""
      }));
    }
    return [{
      id: report.reporte_id || report.id,
      structure: report.estructura || "",
      responsible: report.reportado_por || "",
      specialty: report.especialidad || "",
      activity: report.actividad || report.partida || "",
      previous: report.avance_anterior ?? 0,
      value: report.avance_nuevo ?? 0,
      comment: report.comentario || ""
    }];
  });

  return (
    <div className="table-card">
      <div className="document-toolbar">
        <label>
          Documentos Emitidos Globales
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <button onClick={() => window.print()}>Imprimir / PDF</button>
        <select><option>Mas recientes primero</option></select>
        <select><option>Ver todos los tipos</option></select>
      </div>
      <div className="print-area">
        <h3>Consolidado diario {formatDateShort(date)}</h3>
        {consolidatedRows.length ? (
          <table>
            <thead>
              <tr><th>Reporte</th><th>Torre</th><th>Responsable</th><th>Especialidad</th><th>Actividad</th><th>Anterior</th><th>Nuevo</th><th>Comentario</th></tr>
            </thead>
            <tbody>
              {consolidatedRows.map((row, index) => (
                <tr key={`${row.id}-${row.structure}-${row.activity}-${index}`}>
                  <td>{row.id}</td>
                  <td>{row.structure}</td>
                  <td>{row.responsible}</td>
                  <td>{row.specialty}</td>
                  <td>{row.activity}</td>
                  <td>{fmt(Number(row.previous))}</td>
                  <td>{fmt(Number(row.value))}</td>
                  <td>{row.comment || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-card">Sin reportes de capataces para la fecha seleccionada.</div>
        )}
      </div>
      <h3>Historial de documentos</h3>
      {documents.length ? (
        <table>
          <thead>
            <tr><th>ID Documento</th><th>Estructura</th><th>Emitido el</th><th>Responsable</th><th>Detalle Documento</th><th>Accion</th></tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td><strong>{doc.id}</strong></td>
                <td>Torre N {doc.structure || "-"}</td>
                <td>{doc.date || "-"}</td>
                <td>{doc.owner || "-"}</td>
                <td><span className={doc.id.startsWith("RPT") ? "doc-tag rpt" : "doc-tag pla"}>{doc.type}</span></td>
                <td><button onClick={() => window.print()}>Abrir / Imprimir</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-card">Aun no hay documentos emitidos. Los reportes y planificaciones guardadas apareceran aca.</div>
      )}
    </div>
  );
}

function QuickReportModal({ data, onSaveReport, onNotify, onClose }) {
  const [selectedForeman, setSelectedForeman] = useState(data.foremen[0]?.name || "");
  const [selectedStructureId, setSelectedStructureId] = useState("");
  const [activityValues, setActivityValues] = useState({});
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const foreman = data.foremen.find((item) => item.name === selectedForeman) || data.foremen[0];
  const structure = data.structures.find((item) => item.id === selectedStructureId);
  const detail = getReportActivities(foreman?.specialty, structure, data.processCatalog);
  const detailTitle = foreman?.specialty === "OOMM"
    ? "OOMM Montaje"
    : `OOCC Detallado - ${structure?.foundation || "Seleccione estructura"}`;
  const canReport = structure && structure.legal === "LIBERADA" && structure.programmed === true;

  async function saveReport() {
    if (!canReport || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const activities = detail.map((item) => ({
        code: item.code,
        name: item.name,
        previous: numberOrZero(item.real),
        value: Number(activityValues[item.code] ?? item.real ?? 0)
      }));
      await onSaveReport({
        foreman,
        structure,
        detailTitle,
        activities,
        comment
      });
      setMessage("Reporte guardado en historial.");
      onNotify("Reporte rapido guardado correctamente.");
      setActivityValues({});
      setComment("");
    } catch (error) {
      const errorMessage = error.message || "No se pudo guardar el reporte.";
      setMessage(errorMessage);
      onNotify(errorMessage, true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="quick-modal">
        <header className="modal-header">
          <h2>Reporte Rapido Terreno</h2>
          <button className="outline-button" onClick={onClose}>Cerrar</button>
        </header>
        <div className="quick-body">
          <div className="quick-grid">
            <label>
              Capataz
              <select value={selectedForeman} onChange={(event) => setSelectedForeman(event.target.value)}>
                {data.foremen.map((item) => (
                  <option key={`${item.name}-${item.specialty}`} value={item.name}>{item.name}</option>
                ))}
              </select>
            </label>
            <label>
              Especialidad
              <input value={foreman?.specialty || "Pendiente"} readOnly />
            </label>
          </div>
          <label>
            Estructura / Torre
            <select value={selectedStructureId} onChange={(event) => setSelectedStructureId(event.target.value)}>
              <option value="">Seleccione estructura</option>
              {data.structures.map((item) => (
                <option key={item.id} value={item.id}>{item.id} - {item.type}</option>
              ))}
            </select>
          </label>
          {structure && (
            <div className="quick-selected">
              <span>{structure.type}</span>
              <span>{structure.foundation}</span>
              <span>{getStructureStatusLabel(structure)}</span>
            </div>
          )}
          {structure && !canReport && (
            <div className="empty-card blocked-report">
              No se puede reportar avance: la estructura debe estar liberada y programada.
            </div>
          )}
          {structure ? (
            <div className="process-card">
              <strong>{detailTitle}</strong>
              {detail.map((item) => (
                <label key={item.code}>
                  {item.name} <small>Avance previo: {fmt(item.real)}</small>
                  <input
                    type="number"
                    min={item.real || 0}
                    max="100"
                    value={activityValues[item.code] ?? item.real ?? 0}
                    disabled={!canReport}
                    onChange={(event) => {
                      const nextValue = Math.max(numberOrZero(item.real), Math.min(100, Number(event.target.value || 0)));
                      setActivityValues((current) => ({ ...current, [item.code]: nextValue }));
                    }}
                  />
                </label>
              ))}
              {!detail.length && <div className="empty-card">No hay actividades configuradas para esta fundacion.</div>}
              <label>
                Comentario general / actividades fuera de control
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Aseo, orden, mejoramiento de caminos, interferencias, observaciones de terreno..."
                  disabled={!canReport}
                />
              </label>
            </div>
          ) : (
            <div className="empty-card">Seleccione una estructura para abrir el reporte de avance.</div>
          )}
          {message && <div className={message.includes("guardado") ? "empty-card positive" : "empty-card blocked-report"}>{message}</div>}
          <button className="success-button" disabled={!canReport || saving} onClick={saveReport}>
            {saving ? "Guardando..." : "Guardar Reporte Rapido"}
          </button>
        </div>
      </section>
    </div>
  );
}

function InfoModal({ data, onClose }) {
  return (
    <div className="modal-backdrop">
      <section className="info-modal">
        <h2>{data.title}</h2>
        <p>Avance esperado a hoy: <strong>{fmt(data.planned)}</strong></p>
        <p>Avance real registrado: <strong>{fmt(data.real)}</strong></p>
        <p>Desviacion: <strong className={data.real - data.planned < 0 ? "negative" : "positive"}>{fmt(data.real - data.planned)}</strong></p>
        <button className="primary-button" onClick={onClose}>Entendido</button>
      </section>
    </div>
  );
}

function Configuracion({
  user,
  data,
  syncStatus,
  onNotify,
  onCreateUser,
  onCreateForeman,
  onUpdateUser,
  onDeleteUser,
  onUpdateForeman,
  onDeleteForeman,
  onRepairProgramData
}) {
  const [newUser, setNewUser] = useState({ name: "", password: "", role: "ADMIN" });
  const [newForeman, setNewForeman] = useState({ name: "", specialty: "OOCC" });
  const [status, setStatus] = useState("");
  const [savingUser, setSavingUser] = useState(false);
  const [savingForeman, setSavingForeman] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editingForeman, setEditingForeman] = useState(null);
  const [busyRow, setBusyRow] = useState("");
  const [repairingProgram, setRepairingProgram] = useState(false);

  if (!isAdmin(user)) {
    return (
      <section className="module">
        <h2>Configuracion</h2>
        <div className="empty-card">Modulo disponible solo para usuarios ADMIN.</div>
      </section>
    );
  }

  async function addUser() {
    if (savingUser) return;
    if (!newUser.name.trim() || !newUser.password.trim()) {
      onNotify("Falta nombre de usuario o clave numerica.", true);
      setStatus("Falta nombre de usuario o clave numerica.");
      return;
    }
    const duplicated = data.users.some((item) => (
      normalizeText(item.name) === normalizeText(newUser.name)
      && normalizeText(item.name) !== normalizeText(editingUser?.originalName)
    ));
    if (duplicated) {
      onNotify("Ese usuario ya existe. No se duplico el registro.", true);
      setStatus("Ese usuario ya existe.");
      return;
    }
    setSavingUser(true);
    try {
      if (editingUser) {
        await onUpdateUser({
          originalName: editingUser.originalName,
          name: newUser.name.trim(),
          password: newUser.password.trim(),
          role: newUser.role
        });
      } else {
        await onCreateUser({ name: newUser.name.trim(), password: newUser.password.trim(), role: newUser.role });
      }
      setNewUser({ name: "", password: "", role: "ADMIN" });
      setEditingUser(null);
      setStatus(editingUser ? "Usuario editado y registrado." : "Usuario agregado y registrado.");
      onNotify(editingUser ? "Usuario editado correctamente." : "Usuario agregado correctamente.");
    } catch (error) {
      const message = error.message || "No se pudo agregar el usuario.";
      setStatus(message);
      onNotify(message, true);
    } finally {
      setSavingUser(false);
    }
  }

  async function addForeman() {
    if (savingForeman) return;
    if (!newForeman.name.trim()) {
      onNotify("Falta nombre del capataz.", true);
      setStatus("Falta nombre del capataz.");
      return;
    }
    const duplicated = data.foremen.some((item) => (
      normalizeText(item.name) === normalizeText(newForeman.name)
      && normalizeText(item.name) !== normalizeText(editingForeman?.originalName)
    ));
    if (duplicated) {
      onNotify("Ese capataz ya existe. No se duplico el registro.", true);
      setStatus("Ese capataz ya existe.");
      return;
    }
    setSavingForeman(true);
    try {
      if (editingForeman) {
        await onUpdateForeman({
          originalName: editingForeman.originalName,
          name: newForeman.name.trim(),
          specialty: newForeman.specialty
        });
      } else {
        await onCreateForeman({ name: newForeman.name.trim(), specialty: newForeman.specialty });
      }
      setNewForeman({ name: "", specialty: "OOCC" });
      setEditingForeman(null);
      setStatus(editingForeman ? "Capataz editado y registrado." : "Capataz agregado y registrado.");
      onNotify(editingForeman ? "Capataz editado correctamente." : "Capataz agregado correctamente.");
    } catch (error) {
      const message = error.message || "No se pudo agregar el capataz.";
      setStatus(message);
      onNotify(message, true);
    } finally {
      setSavingForeman(false);
    }
  }

  async function deleteUser(item) {
    const key = `user-${item.name}`;
    if (busyRow) return;
    setBusyRow(key);
    try {
      await onDeleteUser({ name: item.name });
      onNotify("Usuario eliminado correctamente.");
      setStatus("Usuario eliminado y registrado.");
      if (editingUser?.originalName === item.name) {
        setEditingUser(null);
        setNewUser({ name: "", password: "", role: "ADMIN" });
      }
    } catch (error) {
      const message = error.message || "No se pudo eliminar el usuario.";
      onNotify(message, true);
      setStatus(message);
    } finally {
      setBusyRow("");
    }
  }

  async function deleteForeman(item) {
    const key = `foreman-${item.name}`;
    if (busyRow) return;
    setBusyRow(key);
    try {
      await onDeleteForeman({ name: item.name });
      onNotify("Capataz eliminado correctamente.");
      setStatus("Capataz eliminado y registrado.");
      if (editingForeman?.originalName === item.name) {
        setEditingForeman(null);
        setNewForeman({ name: "", specialty: "OOCC" });
      }
    } catch (error) {
      const message = error.message || "No se pudo eliminar el capataz.";
      onNotify(message, true);
      setStatus(message);
    } finally {
      setBusyRow("");
    }
  }

  function startEditUser(item) {
    setEditingUser({ originalName: item.name });
    setNewUser({ name: item.name, password: item.password || "", role: item.role || "VISUALIZADOR" });
  }

  function startEditForeman(item) {
    setEditingForeman({ originalName: item.name });
    setNewForeman({ name: item.name, specialty: item.specialty || "OOCC" });
  }

  async function repairProgramData() {
    if (repairingProgram) return;
    const confirmed = window.confirm("Esto reparara SIS_PROGRAMA_GENERAL dejando una sola fila por estructura y partida. Continuar?");
    if (!confirmed) return;
    setRepairingProgram(true);
    try {
      await onRepairProgramData();
      setStatus("Programacion general reparada y registrada.");
      onNotify("Programacion general reparada correctamente.");
    } catch (error) {
      const message = error.message || "No se pudo reparar la programacion.";
      setStatus(message);
      onNotify(message, true);
    } finally {
      setRepairingProgram(false);
    }
  }

  return (
    <section className="module">
      <h2>Configuracion</h2>
      <div className="config-grid">
        <section className="table-card">
          <h3>Base de datos operativa</h3>
          <p className="muted-text">Estado: {syncStatus}. La aplicacion usa Google Sheets si existe URL configurada; si no, guarda en data/runtime-db.json para trabajar hoy sin perder datos.</p>
          <div className="config-actions">
            <button className="primary-button" onClick={() => exportJson(data)}>Exportar base JSON</button>
            <button className="outline-button" onClick={() => exportStructuresCsv(data.structures)}>Exportar estructuras CSV</button>
            <button className="outline-button" onClick={() => exportModelWorkbook(data)}>Exportar modelo Excel</button>
            <button className="outline-button" onClick={repairProgramData} disabled={repairingProgram}>
              {repairingProgram ? "Reparando..." : "Reparar programacion"}
            </button>
            <label className="import-button">
              Importar base
              <input type="file" accept=".json,.xlsx,.csv" />
            </label>
          </div>
        </section>

        <section className="table-card">
          <h3>{editingUser ? "Editar usuario" : "Nuevo usuario"}</h3>
          <div className="config-form">
            <input placeholder="Nombre usuario" value={newUser.name} onChange={(event) => setNewUser({ ...newUser, name: event.target.value })} />
            <input placeholder="Clave numerica" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} />
            <select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}><option>ADMIN</option><option>VISUALIZADOR</option></select>
            <button onClick={addUser} disabled={savingUser}>{savingUser ? "Guardando..." : editingUser ? "Guardar cambios" : "Agregar usuario"}</button>
            {editingUser && (
              <button
                className="neutral-action"
                onClick={() => {
                  setEditingUser(null);
                  setNewUser({ name: "", password: "", role: "ADMIN" });
                }}
              >
                Cancelar
              </button>
            )}
          </div>
          <small className="muted-text">Este registro se guarda en SIS_USUARIOS cuando Sheets esta conectado.</small>
        </section>

        <section className="table-card">
          <h3>{editingForeman ? "Editar capataz" : "Nuevo capataz"}</h3>
          <div className="config-form">
            <input placeholder="Nombre capataz" value={newForeman.name} onChange={(event) => setNewForeman({ ...newForeman, name: event.target.value })} />
            <select value={newForeman.specialty} onChange={(event) => setNewForeman({ ...newForeman, specialty: event.target.value })}><option>OOCC</option><option>OOMM</option></select>
            <button onClick={addForeman} disabled={savingForeman}>{savingForeman ? "Guardando..." : editingForeman ? "Guardar cambios" : "Agregar capataz"}</button>
            {editingForeman && (
              <button
                className="neutral-action"
                onClick={() => {
                  setEditingForeman(null);
                  setNewForeman({ name: "", specialty: "OOCC" });
                }}
              >
                Cancelar
              </button>
            )}
          </div>
          <small className="muted-text">Este registro se guarda en DATA_CAPATAZ cuando Sheets esta conectado.</small>
        </section>

        <section className="table-card config-list-card">
          <h3>Usuarios activos</h3>
          <div className="config-table-scroll">
            <table className="compact-table">
              <thead><tr><th>Usuario</th><th>Rol</th><th>Accion</th></tr></thead>
              <tbody>{data.users.map((item, index) => (
                <tr key={`${item.name}-${item.role}-${index}`}>
                  <td>{item.name}</td>
                  <td>{item.role}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => startEditUser(item)}>Editar</button>
                      <button className="danger-mini" disabled={busyRow === `user-${item.name}`} onClick={() => deleteUser(item)}>
                        {busyRow === `user-${item.name}` ? "Eliminando..." : "Eliminar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        <section className="table-card config-list-card">
          <h3>Capataces</h3>
          <div className="config-table-scroll">
            <table className="compact-table">
              <thead><tr><th>Nombre</th><th>Especialidad</th><th>Accion</th></tr></thead>
              <tbody>{data.foremen.map((item, index) => (
                <tr key={`${item.name}-${item.specialty}-${index}`}>
                  <td>{item.name}</td>
                  <td>{item.specialty}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => startEditForeman(item)}>Editar</button>
                      <button className="danger-mini" disabled={busyRow === `foreman-${item.name}`} onClick={() => deleteForeman(item)}>
                        {busyRow === `foreman-${item.name}` ? "Eliminando..." : "Eliminar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}

function Placeholder({ title }) {
  return (
    <section className="module">
      <h2>{title}</h2>
      <div className="empty-card">Modulo preparado para una etapa posterior.</div>
    </section>
  );
}

async function serverAction(action, payload = {}) {
  const response = await fetch("/api/sheets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload })
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.message || "No se pudo conectar con la base de datos.");
  }
  if (result?.ok === false) {
    throw new Error(result.message || "No se pudo guardar.");
  }
  return result;
}

function showToast(setToast, message, isError = false) {
  setToast({ message, isError });
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => setToast(null), 3600);
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeData(data) {
  const normalizedStructures = data.structures?.length ? data.structures : structures;
  return {
    users: data.users?.length ? data.users : users,
    foremen: data.foremen?.length ? data.foremen : foremen,
    structures: normalizedStructures.map(enrichStructureProgress),
    documents: data.documents || documents,
    reports: data.reports || [],
    plans: data.plans || [],
    comments: data.comments || [],
    processCatalog: hasProcessCatalog(data.processCatalog) ? data.processCatalog : processCatalog,
    generalProcesses: data.generalProcesses?.length ? data.generalProcesses : generalProcesses,
    crewSchedule: data.crewSchedule?.length ? data.crewSchedule : crewSchedule,
    tomorrowPlan: data.tomorrowPlan?.length ? data.tomorrowPlan : tomorrowPlan
  };
}

function enrichStructureProgress(structure) {
  const rows = getStructureProcessRows(structure, generalProcesses);
  const hasRealProgress = rows.some((row) => row.completed || (isNumber(row.real) && row.real > 0));
  const hasPlannedProgress = rows.some((row) => row.start && row.end);
  const computedReal = hasRealProgress ? getWeightedProgress(rows, "real") : structure.real;
  const computedPlanned = hasPlannedProgress ? getWeightedProgress(rows, "planned") : structure.planned;
  const programmed = structure.programmed === true || hasPlannedProgress ? true : structure.programmed;

  return {
    ...structure,
    real: isNumber(computedReal) ? computedReal : null,
    planned: isNumber(computedPlanned) ? computedPlanned : null,
    programmed
  };
}

function hasProcessCatalog(catalog) {
  return Boolean(
    catalog
    && Object.values(catalog).some((category) => category && Object.keys(category).length)
  );
}

function buildProgramRows(structure) {
  const canonicalRows = generalProcesses.map((item) => ({
    item: item.item,
    name: item.name,
    weight: item.weight,
    start: "",
    end: "",
    real: 0,
    planned: 0,
    completed: false
  }));
  const byItem = new Map(canonicalRows.map((row) => [String(row.item), row]));

  (structure.programRows || []).forEach((row) => {
    const item = normalizeProgramItem(row.item);
    if (!item || !byItem.has(item)) return;
    const base = byItem.get(item);
    const completed = readBoolean(row.completed ?? row.finalizada_100);
    byItem.set(item, {
      ...base,
      start: cleanIsoDate(row.start || row.fecha_inicio) || "",
      end: cleanIsoDate(row.end || row.fecha_termino) || "",
      real: isNumber(row.real) ? row.real : base.real,
      planned: isNumber(row.planned) ? row.planned : base.planned,
      completed: completed === null ? base.completed : completed
    });
  });

  return canonicalRows.map((base) => {
    const row = byItem.get(String(base.item)) || base;
    return row.item === "1"
      ? { ...row, completed: structure.legal === "LIBERADA" || row.completed === true }
      : row;
  });
}

function normalizeProgramItem(value) {
  const text = String(value || "").trim();
  return generalProcesses.some((item) => String(item.item) === text) ? text : "";
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

function average(values) {
  const numeric = values.filter((value) => isNumber(value));
  if (!numeric.length) return null;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function numberOrZero(value) {
  return isNumber(value) ? value : 0;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function getCalendarDays(month) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const first = new Date(year, monthIndex, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, monthIndex, 1 - startOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    const value = toIsoDate(date);
    return {
      key: value,
      value,
      label: date.getDate(),
      inMonth: date.getMonth() === monthIndex
    };
  });
}

function getCalendarDayClass(value, start, end, inMonth) {
  const classes = ["calendar-day"];
  if (!inMonth) classes.push("outside");
  if (value === start || value === end) classes.push("selected");
  if (start && end && value > start && value < end) classes.push("in-range");
  return classes.join(" ");
}

function toIsoDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateShort(value) {
  if (!value) return "-";
  return String(value).replaceAll("-", "/");
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

function getDeviation(item) {
  if (!isNumber(item.real) || !isNumber(item.planned)) return null;
  return item.real - item.planned;
}

function isStructureOk(item) {
  const deviation = getDeviation(item);
  return item.legal === "LIBERADA" && item.programmed === true && isNumber(deviation) && deviation >= 0;
}

function isStructurePending(item) {
  return item.legal === "PENDIENTE" || item.programmed === null || !isNumber(item.real) || !isNumber(item.planned);
}

function getStructureTone(item) {
  return isStructureOk(item) ? "ok" : "critical";
}

function getDeviationTone(item) {
  const deviation = getDeviation(item);
  if (!isNumber(deviation)) return "muted-text";
  if (deviation < 0) return "negative";
  if (deviation > 0) return "positive";
  return "neutral";
}

function getValueTone(value) {
  if (!isNumber(value)) return "muted-text";
  if (value < 0) return "negative";
  if (value > 0) return "positive";
  return "neutral";
}

function getStructureProcessRows(structure, processes = generalProcesses) {
  const programRows = buildProgramRows(structure);
  return processes.map((process) => {
    const programmed = programRows.find((row) => String(row.item) === String(process.item));
    const real = programmed?.completed ? 100 : numberOrZero(programmed?.real);
    const planned = programmed?.start && programmed?.end ? numberOrZero(programmed?.planned) : 0;
    return {
      ...process,
      ...(programmed || {}),
      item: process.item,
      name: process.name,
      weight: numberOrZero(process.weight),
      real,
      planned
    };
  });
}

function getWeightedProgress(rows, key) {
  const totalWeight = rows.reduce((total, row) => total + numberOrZero(row.weight), 0);
  if (!totalWeight) return 0;
  return rows.reduce((total, row) => total + (numberOrZero(row[key]) * numberOrZero(row.weight)), 0) / totalWeight;
}

function buildGanttRows(structuresList, expanded, filter) {
  return structuresList.flatMap((structure) => {
    const programRows = buildProgramRows(structure);
    const visibleProgramRows = programRows
      .filter((row) => row.start && row.end)
      .filter((row) => filter === "Todas las Partidas" || `${row.item}. ${row.name}` === filter);
    const datedRows = filter === "Todas las Partidas"
      ? programRows.filter((row) => row.start && row.end)
      : visibleProgramRows;
    if (!datedRows.length) return [];
    const parentStart = minDate(datedRows.map((row) => row.start));
    const parentEnd = maxDate(datedRows.map((row) => row.end));
    const parent = {
      key: `tower-${structure.id}`,
      structureId: structure.id,
      label: `Torre N ${structure.id}`,
      start: parentStart,
      end: parentEnd,
      real: structure.real,
      planned: structure.planned,
      detail: false
    };
    if (expanded !== structure.id) return [parent];
    const visibleChildren = visibleProgramRows.map((row) => ({
        key: `tower-${structure.id}-${row.item}`,
        structureId: structure.id,
        label: `└ ${row.item}. ${row.name}`,
        start: row.start,
        end: row.end,
        real: row.completed ? 100 : row.real,
        planned: row.completed ? 100 : row.planned,
        detail: true
      }));
    return [parent, ...visibleChildren];
  });
}

function getGanttRange(rows, zoom = 42, scale = "dia") {
  const today = toIsoDate(new Date());
  const starts = [...rows.map((row) => row.start).filter(Boolean), today];
  const ends = [...rows.map((row) => row.end).filter(Boolean), today];
  const zoomValue = Math.max(28, Math.min(76, Number(zoom || 42)));
  const visibleDays = scale === "mes"
    ? Math.round(420 - zoomValue * 3)
    : scale === "semana"
      ? Math.round(220 - zoomValue * 1.9)
      : Math.round(120 - zoomValue);
  const minimumSpan = Math.max(scale === "dia" ? 36 : scale === "semana" ? 84 : 180, visibleDays);
  const calendarStart = minDate([...starts, shiftIsoDate(today, -Math.floor(minimumSpan / 2))]);
  const calendarEnd = maxDate([...ends, shiftIsoDate(today, Math.ceil(minimumSpan / 2))]);
  const currentSpan = dateDiffDays(calendarStart, calendarEnd) + 1;
  const extraPadding = Math.max(0, minimumSpan - currentSpan);

  return {
    start: shiftIsoDate(calendarStart, -Math.floor(extraPadding / 2)),
    end: shiftIsoDate(calendarEnd, Math.ceil(extraPadding / 2))
  };
}

function buildGanttDays(start, end, scale) {
  const first = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  const days = [];

  if (scale === "mes") {
    const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
    while (cursor <= last) {
      const periodStart = new Date(cursor);
      const periodEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const value = toIsoDate(periodStart);
      days.push({
        key: `${value}-${scale}`,
        value,
        start: value,
        end: toIsoDate(periodEnd),
        label: formatGanttLabel(periodStart, scale),
        weekday: ""
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return days;
  }

  const step = scale === "semana" ? 7 : 1;
  for (let date = new Date(first); date <= last; date.setDate(date.getDate() + step)) {
    const periodStart = new Date(date);
    const periodEnd = new Date(date);
    periodEnd.setDate(periodEnd.getDate() + step - 1);
    const value = toIsoDate(periodStart);
    days.push({
      key: `${value}-${scale}`,
      value,
      start: value,
      end: toIsoDate(periodEnd),
      label: formatGanttLabel(periodStart, scale),
      weekday: getWeekdayInitial(periodStart, scale)
    });
  }
  return days;
}

function getWeekdayInitial(date, scale) {
  if (scale === "semana") return "Semana";
  if (scale !== "dia") return "";
  return ["D", "L", "M", "M", "J", "V", "S"][date.getDay()];
}

function formatGanttLabel(date, scale) {
  if (scale === "mes") return date.toLocaleDateString("es-CL", { month: "short", year: "2-digit" }).replace(".", "");
  if (scale === "semana") return `Sem ${getWeekNumber(date)}`;
  return String(date.getDate()).padStart(2, "0");
}

function getWeekNumber(date) {
  const first = new Date(date.getFullYear(), 0, 1);
  return Math.ceil((((date - first) / 86400000) + first.getDay() + 1) / 7);
}

function getGanttBarStyle(start, end, days) {
  const startIndex = Math.max(0, findClosestDayIndex(days, start));
  const endIndex = Math.max(startIndex, findClosestDayIndex(days, end));
  const width = Math.max(1, endIndex - startIndex + 1);
  return {
    left: `${(startIndex / days.length) * 100}%`,
    width: `${(width / days.length) * 100}%`
  };
}

function getGanttActualStyle(start, end, real, days) {
  const base = getGanttBarStyle(start, end, days);
  const pct = isNumber(real) ? Math.max(0, Math.min(100, real)) : 0;
  return {
    ...base,
    width: `calc(${base.width} * ${pct / 100})`
  };
}

function findClosestDayIndex(days, isoDate) {
  const target = new Date(`${isoDate}T00:00:00`).getTime();
  let index = 0;
  let diff = Infinity;
  days.forEach((day, currentIndex) => {
    if (isIsoInPeriod(isoDate, day.start, day.end)) {
      index = currentIndex;
      diff = 0;
      return;
    }
    const currentDiff = Math.abs(new Date(`${day.value}T00:00:00`).getTime() - target);
    if (currentDiff < diff) {
      diff = currentDiff;
      index = currentIndex;
    }
  });
  return index;
}

function isIsoInPeriod(value, start, end) {
  if (!value || !start || !end) return false;
  return value >= start && value <= end;
}

function minDate(values) {
  return values.reduce((min, value) => value < min ? value : min, values[0]);
}

function maxDate(values) {
  return values.reduce((max, value) => value > max ? value : max, values[0]);
}

function shiftIsoDate(value, days) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

function dateDiffDays(start, end) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  return Math.round((endDate - startDate) / 86400000);
}

function buildCrewDays() {
  const start = new Date(2026, 5, 16);
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      value: toIsoDate(date),
      label: date.toLocaleDateString("es-CL", { day: "2-digit", month: "short" }).replace(".", "")
    };
  });
}

function getStructureStatusLabel(item) {
  if (item.legal === "PENDIENTE") return "No liberada / No programada";
  if (item.legal !== "LIBERADA") return "No liberada";
  if (item.programmed === false) return "Sin programa";
  if (item.programmed === null) return "Programa pendiente";
  return "Liberada";
}

function getSemaphoreLabel(item) {
  return isStructureOk(item) ? "Verde" : "Rojo";
}

function getReportActivities(specialty, structure, catalog = processCatalog) {
  if (specialty === "OOMM") {
    const subcategory = Object.keys(catalog.OOMM || {})[0];
    return (catalog.OOMM?.[subcategory] || oommDetail).map((item) => ({ ...item, real: item.real || 0, planned: item.planned || 0 }));
  }
  if (!structure) return [];
  const foundation = structure.foundation;
  return (catalog.OOCC?.[foundation] || ooccDetail).map((item) => ({ ...item, real: item.real || 0, planned: item.planned || 0 }));
}

function getPlanActivityOptions(specialty) {
  const allowed = specialty === "OOMM"
    ? ["TR", "PRE", "MON", "GA"]
    : ["IA", "CC", "ZV", "RC", "MPTA", "ACC", "PTAS"];
  return [
    ...allowed
      .filter((code) => taskLegend[code])
      .map((code) => ({ code, label: taskLegend[code].label })),
    { code: "ADIC", label: "Actividad adicional" }
  ];
}

function extractStructureId(value) {
  const match = String(value || "").match(/\d+/);
  return match ? match[0] : "";
}

function nextPlanCode(documentsRows = [], planRows = []) {
  const currentYear = new Date().getFullYear();
  const max = [...documentsRows, ...planRows]
    .map((item) => String(item.id || item.plan_id || item.planId || ""))
    .filter((id) => id.startsWith("PLA-"))
    .map((id) => Number(id.split("-").pop()))
    .filter((value) => Number.isFinite(value))
    .reduce((highest, value) => Math.max(highest, value), 0);
  return `PLA-${currentYear}-${String(max + 1).padStart(4, "0")}`;
}

function getDocumentDate(value) {
  if (!value) return "";
  const text = String(value);
  const iso = text.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : toIsoDate(date);
}

function exportJson(data = DEFAULT_DATA) {
  downloadFile(
    "tineo-ancud-base.json",
    JSON.stringify(data, null, 2),
    "application/json"
  );
}

function exportStructuresCsv(currentStructures = structures) {
  const headers = ["estructura", "tipo", "id_torre", "tipo_oocc", "tipo_oomm", "estado_legal", "programada", "avance_real", "avance_programado", "desviacion"];
  const rows = currentStructures.map((item) => [
    item.id,
    item.type,
    item.towerId,
    item.foundation,
    item.mountingType,
    getStructureStatusLabel(item),
    item.programmed === null ? "Pendiente" : item.programmed ? "SI" : "NO",
    fmt(item.real),
    fmt(item.planned),
    fmt(getDeviation(item))
  ]);
  downloadFile("tineo-ancud-estructuras.csv", toCsv([headers, ...rows]), "text/csv;charset=utf-8");
}

function exportModelWorkbook(data = DEFAULT_DATA) {
  const sheets = [
    {
      name: "DATA_GENERA",
      rows: [
        ["N° Estructura", "Tipo", "ID. Torre", "Tipo OOCC", "Tipo OOMM"],
        ...data.structures.map((item) => [item.id, item.type, item.towerId, item.foundation, item.mountingType])
      ]
    },
    {
      name: "SIS_ESTADO_ESTRUCTURA",
      rows: [
        ["estructura", "estado_legal", "programada", "avance_real_global", "avance_programado_global", "desviacion_global", "oocc_cerrada", "oomm_cerrada", "actualizado_en"],
        ...data.structures.map((item) => [item.id, item.legal, item.programmed === true ? "SI" : "NO", fmt(item.real), fmt(item.planned), fmt(getDeviation(item)), "", "", ""])
      ]
    },
    {
      name: "SIS_USUARIOS",
      rows: [["usuario_id", "nombre", "clave", "rol", "activo", "creado_en", "actualizado_en"], ...data.users.map((item, index) => [`USR-${String(index + 1).padStart(4, "0")}`, item.name, item.password, item.role, "SI", "", ""])]
    },
    {
      name: "DATA_CAPATAZ",
      rows: [["NOMBRES", "ESPECIALIDAD"], ...data.foremen.map((item) => [item.name, item.specialty])]
    },
    {
      name: "SIS_REPORTES",
      rows: [["reporte_id", "fecha_hora", "origen", "reportado_por", "especialidad", "estructura", "partida", "codigo_actividad", "actividad", "avance_anterior", "avance_nuevo", "comentario"]]
    },
    {
      name: "SIS_PLAN_DIARIO",
      rows: [["plan_id", "fecha_creacion", "fecha_planificada", "creado_por", "capataz", "especialidad", "estructura", "partida", "codigo_actividad", "actividad", "observaciones", "estado", "reporte_relacionado"]]
    }
  ];
  downloadFile("tineo-ancud-modelo-datos.xls", toExcelXml(sheets), "application/vnd.ms-excel;charset=utf-8");
}

function toExcelXml(sheets) {
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${sheets.map((sheet) => `<Worksheet ss:Name="${escapeXml(sheet.name)}"><Table>${sheet.rows.map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join("")}</Row>`).join("")}</Table></Worksheet>`).join("")}</Workbook>`;
}

function toCsv(rows) {
  return rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function fmt(value) {
  if (!isNumber(value)) return "-";
  return `${Math.round(value * 100) / 100}%`;
}
