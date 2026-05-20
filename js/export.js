/* export.js — PDF, Excel, and Print export */
const Exporter = (() => {

  function getTeamName(league, id) {
    const t = league.teams.find(t => t.id === id);
    return t ? t.name : 'Unknown';
  }

  function getGymName(league, id) {
    const g = league.gyms.find(g => g.id === id);
    return g ? g.name : '—';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatTime(timeStr) {
    if (!timeStr) return '—';
    const [h, m] = timeStr.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour   = h % 12 || 12;
    return `${hour}:${m.toString().padStart(2, '0')} ${suffix}`;
  }

  function buildRows(league) {
    const allGames = [...(league.schedule || []), ...(league.flagged || [])];
    allGames.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.time || '').localeCompare(b.time || '');
    });
    return allGames.map(g => ({
      Date:   formatDate(g.date),
      Time:   formatTime(g.time),
      Home:   getTeamName(league, g.homeTeamId),
      Away:   getTeamName(league, g.awayTeamId),
      Gym:    getGymName(league, g.gymId),
      Status: g.status === 'flagged' ? 'UNSCHEDULED' : (g.homeScore != null ? `${g.homeScore}-${g.awayScore}` : 'Scheduled'),
    }));
  }

  /* ── Print ──────────────────────────────────── */
  function print() {
    window.print();
  }

  /* ── Excel ──────────────────────────────────── */
  function toExcel(league) {
    if (typeof XLSX === 'undefined') {
      alert('Excel library not loaded. Check your internet connection and try again.');
      return;
    }

    const schedRows = buildRows(league);
    const standRows = buildStandingsRows(league);
    const wb = XLSX.utils.book_new();

    if (schedRows.length) {
      const ws = XLSX.utils.json_to_sheet(schedRows);
      ws['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Schedule');
    }
    if (standRows.length) {
      const ws2 = XLSX.utils.json_to_sheet(standRows);
      XLSX.utils.book_append_sheet(wb, ws2, 'Standings');
    }

    XLSX.writeFile(wb, `${league.name || 'CourtFlow'}_Schedule.xlsx`);
  }

  function buildStandingsRows(league) {
    const stats = computeStandings(league);
    return stats.map((s, i) => ({
      Rank: i + 1,
      Team: s.name,
      W:    s.w,
      L:    s.l,
      T:    s.t,
      PCT:  s.pct,
      PF:   s.pf,
      PA:   s.pa,
    }));
  }

  /* ── PDF ────────────────────────────────────── */
  function toPDF(league) {
    if (typeof window.jspdf === 'undefined') {
      alert('PDF library not loaded. Check your internet connection and try again.');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc  = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    const rows = buildRows(league);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(league.name || 'CourtFlow Schedule', 40, 40);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Generated ${new Date().toLocaleDateString()}`, 40, 58);

    if (rows.length) {
      doc.autoTable({
        startY: 72,
        head: [['Date', 'Time', 'Home', 'Away', 'Gym', 'Status']],
        body: rows.map(r => [r.Date, r.Time, r.Home, r.Away, r.Gym, r.Status]),
        headStyles: { fillColor: [26, 46, 80], textColor: 255, fontStyle: 'bold', fontSize: 10 },
        bodyStyles: { fontSize: 9, textColor: 30 },
        alternateRowStyles: { fillColor: [245, 246, 248] },
        columnStyles: { 5: { cellWidth: 60 } },
        margin: { left: 40, right: 40 },
      });
    }

    const standRows = buildStandingsRows(league);
    if (standRows.length) {
      doc.addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(30);
      doc.text('League Standings', 40, 40);
      doc.autoTable({
        startY: 60,
        head: [['Rank', 'Team', 'W', 'L', 'T', 'PCT', 'PF', 'PA']],
        body: standRows.map((r, i) => [i + 1, r.Team, r.W, r.L, r.T, r.PCT, r.PF, r.PA]),
        headStyles: { fillColor: [26, 46, 80], textColor: 255, fontStyle: 'bold', fontSize: 10 },
        bodyStyles: { fontSize: 9, textColor: 30 },
        alternateRowStyles: { fillColor: [245, 246, 248] },
        margin: { left: 40, right: 40 },
      });
    }

    doc.save(`${(league.name || 'CourtFlow').replace(/\s+/g, '_')}_Schedule.pdf`);
  }

  /* ── Standings calculator ───────────────────── */
  function computeStandings(league) {
    const teams = league.teams || [];
    const games = (league.schedule || []).filter(g => g.homeScore != null && g.awayScore != null);
    const map   = {};
    teams.forEach(t => {
      map[t.id] = { id: t.id, name: t.name, w: 0, l: 0, t: 0, pf: 0, pa: 0 };
    });
    for (const g of games) {
      const hm  = map[g.homeTeamId];
      const am  = map[g.awayTeamId];
      if (!hm || !am) continue;
      const hs  = Number(g.homeScore);
      const as_ = Number(g.awayScore);
      hm.pf += hs; hm.pa += as_;
      am.pf += as_; am.pa += hs;
      if (hs > as_)      { hm.w++; am.l++; }
      else if (as_ > hs) { am.w++; hm.l++; }
      else               { hm.t++; am.t++; }
    }
    return Object.values(map).map(s => ({
      ...s,
      pct: (s.w + s.l + s.t) > 0
        ? ((s.w + s.t * 0.5) / (s.w + s.l + s.t)).toFixed(3)
        : '.000'
    })).sort((a, b) => {
      const ap = parseFloat(a.pct), bp = parseFloat(b.pct);
      if (bp !== ap) return bp - ap;
      return (b.pf - b.pa) - (a.pf - a.pa);
    });
  }

  return { print, toExcel, toPDF, computeStandings };
})();
