// =========================================================
// PontoCerto — lógica principal
// =========================================================

const WEEKDAYS = ['Domingo','Segunda-Feira','Terça-Feira','Quarta-Feira','Quinta-Feira','Sexta-Feira','Sábado'];
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const CATEGORIA_LABEL = {
  entrada_antecipada: 'Entrada antecipada',
  saida_antecipada: 'Saída antecipada',
  atraso: 'Atraso',
  outro: 'Outro'
};

const DEFAULT_RH_EMAIL = 'grupojunrh@sp.senac.br';
const BLANK_SHIFT = { tipo: 'normal', entrada: '', 'intervalo-saida': '', 'intervalo-retorno': '', saida: '' };
const DEFAULT_SCHEDULE = {
  seg: { ...BLANK_SHIFT }, ter: { ...BLANK_SHIFT }, qua: { ...BLANK_SHIFT },
  qui: { ...BLANK_SHIFT }, sex: { ...BLANK_SHIFT }, sab: { ...BLANK_SHIFT }, dom: { ...BLANK_SHIFT }
};

let currentUser = null;
let currentProfile = { full_name: '', registro: '', rh_email: '', schedule: null };
let allMarcacoes = [];       // cache local do usuário logado
let selectedTipo = 'entrada';
let manualTimeEdit = false;
let historyOriginFilter = 'todas';
let calendarCursor = new Date();
let selectedCalDay = null;
let isSignupMode = false;

// ---------- utilidades ----------

function pad(n) { return n.toString().padStart(2, '0'); }

function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeHMS(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDateBR(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}`;
}

function showToast(message, type = '') {
  const toast = document.getElementById('pc-toast');
  toast.textContent = message;
  toast.className = 'pc-toast show ' + type;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2600);
}

function navigate(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const leavingReport = document.getElementById('view-report').classList.contains('active') && view !== 'report';
  document.getElementById('view-' + view).classList.add('active');
  if (leavingReport) {
    if (typeof clearPdfState === 'function') clearPdfState();
    if (typeof clearXlsxState === 'function') clearXlsxState();
  }
  if (view === 'register') resetRegisterForm();
  if (view === 'history') renderHistoryList();
  if (view === 'report') {
    populateReportSelectors();
    renderReport();
    const rhEmailInput = document.getElementById('report-rh-email');
    if (rhEmailInput && !rhEmailInput.value) {
      rhEmailInput.value = currentProfile.rh_email || DEFAULT_RH_EMAIL;
    }
  }
  if (view === 'profile') loadProfileForm();
  if (view === 'schedule') loadScheduleForm();
  if (view === 'bankhours') loadBankHoursDashboard();
}

document.querySelectorAll('[data-nav]').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.nav));
});

// ---------- clocks ----------

function tickClocks() {
  const now = new Date();
  const homeClock = document.getElementById('home-clock');
  const homeDate = document.getElementById('home-date');
  if (homeClock) homeClock.textContent = timeHMS(now);
  if (homeDate) homeDate.textContent = `${WEEKDAYS[now.getDay()]}, ${pad(now.getDate())} De ${MONTHS[now.getMonth()]} De ${now.getFullYear()}`;

  if (!manualTimeEdit) {
    const regClock = document.getElementById('reg-clock');
    const regWD = document.getElementById('reg-weekday-date');
    if (regClock) regClock.textContent = timeHMS(now);
    if (regWD) regWD.textContent = `${WEEKDAYS[now.getDay()]}, ${pad(now.getDate())} De ${MONTHS[now.getMonth()]} De ${now.getFullYear()}`;
  }
}
setInterval(tickClocks, 1000);

// ---------- auth ----------

document.getElementById('auth-toggle-btn').addEventListener('click', () => {
  isSignupMode = !isSignupMode;
  document.getElementById('auth-title').textContent = isSignupMode ? 'Criar conta' : 'Entrar';
  document.getElementById('auth-sub').textContent = isSignupMode
    ? 'Crie sua conta para começar a registrar seu ponto.'
    : 'Acesse sua conta para registrar seu ponto.';
  document.getElementById('auth-name-wrap').classList.toggle('d-none', !isSignupMode);
  document.getElementById('auth-submit-btn').innerHTML = isSignupMode
    ? '<i class="bi bi-person-plus"></i> Criar conta'
    : '<i class="bi bi-box-arrow-in-right"></i> Entrar';
  document.getElementById('auth-toggle-btn').textContent = isSignupMode
    ? 'Já tem conta? Entrar'
    : 'Não tem conta? Criar conta';
});

document.getElementById('auth-submit-btn').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const name = document.getElementById('auth-name').value.trim();

  if (!email || !password) { showToast('Preencha e-mail e senha.', 'error'); return; }

  try {
    if (isSignupMode) {
      const { data, error } = await supabaseClient.auth.signUp({
        email, password,
        options: { data: { username: name || email.split('@')[0] } }
      });
      if (error) throw error;
      if (data.session) {
        await onLoggedIn(data.session.user);
      } else {
        showToast('Conta criada! Verifique seu e-mail para confirmar.', 'success');
      }
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await onLoggedIn(data.user);
    }
  } catch (err) {
    showToast(err.message || 'Erro ao autenticar.', 'error');
  }
});

document.getElementById('auth-google-btn').addEventListener('click', async () => {
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) showToast('Erro ao entrar com Google: ' + error.message, 'error');
  // Em caso de sucesso, o navegador é redirecionado ao Google e depois de volta ao app;
  // checkExistingSession() no carregamento da página detecta a sessão automaticamente.
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  currentUser = null;
  allMarcacoes = [];
  navigate('auth');
});

async function onLoggedIn(user) {
  currentUser = user;
  currentProfile.full_name = user.user_metadata?.full_name || '';
  currentProfile.registro = user.user_metadata?.registro || '';
  currentProfile.rh_email = user.user_metadata?.rh_email || '';
  currentProfile.schedule = user.user_metadata?.schedule || JSON.parse(JSON.stringify(DEFAULT_SCHEDULE));
  const displayName = currentProfile.full_name || user.user_metadata?.username || user.email.split('@')[0];
  document.getElementById('home-username').textContent = displayName;
  await loadMarcacoes();
  navigate('home');
}

async function checkExistingSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    await onLoggedIn(data.session.user);
  }
}

// ---------- minha conta / perfil ----------

function loadProfileForm() {
  document.getElementById('profile-fullname').value = currentProfile.full_name || '';
  document.getElementById('profile-registro').value = currentProfile.registro || '';
  document.getElementById('profile-rh-email').value = currentProfile.rh_email || DEFAULT_RH_EMAIL;
  document.getElementById('profile-new-password').value = '';
  document.getElementById('profile-confirm-password').value = '';
}

document.getElementById('profile-save-btn').addEventListener('click', async () => {
  const fullName = document.getElementById('profile-fullname').value.trim();
  const registro = document.getElementById('profile-registro').value.trim();
  const rhEmail = document.getElementById('profile-rh-email').value.trim();
  const newPassword = document.getElementById('profile-new-password').value;
  const confirmPassword = document.getElementById('profile-confirm-password').value;

  if (newPassword || confirmPassword) {
    if (newPassword.length < 6) { showToast('A nova senha deve ter pelo menos 6 caracteres.', 'error'); return; }
    if (newPassword !== confirmPassword) { showToast('As senhas não coincidem.', 'error'); return; }
  }

  const btn = document.getElementById('profile-save-btn');
  btn.disabled = true;

  const updatePayload = { data: { full_name: fullName, registro: registro, rh_email: rhEmail } };
  if (newPassword) updatePayload.password = newPassword;

  const { data, error } = await supabaseClient.auth.updateUser(updatePayload);
  btn.disabled = false;

  if (error) { showToast('Erro ao salvar: ' + error.message, 'error'); return; }

  currentUser = data.user;
  currentProfile.full_name = fullName;
  currentProfile.registro = registro;
  currentProfile.rh_email = rhEmail;
  document.getElementById('home-username').textContent = fullName || currentUser.user_metadata?.username || currentUser.email.split('@')[0];
  document.getElementById('profile-new-password').value = '';
  document.getElementById('profile-confirm-password').value = '';

  showToast('Dados atualizados!', 'success');
});

// ---------- minha escala de trabalho ----------

const WEEK_KEYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];

function updateScheduleFieldVisibility(day) {
  const tipo = document.getElementById(`sched-${day}-tipo`).value;
  document.getElementById(`sched-${day}-times`).classList.toggle('d-none', tipo !== 'normal');
}

WEEK_KEYS.forEach(day => {
  document.getElementById(`sched-${day}-tipo`).addEventListener('change', () => updateScheduleFieldVisibility(day));
});

function loadScheduleForm() {
  const schedule = currentProfile.schedule || DEFAULT_SCHEDULE;
  WEEK_KEYS.forEach(day => {
    const d = schedule[day] || { tipo: 'folga' };
    document.getElementById(`sched-${day}-tipo`).value = d.tipo || 'normal';
    document.getElementById(`sched-${day}-entrada`).value = d.entrada || '';
    document.getElementById(`sched-${day}-intervalo-saida`).value = d['intervalo-saida'] || '';
    document.getElementById(`sched-${day}-intervalo-retorno`).value = d['intervalo-retorno'] || '';
    document.getElementById(`sched-${day}-saida`).value = d.saida || '';
    updateScheduleFieldVisibility(day);
  });
}

document.getElementById('schedule-save-btn').addEventListener('click', async () => {
  const schedule = {};
  WEEK_KEYS.forEach(day => {
    const tipo = document.getElementById(`sched-${day}-tipo`).value;
    if (tipo === 'normal') {
      schedule[day] = {
        tipo: 'normal',
        entrada: document.getElementById(`sched-${day}-entrada`).value,
        'intervalo-saida': document.getElementById(`sched-${day}-intervalo-saida`).value,
        'intervalo-retorno': document.getElementById(`sched-${day}-intervalo-retorno`).value,
        saida: document.getElementById(`sched-${day}-saida`).value
      };
    } else {
      schedule[day] = { tipo };
    }
  });

  const btn = document.getElementById('schedule-save-btn');
  btn.disabled = true;
  const { data, error } = await supabaseClient.auth.updateUser({ data: { schedule } });
  btn.disabled = false;

  if (error) { showToast('Erro ao salvar: ' + error.message, 'error'); return; }

  currentUser = data.user;
  currentProfile.schedule = schedule;
  showToast('Escala salva!', 'success');
});

// ---------- banco de horas (dashboard) ----------

let bankHoursChartInstance = null;

async function loadBankHoursDashboard() {
  const { data, error } = await supabaseClient
    .from('banco_horas_dias')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('data', { ascending: true });

  const emptyEl = document.getElementById('bh-empty');
  const contentEl = document.getElementById('bh-content');

  if (error) { showToast('Erro ao carregar Banco de Horas: ' + error.message, 'error'); return; }

  if (!data || data.length === 0) {
    emptyEl.classList.remove('d-none');
    contentEl.classList.add('d-none');
    return;
  }
  emptyEl.classList.add('d-none');
  contentEl.classList.remove('d-none');

  // Saldo total e período
  const totalMinutos = data.reduce((sum, d) => sum + d.saldo_minutos, 0);
  const saldoEl = document.getElementById('bh-saldo-total');
  saldoEl.textContent = formatMinutesAsHours(totalMinutos);
  saldoEl.style.color = totalMinutos < 0 ? '#FF9C9C' : '#fff';

  const primeiraData = formatDateBR(data[0].data);
  const ultimaData = formatDateBR(data[data.length - 1].data);
  document.getElementById('bh-periodo').textContent = `Período: ${primeiraData} a ${ultimaData} (${data.length} dia(s) com saldo)`;

  // Gráfico: saldo acumulado ao longo do tempo
  let acumulado = 0;
  const chartLabels = [];
  const chartValues = [];
  data.forEach(d => {
    acumulado += d.saldo_minutos;
    chartLabels.push(formatDateBR(d.data));
    chartValues.push(Math.round(acumulado / 60 * 100) / 100); // em horas, 2 casas
  });

  const ctx = document.getElementById('bh-chart').getContext('2d');
  if (bankHoursChartInstance) bankHoursChartInstance.destroy();
  bankHoursChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [{
        label: 'Saldo acumulado (h)',
        data: chartValues,
        borderColor: '#6B1650',
        backgroundColor: 'rgba(107,22,80,0.08)',
        fill: true,
        tension: 0.25,
        pointRadius: 2
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 6, font: { size: 10 } } },
        y: { ticks: { font: { size: 10 } }, title: { display: true, text: 'horas' } }
      }
    }
  });

  // Maiores créditos e débitos
  const creditos = data.filter(d => d.saldo_minutos > 0).sort((a, b) => b.saldo_minutos - a.saldo_minutos).slice(0, 5);
  const debitos = data.filter(d => d.saldo_minutos < 0).sort((a, b) => a.saldo_minutos - b.saldo_minutos).slice(0, 5);

  const renderTopList = (list, elId) => {
    const el = document.getElementById(elId);
    if (list.length === 0) { el.innerHTML = `<p class="small text-secondary mb-0">Nenhum</p>`; return; }
    el.innerHTML = list.map(d => `
      <div class="d-flex justify-content-between align-items-center small mb-1">
        <span>${formatDateBR(d.data)} ${d.ajustado ? '<span class="cat-badge outro" style="font-size:0.6rem;padding:1px 6px;">ajustado</span>' : ''}</span>
        <span class="fw-semibold">${formatMinutesAsHours(d.saldo_minutos)}</span>
      </div>`).join('');
  };
  renderTopList(creditos, 'bh-top-creditos');
  renderTopList(debitos, 'bh-top-debitos');

  // Resumo por mês
  const byMonth = {};
  data.forEach(d => {
    const key = d.data.slice(0, 7); // 'YYYY-MM'
    byMonth[key] = (byMonth[key] || 0) + d.saldo_minutos;
  });
  let running = 0;
  const monthlyBody = document.getElementById('bh-monthly-body');
  monthlyBody.innerHTML = Object.keys(byMonth).sort().map(key => {
    const [y, m] = key.split('-').map(Number);
    running += byMonth[key];
    return `
      <tr>
        <td>${MONTHS[m - 1]}/${y}</td>
        <td>${formatMinutesAsHours(byMonth[key])}</td>
        <td class="fw-semibold">${formatMinutesAsHours(running)}</td>
      </tr>`;
  }).join('');
}



async function loadMarcacoes() {
  const { data, error } = await supabaseClient
    .from('marcacoes')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('data', { ascending: false })
    .order('horario', { ascending: false });

  if (error) { showToast('Erro ao carregar dados.', 'error'); return; }
  allMarcacoes = data || [];
}

// ---------- registrar ponto ----------

document.getElementById('type-entrada').addEventListener('click', () => setTipo('entrada'));
document.getElementById('type-saida').addEventListener('click', () => setTipo('saida'));

function setTipo(tipo) {
  selectedTipo = tipo;
  document.getElementById('type-entrada').classList.toggle('active', tipo === 'entrada');
  document.getElementById('type-saida').classList.toggle('active', tipo === 'saida');
}

document.getElementById('reg-edit-time-btn').addEventListener('click', () => {
  const fields = document.getElementById('reg-edit-time-fields');
  manualTimeEdit = !manualTimeEdit;
  fields.classList.toggle('d-none', !manualTimeEdit);
  if (manualTimeEdit) {
    const now = new Date();
    document.getElementById('reg-date-input').value = todayISO(now);
    document.getElementById('reg-time-input').value = timeHMS(now);
  }
});

function resetRegisterForm() {
  setTipo('entrada');
  manualTimeEdit = false;
  document.getElementById('reg-edit-time-fields').classList.add('d-none');
  document.getElementById('reg-categoria').value = '';
  document.getElementById('reg-descricao').value = '';
}

document.getElementById('reg-submit-btn').addEventListener('click', async () => {
  if (!currentUser) { showToast('Você precisa estar logado.', 'error'); return; }

  let dataISO, horario, origem;
  if (manualTimeEdit) {
    dataISO = document.getElementById('reg-date-input').value;
    horario = document.getElementById('reg-time-input').value || '00:00:00';
    if (horario.length === 5) horario += ':00';
    origem = 'manual';
  } else {
    const now = new Date();
    dataISO = todayISO(now);
    horario = timeHMS(now);
    origem = 'web';
  }

  const categoria = document.getElementById('reg-categoria').value || null;
  const descricao = document.getElementById('reg-descricao').value.trim() || null;

  const payload = {
    user_id: currentUser.id,
    data: dataISO,
    horario: horario,
    tipo: selectedTipo,
    categoria: categoria,
    descricao: descricao,
    origem: origem
  };

  const btn = document.getElementById('reg-submit-btn');
  btn.disabled = true;
  const { error } = await supabaseClient.from('marcacoes').insert(payload);
  btn.disabled = false;

  if (error) { showToast('Erro ao marcar: ' + error.message, 'error'); return; }

  showToast('Ponto marcado com sucesso!', 'success');
  await loadMarcacoes();
  navigate('home');
});

// ---------- histórico ----------

document.getElementById('hist-tab-list').addEventListener('click', () => {
  document.getElementById('hist-tab-list').classList.add('active');
  document.getElementById('hist-tab-calendar').classList.remove('active');
  document.getElementById('hist-list-view').classList.remove('d-none');
  document.getElementById('hist-calendar-view').classList.add('d-none');
});

document.getElementById('hist-tab-calendar').addEventListener('click', () => {
  document.getElementById('hist-tab-calendar').classList.add('active');
  document.getElementById('hist-tab-list').classList.remove('active');
  document.getElementById('hist-calendar-view').classList.remove('d-none');
  document.getElementById('hist-list-view').classList.add('d-none');
  renderCalendar();
});

document.querySelectorAll('#hist-origin-filters .filter-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#hist-origin-filters .filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    historyOriginFilter = btn.dataset.origem;
    renderHistoryList();
    if (!document.getElementById('hist-calendar-view').classList.contains('d-none')) renderCalendar();
  });
});

function filteredMarcacoes() {
  if (historyOriginFilter === 'todas') return allMarcacoes;
  return allMarcacoes.filter(m => m.origem === historyOriginFilter);
}

function iconForTipo(tipo) {
  return tipo === 'entrada' ? 'bi-box-arrow-in-right' : 'bi-box-arrow-right';
}

function renderHistoryList() {
  const container = document.getElementById('hist-list-container');
  const list = filteredMarcacoes();

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon-badge"><i class="bi bi-inbox fs-4"></i></div>
        <p class="fw-semibold mb-0">Nenhuma marcação encontrada</p>
        <p class="small">Registre seu ponto para ver o histórico aqui.</p>
      </div>`;
    return;
  }

  const groups = {};
  list.forEach(m => { (groups[m.data] ||= []).push(m); });

  let html = '';
  Object.keys(groups).sort().reverse().forEach(dateKey => {
    const [y, mo, d] = dateKey.split('-');
    const dObj = new Date(Number(y), Number(mo) - 1, Number(d));
    html += `<div class="day-heading"><span>${WEEKDAYS[dObj.getDay()]}</span><span class="day-date">${d} De ${MONTHS[dObj.getMonth()]} De ${y}</span></div>`;
    groups[dateKey].forEach(m => {
      const catBadge = m.categoria
        ? `<span class="cat-badge ${m.categoria}">${CATEGORIA_LABEL[m.categoria]}</span>`
        : '';
      html += `
        <div class="entry-row">
          <div class="icon-circle ${m.tipo === 'saida' ? 'saida' : ''}"><i class="bi ${iconForTipo(m.tipo)}"></i></div>
          <div class="flex-grow-1">
            <div><span class="entry-time">${m.horario.slice(0,5)}</span> <span class="entry-origin text-capitalize">${m.origem}</span></div>
            ${m.descricao ? `<div class="entry-desc">${escapeHTML(m.descricao)}</div>` : ''}
            <div>${catBadge}</div>
          </div>
          <div class="entry-actions">
            <button data-edit="${m.id}" title="Editar"><i class="bi bi-pencil"></i></button>
            <button data-del="${m.id}" title="Excluir"><i class="bi bi-trash"></i></button>
          </div>
        </div>`;
    });
  });
  container.innerHTML = html;

  container.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => deleteMarcacao(btn.dataset.del));
  });
  container.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.edit));
  });
}

async function deleteMarcacao(id) {
  if (!confirm('Excluir esta marcação?')) return;
  const { error } = await supabaseClient.from('marcacoes').delete().eq('id', id);
  if (error) { showToast('Erro ao excluir.', 'error'); return; }
  showToast('Marcação excluída.', 'success');
  await loadMarcacoes();
  renderHistoryList();
}

// ---------- editar marcação ----------

let editModalInstance = null;
let editSelectedTipo = 'entrada';

function getEditModal() {
  if (!editModalInstance) {
    editModalInstance = new bootstrap.Modal(document.getElementById('edit-modal'));
  }
  return editModalInstance;
}

function setEditTipo(tipo) {
  editSelectedTipo = tipo;
  document.getElementById('edit-type-entrada').classList.toggle('active', tipo === 'entrada');
  document.getElementById('edit-type-saida').classList.toggle('active', tipo === 'saida');
}

document.getElementById('edit-type-entrada').addEventListener('click', () => setEditTipo('entrada'));
document.getElementById('edit-type-saida').addEventListener('click', () => setEditTipo('saida'));

function openEditModal(id) {
  const m = allMarcacoes.find(x => x.id === id);
  if (!m) { showToast('Marcação não encontrada.', 'error'); return; }

  document.getElementById('edit-id').value = m.id;
  document.getElementById('edit-date-input').value = m.data;
  document.getElementById('edit-time-input').value = m.horario;
  document.getElementById('edit-categoria').value = m.categoria || '';
  document.getElementById('edit-descricao').value = m.descricao || '';
  setEditTipo(m.tipo);

  getEditModal().show();
}

document.getElementById('edit-save-btn').addEventListener('click', async () => {
  const id = document.getElementById('edit-id').value;
  const dataISO = document.getElementById('edit-date-input').value;
  let horario = document.getElementById('edit-time-input').value;
  if (!dataISO || !horario) { showToast('Preencha data e horário.', 'error'); return; }
  if (horario.length === 5) horario += ':00';

  const categoria = document.getElementById('edit-categoria').value || null;
  const descricao = document.getElementById('edit-descricao').value.trim() || null;

  const btn = document.getElementById('edit-save-btn');
  btn.disabled = true;
  const { error } = await supabaseClient
    .from('marcacoes')
    .update({
      data: dataISO,
      horario: horario,
      tipo: editSelectedTipo,
      categoria: categoria,
      descricao: descricao,
      origem: 'manual'
    })
    .eq('id', id);
  btn.disabled = false;

  if (error) { showToast('Erro ao salvar: ' + error.message, 'error'); return; }

  getEditModal().hide();
  showToast('Marcação atualizada!', 'success');
  await loadMarcacoes();
  renderHistoryList();
  if (!document.getElementById('hist-calendar-view').classList.contains('d-none')) {
    renderCalendar();
  }
});

document.getElementById('hist-export-btn').addEventListener('click', () => {
  const list = filteredMarcacoes();
  if (list.length === 0) { showToast('Nada para exportar.', 'error'); return; }
  const rows = [['Data','Horário','Tipo','Categoria','Descrição','Origem']];
  list.forEach(m => rows.push([
    m.data, m.horario, m.tipo,
    m.categoria ? CATEGORIA_LABEL[m.categoria] : '',
    (m.descricao || '').replace(/\n/g, ' '),
    m.origem
  ]));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'historico_pontocerto.csv';
  link.click();
});

// ---------- calendário ----------

document.getElementById('cal-prev').addEventListener('click', () => { calendarCursor.setMonth(calendarCursor.getMonth() - 1); renderCalendar(); });
document.getElementById('cal-next').addEventListener('click', () => { calendarCursor.setMonth(calendarCursor.getMonth() + 1); renderCalendar(); });

function renderCalendar() {
  const y = calendarCursor.getFullYear();
  const m = calendarCursor.getMonth();
  document.getElementById('cal-month-label').textContent = `${MONTHS[m]} ${y}`;

  const list = filteredMarcacoes().filter(mk => {
    const [my, mm] = mk.data.split('-').map(Number);
    return my === y && mm === m + 1;
  });
  const byDay = {};
  list.forEach(mk => { const d = Number(mk.data.split('-')[2]); (byDay[d] ||= []).push(mk); });

  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const dowLabels = ['D','S','T','Q','Q','S','S'];
  let html = dowLabels.map(l => `<div class="cal-dow">${l}</div>`).join('');
  for (let i = 0; i < firstDow; i++) html += `<div class="cal-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const has = !!byDay[d];
    html += `<div class="cal-day ${has ? 'has-entry' : ''}" data-day="${d}">${d}${has ? '<span class="dot"></span>' : ''}</div>`;
  }
  document.getElementById('calendar-grid').innerHTML = html;

  document.querySelectorAll('#calendar-grid .cal-day[data-day]').forEach(el => {
    el.addEventListener('click', () => {
      selectedCalDay = Number(el.dataset.day);
      renderCalDayEntries(byDay[selectedCalDay] || []);
    });
  });
  document.getElementById('cal-day-entries').innerHTML = '';
}

function renderCalDayEntries(entries) {
  const wrap = document.getElementById('cal-day-entries');
  if (entries.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><p class="small mb-0">Sem marcações neste dia.</p></div>`;
    return;
  }
  wrap.innerHTML = entries.map(m => `
    <div class="entry-row">
      <div class="icon-circle ${m.tipo === 'saida' ? 'saida' : ''}"><i class="bi ${iconForTipo(m.tipo)}"></i></div>
      <div class="flex-grow-1">
        <div><span class="entry-time">${m.horario.slice(0,5)}</span> <span class="entry-origin text-capitalize">${m.origem}</span></div>
        ${m.descricao ? `<div class="entry-desc">${escapeHTML(m.descricao)}</div>` : ''}
        ${m.categoria ? `<span class="cat-badge ${m.categoria}">${CATEGORIA_LABEL[m.categoria]}</span>` : ''}
      </div>
      <div class="entry-actions">
        <button data-edit="${m.id}" title="Editar"><i class="bi bi-pencil"></i></button>
        <button data-del="${m.id}" title="Excluir"><i class="bi bi-trash"></i></button>
      </div>
    </div>`).join('');
  wrap.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => deleteMarcacao(btn.dataset.del));
  });
  wrap.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.edit));
  });
}

// ---------- cálculo de horas trabalhadas / intervalo ----------

function timeToMinutes(t) {
  const [h, m, s] = t.split(':').map(Number);
  return h * 60 + m + (s || 0) / 60;
}

function parseSaldoToMinutes(saldoStr) {
  const match = saldoStr.trim().match(/^(-)?(\d{1,3}):(\d{2})$/);
  if (!match) return 0;
  const total = Number(match[2]) * 60 + Number(match[3]);
  return match[1] ? -total : total;
}

function formatMinutesAsHours(min) {
  const sign = min < 0 ? '-' : '';
  min = Math.abs(Math.round(min));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${sign}${h}h${String(m).padStart(2, '0')}`;
}

// Pareia Entrada -> Saída em ordem cronológica e soma o tempo trabalhado bruto.
function grossMinutesForDay(entriesOfDay) {
  const sorted = entriesOfDay.slice().sort((a, b) => a.horario.localeCompare(b.horario));
  let gross = 0;
  let openEntrada = null;
  sorted.forEach(e => {
    if (e.tipo === 'entrada') {
      openEntrada = timeToMinutes(e.horario);
    } else if (e.tipo === 'saida' && openEntrada !== null) {
      const end = timeToMinutes(e.horario);
      if (end > openEntrada) gross += (end - openEntrada);
      openEntrada = null;
    }
  });
  return gross;
}

// Regra de intervalo: acima de 6h → 1h; acima de 4h → 15min; senão, sem desconto.
function breakMinutesForGross(grossMin) {
  if (grossMin > 360) return 60;
  if (grossMin > 240) return 15;
  return 0;
}

function dailyHoursSummary(list) {
  const groups = {};
  list.forEach(m => { (groups[m.data] ||= []).push(m); });

  return Object.keys(groups).sort().map(dateKey => {
    const gross = grossMinutesForDay(groups[dateKey]);
    const brk = breakMinutesForGross(gross);
    const net = Math.max(gross - brk, 0);
    return { data: dateKey, gross, brk, net };
  });
}



// ---------- preencher PDF do RH automaticamente ----------

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

let pdfUploadedBytes = null;   // ArrayBuffer do PDF carregado (limpo depois do uso)
let pdfDownloadUrl = null;     // Object URL do PDF preenchido (revogado depois do uso)
let originalPdfUrl = null;     // Object URL do PDF original, sem alterações (para anexar por e-mail)
let originalPdfName = null;
let lastDebitoDays = [];       // dias marcados como "Débito" no último PDF processado

function isoToBRShort(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

function clearPdfState() {
  pdfUploadedBytes = null;
  if (pdfDownloadUrl) { URL.revokeObjectURL(pdfDownloadUrl); pdfDownloadUrl = null; }
  if (originalPdfUrl) { URL.revokeObjectURL(originalPdfUrl); originalPdfUrl = null; }
  originalPdfName = null;
  const input = document.getElementById('pdf-upload-input');
  const link = document.getElementById('pdf-download-link');
  const status = document.getElementById('pdf-status');
  if (input) input.value = '';
  if (link) link.classList.add('d-none');
  if (status) status.textContent = '';
}

document.getElementById('pdf-upload-input').addEventListener('change', () => {
  const status = document.getElementById('pdf-status');
  const link = document.getElementById('pdf-download-link');
  link.classList.add('d-none');
  if (pdfDownloadUrl) { URL.revokeObjectURL(pdfDownloadUrl); pdfDownloadUrl = null; }
  status.textContent = '';
});

// Extrai, do texto de um PDF, a linha de cada data e as posições de colunas relevantes.
async function extractPdfRowMap(arrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
  const pdfDoc = await loadingTask.promise;
  const rowsMap = {}; // 'DD/MM/YY' -> dados da linha
  let lastMeta = null;

  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page = await pdfDoc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items;

    // Posições de cabeçalho desta página
    let motivoX = null, justificarX = null, justificarWidth = null;
    let marcacoesColStart = null, saldoX = null;
    const marColumns = []; // [{n, x}] para 1ªMar..8ªMar

    items.forEach(it => {
      const txt = it.str.trim();
      if (txt === 'Motivo') motivoX = it.transform[4];
      if (txt === 'Justificar') { justificarX = it.transform[4]; justificarWidth = it.width; }
      if (txt.includes('Marcações')) marcacoesColStart = it.transform[4];
      if (txt === 'Saldo') saldoX = it.transform[4];
      const marMatch = txt.match(/^(\d)ªMar$/);
      if (marMatch) marColumns.push({ n: Number(marMatch[1]), x: it.transform[4] });
    });
    marColumns.sort((a, b) => a.n - b.n);

    let meta = { motivoX, justificarX, justificarWidth, marcacoesColStart, saldoX, marColumns };
    // se algum dado não apareceu nesta página (ex. continuação), reaproveita da página anterior
    if (motivoX === null || justificarX === null || marColumns.length === 0) {
      meta = lastMeta ? { ...lastMeta } : meta;
    } else {
      lastMeta = meta;
    }

    const writeStartX = (meta.justificarX !== null && meta.justificarWidth !== null)
      ? meta.justificarX + meta.justificarWidth + 4
      : (meta.motivoX !== null ? meta.motivoX + 2 : null);

    const marcacoesColEnd = meta.marColumns.length > 0 ? meta.marColumns[0].x - 4 : meta.motivoX;

    const dateItems = items.filter(it => /^\d{2}\/\d{2}\/\d{2}$/.test(it.str.trim()));

    dateItems.forEach(dIt => {
      const dateStr = dIt.str.trim();
      const y = dIt.transform[5];

      // Texto da coluna "Justificar" nessa linha (Crédito / Débito / Ímpar / Falta / vazio)
      let justificarLabel = '';
      if (meta.justificarX !== null && meta.motivoX !== null) {
        const found = items.find(it => {
          if (it === dIt) return false;
          const y2 = it.transform[5];
          const x2 = it.transform[4];
          return Math.abs(y2 - y) < 3 && x2 >= meta.justificarX - 2 && x2 < meta.motivoX - 2 && it.str.trim() !== '';
        });
        if (found) justificarLabel = found.str.trim();
      }

      // Valor do "Saldo do dia" nessa linha (ex.: "-0:44"), fica entre a última coluna Mar e Justificar
      let saldoValue = '';
      if (meta.saldoX !== null && meta.justificarX !== null) {
        const found = items.find(it => {
          const y2 = it.transform[5];
          const x2 = it.transform[4];
          return Math.abs(y2 - y) < 3 && x2 >= meta.saldoX - 2 && x2 < meta.justificarX - 2
            && /^-?\d{1,3}:\d{2}$/.test(it.str.trim());
        });
        if (found) saldoValue = found.str.trim();
      }

      // Horários já registrados no relógio eletrônico, nessa linha
      const officialTimes = items
        .filter(it => {
          const y2 = it.transform[5];
          const x2 = it.transform[4];
          return Math.abs(y2 - y) < 3
            && marcacoesColStart !== null && x2 >= marcacoesColStart - 2
            && x2 < marcacoesColEnd
            && /^\d{2}:\d{2}$/.test(it.str.trim());
        })
        .map(it => it.str.trim());

      rowsMap[dateStr] = {
        page: p,
        y,
        writeStartX,
        pageMotivoX: meta.motivoX,
        justificarLabel,
        saldoValue,
        officialTimes,
        marColumns: meta.marColumns,
        saldoX: meta.saldoX
      };
    });
  }
  return rowsMap;
}

// Palavra por palavra, quebra o texto em linhas que cabem em maxWidth.
function wrapTextToWidth(text, font, size, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  words.forEach(word => {
    const candidate = current ? current + ' ' + word : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines;
}

document.getElementById('pdf-process-btn').addEventListener('click', async () => {
  const fileInput = document.getElementById('pdf-upload-input');
  const status = document.getElementById('pdf-status');
  const link = document.getElementById('pdf-download-link');

  if (!fileInput.files.length) { showToast('Selecione um arquivo PDF primeiro.', 'error'); return; }
  const file = fileInput.files[0];

  status.textContent = 'Lendo o PDF...';
  link.classList.add('d-none');

  try {
    pdfUploadedBytes = await file.arrayBuffer();

    const rowsMap = await extractPdfRowMap(pdfUploadedBytes);

    // Usa todas as marcações do usuário, não só as do mês selecionado no seletor do
    // Relatório Mensal — o PDF pode ter um período diferente do que está selecionado ali.
    const monthEntries = allMarcacoes;
    const correctedSaldoByDate = {}; // dateBR -> minutos corrigidos (dias "Ímpar" recalculados pela Escala)
    const byDay = {};
    monthEntries.forEach(m => { (byDay[m.data] ||= []).push(m); });

    const filledMotivo = [];
    const filledMarcacoes = [];
    const pendingManual = [];

    const pdfLibDoc = await PDFLib.PDFDocument.load(pdfUploadedBytes);
    const pages = pdfLibDoc.getPages();
    const font = await pdfLibDoc.embedFont(PDFLib.StandardFonts.Helvetica);

    Object.keys(byDay).forEach(dataISO => {
      const dateBR = isoToBRShort(dataISO);
      const row = rowsMap[dateBR];
      if (!row) return; // data não encontrada nesse PDF

      const needsJustification = row.justificarLabel !== '';
      const page = pages[row.page - 1];

      // ---- 1) Preenche o Motivo (só se essa linha pede justificativa) ----
      if (needsJustification) {
        const descricoes = [...new Set(
          byDay[dataISO].map(m => (m.descricao || '').trim()).filter(Boolean)
        )];
        const motivoText = descricoes.join('; ');

        if (motivoText && row.writeStartX !== null) {
          const pageWidth = page.getWidth();
          const maxWidth = pageWidth - row.writeStartX - 15;

          let fontSize = 7;
          let lines = wrapTextToWidth(motivoText, font, fontSize, maxWidth);
          if (lines.length > 2) {
            fontSize = 6;
            lines = wrapTextToWidth(motivoText, font, fontSize, maxWidth);
          }
          if (lines.length > 2) {
            lines = [lines[0], lines[1].slice(0, Math.max(0, lines[1].length - 3)) + '...'];
          }

          lines.slice(0, 2).forEach((line, idx) => {
            page.drawText(line, {
              x: row.writeStartX,
              y: row.y - idx * (fontSize + 1.5),
              size: fontSize,
              font: font,
              color: PDFLib.rgb(0.16, 0.08, 0.12)
            });
          });
          filledMotivo.push(dateBR);
        } else if (!motivoText) {
          pendingManual.push(`${dateBR} (Motivo: sem descrição registrada no PontoCerto)`);
        }
      }
    });

    // ---- 2) Preenche 1ªMar..8ªMar com a sequência completa do dia (todas as linhas "Ímpar" do PDF) ----
    Object.keys(rowsMap)
      .filter(dateBR => rowsMap[dateBR].justificarLabel === 'Ímpar' && rowsMap[dateBR].marColumns.length > 0)
      .forEach(dateBR => {
        const row = rowsMap[dateBR];
        const page = pages[row.page - 1];

        const [d, m, y2] = dateBR.split('/').map(Number);
        const dataISO = `${2000 + y2}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const pontoCertoTimes = (byDay[dataISO] || []).map(mk => mk.horario.slice(0, 5));

        const allKnown = [...new Set([...row.officialTimes, ...pontoCertoTimes])]
          .map(t => { const [h, min] = t.split(':').map(Number); return { t, mins: h * 60 + min }; })
          .sort((a, b) => a.mins - b.mins);

        if (allKnown.length >= 2) {
          const weekdayIdx = new Date(dataISO + 'T00:00:00').getDay(); // 0=domingo..6=sábado
          const weekdayKey = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'][weekdayIdx];
          const daySchedule = (currentProfile.schedule || {})[weekdayKey];

          const entradaTime = allKnown[0].t;
          const saidaTime = allKnown[allKnown.length - 1].t;

          const scheduleHasBreak = daySchedule && daySchedule.tipo === 'normal'
            && daySchedule['intervalo-saida'] && daySchedule['intervalo-retorno'];

          let sequence;
          if (scheduleHasBreak) {
            // A escala da pessoa já define os horários exatos do intervalo daquele dia —
            // usamos esses valores diretamente, sem aplicar nenhuma regra genérica por cima.
            sequence = [entradaTime, daySchedule['intervalo-saida'], daySchedule['intervalo-retorno'], saidaTime];
          } else {
            sequence = [entradaTime, saidaTime];
            if (!daySchedule || daySchedule.tipo !== 'normal') {
              pendingManual.push(`${dateBR} (configure a Escala de Trabalho desse dia da semana para completar o intervalo automaticamente, se houver)`);
            }
          }

          sequence.slice(0, row.marColumns.length).forEach((timeStr, idx) => {
            const col = row.marColumns[idx];
            const nextX = row.marColumns[idx + 1] ? row.marColumns[idx + 1].x : (row.saldoX || col.x + 40);
            const colWidth = nextX - col.x;
            const textWidth = font.widthOfTextAtSize(timeStr, 7);
            const x = col.x + Math.max(0, (colWidth - textWidth) / 2);

            page.drawText(timeStr, {
              x: x,
              y: row.y,
              size: 7,
              font: font,
              color: PDFLib.rgb(0.16, 0.08, 0.12)
            });
          });

          filledMarcacoes.push(`${dateBR} (${sequence.join(', ')})`);

          // Recalcula o saldo real do dia usando a sequência reconstruída, em vez do valor
          // bruto do PDF (que costuma vir artificialmente exagerado em dias "Ímpar", já que
          // o sistema oficial só enxergou 1 marcação isolada quando calculou aquele número).
          if (daySchedule && daySchedule.tipo === 'normal' && daySchedule.entrada && daySchedule.saida) {
            const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
            const scheduledBreak = scheduleHasBreak
              ? (toMin(daySchedule['intervalo-retorno']) - toMin(daySchedule['intervalo-saida']))
              : 0;
            const scheduledWorked = (toMin(daySchedule.saida) - toMin(daySchedule.entrada)) - scheduledBreak;

            const actualBreak = scheduleHasBreak
              ? (toMin(sequence[2]) - toMin(sequence[1]))
              : 0;
            const actualWorked = (toMin(saidaTime) - toMin(entradaTime)) - actualBreak;

            correctedSaldoByDate[dateBR] = actualWorked - scheduledWorked;
          }
        } else {
          pendingManual.push(`${dateBR} (só ${allKnown.length} horário(s) conhecido(s) — registre a marcação que faltou no PontoCerto e reprocesse)`);
        }
      });

    const savedBytes = await pdfLibDoc.save();
    const blob = new Blob([savedBytes], { type: 'application/pdf' });
    if (pdfDownloadUrl) URL.revokeObjectURL(pdfDownloadUrl);
    pdfDownloadUrl = URL.createObjectURL(blob);

    link.href = pdfDownloadUrl;
    link.download = 'preenchido_' + (file.name || 'relatorio_pontocerto.pdf');
    link.classList.remove('d-none');

    // Guarda os dias marcados como "Débito" (todos, não só os que têm marcação no PontoCerto)
    // para reaproveitar na Carta de Compensação de Horas.
    lastDebitoDays = Object.keys(rowsMap)
      .filter(dateBR => rowsMap[dateBR].justificarLabel === 'Débito' && rowsMap[dateBR].saldoValue)
      .map(dateBR => {
        const [d, m, y2] = dateBR.split('/').map(Number);
        const match = rowsMap[dateBR].saldoValue.match(/^-?(\d{1,3}):(\d{2})$/);
        return {
          day: d, month: m, year: 2000 + y2,
          hours: match ? Number(match[1]) : 0,
          minutes: match ? Number(match[2]) : 0,
          dateBR
        };
      })
      .sort((a, b) => (a.year - b.year) || (a.month - b.month) || (a.day - b.day));

    // Importa o saldo de TODOS os dias do PDF (não só Débito) para o Banco de Horas.
    // Para dias "Ímpar" que conseguimos recalcular, usamos o valor corrigido em vez do bruto.
    const bancoHorasRows = Object.keys(rowsMap)
      .filter(dateBR => rowsMap[dateBR].saldoValue || correctedSaldoByDate[dateBR] !== undefined)
      .map(dateBR => {
        const [d, m, y2] = dateBR.split('/').map(Number);
        const dataISO = `${2000 + y2}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const hasCorrection = correctedSaldoByDate[dateBR] !== undefined;
        return {
          user_id: currentUser.id,
          data: dataISO,
          saldo_minutos: hasCorrection ? correctedSaldoByDate[dateBR] : parseSaldoToMinutes(rowsMap[dateBR].saldoValue),
          tipo: rowsMap[dateBR].justificarLabel || null,
          ajustado: hasCorrection
        };
      });

    let bancoHorasImportError = null;
    if (bancoHorasRows.length > 0) {
      const { error: bhError } = await supabaseClient
        .from('banco_horas_dias')
        .upsert(bancoHorasRows, { onConflict: 'user_id,data' });
      bancoHorasImportError = bhError;
    }

    let statusMsg = filledMotivo.length > 0
      ? `Motivo preenchido em: ${filledMotivo.join(', ')}.`
      : 'Nenhum Motivo foi preenchido automaticamente.';
    if (filledMarcacoes.length > 0) {
      statusMsg += ` Horários complementados (1ªMar+): ${filledMarcacoes.join(' | ')}.`;
    }
    if (pendingManual.length > 0) {
      statusMsg += ` Precisam de atenção manual: ${pendingManual.join('; ')}.`;
    }
    if (lastDebitoDays.length > 0) {
      statusMsg += ` ${lastDebitoDays.length} dia(s) de Débito identificado(s) — já disponíveis para a Carta de Compensação abaixo.`;
    }
    if (bancoHorasImportError) {
      statusMsg += ` Atenção: não foi possível atualizar o Banco de Horas (${bancoHorasImportError.message}).`;
    } else if (bancoHorasRows.length > 0) {
      statusMsg += ` Banco de Horas atualizado com ${bancoHorasRows.length} dia(s).`;
    }
    status.textContent = statusMsg;
    showToast('PDF processado!', 'success');

    // Guarda uma cópia do PDF original (sem alterações) para o fluxo de e-mail,
    // antes de descartar os bytes carregados.
    if (originalPdfUrl) URL.revokeObjectURL(originalPdfUrl);
    originalPdfUrl = URL.createObjectURL(new Blob([pdfUploadedBytes], { type: 'application/pdf' }));
    originalPdfName = file.name || 'relatorio_original.pdf';

    pdfUploadedBytes = null;
    fileInput.value = '';

  } catch (err) {
    console.error(err);
    status.textContent = '';
    showToast('Não foi possível processar esse PDF. Confira se é o modelo da Senac.', 'error');
    pdfUploadedBytes = null;
  }
});

// ---------- carta de compensação de horas (Excel) ----------

let xlsxDownloadUrl = null;

function clearXlsxState() {
  if (xlsxDownloadUrl) { URL.revokeObjectURL(xlsxDownloadUrl); xlsxDownloadUrl = null; }
  const input = document.getElementById('xlsx-upload-input');
  const link = document.getElementById('xlsx-download-link');
  const status = document.getElementById('xlsx-status');
  if (input) input.value = '';
  if (link) link.classList.add('d-none');
  if (status) status.textContent = '';
}

document.getElementById('xlsx-upload-input').addEventListener('change', () => {
  const link = document.getElementById('xlsx-download-link');
  const status = document.getElementById('xlsx-status');
  link.classList.add('d-none');
  if (xlsxDownloadUrl) { URL.revokeObjectURL(xlsxDownloadUrl); xlsxDownloadUrl = null; }
  status.textContent = '';
});

document.getElementById('xlsx-process-btn').addEventListener('click', async () => {
  const fileInput = document.getElementById('xlsx-upload-input');
  const status = document.getElementById('xlsx-status');
  const link = document.getElementById('xlsx-download-link');

  if (!fileInput.files.length) { showToast('Selecione o arquivo Excel modelo primeiro.', 'error'); return; }
  if (lastDebitoDays.length === 0) {
    showToast('Processe o PDF do RH acima primeiro, para identificarmos os dias de Débito.', 'error');
    return;
  }
  if (!currentProfile.full_name || !currentProfile.registro) {
    showToast('Preencha seu nome completo e registro em "Minha Conta" antes de gerar a carta.', 'error');
    return;
  }

  const file = fileInput.files[0];
  status.textContent = 'Preenchendo a planilha...';
  link.classList.add('d-none');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    const ws = workbook.worksheets[0];

    const today = new Date();

    // Data da carta (hoje) — linha 6
    ws.getCell('R6').value = today.getDate();
    ws.getCell('U6').value = MONTHS[today.getMonth()];
    ws.getCell('AB6').value = today.getFullYear();

    // Dados do funcionário — linha 12
    ws.getCell('C12').value = currentProfile.full_name;
    ws.getCell('U12').value = currentProfile.registro;

    // Linhas de ausências — de 17 a 36 (20 linhas disponíveis no modelo)
    const maxRows = 20;
    const startRow = 17;
    const toFill = lastDebitoDays.slice(0, maxRows);

    toFill.forEach((d, idx) => {
      const r = startRow + idx;
      ws.getCell(`D${r}`).value = d.day;
      ws.getCell(`G${r}`).value = d.month;
      ws.getCell(`J${r}`).value = d.year;
      ws.getCell(`N${r}`).value = d.hours;
      ws.getCell(`R${r}`).value = d.minutes;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    if (xlsxDownloadUrl) URL.revokeObjectURL(xlsxDownloadUrl);
    xlsxDownloadUrl = URL.createObjectURL(blob);

    link.href = xlsxDownloadUrl;
    link.download = 'carta_compensacao_' + MONTHS[document.getElementById('report-month').value - 1] + '.xlsx';
    link.classList.remove('d-none');

    let msg = `${toFill.length} dia(s) preenchido(s): ${toFill.map(d => `${String(d.day).padStart(2,'0')}/${String(d.month).padStart(2,'0')}`).join(', ')}.`;
    if (lastDebitoDays.length > maxRows) {
      msg += ` Atenção: havia ${lastDebitoDays.length} dias de débito, mas a planilha só tem ${maxRows} linhas — os demais precisam ser preenchidos manualmente ou enviados em uma segunda carta.`;
    }
    status.textContent = msg;
    showToast('Carta gerada!', 'success');

    fileInput.value = '';
  } catch (err) {
    console.error(err);
    status.textContent = '';
    showToast('Não foi possível preencher essa planilha. Confira se é o modelo correto.', 'error');
  }
});

function populateReportSelectors() {
  const monthSel = document.getElementById('report-month');
  const yearSel = document.getElementById('report-year');
  if (monthSel.options.length === 0) {
    MONTHS.forEach((name, idx) => {
      const opt = document.createElement('option');
      opt.value = idx + 1;
      opt.textContent = name.toLowerCase();
      monthSel.appendChild(opt);
    });
    const now = new Date();
    const startYear = now.getFullYear() - 2;
    for (let y = startYear; y <= now.getFullYear() + 1; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      yearSel.appendChild(opt);
    }
    monthSel.value = now.getMonth() + 1;
    yearSel.value = now.getFullYear();
    monthSel.addEventListener('change', renderReport);
    yearSel.addEventListener('change', renderReport);
  }
}

function currentReportEntries() {
  const month = Number(document.getElementById('report-month').value);
  const year = Number(document.getElementById('report-year').value);
  return allMarcacoes
    .filter(m => {
      const [y, mo] = m.data.split('-').map(Number);
      return y === year && mo === month;
    })
    .sort((a, b) => (a.data + a.horario).localeCompare(b.data + b.horario))
    .reverse();
}

function renderReport() {
  const month = Number(document.getElementById('report-month').value);
  const year = Number(document.getElementById('report-year').value);
  const list = currentReportEntries();

  document.getElementById('report-title').textContent = `${MONTHS[month - 1]} / ${year}`;
  document.getElementById('report-count').textContent = `${list.length} marcação(ões) registrada(s)`;

  const body = document.getElementById('report-table-body');
  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="text-secondary text-center py-4">Nenhuma marcação neste período.</td></tr>`;
    renderHoursSummary(list);
    return;
  }
  body.innerHTML = list.map(m => `
    <tr>
      <td>${formatDateBR(m.data)}</td>
      <td>${m.horario.slice(0,5)}</td>
      <td class="text-capitalize">${m.tipo}</td>
      <td>${m.categoria ? CATEGORIA_LABEL[m.categoria] : '-'}</td>
      <td>${escapeHTML(m.descricao || '')}</td>
    </tr>`).join('');

  renderHoursSummary(list);
}

function renderHoursSummary(list) {
  const summary = dailyHoursSummary(list);
  const body = document.getElementById('hours-summary-body');

  if (summary.length === 0) {
    body.innerHTML = `<tr><td colspan="4" class="text-secondary text-center py-3">Sem dados para calcular.</td></tr>`;
    document.getElementById('hours-summary-total-gross').textContent = '—';
    document.getElementById('hours-summary-total-break').textContent = '—';
    document.getElementById('hours-summary-total-net').textContent = '—';
    return;
  }

  let totalGross = 0, totalBreak = 0, totalNet = 0;
  body.innerHTML = summary.map(d => {
    totalGross += d.gross; totalBreak += d.brk; totalNet += d.net;
    return `
      <tr>
        <td>${formatDateBR(d.data)}</td>
        <td>${formatMinutesAsHours(d.gross)}</td>
        <td>${d.brk > 0 ? formatMinutesAsHours(d.brk) : '-'}</td>
        <td class="fw-semibold">${formatMinutesAsHours(d.net)}</td>
      </tr>`;
  }).join('');

  document.getElementById('hours-summary-total-gross').textContent = formatMinutesAsHours(totalGross);
  document.getElementById('hours-summary-total-break').textContent = formatMinutesAsHours(totalBreak);
  document.getElementById('hours-summary-total-net').textContent = formatMinutesAsHours(totalNet);
}

document.getElementById('report-pdf-btn').addEventListener('click', () => {
  window.print();
});

function triggerFileDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

document.getElementById('report-email-btn').addEventListener('click', async () => {
  const rhEmail = document.getElementById('report-rh-email').value.trim();
  const month = Number(document.getElementById('report-month').value);
  const monthName = MONTHS[month - 1];
  const fullName = currentProfile.full_name || currentUser?.user_metadata?.username || '';

  const filledPdfLink = document.getElementById('pdf-download-link');
  const xlsxLink = document.getElementById('xlsx-download-link');
  const hasFilledPdf = !filledPdfLink.classList.contains('d-none') && filledPdfLink.href;
  const hasOriginalPdf = !!originalPdfUrl;
  const hasXlsx = !xlsxLink.classList.contains('d-none') && xlsxLink.href;

  const missing = [];
  if (!hasOriginalPdf || !hasFilledPdf) missing.push('PDF (processe-o na seção acima)');
  if (!hasXlsx) missing.push('Carta de Compensação em Excel (gere-a na seção acima)');

  if (missing.length > 0) {
    showToast('Antes de enviar, gere: ' + missing.join(' e ') + '.', 'error');
    return;
  }

  const subject = `PONTO ${monthName} - ${fullName}`;
  let body = `Olá!!!\nSegue justificativa do ponto do mês ${monthName}\n\nObrigado.`;
  if (rhEmail) body += `\n\n(Destinatário: ${rhEmail})`;

  // Celular: usa o compartilhamento nativo, que anexa os arquivos de verdade
  if (navigator.share && navigator.canShare) {
    try {
      const [originalPdfBlob, filledPdfBlob, xlsxBlob] = await Promise.all([
        fetch(originalPdfUrl).then(r => r.blob()),
        fetch(filledPdfLink.href).then(r => r.blob()),
        fetch(xlsxLink.href).then(r => r.blob())
      ]);
      const files = [
        new File([originalPdfBlob], originalPdfName, { type: 'application/pdf' }),
        new File([filledPdfBlob], filledPdfLink.download, { type: 'application/pdf' }),
        new File([xlsxBlob], xlsxLink.download, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      ];
      if (navigator.canShare({ files })) {
        await navigator.share({ files, title: subject, text: body });
        showToast('Escolha o app de e-mail no menu de compartilhamento.', 'success');
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return; // usuário cancelou o compartilhamento
      // qualquer outro erro cai no fallback de baixar + mailto abaixo
    }
  }

  // Computador (ou navegador sem suporte a compartilhamento): baixa os arquivos e abre o e-mail
  triggerFileDownload(originalPdfUrl, originalPdfName);
  setTimeout(() => triggerFileDownload(filledPdfLink.href, filledPdfLink.download), 300);
  setTimeout(() => triggerFileDownload(xlsxLink.href, xlsxLink.download), 600);

  const mailto = `mailto:${encodeURIComponent(rhEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  setTimeout(() => { window.location.href = mailto; }, 900);

  showToast('3 arquivos baixados — anexe-os no e-mail que vai abrir.', 'success');
});

// ---------- helpers ----------

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- boot ----------

checkExistingSession();
tickClocks();
