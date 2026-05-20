/* storage.js — localStorage wrapper */
const Storage = (() => {
  const KEY = 'courtflow_v1';

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || defaultState();
    } catch {
      return defaultState();
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function defaultState() {
    return { leagues: [], currentLeagueId: null };
  }

  function defaultLeague(name) {
    return {
      id: uid(),
      name: name || 'New League',
      createdAt: Date.now(),
      settings: {
        gamesPerTeam: 10,
        maxGamesPerWeek: 2,
        gameDuration: 60,
        buffer: 15,
        avoidBackToBack: true
      },
      teams: [],
      gyms: [],
      availableDates: [],
      schedule: [],
      flagged: []
    };
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function getCurrentLeague(state) {
    return state.leagues.find(l => l.id === state.currentLeagueId) || null;
  }

  function updateLeague(state, updated) {
    state.leagues = state.leagues.map(l => l.id === updated.id ? updated : l);
  }

  return { load, save, defaultLeague, getCurrentLeague, updateLeague, uid };
})();
