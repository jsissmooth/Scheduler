/* app.js — CourtFlow main controller */
(() => {
  'use strict';

  /* ══ State ══════════════════════════════════ */
  let state = Storage.load();
  let calInstance = null;
  let activeConflictTeamId = null;
  let activeEditGameId = null;

  /* ══ Utils ══════════════════════════════════ */
  const $ = id => document.getElementById(id);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function league() { return Storage.getCurrentLeague(state); }
  function save() { Storage.save(state); }

  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US',
      { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function fmtTime(t) {
    if (!t) return '—';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  function teamName(id) {
    const lg = league();
    if (!lg) return id;
    const t = lg.teams.find(t => t.id === id);
    return t ? t.name : id;
  }

  function gymName(id) {
    const lg = league();
    if (!lg) return id;
    const g = lg.gyms.find(g => g.id === id);
    return g ? g.name : '—';
  }

  function initials(name) {
    return name.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
  }

  function getWeek(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const jan1 = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  }

  /* ══ Tab Management ═════════════════════════ */
  function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const el = $(`tab-${tabId}`);
    if (el) el.classList.add('active');
    document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');

    if (tabId === 'setup')     renderSetup();
    if (tabId === 'dates')     renderDates();
    if (tabId === 'generate')  renderGenSummary();
    if (tabId === 'schedule')  renderSchedule();
    if (tabId === 'standings') renderStandings();
  }

  /* ══ League Management ══════════════════════ */
  function renderLeagueSelect() {
    const sel = $('league-select');
    sel.innerHTML = '';
    if (!state.leagues.length) {
      sel.innerHTML = '<option value="">— No leagues —</option>';
      return;
    }
    state.leagues.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.name;
      if (l.id === state.currentLeagueId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function createLeague(name) {
    const lg = Storage.defaultLeague(name);
    state.leagues.push(lg);
    state.currentLeagueId = lg.id;
    save();
    renderLeagueSelect();
    renderSetup();
    switchTab('setup');
  }

  /* ══ SETUP TAB ══════════════════════════════ */
  function renderSetup() {
    const lg = league();
    if (!lg) {
      $('card-settings').innerHTML = `<div class="empty-msg">Create or select a league to get started.</div>`;
      return;
    }

    $('s-name').value        = lg.name;
    $('s-games').value       = lg.settings.gamesPerTeam;
    $('s-max-week').value    = lg.settings.maxGamesPerWeek;
    $('s-duration').value    = lg.settings.gameDuration;
    $('s-buffer').value      = lg.settings.buffer;
    $('s-avoid-b2b').checked = lg.settings.avoidBackToBack;

    $('team-badge').textContent = lg.teams.length;

    renderGymsList();
    renderTeamsGrid();
  }

  function saveSettings() {
    const lg = league();
    if (!lg) return;
    lg.name = $('s-name').value.trim() || lg.name;
    lg.settings.gamesPerTeam    = parseInt($('s-games').value) || 10;
    lg.settings.maxGamesPerWeek = parseInt($('s-max-week').value) || 2;
    lg.settings.gameDuration    = parseInt($('s-duration').value) || 60;
    lg.settings.buffer          = parseInt($('s-buffer').value) || 15;
    lg.settings.avoidBackToBack = $('s-avoid-b2b').checked;
    Storage.updateLeague(state, lg);
    save();
    renderLeagueSelect();
    const ind = $('settings-saved');
    ind.style.display = 'inline';
    setTimeout(() => ind.style.display = 'none', 2000);
  }

  /* ── Gyms ─────────────────────────────────── */
  function renderGymsList() {
    const lg = league();
    const el = $('gyms-list');
    if (!lg || !lg.gyms.length) {
      el.innerHTML = '<li class="text-muted text-sm" style="padding:10px 0">No gyms added yet.</li>';
      return;
    }
    el.innerHTML = lg.gyms.map(g => `
      <li class="item-row">
        <span class="item-name">🏟 ${g.name}</span>
        <span class="item-detail">${g.courts} court${g.courts !== 1 ? 's' : ''}</span>
        <button class="btn-icon" onclick="App.removeGym('${g.id}')">✕</button>
      </li>`).join('');
  }

  function addGym() {
    const lg = league();
    if (!lg) return alert('Select or create a league first.');
    const name   = $('gym-name').value.trim();
    const courts = parseInt($('gym-courts').value) || 1;
    if (!name) return;
    lg.gyms.push({ id: uid(), name, courts });
    Storage.updateLeague(state, lg);
    save();
    $('gym-name').value = '';
    $('gym-courts').value = 1;
    renderGymsList();
  }

  function removeGym(id) {
    const lg = league();
    if (!lg) return;
    lg.gyms = lg.gyms.filter(g => g.id !== id);
    Storage.updateLeague(state, lg);
    save();
    renderGymsList();
  }

  /* ── Teams ────────────────────────────────── */
  function renderTeamsGrid() {
    const lg = league();
    const el = $('teams-grid');
    $('team-badge').textContent = lg?.teams?.length || 0;
    if (!lg || !lg.teams.length) {
      el.innerHTML = '<div class="empty-msg" style="grid-column:1/-1">No teams yet. Add a team above.</div>';
      return;
    }
    el.innerHTML = lg.teams.map(t => {
      const cCount = (t.conflicts || []).length;
      return `
      <div class="team-card">
        <div class="team-card-top">
          <div class="team-avatar">${initials(t.name)}</div>
          <div class="team-info">
            <div class="team-name">${t.name}</div>
            <div class="team-conflicts">${cCount} conflict${cCount !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div class="team-actions">
          <button class="btn btn-outline" onclick="App.openConflictsModal('${t.id}')">✏ Conflicts</button>
          <button class="btn btn-danger" onclick="App.removeTeam('${t.id}')">✕</button>
        </div>
      </div>`;
    }).join('');
  }

  function addTeam() {
    const lg = league();
    if (!lg) return alert('Select or create a league first.');
    const name = $('team-name').value.trim();
    if (!name) return;
    lg.teams.push({ id: uid(), name, conflicts: [] });
    Storage.updateLeague(state, lg);
    save();
    $('team-name').value = '';
    renderTeamsGrid();
  }

  function removeTeam(id) {
    const lg = league();
    if (!lg) return;
    if (!confirm('Remove this team?')) return;
    lg.teams = lg.teams.filter(t => t.id !== id);
    Storage.updateLeague(state, lg);
    save();
    renderTeamsGrid();
  }

  /* ── Conflicts Modal ──────────────────────── */
  function openConflictsModal(teamId) {
    const lg = league();
    activeConflictTeamId = teamId;
    const team = lg.teams.find(t => t.id === teamId);
    if (!team) return;
    renderConflictsModal(team);
    openModal();
  }

  function renderConflictsModal(team) {
    const conflicts = team.conflicts || [];
    $('modal-content').innerHTML = `
      <h2 class="modal-title">Conflicts — ${team.name}</h2>
      <p class="text-sm text-muted" style="margin-bottom:14px">Add dates when this team cannot play.</p>
      <div class="conflict-list" id="conflict-list">
        ${conflicts.map((c, i) => `
          <div class="conflict-row">
            <div class="conflict-info">
              <div class="conflict-date">${fmtDate(c.date)}</div>
              <div class="conflict-times">${c.allDay ? 'All day' : (c.blockedRanges || []).map(r => `${fmtTime(r.start)}–${fmtTime(r.end)}`).join(', ')}</div>
            </div>
            <button class="btn btn-danger btn-sm" onclick="App.removeConflict(${i})">Remove</button>
          </div>`).join('') || '<p class="text-sm text-muted">No conflicts added.</p>'}
      </div>
      <div class="conflict-add">
        <h4>Add Conflict</h4>
        <div class="modal-fg">
          <label>Date</label>
          <input type="date" id="c-date">
        </div>
        <label class="allday-toggle" style="margin-top:10px">
          <input type="checkbox" id="c-allday" checked onchange="App.toggleConflictTime()">
          All day (no games this date)
        </label>
        <div id="c-time-section" style="display:none">
          <div class="conflict-time-row" style="margin-top:10px">
            <span class="text-sm text-muted">Block from</span>
            <input type="time" id="c-start" value="18:00">
            <span class="text-sm text-muted">to</span>
            <input type="time" id="c-end" value="22:00">
          </div>
        </div>
        <button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="App.addConflict()">+ Add Conflict</button>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="App.saveConflicts()">Done</button>
      </div>`;
  }

  function toggleConflictTime() {
    const allDay = $('c-allday').checked;
    $('c-time-section').style.display = allDay ? 'none' : 'block';
  }

  function addConflict() {
    const lg   = league();
    const team = lg.teams.find(t => t.id === activeConflictTeamId);
    if (!team) return;
    const date   = $('c-date').value;
    if (!date) return alert('Please select a date.');
    const allDay = $('c-allday').checked;
    const conflict = { date, allDay };
    if (!allDay) {
      const start = $('c-start').value;
      const end   = $('c-end').value;
      if (!start || !end) return alert('Enter start and end times.');
      conflict.blockedRanges = [{ start, end }];
    }
    team.conflicts = team.conflicts || [];
    team.conflicts.push(conflict);
    Storage.updateLeague(state, lg);
    save();
    renderConflictsModal(team);
  }

  function removeConflict(idx) {
    const lg   = league();
    const team = lg.teams.find(t => t.id === activeConflictTeamId);
    if (!team) return;
    team.conflicts.splice(idx, 1);
    Storage.updateLeague(state, lg);
    save();
    renderConflictsModal(team);
  }

  function saveConflicts() {
    closeModal();
    renderTeamsGrid();
  }

  /* ══ DATES TAB ══════════════════════════════ */
  function renderDates() {
    const lg = league();
    if (!lg) {
      $('dates-list').innerHTML = '<div class="empty-msg">Select or create a league first.</div>';
      return;
    }
    initCalendar(lg);
    renderDatesList(lg);
  }

  function initCalendar(lg) {
    if (calInstance) { calInstance.destroy(); calInstance = null; }
    const container = $('cal-container');
    container.innerHTML = '';
    const input = document.createElement('input');
    input.type  = 'text';
    input.style.display = 'none';
    container.appendChild(input);

    const selectedDates = (lg.availableDates || []).map(d => d.date);

    calInstance = flatpickr(input, {
      inline: true,
      mode: 'multiple',
      defaultDate: selectedDates,
      onChange(dates) {
        const lg2 = league();
        if (!lg2) return;
        const newDates = dates.map(d => d.toLocaleDateString('en-CA'));
        const existing = lg2.availableDates || [];
        const updated  = newDates.map(nd => {
          return existing.find(e => e.date === nd) || { date: nd, gymIds: [], times: [] };
        });
        lg2.availableDates = updated.sort((a,b) => a.date.localeCompare(b.date));
        Storage.updateLeague(state, lg2);
        save();
        renderDatesList(lg2);
      }
    });
  }

  function renderDatesList(lg) {
    const el    = $('dates-list');
    const noMsg = $('no-dates-msg');
    const badge = $('dates-badge');
    const dates = lg.availableDates || [];

    badge.textContent = `${dates.length} date${dates.length !== 1 ? 's' : ''}`;

    if (!dates.length) {
      el.innerHTML = '';
      noMsg.style.display = 'block';
      return;
    }
    noMsg.style.display = 'none';

    el.innerHTML = dates.map(dc => {
      const slotCount = dc.times.length;
      const gymNames  = (dc.gymIds || []).map(id => gymName(id)).join(', ') || 'No gyms';
      return `
      <div class="date-row" id="dr-${dc.date}">
        <div class="date-row-header" onclick="App.toggleDate('${dc.date}')">
          <span class="date-label">${fmtDate(dc.date)}</span>
          <span class="date-summary">${slotCount} slot${slotCount !== 1 ? 's' : ''} · ${gymNames}</span>
          <span class="date-expand-icon" id="dei-${dc.date}">▾</span>
        </div>
        <div class="date-body" id="db-${dc.date}">
          <div class="date-section-label">Available Gyms</div>
          <div class="gym-checks">
            ${lg.gyms.length ? lg.gyms.map(g => `
              <label class="gym-check-label">
                <input type="checkbox" ${dc.gymIds.includes(g.id) ? 'checked' : ''}
                  onchange="App.toggleGymOnDate('${dc.date}','${g.id}',this.checked)">
                ${g.name} (${g.courts}c)
              </label>`).join('') : '<span class="text-sm text-muted">No gyms yet — add them in Setup.</span>'}
          </div>
          <div class="date-section-label">Game Start Times</div>
          <div class="timeslot-controls">
            <input type="time" id="ts-start-${dc.date}" step="600">
            <span class="text-sm text-muted">to</span>
            <input type="time" id="ts-end-${dc.date}" step="600">
            <button class="btn btn-primary btn-sm" onclick="App.quickFillSlots('${dc.date}')">Quick Fill</button>
            <input type="time" id="ts-single-${dc.date}" step="600">
            <button class="btn btn-outline btn-sm" onclick="App.addSingleSlot('${dc.date}')">+ Add Time</button>
          </div>
          <div class="slots-grid" id="sg-${dc.date}">
            ${dc.times.sort().map(t => slotChip(dc.date, t)).join('')}
          </div>
        </div>
      </div>`;
    }).join('');
  }

  function slotChip(date, time) {
    return `<div class="slot-chip">
      ${fmtTime(time)}
      <button class="remove-slot" onclick="App.removeSlot('${date}','${time}')">✕</button>
    </div>`;
  }

  function toggleDate(date) {
    const body = $(`db-${date}`);
    const icon = $(`dei-${date}`);
    const open = body.classList.toggle('open');
    icon.classList.toggle('open', open);
  }

  function toggleGymOnDate(date, gymId, checked) {
    const lg = league();
    const dc = lg.availableDates.find(d => d.date === date);
    if (!dc) return;
    if (checked && !dc.gymIds.includes(gymId)) dc.gymIds.push(gymId);
    if (!checked) dc.gymIds = dc.gymIds.filter(id => id !== gymId);
    Storage.updateLeague(state, lg);
    save();
  }

  function quickFillSlots(date) {
    const lg  = league();
    const dc  = lg.availableDates.find(d => d.date === date);
    if (!dc) return;
    const start = $(`ts-start-${date}`)?.value;
    const end   = $(`ts-end-${date}`)?.value;
    if (!start || !end) return alert('Enter both a start and end time.');

    const dur    = (lg.settings.gameDuration || 60) + (lg.settings.buffer || 15);
    const toMin  = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
    const toStr  = n => `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;

    const startMin = toMin(start);
    const endMin   = toMin(end);
    const newTimes = [];
    for (let cur = startMin; cur + (lg.settings.gameDuration || 60) <= endMin + 1; cur += dur) {
      const ts = toStr(cur);
      if (!dc.times.includes(ts)) newTimes.push(ts);
    }
    dc.times = [...new Set([...dc.times, ...newTimes])];
    Storage.updateLeague(state, lg);
    save();
    const sg = $(`sg-${date}`);
    if (sg) sg.innerHTML = dc.times.sort().map(t => slotChip(date, t)).join('');
  }

  function addSingleSlot(date) {
    const lg = league();
    const dc = lg.availableDates.find(d => d.date === date);
    const t  = $(`ts-single-${date}`)?.value;
    if (!dc || !t) return;
    if (!dc.times.includes(t)) {
      dc.times.push(t);
      Storage.updateLeague(state, lg);
      save();
      const sg = $(`sg-${date}`);
      if (sg) sg.innerHTML = dc.times.sort().map(ts => slotChip(date, ts)).join('');
    }
  }

  function removeSlot(date, time) {
    const lg = league();
    const dc = lg.availableDates.find(d => d.date === date);
    if (!dc) return;
    dc.times = dc.times.filter(t => t !== time);
    Storage.updateLeague(state, lg);
    save();
    const sg = $(`sg-${date}`);
    if (sg) sg.innerHTML = dc.times.sort().map(t => slotChip(date, t)).join('');
  }

  /* ══ GENERATE TAB ═══════════════════════════ */
  function renderGenSummary() {
    const lg = league();
    const el = $('gen-summary');
    if (!lg) { el.innerHTML = '<p class="text-muted">No league selected.</p>'; return; }

    const n   = lg.teams.length;
    const rpc = n % 2 === 0 ? n - 1 : n;
    const totalSlots = (lg.availableDates || []).reduce((acc, dc) => {
      return acc + dc.times.length * dc.gymIds.reduce((s, gid) => {
        const gym = lg.gyms.find(g => g.id === gid);
        return s + (gym ? gym.courts : 0);
      }, 0);
    }, 0);

    const warn = lg.settings.gamesPerTeam > rpc
      ? `<p style="color:var(--warn);margin-top:8px;font-size:13px">⚠ ${n} teams = ${rpc} unique rounds. Games per team > ${rpc} will repeat matchups.</p>`
      : '';

    el.innerHTML = `
      <h3>Pre-Flight Check</h3>
      ${row('League', lg.name)}
      ${row('Teams', n)}
      ${row('Gyms', lg.gyms.length)}
      ${row('Game dates', (lg.availableDates || []).length)}
      ${row('Total time slots', totalSlots)}
      ${row('Games per team', lg.settings.gamesPerTeam)}
      ${row('Max games / week', lg.settings.maxGamesPerWeek)}
      ${row('Game duration', lg.settings.gameDuration + ' min')}
      ${row('Avoid back-to-back', lg.settings.avoidBackToBack ? 'Yes' : 'No')}
      ${warn}`;
  }

  function row(label, value) {
    return `<div class="gen-row"><span class="label">${label}</span><span class="value">${value}</span></div>`;
  }

  function runGenerate() {
    const lg  = league();
    const res = $('gen-result');
    if (!lg) { res.className = 'gen-result error'; res.textContent = 'No league selected.'; return; }

    const result = Scheduler.generate(lg);

    if (!result.ok) {
      res.className = 'gen-result error';
      res.innerHTML = result.errors.map(e => `• ${e}`).join('<br>');
      return;
    }

    lg.schedule = result.scheduled;
    lg.flagged  = result.flagged;
    Storage.updateLeague(state, lg);
    save();

    const total   = result.scheduled.length + result.flagged.length;
    const flagged = result.flagged.length;

    if (flagged === 0) {
      res.className = 'gen-result success';
      res.innerHTML = `✅ <strong>${result.scheduled.length} games</strong> scheduled successfully!`;
    } else {
      res.className = 'gen-result warn';
      res.innerHTML = `⚡ <strong>${result.scheduled.length} of ${total} games</strong> scheduled. 
        <strong>${flagged} game${flagged !== 1 ? 's' : ''}</strong> flagged — 
        go to the Schedule tab to assign them manually.`;
    }
  }

  /* ══ SCHEDULE TAB ═══════════════════════════ */
  function renderSchedule() {
    const lg        = league();
    const view      = $('schedule-view');
    const noMsg     = $('no-schedule-msg');
    const flagPanel = $('flagged-panel');

    if (!lg || (!lg.schedule?.length && !lg.flagged?.length)) {
      view.innerHTML = '';
      noMsg.style.display = 'block';
      flagPanel.style.display = 'none';
      return;
    }
    noMsg.style.display = 'none';

    if (lg.flagged?.length) {
      flagPanel.style.display = 'block';
      $('flagged-list').innerHTML = lg.flagged.map(g => `
        <div class="flagged-game">
          <span class="flagged-matchup">⚠ ${teamName(g.homeTeamId)} vs ${teamName(g.awayTeamId)}</span>
          <button class="btn btn-sm btn-primary" onclick="App.openEditGame('${g.id}', true)">Assign Date &amp; Time</button>
        </div>`).join('');
    } else {
      flagPanel.style.display = 'none';
    }

    const mode = $('view-mode')?.value || 'week';
    if (mode === 'week') renderByWeek(lg, view);
    if (mode === 'date') renderByDate(lg, view);
    if (mode === 'team') renderByTeam(lg, view);
  }

  function renderByWeek(lg, view) {
    const games  = [...(lg.schedule || [])].sort((a,b) => (a.date||'').localeCompare(b.date||'') || (a.time||'').localeCompare(b.time||''));
    const byWeek = {};
    games.forEach(g => {
      const w = g.week || getWeek(g.date);
      if (!byWeek[w]) byWeek[w] = [];
      byWeek[w].push(g);
    });
    view.innerHTML = Object.keys(byWeek).sort((a,b) => a-b).map(week => `
      <div class="week-block">
        <div class="week-header">Week ${week}</div>
        ${gamesTable(byWeek[week])}
      </div>`).join('');
  }

  function renderByDate(lg, view) {
    const games  = [...(lg.schedule || [])].sort((a,b) => (a.date||'').localeCompare(b.date||'') || (a.time||'').localeCompare(b.time||''));
    const byDate = {};
    games.forEach(g => {
      if (!byDate[g.date]) byDate[g.date] = [];
      byDate[g.date].push(g);
    });
    view.innerHTML = Object.keys(byDate).sort().map(date => `
      <div class="week-block">
        <div class="week-header">${fmtDate(date)}</div>
        ${gamesTable(byDate[date])}
      </div>`).join('');
  }

  function renderByTeam(lg, view) {
    view.innerHTML = lg.teams.map(t => {
      const games = (lg.schedule || [])
        .filter(g => g.homeTeamId === t.id || g.awayTeamId === t.id)
        .sort((a,b) => (a.date||'').localeCompare(b.date||''));
      if (!games.length) return '';
      return `
      <div class="week-block">
        <div class="week-header">${t.name} — ${games.length} game${games.length !== 1 ? 's' : ''}</div>
        ${gamesTable(games)}
      </div>`;
    }).join('');
  }

  function gamesTable(games) {
    return `
      <table class="games-table">
        <thead>
          <tr><th>Date</th><th>Time</th><th>Matchup</th><th>Gym</th><th>Score</th><th>Edit</th></tr>
        </thead>
        <tbody>
          ${games.map(g => `
            <tr>
              <td>${fmtDate(g.date)}</td>
              <td>${fmtTime(g.time)}</td>
              <td class="matchup-cell">${teamName(g.homeTeamId)} <span class="vs-text">vs</span> ${teamName(g.awayTeamId)}</td>
              <td>${gymName(g.gymId)}</td>
              <td>${g.homeScore != null ? `<strong>${g.homeScore}–${g.awayScore}</strong>` : '—'}</td>
              <td><button class="edit-game-btn" onclick="App.openEditGame('${g.id}')">✏ Edit</button></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  /* ── Edit Game Modal ──────────────────────── */
  function openEditGame(gameId, fromFlagged = false) {
    const lg = league();
    activeEditGameId = gameId;
    const game = (lg.schedule || []).find(g => g.id === gameId)
              || (lg.flagged  || []).find(g => g.id === gameId);
    if (!game) return;

    const gymOptions = lg.gyms.map(g =>
      `<option value="${g.id}" ${g.id === game.gymId ? 'selected' : ''}>${g.name}</option>`
    ).join('');

    $('modal-content').innerHTML = `
      <h2 class="modal-title">${fromFlagged ? 'Assign Game' : 'Edit Game'}</h2>
      <p class="text-sm text-muted" style="margin-bottom:18px">
        ${teamName(game.homeTeamId)} vs ${teamName(game.awayTeamId)}<br>
        <em>No conflict rules enforced on manual edits.</em>
      </p>
      <div class="modal-form-grid">
        <div class="modal-fg">
          <label>Date</label>
          <input type="date" id="eg-date" value="${game.date || ''}">
        </div>
        <div class="modal-fg">
          <label>Time</label>
          <input type="time" id="eg-time" step="600" value="${game.time || ''}">
        </div>
        <div class="modal-fg">
          <label>Gym</label>
          <select id="eg-gym">
            <option value="">— Select Gym —</option>
            ${gymOptions}
          </select>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="App.saveGameEdit(${fromFlagged})">Save</button>
        <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
      </div>`;
    openModal();
  }

  function saveGameEdit(fromFlagged) {
    const lg   = league();
    const date = $('eg-date').value;
    const time = $('eg-time').value;
    const gym  = $('eg-gym').value;
    if (!date || !time) return alert('Date and time are required.');

    let game = (lg.schedule || []).find(g => g.id === activeEditGameId);
    const isFlagged = !game;
    if (isFlagged) game = (lg.flagged || []).find(g => g.id === activeEditGameId);
    if (!game) return;

    game.date  = date;
    game.time  = time;
    game.gymId = gym || null;
    game.week  = getWeek(date);

    if (isFlagged) {
      game.status = 'scheduled';
      lg.flagged  = (lg.flagged || []).filter(g => g.id !== game.id);
      lg.schedule = [...(lg.schedule || []), game];
    }

    Storage.updateLeague(state, lg);
    save();
    closeModal();
    renderSchedule();
  }

  /* ══ STANDINGS TAB ══════════════════════════ */
  function renderStandings() {
    const lg = league();
    if (!lg) {
      $('standings-table').innerHTML = '<p class="text-muted">No league selected.</p>';
      return;
    }

    const stats = Exporter.computeStandings(lg);

    if (!stats.length) {
      $('standings-table').innerHTML = '<p class="text-muted">No teams yet.</p>';
    } else {
      $('standings-table').innerHTML = `
        <table class="standings-tbl">
          <thead>
            <tr>
              <th>#</th><th>Team</th>
              <th style="text-align:center">W</th>
              <th style="text-align:center">L</th>
              <th style="text-align:center">T</th>
              <th style="text-align:center">PCT</th>
              <th style="text-align:center">PF</th>
              <th style="text-align:center">PA</th>
              <th style="text-align:center">+/-</th>
            </tr>
          </thead>
          <tbody>
            ${stats.map((s, i) => `
              <tr class="rank-${i+1}">
                <td><span class="rank-num">${i+1}</span></td>
                <td class="team-name-cell">${s.name}</td>
                <td class="stat-cell">${s.w}</td>
                <td class="stat-cell">${s.l}</td>
                <td class="stat-cell">${s.t}</td>
                <td class="pct-cell">${s.pct}</td>
                <td class="stat-cell">${s.pf}</td>
                <td class="stat-cell">${s.pa}</td>
                <td class="stat-cell">${s.pf - s.pa >= 0 ? '+' : ''}${s.pf - s.pa}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    }

    const games = (lg.schedule || []).filter(g => g.status !== 'flagged');
    const noMsg = $('no-scores-msg');
    const sl    = $('score-list');

    if (!games.length) {
      noMsg.style.display = 'block';
      sl.innerHTML = '';
    } else {
      noMsg.style.display = 'none';
      sl.innerHTML = `<div class="score-entry-list">
        ${games.sort((a,b) => (a.date||'').localeCompare(b.date||'')).map(g => `
          <div class="score-row">
            <div class="matchup">${teamName(g.homeTeamId)} vs ${teamName(g.awayTeamId)}</div>
            <div class="game-date">${fmtDate(g.date)}</div>
            <div class="score-inputs">
              <input type="number" min="0" value="${g.homeScore ?? ''}" placeholder="H"
                onchange="App.enterScore('${g.id}', 'home', this.value)">
              <span class="score-dash">–</span>
              <input type="number" min="0" value="${g.awayScore ?? ''}" placeholder="A"
                onchange="App.enterScore('${g.id}', 'away', this.value)">
            </div>
            <button class="btn btn-sm btn-success" onclick="App.saveScore('${g.id}')">✓ Save</button>
          </div>`).join('')}
      </div>`;
    }
  }

  const scoreBuffer = {};

  function enterScore(gameId, side, value) {
    if (!scoreBuffer[gameId]) scoreBuffer[gameId] = {};
    scoreBuffer[gameId][side] = value === '' ? null : Number(value);
  }

  function saveScore(gameId) {
    const lg   = league();
    const game = (lg.schedule || []).find(g => g.id === gameId);
    if (!game) return;
    const buf  = scoreBuffer[gameId] || {};
    if (buf.home !== undefined) game.homeScore = buf.home;
    if (buf.away !== undefined) game.awayScore = buf.away;
    if (game.homeScore != null && game.awayScore != null) game.status = 'completed';
    Storage.updateLeague(state, lg);
    save();
    renderStandings();
  }

  /* ══ Modal ══════════════════════════════════ */
  function openModal() {
    $('modal-overlay').style.display = 'flex';
  }

  function closeModal() {
    $('modal-overlay').style.display = 'none';
    $('modal-content').innerHTML = '';
    activeConflictTeamId = null;
    activeEditGameId     = null;
  }

  /* ══ Event Listeners ════════════════════════ */
  function init() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    $('btn-new-league').addEventListener('click', () => {
      const name = prompt('League name:');
      if (name?.trim()) createLeague(name.trim());
    });

    $('league-select').addEventListener('change', e => {
      state.currentLeagueId = e.target.value;
      save();
      switchTab('setup');
    });

    $('btn-save-settings').addEventListener('click', saveSettings);
    $('btn-add-gym').addEventListener('click', addGym);
    $('gym-name').addEventListener('keydown', e => e.key === 'Enter' && addGym());
    $('btn-add-team').addEventListener('click', addTeam);
    $('team-name').addEventListener('keydown', e => e.key === 'Enter' && addTeam());
    $('btn-generate').addEventListener('click', runGenerate);
    $('view-mode').addEventListener('change', renderSchedule);
    $('btn-print').addEventListener('click', () => Exporter.print());
    $('btn-pdf').addEventListener('click', () => { const lg = league(); if (lg) Exporter.toPDF(lg); });
    $('btn-excel').addEventListener('click', () => { const lg = league(); if (lg) Exporter.toExcel(lg); });
    $('modal-close').addEventListener('click', closeModal);
    $('modal-overlay').addEventListener('click', e => {
      if (e.target === $('modal-overlay')) closeModal();
    });

    renderLeagueSelect();

    if (!state.leagues.length) {
      const lg = Storage.defaultLeague('My First League');
      state.leagues.push(lg);
      state.currentLeagueId = lg.id;
      save();
      renderLeagueSelect();
    }

    renderSetup();
  }

  window.App = {
    removeGym, addGym, removeTeam,
    openConflictsModal, addConflict, removeConflict, saveConflicts, toggleConflictTime,
    toggleDate, toggleGymOnDate, quickFillSlots, addSingleSlot, removeSlot,
    openEditGame, saveGameEdit, enterScore, saveScore, closeModal,
  };

  document.addEventListener('DOMContentLoaded', init);
})();
