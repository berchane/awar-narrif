
/*
 * Awar n'Arrif — Administration Supabase
 *
 * Une contribution = une session complète de 10 WAV.
 *
 * Fonctionnalités :
 * - Authentification administrateur
 * - Statistiques par paquet
 * - Contributions regroupées par session
 * - Exploration des 10 WAV
 * - Lecture et téléchargement WAV
 * - Analyse automatique de qualité acoustique
 *
 * Les WAV originaux ne sont jamais modifiés.
 */

(() => {
  "use strict";

  // ==========================================================
  // 1. CONFIGURATION
  // ==========================================================

  const BASE =
    "https://dpxrkzvhpeflaeiqfmyt.supabase.co/functions/v1/admin-api";

  const TOKEN_KEY = "awar_admin_token";

  const $ = id => document.getElementById(id);

  const S = {
    contribs: [],
    allSessions: [],
    packets: [],
    all: false,
    packet: null,
    cid: null,
    audio: null,
    btn: null,
    audioUrl: null,
    gen: 0,
    playGen: 0
  };

  const qualityCache = new Map();

  const PLAY =
    '<svg viewBox="0 0 24 24" style="fill:currentColor;stroke:none"><path d="M6 4l14 8-14 8z"/></svg>';

  const PAUSE =
    '<svg viewBox="0 0 24 24" style="fill:currentColor;stroke:none"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';

  const DL =
    '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg>';

  const pad = n =>
    String(n).padStart(2, "0");

  const idLabel = c =>
    "#" + String(c.n || 0).padStart(5, "0");

  const participantLabel = c =>
    c.participant_id
      ? "Participant " + c.participant_id.slice(0, 8)
      : "Participant inconnu";

  const plural = (n, a, b) =>
    n > 1 ? b : a;

  const fdur = t => {
    t = Number(t) || 0;

    return (
      `${Math.floor(t / 60)}:` +
      `${(t % 60).toFixed(1).padStart(4, "0")}`
    );
  };

  const fcur = t =>
    `${Math.floor(t / 60)}:${pad(Math.floor(t % 60))}`;

  function fdate(raw) {
    if (!raw) return "—";

    const d = new Date(raw);

    return Number.isNaN(d.getTime())
      ? raw
      : d.toLocaleString("fr-FR", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        });
  }

  function el(tag, cls, text, html) {
    const e = document.createElement(tag);

    if (cls) e.className = cls;

    if (text !== undefined) {
      e.textContent = text;
    }

    if (html) {
      e.innerHTML = html;
    }

    return e;
  }

  function msg(text, type) {
    const m = $("ad-msg");

    if (!m) return;

    m.textContent = text || "";

    m.className =
      "ad-msg" +
      (text ? " on" : "") +
      (type ? " " + type : "");
  }

  // ==========================================================
  // 2. API SUPABASE
  // ==========================================================

  async function api(path, opts = {}) {
    const token =
      sessionStorage.getItem(TOKEN_KEY);

    const headers =
      new Headers(opts.headers || {});

    if (token) {
      headers.set(
        "Authorization",
        `Bearer ${token}`
      );
    }

    const response = await fetch(
      `${BASE}/${path}`,
      {
        ...opts,
        headers,
        cache: "no-store"
      }
    );

    const type =
      response.headers.get("Content-Type") || "";

    if (!response.ok) {
      let detail = {};

      if (type.includes("json")) {
        try {
          detail = await response.json();
        } catch {}
      }

      const error = new Error(
        detail.error ||
        `Erreur HTTP ${response.status}`
      );

      error.status = response.status;

      throw error;
    }

    return type.includes("json")
      ? response.json()
      : response.blob();
  }

  function guard(error) {
    if (
      error.status === 401 ||
      error.status === 403
    ) {
      sessionStorage.removeItem(TOKEN_KEY);

      showLogin(
        "Session expirée. Reconnectez-vous."
      );
    } else {
      msg(
        error.message || "Erreur inconnue",
        "err"
      );
    }
  }

  // ==========================================================
  // 3. AUTHENTIFICATION
  // ==========================================================

  function stopAudio() {
    ++S.playGen;

    if (S.audio) {
      S.audio.pause();
      S.audio.src = "";
      S.audio = null;
    }

    if (S.audioUrl) {
      URL.revokeObjectURL(S.audioUrl);
      S.audioUrl = null;
    }

    if (S.btn) {
      S.btn.innerHTML = PLAY;
      S.btn = null;
    }
  }

  function showLogin(message) {
    stopAudio();

    $("ad-dash").hidden = true;
    $("ad-login").hidden = false;

    msg(
      message || "",
      message ? "err" : ""
    );
  }

  function showDash() {
    $("ad-login").hidden = true;
    $("ad-dash").hidden = false;
  }

  async function init() {
    msg("Vérification de la session…");

    try {
      const result = await api("session");

      if (result.authenticated) {
        await load();
      } else {
        sessionStorage.removeItem(TOKEN_KEY);
        showLogin();
      }
    } catch (error) {
      showLogin(error.message);
    }
  }

  // ==========================================================
  // 4. STATISTIQUES
  // ==========================================================

  function renderKpis(stats) {
    const packets = S.packets;

    const counts = packets.map(
      p => Number(p.contributions) || 0
    );

    const low = counts.length
      ? Math.min(...counts)
      : 0;

    const lows = packets.filter(
      p => p.contributions === low
    );

    $("ad-k1").textContent =
      packets.length;

    $("ad-k2").textContent =
      stats.total_contributions ?? 0;

    $("ad-k3").textContent =
      stats.total_recordings ?? 0;

    $("ad-k4").textContent =
      lows.length ? lows[0].id : "—";

    $("ad-k4s").textContent =
      lows.length
        ? `(${low} ${plural(
            low,
            "contribution",
            "contributions"
          )})` +
          (lows.length > 1
            ? ` · ${lows.length} ex æquo`
            : "")
        : "Aucun paquet";
  }

  // ==========================================================
  // 5. GRAPHIQUE PAR PAQUET
  // ==========================================================

  function renderChart() {
    const P = S.packets;

    if (!P.length) {
      $("ad-chart").replaceChildren();
      return;
    }

    const vals =
      P.map(p => p.contributions);

    const max =
      Math.max(5, ...vals);

    const step =
      max > 10 ? Math.ceil(max / 5) : 1;

    const top =
      Math.ceil(max / step) * step;

    const low =
      Math.min(...vals);

    const W = 560;
    const H = 250;
    const L = 58;
    const R = 12;
    const T = 26;
    const B = 52;

    const pw = W - L - R;
    const ph = H - T - B;

    const slot = pw / P.length;

    const bw =
      Math.min(slot * 0.72, 70);

    const y = v =>
      T + ph - (v / top) * ph;

    let g = "";

    for (
      let v = 0;
      v <= top;
      v += step
    ) {
      g += `
        <line
          x1="${L}"
          x2="${W - R}"
          y1="${y(v)}"
          y2="${y(v)}"
          stroke="#e4d3bc"
        />
        <text
          x="${L - 12}"
          y="${y(v) + 5}"
          text-anchor="end"
          font-size="15"
        >${v}</text>
      `;
    }

    P.forEach((p, i) => {
      const x =
        L + i * slot +
        (slot - bw) / 2;

      const hot =
        p.contributions === low;

      g += `
        <rect
          x="${x}"
          y="${y(p.contributions)}"
          width="${bw}"
          height="${
            T + ph - y(p.contributions)
          }"
          fill="${
            hot
              ? "#ee9a4d"
              : "var(--teal)"
          }"
        >
          <title>
            Paquet ${p.id} :
            ${p.contributions}
            contributions complètes
          </title>
        </rect>

        <text
          x="${x + bw / 2}"
          y="${
            y(p.contributions) - 8
          }"
          text-anchor="middle"
          font-size="17"
          font-weight="700"
        >${p.contributions}</text>

        <text
          x="${x + bw / 2}"
          y="${T + ph + 22}"
          text-anchor="middle"
          font-size="15"
        >P${p.id}</text>
      `;
    });

    g += `
      <line
        x1="${L}"
        x2="${L}"
        y1="${T}"
        y2="${T + ph}"
        stroke="#444"
      />

      <line
        x1="${L}"
        x2="${W - R}"
        y1="${T + ph}"
        y2="${T + ph}"
        stroke="#444"
      />

      <text
        transform="translate(
          16 ${T + ph / 2}
        ) rotate(-90)"
        text-anchor="middle"
        font-size="15"
      >
        Contributions complètes
      </text>

      <text
        x="${L + pw / 2}"
        y="${H - 6}"
        text-anchor="middle"
        font-size="15"
      >
        Paquets
      </text>
    `;

    $("ad-chart").innerHTML = `
      <svg
        viewBox="0 0 ${W} ${H}"
        role="img"
        aria-label="Contributions complètes par paquet"
      >
        ${g}
      </svg>
    `;
  }

  // ==========================================================
  // 6. CONTRIBUTIONS RÉCENTES
  // ==========================================================

  function renderRecent() {
    const rows = S.all
      ? S.contribs
      : S.contribs.slice(0, 3);

    const body = $("ad-recent");

    body.replaceChildren();

    for (const c of rows) {
      const tr = el("tr");

      [
        idLabel(c) +
          " · " +
          participantLabel(c),

        "P" + c.packet,

        fdate(c.created_at),

        String(c.audio_count || 1)

      ].forEach(value => {
        tr.append(
          el("td", "", value)
        );
      });

      const td = el("td", "r");

      const button = el(
        "button",
        "ad-vbtn",
        "",
        PLAY + "Voir"
      );

      button.type = "button";

      button.onclick = () => {
        pick(c.packet, c.id);

        $("ad-explorer").scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      };

      td.append(button);
      tr.append(td);
      body.append(tr);
    }

    if (!rows.length) {
      const tr = el("tr");

      const td = el(
        "td",
        "",
        "Aucune contribution complète enregistrée."
      );

      td.colSpan = 5;

      tr.append(td);
      body.append(tr);
    }

    $("ad-all").firstChild.textContent =
      S.all
        ? "Voir moins "
        : "Voir tout ";

    $("ad-recent-wrap")
      .classList.toggle(
        "long",
        S.all
      );
  }

  // ==========================================================
  // 7. SÉLECTION PAQUETS / CONTRIBUTIONS
  // ==========================================================

  function fillSelects() {
    const ps = $("ad-packet");

    ps.replaceChildren();

    S.packets.forEach(p => {
      const option = el(
        "option",
        "",
        `Paquet ${p.id} (${p.contributions} contributions)`
      );

      option.value = p.id;

      if (p.id === S.packet) {
        option.selected = true;
      }

      ps.append(option);
    });

    const cs = $("ad-contrib");

    cs.replaceChildren();

    const list = S.contribs.filter(
      c => c.packet === S.packet
    );

    if (!list.length) {
      const option = el(
        "option",
        "",
        "Aucune contribution complète"
      );

      option.value = "";

      cs.append(option);
    }

    list.forEach(c => {
      const option = el(
        "option",
        "",
        `${idLabel(c)} · ${participantLabel(c)} · ${fdate(c.created_at)}`
      );

      option.value = c.id;

      if (c.id === S.cid) {
        option.selected = true;
      }

      cs.append(option);
    });

    // Exports à intégrer ultérieurement
   /* [
      "ad-zip-packet",
      "ad-zip-one",
      "ad-csv"
    ].forEach(id => {
      const button = $(id);

      if (button) {
        button.disabled = true;

        button.title =
          "Export à intégrer prochainement";
      }
    });*/
	 updateExportButtons();
  }

  // ==========================================================
  // 8. ANALYSE ACOUSTIQUE DES WAV
  // ==========================================================

  /*
   * Analyse :
   *
   * - Format RIFF/WAVE
   * - PCM 16 bits
   * - Mono
   * - 16000 Hz
   * - Durée
   * - Volume RMS
   * - Crête
   * - Pourcentage de silence
   * - Pourcentage de saturation
   *
   * Seuils indicatifs, non validés
   * scientifiquement pour le corpus Tarifit.
   */

  function analyzeWav(buffer) {
    const v = new DataView(buffer);

    const invalid = (label, detail) => ({
      label,
      detail,
      level: "bad"
    });

    const four = at =>
      String.fromCharCode(
        ...new Uint8Array(
          buffer,
          at,
          4
        )
      );

    if (
      v.byteLength < 44 ||
      four(0) !== "RIFF" ||
      four(8) !== "WAVE"
    ) {
      return invalid(
        "WAV invalide",
        "En-tête RIFF/WAVE absent"
      );
    }

    let fmt = null;
    let dataOffset = -1;
    let dataSize = 0;

    for (
      let pos = 12;
      pos + 8 <= v.byteLength;
    ) {
      const name = four(pos);

      const len =
        v.getUint32(pos + 4, true);

      const start = pos + 8;

      if (
        start + len > v.byteLength
      ) {
        return invalid(
          "WAV incomplet",
          "Chunk tronqué"
        );
      }

      if (
        name === "fmt " &&
        len >= 16
      ) {
        fmt = {
          encoding:
            v.getUint16(start, true),

          channels:
            v.getUint16(start + 2, true),

          rate:
            v.getUint32(start + 4, true),

          bits:
            v.getUint16(start + 14, true)
        };
      }

      if (name === "data") {
        dataOffset = start;
        dataSize = len;
      }

      pos =
        start + len + (len % 2);
    }

    if (
      !fmt ||
      dataOffset < 0 ||
      dataSize < 2
    ) {
      return invalid(
        "WAV incomplet",
        "Chunks fmt/data absents"
      );
    }

    if (
      fmt.encoding !== 1 ||
      fmt.channels !== 1 ||
      fmt.rate !== 16000 ||
      fmt.bits !== 16
    ) {
      return invalid(
        "Format à vérifier",
        `${fmt.rate} Hz · ` +
        `${fmt.channels} canal(aux) · ` +
        `${fmt.bits} bits · ` +
        `codec ${fmt.encoding}`
      );
    }

    if (dataSize % 2 !== 0) {
      return invalid(
        "WAV incomplet",
        "Taille PCM incorrecte"
      );
    }

    const count = dataSize / 2;

    const seconds =
      count / fmt.rate;

    let squares = 0;
    let clipped = 0;
    let peak = 0;
    let quiet = 0;

    const frame = 320;

    for (
      let i = 0;
      i < count;
      i += frame
    ) {
      const end =
        Math.min(count, i + frame);

      let frameSquares = 0;

      for (
        let j = i;
        j < end;
        j++
      ) {
        const x =
          v.getInt16(
            dataOffset + 2 * j,
            true
          ) / 32768;

        frameSquares += x * x;

        peak = Math.max(
          peak,
          Math.abs(x)
        );

        if (
          Math.abs(x) >= 0.999
        ) {
          clipped++;
        }
      }

      squares += frameSquares;

      const frameRms =
        Math.sqrt(
          frameSquares /
          (end - i)
        );

      if (frameRms < 0.00316) {
        quiet += end - i;
      }
    }

    const rms =
      Math.sqrt(
        squares / count
      );

    const db =
      20 * Math.log10(
        Math.max(rms, 1e-10)
      );

    const peakDb =
      20 * Math.log10(
        Math.max(peak, 1e-10)
      );

    const clipPct =
      100 * clipped / count;

    const quietPct =
      100 * quiet / count;

    const detail =
      `${seconds.toFixed(2)} s · ` +
      `RMS ${db.toFixed(1)} dBFS · ` +
      `Crête ${peakDb.toFixed(1)} dBFS · ` +
      `Silence ${quietPct.toFixed(0)} % · ` +
      `Saturation ${clipPct.toFixed(2)} %`;

    let label =
      "Qualité technique OK";

    let level = "good";

    if (
      seconds > 5 ||
      seconds <= 0
    ) {
      label =
        "Durée à vérifier";

      level = "bad";

    } else if (
      db < -45 ||
      quietPct > 95
    ) {
      label =
        "Silence / volume très faible";

      level = "bad";

    } else if (
      clipPct >= 0.5
    ) {
      label =
        "Saturation détectée";

      level = "bad";

    } else if (
      db < -30 ||
      quietPct > 70 ||
      clipPct > 0
    ) {
      label =
        "À écouter";

      level = "warn";
    }

    return {
      label,
      level,
      detail,
      metrics: {
        duration_seconds: seconds,
        rms_dbfs: db,
        peak_dbfs: peakDb,
        silence_percent: quietPct,
        clipping_percent: clipPct
      }
    };
  }

  // ==========================================================
  // 9. ANALYSE ASYNCHRONE DES 10 WAV
  // ==========================================================

  async function analyzeQualityRows(
    audios,
    gen,
    cells
  ) {
    for (const a of audios) {
      if (gen !== S.gen) {
        return;
      }

      const cell =
        cells.get(a.id);

      if (!cell) continue;

      try {
        let result =
          qualityCache.get(a.id);

        if (!result) {
          const blob =
            await getAudioBlob(a.id);

          const buffer =
            await blob.arrayBuffer();

          result =
            analyzeWav(buffer);

          qualityCache.set(
            a.id,
            result
          );
        }

        if (gen !== S.gen) {
          return;
        }

        cell.textContent =
          result.label;

        cell.title =
          result.detail;

        cell.style.fontWeight =
          "600";

        cell.style.color =
          result.level === "bad"
            ? "#b42318"
            : result.level === "warn"
              ? "#9a5b00"
              : "#177245";

      } catch (error) {
        if (gen !== S.gen) {
          return;
        }

        cell.textContent =
          "Analyse indisponible";

        cell.title =
          error.message ||
          "Erreur de lecture";

        if (
          error.status === 401 ||
          error.status === 403
        ) {
          guard(error);
          return;
        }
      }
    }
  }

  // ==========================================================
  // 10. EXPLORATEUR DES 10 WAV
  // ==========================================================

  function renderExplorer() {
    stopAudio();

    const gen = ++S.gen;

    const box = $("ad-ex");
    const info = $("ad-info");

    box.replaceChildren();

    if (!S.cid) {
      info.textContent =
        "Aucune contribution complète pour ce paquet.";

      return;
    }

    const c = S.contribs.find(
      item => item.id === S.cid
    );

    if (!c) {
      info.textContent =
        "Contribution introuvable.";

      return;
    }

    info.textContent =
      `Contribution ${idLabel(c)} · ` +
      `${participantLabel(c)} · ` +
      `Paquet ${c.packet} · ` +
      `${c.audio_count} WAV · ` +
      `${fdate(c.created_at)}`;

    const wrap =
      el("div", "ad-tw");

    const table =
      el("table", "ad-t ex");

    const head =
      el("thead");

    head.innerHTML = `
      <tr>
        <th>#</th>
        <th>Phrase (transcription)</th>
        <th>Écoute</th>
        <th>Durée</th>
        <th>Qualité</th>
      </tr>
    `;

    table.append(head);

    const tbody =
      el("tbody");

    const qualityCells =
      new Map();

    for (const a of c.audios) {
      const tr = el("tr");

      tr.append(
        el(
          "td",
          "",
          pad(a.position)
        )
      );

      const tx = el(
        "td",
        "",
        a.transcription || "—"
      );

      tx.lang = "rif";

      tr.append(tx);

      const audioCell =
        el("td");

      const player =
        el("div", "ad-ap");

      player.dataset.id =
        a.id;

      player.dataset.n =
        a.position;

      const play = el(
        "button",
        "pl",
        "",
        PLAY
      );

      play.type = "button";

      play.setAttribute(
        "aria-label",
        "Écouter la phrase " +
        a.position
      );

      const time = el(
        "span",
        "tt",
        `0:00 / ${fdur(a.duration)}`
      );

      const bar = el(
        "div",
        "pg",
        "",
        "<i></i>"
      );

      const dl = el(
        "button",
        "dl",
        "",
        DL
      );

      dl.type = "button";

      dl.title =
        "Télécharger ce WAV";

      player.append(
        play,
        time,
        bar,
        dl
      );

      audioCell.append(player);

      tr.append(audioCell);

      tr.append(
        el(
          "td",
          "",
          fdur(a.duration)
        )
      );

      const quality = el(
        "td",
        "",
        "Analyse en cours…"
      );

      qualityCells.set(
        a.id,
        quality
      );

      tr.append(quality);

      tbody.append(tr);
    }

    table.append(tbody);

    wrap.append(table);

    if (gen === S.gen) {
      box.append(wrap);

      void analyzeQualityRows(
        c.audios,
        gen,
        qualityCells
      );
    }
  }

  function pick(packet, cid) {
    S.packet =
      Number(packet);

    S.cid =
      cid || null;

    fillSelects();

    renderExplorer();
  }

  // ==========================================================
  // 11. LECTURE ET TÉLÉCHARGEMENT WAV
  // ==========================================================

  async function getAudioBlob(id) {
    return api(
      "audio?id=" +
      encodeURIComponent(id)
    );
  }

  async function downloadAudio(
    id,
    name
  ) {
    msg("Téléchargement du WAV…");

    try {
      const blob =
        await getAudioBlob(id);

      const url =
        URL.createObjectURL(blob);

      const a =
        document.createElement("a");

      a.href = url;
      a.download = name;

      document.body.append(a);

      a.click();

      a.remove();

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 20000);

      msg("");

    } catch (error) {
      guard(error);
    }
  }

  async function playAudio(
    button,
    player,
    id
  ) {
    const same =
      S.btn === button;

    stopAudio();

    if (same) return;

    const playGen = S.playGen;
    const selectedCid = S.cid;

    msg("Chargement audio…");

    try {
      const blob =
        await getAudioBlob(id);

      if (
        playGen !== S.playGen ||
        !player.isConnected ||
        S.cid !== selectedCid ||
        !S.contribs.some(
          c =>
            c.id === S.cid &&
            c.audios.some(
              a => a.id === id
            )
        )
      ) {
        return;
      }

      const url =
        URL.createObjectURL(blob);

      const audio =
        new Audio(url);

      const time =
        player.querySelector(".tt");

      const bar =
        player.querySelector(".pg i");

      const c =
        S.contribs.find(
          x => x.id === S.cid
        );

      const wav =
        c?.audios.find(
          a => a.id === id
        );

      const total =
        fdur(wav?.duration || 0);

      S.audioUrl = url;
      S.audio = audio;
      S.btn = button;

      button.innerHTML = PAUSE;

      audio.ontimeupdate = () => {
        time.textContent =
          `${fcur(audio.currentTime)} / ${total}`;

        bar.style.width =
          audio.duration
            ? `${
                audio.currentTime /
                audio.duration * 100
              }%`
            : "0%";
      };

      audio.onended = () => {
        stopAudio();

        time.textContent =
          `0:00 / ${total}`;

        bar.style.width = "0";
      };

      audio.onerror = () => {
        stopAudio();

        msg(
          "Impossible de lire le WAV.",
          "err"
        );
      };

      await audio.play();

      msg("");

    } catch (error) {
      if (playGen !== S.playGen) {
        return;
      }

      stopAudio();
      guard(error);
    }
  }

  // ==========================================================
  // 12. CHARGEMENT DU TABLEAU DE BORD
  // ==========================================================

  async function load() {
    msg(
      "Chargement des données Supabase…"
    );

    try {
      const [stats, list] =
        await Promise.all([
          api("session-stats"),
          api("packet-sessions")
        ]);

      S.packets =
        (stats.packets || [])
          .map(p => ({
            id: Number(p.id),
            contributions:
              Number(p.contributions) || 0
          }));

      S.allSessions =
        list.sessions || [];

      S.contribs =
        S.allSessions
          .filter(
            c =>
              c.complete &&
              c.packet != null
          )
          .map((c, i) => ({
            ...c,

            n: i + 1,

            packet:
              Number(c.packet),

            audios:
              (c.audios || [])
                .map(a => ({
                  ...a,

                  position:
                    Number(a.position),

                  duration:
                    Number(
                      a.duration ??
                      a.duration_ms / 1000
                    ) || 0
                }))
          }));

      showDash();
      msg("");

      renderKpis(stats);
      renderChart();
      renderRecent();

      const keep =
        S.contribs.find(
          c => c.id === S.cid
        ) ||
        S.contribs[0];

      if (keep) {
        pick(
          keep.packet,
          keep.id
        );
      } else {
        S.packet =
          S.packets[0]?.id ?? null;

        S.cid = null;

        fillSelects();
        renderExplorer();
      }

      if (
        list.truncated ||
        stats.truncated
      ) {
        msg(
          "Attention : les statistiques sont limitées aux 5 000 WAV les plus récents."
        );
      }

    } catch (error) {
      guard(error);
    }
  }



//----


  // ==========================================================
  // EXPORTS ZIP / CSV — AWAR N'ARRIF
  // ==========================================================

  const EXPORT_MAX_BYTES = 250 * 1024 * 1024;
  let exportBusy = false;

  const csvCell = value =>
    '"' + String(value ?? "")
      .replace(/"/g, '""')
      .replace(/\r?\n/g, " ") + '"';

  const csvLine = values =>
    values.map(csvCell).join(";") + "\r\n";

  const csvHeaders = [
    "contribution",
    "participant_id",
    "packet_session_id",
    "paquet",
    "position",
    "fichier",
    "transcription",
    "duree_secondes",
    "date_enregistrement"
  ];

  const audioFilename = a =>
    String(Number(a.position) - 1)
      .padStart(6, "0") + ".wav";

  function contributionFolder(c) {
    return (
      "paquet-" + pad(c.packet) +
      "/contribution-" +
      String(c.n || 0).padStart(5, "0") +
      "-" +
      String(c.id || "session")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 48)
    );
  }

  function csvRow(c, a, filename) {
    return [
      idLabel(c),
      c.participant_id || "",
      c.packet_session_id || c.id || "",
      c.packet,
      a.position,
      filename,
      a.transcription || "",
      a.duration ?? "",
      c.created_at || ""
    ];
  }

  function makeCsv(rows) {
    const content =
      csvLine(csvHeaders) +
      rows.map(r => csvLine(r)).join("");

    return "\uFEFF" + content;
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.append(link);
    link.click();
    link.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 30000);
  }

  // ----------------------------------------------------------
  // ZIP natif : méthode STORE (sans compression)
  // Compatible avec Windows, 7-Zip et unzip.
  // ----------------------------------------------------------

  const zipEncoder = new TextEncoder();

  const crcTable = (() => {
    const table = new Uint32Array(256);

    for (let n = 0; n < 256; n++) {
      let c = n;

      for (let k = 0; k < 8; k++) {
        c = c & 1
          ? 0xEDB88320 ^ (c >>> 1)
          : c >>> 1;
      }

      table[n] = c >>> 0;
    }

    return table;
  })();

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;

    for (const byte of bytes) {
      crc = crcTable[(crc ^ byte) & 255] ^
        (crc >>> 8);
    }

    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function zipDateTime(date = new Date()) {
    const year = Math.max(
      1980,
      Math.min(2107, date.getFullYear())
    );

    const time =
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      (Math.floor(date.getSeconds() / 2));

    const day =
      ((year - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate();

    return { time, day };
  }

  function buildZip(files) {
    const parts = [];
    const central = [];
    let offset = 0;

    const { time, day } = zipDateTime();

    for (const file of files) {
      const name = zipEncoder.encode(file.name);
      const data = file.data;
      const size = data.byteLength;
      const crc = crc32(data);

      if (
        size > 0xFFFFFFFF ||
        offset > 0xFFFFFFFF
      ) {
        throw new Error("ZIP trop volumineux.");
      }

      // En-tête local ZIP
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);

      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, time, true);
      lv.setUint16(12, day, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);

      local.set(name, 30);

      parts.push(local, data);

      // Entrée du répertoire central
      const entry = new Uint8Array(46 + name.length);
      const ev = new DataView(entry.buffer);

      ev.setUint32(0, 0x02014b50, true);
      ev.setUint16(4, 20, true);
      ev.setUint16(6, 20, true);
      ev.setUint16(8, 0x0800, true);
      ev.setUint16(10, 0, true);
      ev.setUint16(12, time, true);
      ev.setUint16(14, day, true);
      ev.setUint32(16, crc, true);
      ev.setUint32(20, size, true);
      ev.setUint32(24, size, true);
      ev.setUint16(28, name.length, true);
      ev.setUint16(30, 0, true);
      ev.setUint16(32, 0, true);
      ev.setUint16(34, 0, true);
      ev.setUint16(36, 0, true);
      ev.setUint32(38, 0, true);
      ev.setUint32(42, offset, true);

      entry.set(name, 46);
      central.push(entry);

      offset += local.length + size;
    }

    if (files.length > 65535) {
      throw new Error(
        "Trop de fichiers pour un ZIP classique."
      );
    }

    const centralSize = central.reduce(
      (sum, entry) => sum + entry.length,
      0
    );

    if (
      offset + centralSize > 0xFFFFFFFF
    ) {
      throw new Error(
        "ZIP trop volumineux."
      );
    }

    const end = new Uint8Array(22);
    const v = new DataView(end.buffer);

    v.setUint32(0, 0x06054b50, true);
    v.setUint16(4, 0, true);
    v.setUint16(6, 0, true);
    v.setUint16(8, files.length, true);
    v.setUint16(10, files.length, true);
    v.setUint32(12, centralSize, true);
    v.setUint32(16, offset, true);
    v.setUint16(20, 0, true);

    return new Blob(
      [...parts, ...central, end],
      { type: "application/zip" }
    );
  }

  // ----------------------------------------------------------
  // Récupération des WAV et création des ZIP
  // ----------------------------------------------------------

  async function createExportZip(contributions, filename) {
    if (!contributions.length) {
      throw new Error(
        "Aucune contribution complète à exporter."
      );
    }

    const files = [];
    const metadataRows = [];
    let totalBytes = 0;
    let completed = 0;

    const totalAudios = contributions.reduce(
      (sum, c) => sum + (c.audios || []).length,
      0
    );

    for (const c of contributions) {
      const folder = contributionFolder(c);

      for (const a of c.audios || []) {
        msg(
          `Préparation ZIP : ${completed + 1}/${totalAudios} WAV…`
        );

        const blob = await getAudioBlob(a.id);
        const bytes = new Uint8Array(
          await blob.arrayBuffer()
        );

        totalBytes += bytes.byteLength;

        if (totalBytes > EXPORT_MAX_BYTES) {
          throw new Error(
            "Export supérieur à 250 Mo. " +
            "Sélectionnez moins de contributions."
          );
        }

        const wavName = audioFilename(a);
        const path = folder + "/" + wavName;

        files.push({
          name: path,
          data: bytes
        });

        metadataRows.push(
          csvRow(c, a, path)
        );

        completed++;
      }
    }

    const csv = zipEncoder.encode(
      makeCsv(metadataRows)
    );

    files.push({
      name: "metadata.csv",
      data: csv
    });

    msg("Création de l'archive ZIP…");

    const zip = buildZip(files);

    saveBlob(zip, filename);

    msg(
      `Export terminé : ${completed} WAV.`
    );
  }

  // ----------------------------------------------------------
  // Export CSV global
  // ----------------------------------------------------------

  function exportGlobalCsv() {
    const rows = [];

    for (const c of S.contribs) {
      for (const a of c.audios || []) {
        const path =
          contributionFolder(c) +
          "/" +
          audioFilename(a);

        rows.push(
          csvRow(c, a, path)
        );
      }
    }

    if (!rows.length) {
      throw new Error(
        "Aucune contribution complète à exporter."
      );
    }

    const csv = makeCsv(rows);

    saveBlob(
      new Blob([csv], {
        type: "text/csv;charset=utf-8"
      }),
      "awar-narrif-metadata.csv"
    );

    msg(
      `Export CSV terminé : ${rows.length} lignes.`
    );
  }

  // ----------------------------------------------------------
  // Gestion commune des boutons
  // ----------------------------------------------------------

  function updateExportButtons() {
    const hasContribution =
      !!S.contribs.find(c => c.id === S.cid);

    const hasPacket =
      S.contribs.some(c => c.packet === S.packet);

    const buttons = [
      ["ad-zip-one", hasContribution],
      ["ad-zip-packet", hasPacket],
      ["ad-csv", S.contribs.length > 0]
    ];

    for (const [id, available] of buttons) {
      const button = $(id);

      if (!button) continue;

      button.disabled =
        exportBusy || !available;

      button.title = available
        ? "Télécharger les données"
        : "Aucune contribution complète disponible";
    }
  }

  async function runExport(task) {
    if (exportBusy) return;

    exportBusy = true;
    updateExportButtons();

    try {
      await task();
    } catch (error) {
      guard(error);
    } finally {
      exportBusy = false;
      updateExportButtons();
    }
  }

  function initExportButtons() {
    const one = $("ad-zip-one");
    const packet = $("ad-zip-packet");
    const csv = $("ad-csv");

    if (one) {
      one.onclick = () => runExport(async () => {
        const c = S.contribs.find(
          item => item.id === S.cid
        );

        if (!c) {
          throw new Error(
            "Sélectionnez une contribution complète."
          );
        }

        await createExportZip(
          [c],
          `awar-narrif-contribution-${String(c.n).padStart(5, "0")}.zip`
        );
      });
    }

    if (packet) {
      packet.onclick = () => runExport(async () => {
        const selectedPacket = S.packet;

        const contributions = S.contribs.filter(
          c => c.packet === selectedPacket
        );

        await createExportZip(
          contributions,
          `awar-narrif-paquet-${pad(selectedPacket)}.zip`
        );
      });
    }

    if (csv) {
      csv.onclick = () => runExport(async () => {
        exportGlobalCsv();
      });
    }

    updateExportButtons();
  }

  // ==========================================================
  // 13. ÉVÉNEMENTS
  // ==========================================================

  $("ad-form").onsubmit =
    async event => {
      event.preventDefault();

      msg("Connexion…");

      try {
        const result =
          await api("login", {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({
                password:
                  $("ad-pass").value
              })
          });

        if (
          !result.authenticated ||
          !result.token
        ) {
          throw Error(
            "Connexion non confirmée."
          );
        }

        sessionStorage.setItem(
          TOKEN_KEY,
          result.token
        );

        $("ad-pass").value = "";

        await load();

      } catch (error) {
        msg(
          error.message,
          "err"
        );
      }
    };

  $("ad-out").onclick =
    async () => {
      try {
        await api(
          "logout",
          {
            method: "POST"
          }
        );
      } catch {}

      sessionStorage.removeItem(
        TOKEN_KEY
      );

      S.cid = null;

      showLogin(
        "Vous êtes déconnecté."
      );
    };

  $("ad-refresh").onclick =
    load;

  $("ad-all").onclick = () => {
    S.all = !S.all;
    renderRecent();
  };

  $("ad-packet").onchange =
    event => {
      const packet =
        Number(
          event.target.value
        );

      const list =
        S.contribs.filter(
          c => c.packet === packet
        );

      pick(
        packet,
        list[0]?.id
      );
    };

  $("ad-contrib").onchange =
    event => {
      pick(
        S.packet,
        event.target.value || null
      );
    };

  $("ad-ex").onclick =
    async event => {
      const player =
        event.target.closest(
          ".ad-ap"
        );

      if (
        !player ||
        !S.cid
      ) {
        return;
      }

      const id =
        player.dataset.id;

      if (
        event.target.closest(
          ".dl"
        )
      ) {
        const c =
          S.contribs.find(
            item =>
              item.id === S.cid
          );

        const a =
          c?.audios.find(
            item =>
              item.id === id
          );

        if (!a) return;

        await downloadAudio(
          id,

          `paquet-${pad(c.packet)}` +
          `-phrase-${pad(a.position)}` +
          `-${id.slice(0, 8)}.wav`
        );

        return;
      }

      const button =
        event.target.closest(
          ".pl"
        );

      if (!button) return;

      await playAudio(
        button,
        player,
        id
      );
    };

  // ==========================================================
  // 14. EXPORTS NON DISPONIBLES
  // ==========================================================
/*
  [
    "ad-zip-packet",
    "ad-zip-one",
    "ad-csv"
  ].forEach(id => {
    const button = $(id);

    if (button) {
      button.disabled = true;

      button.onclick = event => {
        event.preventDefault();

        msg(
          "Cette fonctionnalité sera disponible prochainement."
        );
      };
    }
  });*/
    // ==========================================================
  // 14. INITIALISATION DES EXPORTS
  // ==========================================================

  initExportButtons();

  // ==========================================================
  // 15. INITIALISATION
  // ==========================================================

  document
    .querySelectorAll(
      '[data-v="admin"]'
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        init
      );
    });

})();
