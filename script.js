/* Copyright (c) 2026 Robbe Wulgaert */

class LineBreakTransformer {
  constructor() {
    this.chunks = "";
  }

  transform(chunk, controller) {
    this.chunks += chunk;
    const lines = this.chunks.split("\n");
    this.chunks = lines.pop();
    lines.forEach((line) => controller.enqueue(line));
  }

  flush(controller) {
    controller.enqueue(this.chunks);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);
  const FINGERS = [
    { key: "thumb", label: "Duim", pin: "A0", color: "#5200FF" },
    { key: "index", label: "Wijs", pin: "A1", color: "#00A3A3" },
    { key: "middle", label: "Midden", pin: "A2", color: "#FFB000" },
    { key: "ring", label: "Ring", pin: "A3", color: "#D0006F" },
    { key: "pinky", label: "Pink", pin: "A4", color: "#008060" },
  ];
  const GESTURES = {
    "-1": "Geen geldig gebaar",
    0: "--",
    1: "Steen",
    2: "Blad",
    3: "Schaar",
  };
  const BAUD_RATE = 9600;
  const MAX_SAMPLES = 480;

  const els = {
    compatibilityNotice: $("compatibility-notice"),
    connectionStatus: $("connection-status"),
    workflowLinks: [...document.querySelectorAll("[data-step-link]")],
    setupChecklist: $("setup-checklist"),
    diagnosticSummary: $("diagnostic-summary"),
    diagnosticList: $("diagnostic-list"),
    serialPreview: $("serial-preview"),
    fingerToggleGroup: $("finger-toggle-group"),
    btnAllFingers: $("btn-all-fingers"),
    btnIndexOnly: $("btn-index-only"),
    btnConnect: $("btn-connect"),
    btnDemo: $("btn-demo"),
    btnCaptureOpen: $("btn-capture-open"),
    btnCaptureClosed: $("btn-capture-closed"),
    btnResetCalibration: $("btn-reset-calibration"),
    btnReport: $("btn-report"),
    reportModal: $("report-modal"),
    reportForm: $("report-form"),
    reportNames: $("report-names"),
    reportClass: $("report-class"),
    btnCancelReport: $("btn-cancel-report"),
    btnReportBack: $("btn-report-back"),
    btnStartMatch: $("btn-start-match"),
    rpsFingerNotice: $("rps-finger-notice"),
    roundInterval: $("round-interval"),
    opponentGesture: $("opponent-gesture"),
    openCalibration: $("open-calibration"),
    closedCalibration: $("closed-calibration"),
    calibrationStatus: $("calibration-status"),
    fingerMetrics: $("finger-metrics"),
    fingerChart: $("finger-chart"),
    skeletonLayer: $("skeleton-layer"),
    sampleBody: $("sample-body"),
    rpsCountdown: $("rps-countdown"),
    rpsRound: $("rps-round"),
    playerGesture: $("player-gesture"),
    opponentGestureLabel: $("opponent-gesture-label"),
    roundHistoryBody: $("round-history-body"),
    inputConclusion: $("input-conclusion"),
    inputReflection: $("input-reflection"),
  };

  const state = {
    port: null,
    reader: null,
    writer: null,
    serialLoopActive: false,
    source: null,
    demoTimer: null,
    demoTimeMs: 0,
    startedAt: performance.now(),
    latestRaw: null,
    latestSample: null,
    samples: [],
    calibration: {
      open: null,
      closed: null,
    },
    connectedFingers: FINGERS.map(() => true),
    droppedLines: 0,
    rpsHistory: [],
    lastOpponentGesture: 0,
  };

  initialize();

  function initialize() {
    renderFingerToggles();
    renderFingerMetrics();
    renderHandSkeleton();
    updateCompatibilityNotice();
    bindEvents();
    updateDiagnostics("Nog geen data ontvangen.", [
      "Verbind de Arduino of start de demomodus.",
      "Verwachte seriele data: 22 kommagescheiden waarden.",
    ]);
    updateCalibrationDisplay();
    updateControls();
    updateWorkflowState();
    drawChart();
    updateHandSkeleton([0, 0, 0, 0, 0]);
  }

  function bindEvents() {
    els.btnConnect.addEventListener("click", connectSerial);
    els.btnDemo.addEventListener("click", toggleDemoMode);
    els.fingerToggleGroup.addEventListener("change", handleFingerToggleChange);
    els.btnAllFingers.addEventListener("click", () => setConnectedFingers(FINGERS.map((finger) => finger.key)));
    els.btnIndexOnly.addEventListener("click", () => setConnectedFingers(["index"]));
    els.btnCaptureOpen.addEventListener("click", () => captureCalibration("open"));
    els.btnCaptureClosed.addEventListener("click", () => captureCalibration("closed"));
    els.btnResetCalibration.addEventListener("click", resetCalibration);
    els.btnReport.addEventListener("click", openReportModal);
    els.btnCancelReport.addEventListener("click", closeReportModal);
    els.btnReportBack.addEventListener("click", closeReportModal);
    els.reportModal.addEventListener("click", (event) => {
      if (event.target === els.reportModal) {
        closeReportModal();
      }
    });
    els.reportForm.addEventListener("submit", (event) => {
      event.preventDefault();
      generatePdf();
      closeReportModal();
    });
    els.btnStartMatch.addEventListener("click", startMatch);
    els.setupChecklist.addEventListener("change", updateWorkflowState);
    els.inputConclusion.addEventListener("input", updateWorkflowState);
    window.addEventListener("resize", drawChart);
  }

  function updateCompatibilityNotice() {
    const messages = [];
    if (!window.isSecureContext) {
      messages.push("WebSerial werkt alleen via localhost, HTTPS of GitHub Pages.");
    }
    if (!("serial" in navigator)) {
      messages.push("Deze browser ondersteunt WebSerial niet. Gebruik Chrome of Edge, of werk met de demomodus.");
      els.btnConnect.disabled = true;
    }
    if (!window.jspdf) {
      messages.push("PDF-export gebruikt de lokale bibliotheek in vendor/jspdf. Controleer die map als PDF niet start.");
    }
    if (messages.length) {
      els.compatibilityNotice.classList.remove("hidden");
      els.compatibilityNotice.innerHTML = messages.map((message) => `<p>${escapeHtml(message)}</p>`).join("");
    }
  }

  async function connectSerial() {
    if (!("serial" in navigator)) {
      alert("WebSerial is niet beschikbaar in deze browser. Gebruik Chrome of Edge, of start de demomodus.");
      return;
    }
    try {
      state.port = await navigator.serial.requestPort();
      await state.port.open({ baudRate: BAUD_RATE });
      state.reader = state.port.readable
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new TransformStream(new LineBreakTransformer()))
        .getReader();
      state.writer = state.port.writable.getWriter();
      state.source = "serial";
      els.connectionStatus.textContent = `Verbonden (${BAUD_RATE} baud)`;
      els.btnConnect.disabled = true;
      updateDiagnostics("Arduino verbonden. Wacht tot de eerste data binnenkomt.", [
        "De webapp leest de bestaande Arduino-CSV zonder Excel.",
      ]);
      startSerialLoop();
      updateControls();
      updateWorkflowState();
    } catch (error) {
      console.error("Verbindingsfout:", error);
      updateDiagnostics("Verbinding mislukt.", [String(error)]);
      alert(`Verbindingsfout: ${error}`);
    }
  }

  function startSerialLoop() {
    if (state.serialLoopActive || !state.reader) {
      return;
    }
    state.serialLoopActive = true;
    readSerialLoop();
  }

  async function readSerialLoop() {
    while (state.reader) {
      try {
        const { value, done } = await state.reader.read();
        if (done) {
          break;
        }
        if (typeof value === "string") {
          parseSerialLine(value, "serial");
        }
      } catch (error) {
        console.error("Leesfout:", error);
        updateDiagnostics("Leesfout op de seriele verbinding.", [String(error)]);
        break;
      }
    }
    state.serialLoopActive = false;
  }

  function parseSerialLine(line, source) {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    els.serialPreview.textContent = `Laatste regel: ${trimmed}`;
    const values = trimmed.split(",").map((part) => Number(part.trim()));
    if (values.length < 9 || values.some((value) => !Number.isFinite(value))) {
      state.droppedLines += 1;
      updateDiagnostics("Seriele regel overgeslagen.", [
        `Ontvangen velden: ${values.length}. Verwacht minstens 9 en normaal 22 velden.`,
      ]);
      return;
    }
    handlePacket(packetFromValues(values), source, trimmed);
  }

  function packetFromValues(values) {
    const padded = [...values];
    while (padded.length < 22) {
      padded.push(0);
    }
    return {
      workbookMode: padded[0],
      matchTrigger: padded[1],
      matchComplete: padded[2],
      countdown: padded[3],
      fingers: padded.slice(4, 9).map((value) => clamp(value, 0, 100)),
      round: padded[9],
      playerGesture: padded[10],
      opponentGesture: padded[11],
      playerRounds: padded.slice(12, 17),
      opponentRounds: padded.slice(17, 22),
    };
  }

  function handlePacket(packet, source, rawLine) {
    state.latestRaw = packet;
    const sample = buildSample(packet, source, rawLine);
    state.latestSample = sample;
    state.samples.push(sample);
    if (state.samples.length > MAX_SAMPLES) {
      state.samples.shift();
    }
    state.rpsHistory = deriveRoundHistory(packet);
    updateLiveUi(sample);
    updateRpsUi(packet);
    renderSampleTable();
    renderRoundHistory();
    drawChart();
    updateControls();
    updateWorkflowState();
    if (state.samples.length === 1) {
      updateDiagnostics("Data ontvangen.", [
        "Je kunt nu open en gesloten hand vastleggen.",
      ]);
    }
  }

  function buildSample(packet, source, rawLine) {
    const elapsedMs = performance.now() - state.startedAt;
    const calibrated = applyCalibration(packet.fingers);
    return {
      elapsedMs,
      source,
      rawLine,
      raw: packet.fingers,
      fingers: calibrated,
      playerGesture: hasRpsFingers() ? packet.playerGesture : 0,
      opponentGesture: packet.opponentGesture,
      round: packet.round,
      countdown: packet.countdown,
    };
  }

  function applyCalibration(values) {
    return values.map((value, index) => {
      if (!isFingerConnected(index)) {
        return null;
      }
      if (!state.calibration.open || !state.calibration.closed) {
        return clamp(value, 0, 100);
      }
      const open = state.calibration.open[index];
      const closed = state.calibration.closed[index];
      if (!Number.isFinite(open) || !Number.isFinite(closed)) {
        return clamp(value, 0, 100);
      }
      const range = closed - open;
      if (Math.abs(range) < 2) {
        return clamp(value, 0, 100);
      }
      return clamp(((value - open) / range) * 100, 0, 100);
    });
  }

  function toggleDemoMode() {
    if (state.demoTimer) {
      window.clearInterval(state.demoTimer);
      state.demoTimer = null;
      state.source = state.reader ? "serial" : null;
      els.btnDemo.textContent = "Start demomodus";
      els.connectionStatus.textContent = state.reader ? `Verbonden (${BAUD_RATE} baud)` : "Niet verbonden";
      updateDiagnostics("Demomodus gestopt.", ["Verbind Arduino of start opnieuw een demo."]);
      updateControls();
      return;
    }
    state.source = "demo";
    state.demoTimeMs = 0;
    els.btnDemo.textContent = "Stop demomodus";
    els.connectionStatus.textContent = "Demomodus actief";
    updateDiagnostics("Demomodus actief.", [
      "Gesimuleerde vingerwaarden testen de interface zonder hardware.",
    ]);
    makeDemoTick();
    state.demoTimer = window.setInterval(makeDemoTick, 250);
    updateControls();
  }

  function makeDemoTick() {
    state.demoTimeMs += 250;
    const t = state.demoTimeMs / 1000;
    const fingers = [
      45 + 38 * Math.sin(t * 0.9 + 0.4),
      50 + 42 * Math.sin(t * 1.1),
      52 + 40 * Math.sin(t * 1.05 + 0.7),
      50 + 36 * Math.sin(t * 0.95 + 1.2),
      48 + 32 * Math.sin(t * 1.2 + 1.9),
    ].map((value) => clamp(value, 0, 100));
    const gesture = inferGesture(fingers);
    const packet = {
      workbookMode: 0,
      matchTrigger: 0,
      matchComplete: 1,
      countdown: 0,
      fingers,
      round: state.rpsHistory.length,
      playerGesture: gesture,
      opponentGesture: state.lastOpponentGesture,
      playerRounds: historyColumn("player"),
      opponentRounds: historyColumn("opponent"),
    };
    handlePacket(packet, "demo", packetToLine(packet));
  }

  function inferGesture(values) {
    if (!hasRpsFingers()) {
      return 0;
    }
    const index = values[1] > 55 ? "f" : "e";
    const middle = values[2] > 55 ? "f" : "e";
    const ring = values[3] > 55 ? "f" : "e";
    const key = `${index}${middle}${ring}`;
    if (key === "fff") return 1;
    if (key === "eee") return 2;
    if (key === "eef") return 3;
    return -1;
  }

  function captureCalibration(kind) {
    if (!state.latestRaw) {
      alert("Er is nog geen data om te kalibreren.");
      return;
    }
    state.calibration[kind] = state.latestRaw.fingers.map((value, index) => (
      isFingerConnected(index) ? value : null
    ));
    updateCalibrationDisplay();
    refreshSamplesForFingerSelection();
    updateLiveUi(state.latestSample);
    updateWorkflowState();
  }

  function resetCalibration() {
    state.calibration.open = null;
    state.calibration.closed = null;
    updateCalibrationDisplay();
    if (state.latestSample) {
      updateLiveUi(state.latestSample);
    }
    updateWorkflowState();
  }

  async function startMatch() {
    if (!hasRpsFingers()) {
      alert("Voor blad-steen-schaar heb je minstens wijsvinger, middenvinger en ringvinger nodig.");
      return;
    }
    const roundInterval = clamp(Number(els.roundInterval.value) || 5, 2, 15);
    const opponent = chooseOpponentGesture();
    state.lastOpponentGesture = opponent;
    if (state.source === "demo" || !state.writer) {
      simulateDemoMatch(opponent);
      updateRpsUi({
        countdown: 0,
        round: state.rpsHistory.length,
        playerGesture: state.latestSample?.playerGesture ?? 0,
        opponentGesture: opponent,
        playerRounds: historyColumn("player"),
        opponentRounds: historyColumn("opponent"),
      });
      return;
    }
    await sendCommand({ roundInterval, matchTrigger: 1, opponentGesture: opponent });
    window.setTimeout(() => {
      sendCommand({ roundInterval, matchTrigger: 0, opponentGesture: opponent });
    }, 180);
  }

  async function sendCommand({ roundInterval, matchTrigger, opponentGesture }) {
    if (!state.writer) {
      return;
    }
    const line = `0,0,0,0,${roundInterval},${matchTrigger},0,0,${opponentGesture}\n`;
    const encoded = new TextEncoder().encode(line);
    await state.writer.write(encoded);
  }

  function chooseOpponentGesture() {
    const selected = els.opponentGesture.value;
    if (selected === "random") {
      return 1 + Math.floor(Math.random() * 3);
    }
    return Number(selected);
  }

  function simulateDemoMatch(opponent) {
    const player = state.latestSample?.playerGesture && state.latestSample.playerGesture > 0
      ? state.latestSample.playerGesture
      : 1 + Math.floor(Math.random() * 3);
    state.rpsHistory.push({
      round: state.rpsHistory.length + 1,
      player,
      opponent,
      result: resultFor(player, opponent),
    });
    if (state.rpsHistory.length > 5) {
      state.rpsHistory = state.rpsHistory.slice(-5).map((round, index) => ({ ...round, round: index + 1 }));
    }
    renderRoundHistory();
  }

  function deriveRoundHistory(packet) {
    if (!hasRpsFingers()) {
      return [];
    }
    const rows = [];
    for (let index = 0; index < 5; index += 1) {
      const player = Number(packet.playerRounds[index] || 0);
      const opponent = Number(packet.opponentRounds[index] || 0);
      if (player || opponent) {
        rows.push({
          round: index + 1,
          player,
          opponent,
          result: resultFor(player, opponent),
        });
      }
    }
    return rows.length ? rows : state.rpsHistory;
  }

  function historyColumn(side) {
    const key = side === "player" ? "player" : "opponent";
    return Array.from({ length: 5 }, (_, index) => state.rpsHistory[index]?.[key] || 0);
  }

  function resultFor(player, opponent) {
    if (!player || !opponent || player < 0 || opponent < 0) return "--";
    if (player === opponent) return "Gelijk";
    if ((player === 1 && opponent === 3) || (player === 2 && opponent === 1) || (player === 3 && opponent === 2)) {
      return "Gewonnen";
    }
    return "Verloren";
  }

  function updateLiveUi(sample) {
    if (!sample) return;
    FINGERS.forEach((finger, index) => {
      const value = sample.fingers[index];
      const raw = sample.raw[index];
      const connected = isFingerConnected(index);
      const card = document.querySelector(`[data-finger-card="${finger.key}"]`);
      if (card) {
        card.classList.toggle("is-inactive", !connected);
        card.querySelector(".finger-value").textContent = connected && Number.isFinite(value)
          ? `${value.toFixed(0)}%`
          : "niet aangesloten";
        card.querySelector(".finger-raw").textContent = connected
          ? `ruw ${raw.toFixed(0)}`
          : "pin genegeerd";
        card.querySelector(".finger-fill").style.width = connected && Number.isFinite(value) ? `${value}%` : "0%";
      }
    });
    updateHandSkeleton(sample.fingers);
  }

  function updateRpsUi(packet) {
    els.rpsCountdown.textContent = packet.countdown ? String(packet.countdown) : "--";
    els.rpsRound.textContent = packet.round ? String(packet.round) : "--";
    els.playerGesture.textContent = hasRpsFingers() ? gestureLabel(packet.playerGesture) : "--";
    els.opponentGestureLabel.textContent = gestureLabel(packet.opponentGesture || state.lastOpponentGesture);
  }

  function renderFingerToggles() {
    els.fingerToggleGroup.innerHTML = FINGERS.map((finger, index) => `
      <label class="finger-toggle" style="--toggle-color:${finger.color}">
        <input type="checkbox" value="${finger.key}" data-finger-toggle="${finger.key}" ${isFingerConnected(index) ? "checked" : ""} />
        <span>${finger.label}</span>
        <small>${finger.pin}</small>
      </label>
    `).join("");
  }

  function renderFingerMetrics() {
    els.fingerMetrics.innerHTML = FINGERS.map((finger, index) => {
      const connected = isFingerConnected(index);
      return `
      <article class="finger-card ${connected ? "" : "is-inactive"}" data-finger-card="${finger.key}">
        <div>
          <strong>${finger.label}</strong>
          <span class="finger-value">${connected ? "--" : "niet aangesloten"}</span>
        </div>
        <div class="finger-track"><span class="finger-fill" style="background:${finger.color}"></span></div>
        <small class="finger-raw">${connected ? "ruw --" : "pin genegeerd"}</small>
      </article>
    `;
    }).join("");
  }

  function renderHandSkeleton() {
    els.skeletonLayer.innerHTML = FINGERS.map((finger) => `
      <g class="skeleton-finger skeleton-${finger.key}" data-skeleton="${finger.key}" style="--finger-color:${finger.color}">
        <polyline class="skeleton-bone" points=""></polyline>
        <g class="skeleton-joints"></g>
        <text class="skeleton-label" text-anchor="middle">${finger.label}</text>
      </g>
    `).join("");
  }

  function updateHandSkeleton(values) {
    FINGERS.forEach((finger, index) => {
      const connected = isFingerConnected(index);
      const value = connected && Number.isFinite(values[index]) ? values[index] : 0;
      const points = skeletonPointsFor(finger.key, value / 100);
      const group = document.querySelector(`[data-skeleton="${finger.key}"]`);
      if (!group) return;
      group.classList.toggle("is-inactive", !connected);
      group.querySelector(".skeleton-bone").setAttribute("points", points.map(pointString).join(" "));
      group.querySelector(".skeleton-joints").innerHTML = points.map((point, pointIndex) => `
        <circle class="skeleton-joint ${pointIndex === 0 ? "is-base" : ""}" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${pointIndex === 0 ? 5 : 4}"></circle>
      `).join("");
      const tip = points[points.length - 1];
      const label = group.querySelector(".skeleton-label");
      label.setAttribute("x", tip.x.toFixed(1));
      label.setAttribute("y", (tip.y < 34 ? tip.y + 18 : tip.y - 12).toFixed(1));
    });
  }

  function skeletonPointsFor(key, bend) {
    const specs = {
      thumb: { base: { x: 116, y: 178 }, lengths: [34, 28, 22], open: -150, curl: 95 },
      index: { base: { x: 132, y: 140 }, lengths: [46, 34, 25], open: -104, curl: 108 },
      middle: { base: { x: 152, y: 132 }, lengths: [52, 38, 28], open: -94, curl: 112 },
      ring: { base: { x: 174, y: 138 }, lengths: [47, 34, 25], open: -84, curl: 108 },
      pinky: { base: { x: 194, y: 150 }, lengths: [38, 28, 21], open: -74, curl: 102 },
    };
    const spec = specs[key];
    const safeBend = clamp(bend, 0, 1);
    const points = [{ ...spec.base }];
    let angle = spec.open;
    const jointBends = [0.25, 0.55, 0.85];
    spec.lengths.forEach((length, segmentIndex) => {
      angle += spec.curl * safeBend * jointBends[segmentIndex];
      const previous = points[points.length - 1];
      points.push({
        x: previous.x + Math.cos(degToRad(angle)) * length,
        y: previous.y + Math.sin(degToRad(angle)) * length,
      });
    });
    return points;
  }

  function renderSampleTable() {
    const rows = state.samples.slice(-8).reverse();
    if (!rows.length) {
      els.sampleBody.innerHTML = '<tr><td colspan="7">Nog geen data.</td></tr>';
      return;
    }
    els.sampleBody.innerHTML = rows.map((sample) => `
      <tr>
        <td>${(sample.elapsedMs / 1000).toFixed(1)} s</td>
        ${sample.fingers.map((value, index) => (
          isFingerConnected(index) && Number.isFinite(value)
            ? `<td>${value.toFixed(0)}</td>`
            : '<td class="muted-cell">niet aangesloten</td>'
        )).join("")}
        <td>${escapeHtml(gestureLabel(sample.playerGesture))}</td>
      </tr>
    `).join("");
  }

  function renderRoundHistory() {
    if (!hasRpsFingers()) {
      els.roundHistoryBody.innerHTML = '<tr><td colspan="4">Wijsvinger, middenvinger en ringvinger zijn nodig voor blad-steen-schaar.</td></tr>';
      return;
    }
    if (!state.rpsHistory.length) {
      els.roundHistoryBody.innerHTML = '<tr><td colspan="4">Nog geen ronde gespeeld.</td></tr>';
      return;
    }
    els.roundHistoryBody.innerHTML = state.rpsHistory.map((row) => `
      <tr>
        <td>${row.round}</td>
        <td>${escapeHtml(gestureLabel(row.player))}</td>
        <td>${escapeHtml(gestureLabel(row.opponent))}</td>
        <td>${escapeHtml(row.result)}</td>
      </tr>
    `).join("");
  }

  function updateCalibrationDisplay() {
    els.openCalibration.textContent = state.calibration.open ? formatFingerSet(state.calibration.open) : "--";
    els.closedCalibration.textContent = state.calibration.closed ? formatFingerSet(state.calibration.closed) : "--";
    els.calibrationStatus.textContent = hasFullCalibration()
      ? `Open en gesloten hand vastgelegd voor ${connectedFingerLabels()}`
      : "Nog niet volledig gekalibreerd";
  }

  function updateControls() {
    const hasData = Boolean(state.latestRaw);
    const hasSource = Boolean(state.source);
    els.btnCaptureOpen.disabled = !hasData;
    els.btnCaptureClosed.disabled = !hasData;
    els.btnReport.disabled = state.samples.length === 0;
    els.btnStartMatch.disabled = !hasSource || !hasRpsFingers();
    els.rpsFingerNotice.classList.toggle("hidden", hasRpsFingers());
  }

  function updateDiagnostics(summary, items = []) {
    els.diagnosticSummary.textContent = summary;
    els.diagnosticList.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  }

  function updateWorkflowState() {
    const setupInputs = [...els.setupChecklist.querySelectorAll('input[type="checkbox"]')];
    const completed = {
      setup: setupInputs.length > 0 && setupInputs.every((input) => input.checked),
      connect: Boolean(state.source),
      calibration: hasFullCalibration(),
      live: state.samples.length > 0,
      rps: hasRpsFingers() && state.rpsHistory.length > 0,
      report: Boolean(els.inputConclusion.value.trim()),
    };
    els.workflowLinks.forEach((link) => {
      link.classList.toggle("is-complete", Boolean(completed[link.dataset.stepLink]));
    });
  }

  function drawChart() {
    const canvas = els.fingerChart;
    const { ctx, width, height } = prepareCanvas(canvas);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    for (let y = 40; y <= height - 30; y += 50) {
      ctx.beginPath();
      ctx.moveTo(45, y);
      ctx.lineTo(width - 15, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#657286";
    ctx.font = "12px Segoe UI, Arial";
    ctx.fillText("100", 12, 35);
    ctx.fillText("50", 18, height / 2 + 4);
    ctx.fillText("0", 24, height - 30);

    const rows = state.samples.slice(-120);
    if (rows.length < 2) {
      ctx.fillStyle = "#657286";
      ctx.fillText("Wacht op data...", 56, 40);
      return;
    }
    FINGERS.forEach((finger, fingerIndex) => {
      if (!isFingerConnected(fingerIndex)) {
        return;
      }
      ctx.strokeStyle = finger.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      rows.forEach((sample, index) => {
        const x = 45 + (index / Math.max(rows.length - 1, 1)) * (width - 65);
        const value = Number.isFinite(sample.fingers[fingerIndex]) ? sample.fingers[fingerIndex] : 0;
        const y = (height - 30) - (value / 100) * (height - 60);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
  }

  function prepareCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(260, rect.width);
    const height = Math.max(220, rect.height);
    const targetWidth = Math.round(width * dpr);
    const targetHeight = Math.round(height * dpr);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width, height };
  }

  function openReportModal() {
    if (!state.samples.length) {
      alert("Er is nog geen data voor een rapport. Start eerst de demo of verbind de Arduino.");
      return;
    }
    els.reportModal.classList.remove("hidden");
    els.reportNames.focus();
  }

  function closeReportModal() {
    els.reportModal.classList.add("hidden");
  }

  function generatePdf() {
    if (!window.jspdf?.jsPDF) {
      alert("PDF-bibliotheek kon niet geladen worden.");
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let y = 18;
    const margin = 14;
    doc.setFontSize(18);
    doc.text("Rapport Project Robothand J1", margin, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(`Datum: ${new Date().toLocaleDateString("nl-BE")}`, margin, y);
    y += 7;
    doc.text(`Naam/namen: ${els.reportNames.value.trim() || "-"}`, margin, y);
    y += 7;
    doc.text(`Klas: ${els.reportClass.value.trim() || "-"}`, margin, y);
    y += 7;
    doc.text(`Aantal meetpunten: ${state.samples.length}`, margin, y);
    y += 7;
    doc.text(`Kalibratie: ${hasFullCalibration() ? "open en gesloten hand vastgelegd" : "niet volledig"}`, margin, y);
    y += 10;
    doc.text(`Aangesloten vingers: ${connectedFingerLabels()}`, margin, y);
    y += 10;

    y = addPdfBlock(doc, y, "Laatste vingerwaarden", FINGERS.filter((_, index) => isFingerConnected(index)).map((finger) => {
      const index = FINGERS.findIndex((item) => item.key === finger.key);
      const value = state.latestSample?.fingers[index] ?? 0;
      return `${finger.label}: ${value.toFixed(0)}%`;
    }).join("\n") || "Geen aangesloten vingers geselecteerd.");
    y = addPdfBlock(doc, y, "Blad-steen-schaar", state.rpsHistory.length
      ? state.rpsHistory.map((row) => `Ronde ${row.round}: ${gestureLabel(row.player)} tegen ${gestureLabel(row.opponent)} - ${row.result}`).join("\n")
      : "Nog geen ronde gespeeld.");
    y = addPdfBlock(doc, y, "Besluit", els.inputConclusion.value || "-");
    y = addPdfBlock(doc, y, "Reflectie", els.inputReflection.value || "-");

    try {
      const image = els.fingerChart.toDataURL("image/png", 1);
      if (y > 170) {
        doc.addPage();
        y = 18;
      }
      doc.setFontSize(12);
      doc.text("Live grafiek", margin, y);
      y += 4;
      doc.addImage(image, "PNG", margin, y, 180, 64);
    } catch (error) {
      console.warn("Kon grafiek niet toevoegen aan PDF:", error);
    }
    doc.save(`Rapport_Robothand_J1_${dateStamp()}.pdf`);
  }

  function addPdfBlock(doc, y, title, text) {
    if (y > 250) {
      doc.addPage();
      y = 18;
    }
    doc.setFontSize(12);
    doc.text(title, 14, y);
    y += 5;
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(text, 180);
    doc.text(lines, 14, y);
    return y + lines.length * 5 + 5;
  }

  function hasFullCalibration() {
    const activeIndexes = connectedFingerIndexes();
    return Boolean(
      activeIndexes.length
      && state.calibration.open
      && state.calibration.closed
      && activeIndexes.every((index) => (
        Number.isFinite(state.calibration.open[index])
        && Number.isFinite(state.calibration.closed[index])
      ))
    );
  }

  function formatFingerSet(values) {
    return connectedFingerIndexes()
      .map((index) => `${FINGERS[index].label} ${Number.isFinite(values[index]) ? values[index].toFixed(0) : "--"}`)
      .join(" / ") || "--";
  }

  function handleFingerToggleChange(event) {
    if (!event.target.matches("[data-finger-toggle]")) {
      return;
    }
    const selected = [...els.fingerToggleGroup.querySelectorAll("[data-finger-toggle]")]
      .filter((input) => input.checked)
      .map((input) => input.value);
    if (!selected.length) {
      event.target.checked = true;
      return;
    }
    setConnectedFingers(selected);
  }

  function setConnectedFingers(keys) {
    const selected = new Set(keys);
    state.connectedFingers = FINGERS.map((finger) => selected.has(finger.key));
    renderFingerToggles();
    refreshSamplesForFingerSelection();
    renderFingerMetrics();
    updateCalibrationDisplay();
    if (state.latestSample) {
      updateLiveUi(state.latestSample);
      updateRpsUi(state.latestRaw);
    } else {
      updateHandSkeleton([0, 0, 0, 0, 0]);
    }
    renderSampleTable();
    renderRoundHistory();
    drawChart();
    updateControls();
    updateWorkflowState();
  }

  function refreshSamplesForFingerSelection() {
    state.samples = state.samples.map((sample) => ({
      ...sample,
      fingers: applyCalibration(sample.raw),
      playerGesture: hasRpsFingers() ? sample.playerGesture : 0,
    }));
    if (state.latestSample) {
      state.latestSample = {
        ...state.latestSample,
        fingers: applyCalibration(state.latestSample.raw),
        playerGesture: hasRpsFingers() ? state.latestSample.playerGesture : 0,
      };
    }
  }

  function isFingerConnected(index) {
    return Boolean(state.connectedFingers[index]);
  }

  function connectedFingerIndexes() {
    return FINGERS.map((_, index) => index).filter((index) => isFingerConnected(index));
  }

  function connectedFingerLabels() {
    return connectedFingerIndexes().map((index) => `${FINGERS[index].label} (${FINGERS[index].pin})`).join(", ");
  }

  function hasRpsFingers() {
    return ["index", "middle", "ring"].every((key) => {
      const index = FINGERS.findIndex((finger) => finger.key === key);
      return isFingerConnected(index);
    });
  }

  function packetToLine(packet) {
    return [
      packet.workbookMode,
      packet.matchTrigger,
      packet.matchComplete,
      packet.countdown,
      ...packet.fingers,
      packet.round,
      packet.playerGesture,
      packet.opponentGesture,
      ...packet.playerRounds,
      ...packet.opponentRounds,
    ].map((value) => Math.round(value)).join(",");
  }

  function pointString(point) {
    return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }

  function degToRad(degrees) {
    return (degrees * Math.PI) / 180;
  }

  function gestureLabel(value) {
    return GESTURES[String(Number(value))] || "--";
  }

  function dateStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
