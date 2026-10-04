const db = createDB();
const $ = id => document.getElementById(id);

let allRows = [];
let presentIdx = 0;
let refreshTimer = null;

/* ---------- ПОДСЧЁТ ТОЛЬКО ИЗ РЕАЛЬНЫХ ДАННЫХ ---------- */
function computeStats(rows) {
  const students = {};
  rows.forEach(r => {
    if (!students[r.student_name]) students[r.student_name] = { correct: 0, total: 0 };
    students[r.student_name].total++;
    if (r.is_correct) students[r.student_name].correct++;
  });
  const numStudents = Object.keys(students).length;
  const totalAnswers = rows.length;

  let sumPct = 0, best = 0;
  Object.values(students).forEach(s => {
    const pct = s.total ? (s.correct / s.total * 100) : 0;
    sumPct += pct;
    if (s.correct > best) best = s.correct;
  });
  const avgPct = numStudents ? Math.round(sumPct / numStudents) : 0;

  let bestNames = [];
  Object.keys(students).forEach(name => {
    if (best > 0 && students[name].correct === best) bestNames.push(name);
  });
  const bestName = bestNames.length ? bestNames.join(', ') : '—';

  const perQ = {};
  for (let q = 1; q <= TOTAL_QUESTIONS; q++) perQ[q] = { counts: [0,0,0,0], total: 0 };
  rows.forEach(r => {
    if (perQ[r.question_id]) {
      if (r.answer >= 0 && r.answer <= 3) perQ[r.question_id].counts[r.answer]++;
      perQ[r.question_id].total++;
    }
  });
  return { numStudents, totalAnswers, avgPct, best, bestName, perQ };
}

async function fetchAndRender() {
  if (!db) return;
  setLive('загрузка…', false);
  const { data, error } = await db.from('responses')
    .select('student_name,question_id,answer,is_correct');
  if (error) { setLive('ошибка БД', false); return; }
  allRows = data || [];
  renderAll();
  setLive('онлайн', true);
}

function renderAll() {
  const s = computeStats(allRows);
  $('t-students').textContent = s.numStudents;
  $('t-answers').textContent = s.totalAnswers;
  $('t-avg').textContent = s.avgPct + '%';
  renderTable(s);
  renderCharts(s);
  renderFinals(s);
  renderPresent();
}

function renderTable(s) {
  const tb = $('stats-tbody'); tb.innerHTML = '';
  for (let q = 1; q <= TOTAL_QUESTIONS; q++) {
    const info = s.perQ[q];
    const correctIdx = QUESTIONS[q-1].correct;
    const tr = document.createElement('tr');
    let html = '<td>' + q + '</td>';
    for (let i = 0; i < 4; i++) {
      const pct = info.total ? Math.round(info.counts[i] / info.total * 100) : 0;
      const cls = (i === correctIdx) ? ' class="correct-cell"' : '';
      html += '<td' + cls + '>' + pct + '%</td>';
    }
    html += '<td>' + info.total + '</td>';
    tr.innerHTML = html;
    tb.appendChild(tr);
  }
}

function renderCharts(s) {
  const wrap = $('charts'); wrap.innerHTML = '';
  for (let q = 1; q <= TOTAL_QUESTIONS; q++) {
    const info = s.perQ[q];
    const correctIdx = QUESTIONS[q-1].correct;
    const box = document.createElement('div'); box.className = 'chart-box';
    // ИЗМЕНЕНО: добавлен текст правильного ответа в заголовок
    let html = '<div class="chart-title">Вопрос №' + q + ' · ответили ' + info.total +
               ' · правильный: ' + LETTERS[correctIdx] + '</div>';
    for (let i = 0; i < 4; i++) {
      const pct = info.total ? Math.round(info.counts[i] / info.total * 100) : 0;
      const isC = (i === correctIdx);
      html += '<div class="cbar-row' + (isC ? ' is-correct' : '') + '">' +
        '<span class="bar-label">' + LETTERS[i] + (isC ? '✓' : '') + '</span>' +
        '<div class="bar-track"><div class="bar-fill' + (isC ? ' is-correct' : '') + '" style="width:' + pct + '%"></div></div>' +
        '<span class="bar-pct">' + pct + '%</span></div>';
    }
    box.innerHTML = html;
    wrap.appendChild(box);
  }
}

function renderFinals(s) {
  $('f-students').textContent = s.numStudents;
  $('f-avg').textContent = s.avgPct + '%';
  $('f-best').textContent = s.best + '/' + TOTAL_QUESTIONS + (s.best > 0 ? ' — ' + s.bestName : '');
  const pq = $('per-question-correct'); pq.innerHTML = '';
  for (let q = 1; q <= TOTAL_QUESTIONS; q++) {
    const info = s.perQ[q];
    const correctIdx = QUESTIONS[q-1].correct;
    const correctCount = info.counts[correctIdx];
    const d = document.createElement('div'); d.className = 'pq-item';
    d.innerHTML = 'Вопрос №' + q + ': правильных <b>' + correctCount + '</b> из ' + info.total;
    pq.appendChild(d);
  }
}

/* ---------- РЕЖИМ ПОКАЗА ---------- */
function renderPresent() {
  const q = QUESTIONS[presentIdx];
  const qid = presentIdx + 1;
  $('present-q-num').textContent = 'Вопрос №' + qid;
  $('present-qnum-big').textContent = 'ВОПРОС №' + qid;
  $('present-question').textContent = q.text;

  const rows = allRows.filter(r => r.question_id === qid);
  const counts = [0,0,0,0];
  rows.forEach(r => { if (r.answer >= 0 && r.answer <= 3) counts[r.answer]++; });
  const total = rows.length;

  const wrap = $('present-stats'); wrap.innerHTML = '';
  LETTERS.forEach((L, i) => {
    const pct = total ? Math.round(counts[i] / total * 100) : 0;
    const isC = (i === q.correct);
    const d = document.createElement('div');
    d.className = 'present-bar' + (isC ? ' present-correct' : '');
    d.innerHTML = '<span class="pb-label">' + L + (isC ? ' ✓' : '') + '</span>' +
      '<div class="pb-track"><div class="pb-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="pb-pct">' + pct + '%</span>';
    wrap.appendChild(d);
  });
  $('present-count').textContent = 'Ответили: ' + total;

  // ИЗМЕНЕНО: правильный ответ буквой + текстом
  $('present-correct').textContent = 'Правильный ответ: ' + LETTERS[q.correct] + ' — ' + q.options[q.correct];

  // НОВЫЙ БЛОК: фамилии студентов, ответивших правильно
  const correctNames = rows.filter(r => r.is_correct).map(r => r.student_name);
  let namesEl = $('present-correct-names');
  if (!namesEl) {
    namesEl = document.createElement('div');
    namesEl.id = 'present-correct-names';
    namesEl.style.cssText = 'margin-top:16px;font-size:17px;line-height:1.5;color:#eef2ff;text-align:center;';
    $('present-area').appendChild(namesEl);
  }
  if (correctNames.length > 0) {
    namesEl.innerHTML = '<span style="color:#34d399;font-weight:700;">Правильно ответили (' +
      correctNames.length + '):</span> ' + correctNames.join(', ');
  } else {
    namesEl.innerHTML = '<span style="color:#34d399;font-weight:700;">Правильно ответили:</span> пока никто';
  }
}

/* ---------- REALTIME ---------- */
function setLive(text, ok) {
  const el = $('live-dot');
  el.textContent = '● ' + text;
  el.classList.toggle('on', !!ok);
}
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(fetchAndRender, 400);
}
function setupRealtime() {
  if (!db) { setLive('нет БД', false); return; }
  db.channel('responses-rt')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'responses' }, () => scheduleRefresh())
    .subscribe(status => {
      if (status === 'SUBSCRIBED') setLive('онлайн', true);
      else setLive('подключение…', false);
    });
}

/* ---------- QR ---------- */
function buildQR() {
  const url = new URL('index.html', window.location.href).href;
  $('qr-url').textContent = url;
  const box = $('qrbox'); box.innerHTML = '';
  if (typeof QRCode !== 'undefined') {
    new QRCode(box, {
      text: url, width: 280, height: 280,
      colorDark: '#0b1026', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  } else {
    box.textContent = 'QR-библиотека не загрузилась. Ссылка: ' + url;
  }
}

/* ---------- ОЧИСТКА ---------- */
async function clearResults() {
  if (!confirm('Вы действительно хотите удалить результаты текущего теста?')) return;
  if (!db) return;
  const { error } = await db.from('responses').delete().neq('id', 0);
  if (error) { alert('Ошибка удаления: ' + error.message); return; }
  await fetchAndRender();
}

document.addEventListener('DOMContentLoaded', () => {
  if (!isConfigured()) $('warn-banner').hidden = false;
  buildQR();
  fetchAndRender();
  setupRealtime();

  $('btn-refresh').addEventListener('click', fetchAndRender);
  $('btn-clear').addEventListener('click', clearResults);
  $('btn-print').addEventListener('click', () => window.print());
  $('btn-present').addEventListener('click', () => {
    $('present-area').hidden = false; renderPresent();
    $('present-area').scrollIntoView({ behavior: 'smooth' });
  });
  $('btn-prev-q').addEventListener('click', () => {
    presentIdx = (presentIdx - 1 + TOTAL_QUESTIONS) % TOTAL_QUESTIONS; renderPresent();
  });
  $('btn-next-q').addEventListener('click', () => {
    presentIdx = (presentIdx + 1) % TOTAL_QUESTIONS; renderPresent();
  });
});