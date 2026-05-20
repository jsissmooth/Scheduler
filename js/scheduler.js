/* scheduler.js — Schedule generation engine */
const Scheduler = (() => {

  /* ── Public entry point ─────────────────────── */
  function generate(league) {
    const { teams, gyms, availableDates, settings } = league;
    const errs = [];

    if (teams.length < 2)          errs.push('Need at least 2 teams.');
    if (!gyms.length)              errs.push('No gyms configured.');
    if (!availableDates.length)    errs.push('No game dates selected.');
    const totalSlots = countSlots(availableDates, gyms);
    if (!totalSlots)               errs.push('No time slots configured on any game date.');
    if (errs.length) return { ok: false, errors: errs };

    const matchups  = generateMatchups(teams, settings.gamesPerTeam);
    const slots     = buildSlots(availableDates, gyms);

    const tracker = {};
    teams.forEach(t => {
      tracker[t.id] = { byDate: {}, byWeek: {}, lastDate: null };
    });

    const scheduled = [];
    const flagged   = [];

    for (const m of matchups) {
      let placed = false;
      for (const slot of slots) {
        if (slot.used) continue;
        if (canPlace(m, slot, tracker, teams, settings)) {
          slot.used = true;
          const game = makeGame(m, slot);
          scheduled.push(game);
          recordGame(tracker, m, slot, game.id);
          placed = true;
          break;
        }
      }
      if (!placed) {
        flagged.push(makeFlagged(m));
      }
    }

    return { ok: true, scheduled, flagged };
  }

  /* ── Round-robin matchup generation ─────────── */
  function generateMatchups(teams, gamesPerTeam) {
    const ids  = teams.map(t => t.id);
    const arr  = ids.length % 2 === 0 ? [...ids] : [...ids, '__BYE__'];
    const n    = arr.length;
    const rpc  = n - 1;

    const allRounds = buildRounds(arr);

    const matchups = [];
    for (let r = 0; r < gamesPerTeam; r++) {
      const cycleIdx  = r % rpc;
      const cycleNum  = Math.floor(r / rpc);
      const flip      = cycleNum % 2 === 1;
      for (const m of allRounds[cycleIdx]) {
        matchups.push(flip
          ? { homeTeamId: m.awayTeamId, awayTeamId: m.homeTeamId }
          : { homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId });
      }
    }
    return matchups;
  }

  function buildRounds(arr) {
    const n      = arr.length;
    const rounds = n - 1;
    const w      = [...arr];
    const all    = [];

    for (let r = 0; r < rounds; r++) {
      const round = [];
      for (let i = 0; i < n / 2; i++) {
        const home = w[i];
        const away = w[n - 1 - i];
        if (home !== '__BYE__' && away !== '__BYE__') {
          round.push({ homeTeamId: home, awayTeamId: away });
        }
      }
      all.push(round);
      const last = w[n - 1];
      for (let i = n - 1; i > 1; i--) w[i] = w[i - 1];
      w[1] = last;
    }
    return all;
  }

  /* ── Slot pool builder ──────────────────────── */
  function buildSlots(availableDates, gyms) {
    const slots = [];
    const sorted = [...availableDates].sort((a, b) => a.date.localeCompare(b.date));
    for (const dc of sorted) {
      const sortedTimes = [...dc.times].sort();
      for (const time of sortedTimes) {
        for (const gymId of dc.gymIds) {
          const gym = gyms.find(g => g.id === gymId);
          if (!gym) continue;
          for (let c = 0; c < (gym.courts || 1); c++) {
            slots.push({ date: dc.date, time, gymId, courtIndex: c, used: false });
          }
        }
      }
    }
    return slots;
  }

  function countSlots(availableDates, gyms) {
    let count = 0;
    for (const dc of availableDates) {
      for (const gymId of dc.gymIds) {
        const gym = gyms.find(g => g.id === gymId);
        if (gym) count += dc.times.length * (gym.courts || 1);
      }
    }
    return count;
  }

  /* ── Placement check ────────────────────────── */
  function canPlace(matchup, slot, tracker, teams, settings) {
    const { homeTeamId, awayTeamId } = matchup;
    const { date, time } = slot;
    const week = getWeek(date);

    const homeTeam = teams.find(t => t.id === homeTeamId);
    const awayTeam = teams.find(t => t.id === awayTeamId);

    if (hasConflict(homeTeam, date, time, settings.gameDuration)) return false;
    if (hasConflict(awayTeam, date, time, settings.gameDuration)) return false;

    if (tracker[homeTeamId].byDate[date]) return false;
    if (tracker[awayTeamId].byDate[date]) return false;

    if ((tracker[homeTeamId].byWeek[week] || 0) >= settings.maxGamesPerWeek) return false;
    if ((tracker[awayTeamId].byWeek[week] || 0) >= settings.maxGamesPerWeek) return false;

    if (settings.avoidBackToBack) {
      if (isNextDay(tracker[homeTeamId].lastDate, date)) return false;
      if (isNextDay(tracker[awayTeamId].lastDate, date)) return false;
    }

    return true;
  }

  function hasConflict(team, date, time, gameDuration) {
    if (!team || !team.conflicts) return false;
    for (const c of team.conflicts) {
      if (c.date !== date) continue;
      if (c.allDay) return true;
      if (!c.blockedRanges || !c.blockedRanges.length) continue;
      const gameStart = toMin(time);
      const gameEnd   = gameStart + (gameDuration || 60);
      for (const range of c.blockedRanges) {
        const bs = toMin(range.start);
        const be = toMin(range.end);
        if (gameStart < be && gameEnd > bs) return true;
      }
    }
    return false;
  }

  /* ── Record helpers ─────────────────────────── */
  function recordGame(tracker, matchup, slot, gameId) {
    const week = getWeek(slot.date);
    for (const tid of [matchup.homeTeamId, matchup.awayTeamId]) {
      tracker[tid].byDate[slot.date] = gameId;
      tracker[tid].byWeek[week] = (tracker[tid].byWeek[week] || 0) + 1;
      if (!tracker[tid].lastDate || slot.date > tracker[tid].lastDate) {
        tracker[tid].lastDate = slot.date;
      }
    }
  }

  function makeGame(matchup, slot) {
    return {
      id: 'g-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      homeTeamId: matchup.homeTeamId,
      awayTeamId: matchup.awayTeamId,
      gymId: slot.gymId,
      courtIndex: slot.courtIndex,
      date: slot.date,
      time: slot.time,
      week: getWeek(slot.date),
      status: 'scheduled',
      homeScore: null,
      awayScore: null
    };
  }

  function makeFlagged(matchup) {
    return {
      id: 'f-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      homeTeamId: matchup.homeTeamId,
      awayTeamId: matchup.awayTeamId,
      gymId: null,
      courtIndex: null,
      date: null,
      time: null,
      week: null,
      status: 'flagged',
      homeScore: null,
      awayScore: null
    };
  }

  /* ── Date/time utilities ────────────────────── */
  function getWeek(dateStr) {
    const d    = new Date(dateStr + 'T12:00:00');
    const jan1 = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  }

  function isNextDay(prev, curr) {
    if (!prev || !curr) return false;
    const a = new Date(prev + 'T12:00:00');
    const b = new Date(curr + 'T12:00:00');
    return (b - a) / 86400000 === 1;
  }

  function toMin(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  return { generate };
})();
