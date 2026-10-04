const db = createDB();

let studentName = "";
let currentQ = 0;          // индекс вопроса 0..9
let selected = null;       // выбранный вариант 0..3
let myCorrect = 0;
const answeredSet = new Set();

const $ = id => document.getElementById(id);

function showScreen(name) {
  ['start', 'quiz', 'result', 'final'].forEach(s => {
    $('screen-' + s).hidden = (s !== name);
  });
  window.scrollTo(0, 0);
}

async function startTest() {
  const name = $('student-name').value.trim();
  if (!name) { alert('Введите имя или номер студента.'); return; }
  if (!db) { alert('База данных не настроена. Сообщите преподавателю.'); return; }

  studentName = name;
  sessionStorage.setItem('mkt_student_name', name);
  $('btn-start').disabled = true;
  $('btn-start').textContent = 'ЗАГРУЗКА…';

  // Подгружаем уже данные ответы (защита от повторных ответов)
  const { data, error } = await db.from('responses')
    .select('question_id,is_correct')
    .eq('student_name', studentName);

  answeredSet.clear(); myCorrect = 0;
  if (!error && data) {
    data.forEach(r => { answeredSet.add(r.question_id); if (r.is_correct) myCorrect++; });
  }

  // Находим первый вопрос без ответа
  currentQ = 0;
  while (currentQ < TOTAL_QUESTIONS && answeredSet.has(currentQ + 1)) currentQ++;

  $('btn-start').disabled = false;
  $('btn-start').textContent = 'НАЧАТЬ ТЕСТ';

  if (currentQ >= TOTAL_QUESTIONS) { showFinal(); }
  else { showScreen('quiz'); renderQuestion(); }
}

function renderQuestion() {
  const q = QUESTIONS[currentQ];
  selected = null;
  $('q-number').textContent = 'Вопрос ' + (currentQ + 1) + ' / ' + TOTAL_QUESTIONS;
  $('progress-fill').style.width = (currentQ / TOTAL_QUESTIONS * 100) + '%';
  $('question-text').textContent = q.text;
  $('quiz-error').hidden = true;

  const opts = $('options'); opts.innerHTML = '';
  q.options.forEach((txt, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'option';
    b.innerHTML = '<span class="opt-letter">' + LETTERS[i] + '</span><span class="opt-text"></span>';
    b.querySelector('.opt-text').textContent = txt;
    b.addEventListener('click', () => selectOption(i, b));
    opts.appendChild(b);
  });

  const ba = $('btn-answer');
  ba.disabled = true; ba.textContent = 'ОТВЕТИТЬ';

  const card = $('question-card');
  card.classList.remove('anim'); void card.offsetWidth; card.classList.add('anim');
}

function selectOption(i, btn) {
  selected = i;
  document.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
  btn.classList.add('selected');
  $('btn-answer').disabled = false;
}

async function submitAnswer() {
  if (selected === null) return;
  const btnAnswer = $('btn-answer');
  btnAnswer.disabled = true; btnAnswer.textContent = 'ОТПРАВКА…';
  $('quiz-error').hidden = true;

  const qid = currentQ + 1;

  // 1) Проверка: не отвечал ли студент раньше
  const { data: existing, error: chkErr } = await db.from('responses')
    .select('id').eq('student_name', studentName).eq('question_id', qid);
  if (chkErr) { showQuizError('Ошибка проверки: ' + chkErr.message); return; }
  if (existing && existing.length > 0) { showQuizError('Вы уже ответили на этот вопрос.'); return; }

  // 2) Сохраняем ответ
  const q = QUESTIONS[currentQ];
  const isCorrect = (selected === q.correct);
  const { error } = await db.from('responses').insert({
    student_name: studentName,
    question_id: qid,
    answer: selected,
    is_correct: isCorrect
  });
  if (error) {
    if (error.code === '23505') { showQuizError('Вы уже ответили на этот вопрос.'); }
    else { showQuizError('Ошибка сохранения: ' + error.message); }
    return;
  }

  answeredSet.add(qid);
  if (isCorrect) myCorrect++;
  sessionStorage.setItem('mkt_student_name', studentName);

  await showQuestionResult();
}

function showQuizError(msg) {
  $('quiz-error').textContent = msg;
  $('quiz-error').hidden = false;
  $('btn-answer').disabled = false;
  $('btn-answer').textContent = 'ОТВЕТИТЬ';
}

async function showQuestionResult() {
  showScreen('result');
  const q = QUESTIONS[currentQ];

  // Правильный ответ — только если разрешено
  const ci = $('correct-info');
  if (SHOW_CORRECT_ANSWER) {
    ci.innerHTML = 'Правильный ответ: <b>' + LETTERS[q.correct] + '</b>';
    ci.hidden = false;
  } else { ci.hidden = true; ci.innerHTML = ''; }

  // Статистика группы из БД
  const { data } = await db.from('responses').select('answer').eq('question_id', currentQ + 1);
  renderGroupStats(data || [], 'group-stats');
  $('answered-count').textContent = 'Ответили: ' + ((data || []).length) + ' студентов';

  $('btn-next').textContent = (currentQ === TOTAL_QUESTIONS - 1) ? 'ЗАВЕРШИТЬ' : 'СЛЕДУЮЩИЙ ВОПРОС';
}

function renderGroupStats(rows, containerId) {
  const counts = [0, 0, 0, 0];
  rows.forEach(r => { if (r.answer >= 0 && r.answer <= 3) counts[r.answer]++; });
  const total = rows.length;
  const el = $(containerId); el.innerHTML = '';
  LETTERS.forEach((L, i) => {
    const pct = total ? Math.round(counts[i] / total * 100) : 0;
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = '<span class="bar-label">' + L + '</span>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="bar-pct">' + pct + '%</span>';
    el.appendChild(row);
  });
}

function onNext() {
  if (currentQ >= TOTAL_QUESTIONS - 1) { showFinal(); }
  else { currentQ++; showScreen('quiz'); renderQuestion(); }
}

function showFinal() {
  showScreen('final');
  $('final-score').textContent = myCorrect + ' из ' + TOTAL_QUESTIONS;
  const pct = Math.round(myCorrect / TOTAL_QUESTIONS * 100);
  $('final-pct').textContent = pct + '%';
}

document.addEventListener('DOMContentLoaded', () => {
  if (!isConfigured()) $('warn-banner').hidden = false;
  const saved = sessionStorage.getItem('mkt_student_name');
  if (saved) $('student-name').value = saved;

  $('btn-start').addEventListener('click', startTest);
  $('student-name').addEventListener('keydown', e => { if (e.key === 'Enter') startTest(); });
  $('btn-answer').addEventListener('click', submitAnswer);
  $('btn-next').addEventListener('click', onNext);
});