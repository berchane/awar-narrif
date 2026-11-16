
/*
 * Awar n'Arrif — Administration Supabase
 * Conserve les identifiants HTML et le design existant.
 * Chaque contribution correspond à un WAV.
 */
(() => {
  "use strict";

  const BASE =
    "https://dpxrkzvhpeflaeiqfmyt.supabase.co/functions/v1/admin-api";

  const TOKEN_KEY = "awar_admin_token";
  const $ = id => document.getElementById(id);

  const S = {
    contribs: [],
    packets: [],
    all: false,
    packet: null,
    cid: null,
    audio: null,
    btn: null,
    audioUrl: null,
    gen: 0
  };

  const PLAY =
    '<svg viewBox="0 0 24 24" style="fill:currentColor;stroke:none"><path d="M6 4l14 8-14 8z"/></svg>';

  const PAUSE =
    '<svg viewBox="0 0 24 24" style="fill:currentColor;stroke:none"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';

  const DL =
    '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg>';

  const pad = n => String(n).padStart(2, "0");

  const idLabel = c =>
    "#" + String(c.n || 0).padStart(5, "0");

  const plural = (n, a, b) => n > 1 ? b : a;

  const fdur = t => {
    t = Number(t) || 0;
    return `${Math.floor(t / 60)}:${(t % 60)
      .toFixed(1).padStart(4, "0")}`;
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
    if (text !== undefined) e.textContent = text;
    if (html) e.innerHTML = html;

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
  // 1. API SUPABASE
  // ==========================================================

  async function api(path, opts = {}) {
    const token = sessionStorage.getItem(TOKEN_KEY);

    const headers = new Headers(opts.headers || {});

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(`${BASE}/${path}`, {
      ...opts,
      headers,
      cache: "no-store"
    });

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
        detail.error || `Erreur HTTP ${response.status}`
      );

      error.status = response.status;
      throw error;
    }

    return type.includes("json")
      ? response.json()
      : response.blob();
  }

  function guard(error) {
    if (error.status === 401 || error.status === 403) {
      sessionStorage.removeItem(TOKEN_KEY);
      showLogin("Session expirée. Reconnectez-vous.");
    } else {
      msg(error.message || "Erreur inconnue", "err");
    }
  }

  // ==========================================================
  // 2. SESSION
  // ==========================================================

  function stopAudio() {
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

    msg(message || "", message ? "err" : "");
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
  // 3. STATISTIQUES
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

    $("ad-k1").textContent = packets.length;

    $("ad-k2").textContent =
      stats.total_contributions ?? 0;

    $("ad-k3").textContent =
      stats.total_recordings ?? 0;

    $("ad-k4").textContent =
      lows.length ? lows[0].id : "—";

    $("ad-k4s").textContent = lows.length
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
  // 4. GRAPHIQUE EXISTANT
  // ==========================================================

  function renderChart() {
    const P = S.packets;

    if (!P.length) {
      $("ad-chart").replaceChildren();
      return;
    }

    const vals = P.map(p => p.contributions);

    const max = Math.max(5, ...vals);
    const step = max > 10 ? Math.ceil(max / 5) : 1;
    const top = Math.ceil(max / step) * step;
    const low = Math.min(...vals);

    const W = 560;
    const H = 250;
    const L = 58;
    const R = 12;
    const T = 26;
    const B = 52;

    const pw = W - L - R;
    const ph = H - T - B;
    const slot = pw / P.length;
    const bw = Math.min(slot * 0.72, 70);

    const y = v => T + ph - (v / top) * ph;

    let g = "";

    for (let v = 0; v <= top; v += step) {
      g += `
        <line x1="${L}" x2="${W - R}"
          y1="${y(v)}" y2="${y(v)}"
          stroke="#e4d3bc"/>
        <text x="${L - 12}" y="${y(v) + 5}"
          text-anchor="end" font-size="15">${v}</text>
      `;
    }

    P.forEach((p, i) => {
      const x = L + i * slot + (slot - bw) / 2;
      const hot = p.contributions === low;

      g += `
        <rect x="${x}" y="${y(p.contributions)}"
          width="${bw}"
          height="${T + ph - y(p.contributions)}"
          fill="${hot ? "#ee9a4d" : "var(--teal)"}">
          <title>Paquet ${p.id} :
            ${p.contributions} enregistrements</title>
        </rect>
        <text x="${x + bw / 2}"
          y="${y(p.contributions) - 8}"
          text-anchor="middle"
          font-size="17"
          font-weight="700">${p.contributions}</text>
        <text x="${x + bw / 2}"
          y="${T + ph + 22}"
          text-anchor="middle"
          font-size="15">P${p.id}</text>
      `;
    });

    g += `
      <line x1="${L}" x2="${L}"
        y1="${T}" y2="${T + ph}" stroke="#444"/>
      <line x1="${L}" x2="${W - R}"
        y1="${T + ph}" y2="${T + ph}" stroke="#444"/>
      <text transform="translate(16 ${T + ph / 2}) rotate(-90)"
        text-anchor="middle" font-size="15">
        Enregistrements WAV
      </text>
      <text x="${L + pw / 2}" y="${H - 6}"
        text-anchor="middle" font-size="15">
        Paquets
      </text>
    `;

    $("ad-chart").innerHTML =
      `<svg viewBox="0 0 ${W} ${H}"
        role="img"
        aria-label="Enregistrements par paquet">
        ${g}
      </svg>`;
  }

  // ==========================================================
  // 5. CONTRIBUTIONS RÉCENTES
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
        idLabel(c),
        "P" + c.packet,
        fdate(c.created_at),
        String(c.audio_count || 1)
      ].forEach(value => {
        tr.append(el("td", "", value));
      });

      const td = el("td", "r");
      const button = el("button", "ad-vbtn", "", PLAY + "Voir");

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
        "Aucune contribution enregistrée."
      );

      td.colSpan = 5;
      tr.append(td);
      body.append(tr);
    }

    $("ad-all").firstChild.textContent =
      S.all ? "Voir moins " : "Voir tout ";

    $("ad-recent-wrap").classList.toggle(
      "long",
      S.all
    );
  }

  // ==========================================================
  // 6. SÉLECTION DES PAQUETS ET WAV
  // ==========================================================

  function fillSelects() {
    const ps = $("ad-packet");
    ps.replaceChildren();

    S.packets.forEach(p => {
      const option = el(
        "option",
        "",
        `Paquet ${p.id} (${p.contributions} WAV)`
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
        "Aucun enregistrement"
      );

      option.value = "";
      cs.append(option);
    }

    list.forEach(c => {
      const option = el(
        "option",
        "",
        `Phrase ${pad(c.sentence)} – ${fdate(c.created_at)}`
      );

      option.value = c.id;

      if (c.id === S.cid) {
        option.selected = true;
      }

      cs.append(option);
    });

    // Exports ZIP non encore disponibles côté API
    $("ad-zip-packet").disabled = true;
    $("ad-zip-one").disabled = true;
    $("ad-csv").disabled = true;

    $("ad-zip-packet").title =
      "Export ZIP à intégrer prochainement";

    $("ad-zip-one").title =
      "Export ZIP à intégrer prochainement";

    $("ad-csv").title =
      "Export CSV à intégrer prochainement";
  }

  // ==========================================================
  // 7. EXPLORATEUR AUDIO
  // ==========================================================

  async function renderExplorer() {
    stopAudio();

    const gen = ++S.gen;
    const box = $("ad-ex");
    const info = $("ad-info");

    box.replaceChildren();

    if (!S.cid) {
      info.textContent =
        "Aucun enregistrement pour ce paquet.";
      return;
    }

    const c = S.contribs.find(
      item => item.id === S.cid
    );

    if (!c) {
      info.textContent =
        "Enregistrement introuvable.";
      return;
    }

    info.textContent =
      `Enregistrement ${idLabel(c)} · ` +
      `Paquet ${c.packet} · ` +
      `Phrase ${pad(c.sentence)} · ` +
      `${fdate(c.created_at)} · ` +
      `WAV ${c.sample_rate / 1000} kHz`;

    const wrap = el("div", "ad-tw");
    const table = el("table", "ad-t ex");

    const head = el("thead");

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

    const tbody = el("tbody");
    const tr = el("tr");

    tr.append(el("td", "", pad(c.sentence)));

    const tx = el(
      "td",
      "",
      c.transcription || "—"
    );

    tx.lang = "rif";
    tr.append(tx);

    const audioCell = el("td");
    const player = el("div", "ad-ap");

    player.dataset.id = c.id;
    player.dataset.n = c.sentence;

    const play = el("button", "pl", "", PLAY);
    play.type = "button";
    play.setAttribute(
      "aria-label",
      "Écouter la phrase " + c.sentence
    );

    const time = el(
      "span",
      "tt",
      `0:00 / ${fdur(c.duration)}`
    );

    const bar = el(
      "div",
      "pg",
      "",
      "<i></i>"
    );

    const dl = el("button", "dl", "", DL);
    dl.type = "button";
    dl.title = "Télécharger ce WAV";

    player.append(play, time, bar, dl);
    audioCell.append(player);

    tr.append(audioCell);

    tr.append(
      el("td", "", fdur(c.duration))
    );

    // Aucune analyse acoustique RMS / saturation
    // n'est encore disponible dans Supabase.
    const quality = el("td");

    quality.append(
      el("span", "ad-q", "Non analysée")
    );

    tr.append(quality);
    tbody.append(tr);

    table.append(tbody);
    wrap.append(table);
    box.append(wrap);

    if (gen !== S.gen) return;
  }

  function pick(packet, cid) {
    S.packet = Number(packet);
    S.cid = cid || null;

    fillSelects();
    renderExplorer();
  }

  // ==========================================================
  // 8. LECTURE ET TÉLÉCHARGEMENT WAV
  // ==========================================================

  async function getAudioBlob(id) {
    return api(
      "audio?id=" + encodeURIComponent(id)
    );
  }

  async function downloadAudio(id, name) {
    msg("Téléchargement du WAV…");

    try {
      const blob = await getAudioBlob(id);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

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

  async function playAudio(button, player, id) {
    const same = S.btn === button;

    stopAudio();

    if (same) return;

    msg("Chargement audio…");

    try {
      const blob = await getAudioBlob(id);

      // Éviter de lancer un audio si la sélection a changé
      if (!player.isConnected || S.cid !== id) {
        return;
      }

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      const time = player.querySelector(".tt");
      const bar = player.querySelector(".pg i");

      const c = S.contribs.find(x => x.id === id);
      const total = fdur(c?.duration || 0);

      S.audioUrl = url;
      S.audio = audio;
      S.btn = button;

      button.innerHTML = PAUSE;

      audio.ontimeupdate = () => {
        time.textContent =
          `${fcur(audio.currentTime)} / ${total}`;

        bar.style.width = audio.duration
          ? `${audio.currentTime / audio.duration * 100}%`
          : "0%";
      };

      audio.onended = () => {
        stopAudio();
        time.textContent = `0:00 / ${total}`;
        bar.style.width = "0";
      };

      audio.onerror = () => {
        stopAudio();
        msg("Impossible de lire le WAV.", "err");
      };

      await audio.play();
      msg("");
    } catch (error) {
      stopAudio();
      guard(error);
    }
  }

  // ==========================================================
  // 9. CHARGEMENT DU TABLEAU DE BORD
  // ==========================================================

  async function load() {
    msg("Chargement des données Supabase…");

    try {
      const [stats, list] = await Promise.all([
        api("stats"),
        api("contributions")
      ]);

      S.packets = (stats.packets || []).map(p => ({
        id: Number(p.id),
        contributions: Number(p.contributions) || 0
      }));

      S.contribs = (list.contributions || []).map(c => ({
        ...c,
        packet: Number(c.packet),
        sentence: Number(c.sentence)
      }));

      showDash();
      msg("");

      renderKpis(stats);
      renderChart();
      renderRecent();

      const keep =
        S.contribs.find(c => c.id === S.cid) ||
        S.contribs[0];

      if (keep) {
        pick(keep.packet, keep.id);
      } else {
        S.packet = S.packets[0]?.id ?? null;
        S.cid = null;

        fillSelects();
        renderExplorer();
      }

      if (list.truncated) {
        msg(
          "La liste est limitée aux 5 000 WAV les plus récents."
        );
      }
    } catch (error) {
      guard(error);
    }
  }

  // ==========================================================
  // 10. ÉVÉNEMENTS
  // ==========================================================

  $("ad-form").onsubmit = async event => {
    event.preventDefault();

    msg("Connexion…");

    try {
      const result = await api("login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          password: $("ad-pass").value
        })
      });

      if (!result.authenticated || !result.token) {
        throw Error("Connexion non confirmée.");
      }

      sessionStorage.setItem(
        TOKEN_KEY,
        result.token
      );

      $("ad-pass").value = "";

      await load();
    } catch (error) {
      msg(error.message, "err");
    }
  };

  $("ad-out").onclick = async () => {
    try {
      await api("logout", {
        method: "POST"
      });
    } catch {}

    sessionStorage.removeItem(TOKEN_KEY);

    S.cid = null;
    showLogin("Vous êtes déconnecté.");
  };

  $("ad-refresh").onclick = load;

  $("ad-all").onclick = () => {
    S.all = !S.all;
    renderRecent();
  };

  $("ad-packet").onchange = event => {
    const packet = Number(event.target.value);

    const list = S.contribs.filter(
      c => c.packet === packet
    );

    pick(packet, list[0]?.id);
  };

  $("ad-contrib").onchange = event => {
    pick(
      S.packet,
      event.target.value || null
    );
  };

  $("ad-ex").onclick = async event => {
    const player = event.target.closest(".ad-ap");

    if (!player || !S.cid) return;

    const id = player.dataset.id;

    if (event.target.closest(".dl")) {
      const c = S.contribs.find(
        item => item.id === id
      );

      await downloadAudio(
        id,
        `paquet-${pad(c?.packet)}-phrase-${pad(c?.sentence)}-${id.slice(0, 8)}.wav`
      );

      return;
    }

    const button = event.target.closest(".pl");

    if (!button) return;

    await playAudio(button, player, id);
  };

  // Désactiver explicitement les exports non disponibles
  ["ad-zip-packet", "ad-zip-one", "ad-csv"]
    .forEach(id => {
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
    });

  // Initialiser quand l'utilisateur ouvre Administration
  document
    .querySelectorAll('[data-v="admin"]')
    .forEach(button => {
      button.addEventListener("click", init);
    });

})();
