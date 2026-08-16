const firebaseConfig = {
  apiKey: "AIzaSyAqaGDE013miUh1CsJajj7_bG6xNLPv0h0",
  authDomain: "study-timer11.firebaseapp.com",
  projectId: "study-timer11",
  storageBucket: "study-timer11.firebasestorage.app",
  messagingSenderId: "72603722283",
  appId: "1:72603722283:web:0132b781b6fb325f25406e",
  measurementId: "G-P6F9YSY860"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

let currentUser = null;
let chartInstance = null;
let timer = null;
let timerSeconds = 0;
let activeSubjectName = "";

let subjects = [];
let recentSessions = [];
let weeklyData = [0, 0, 0, 0, 0, 0, 0];
let routineTasks = [];
let currentFilter = '1d';
let customPhotoURL = null;

// AUTH STATE LISTENER
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('appSection').classList.remove('hidden');
    initChart();
    listenToRealtimeData();
  } else {
    currentUser = null;
    document.getElementById('authSection').classList.remove('hidden');
    document.getElementById('appSection').classList.add('hidden');
  }
});

function loginWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider);
}

function logout() { 
  closeProfileModal();
  auth.signOut(); 
}

// PROFILE MODAL & AVATAR
function openProfileModal() {
  if (!currentUser) return;

  document.getElementById('userName').innerText = currentUser.displayName || 'User';
  document.getElementById('userEmail').innerText = currentUser.email || '';

  const defaultAvatar = currentUser.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
  const activeAvatar = customPhotoURL || defaultAvatar;

  document.getElementById('userAvatar').src = activeAvatar;
  document.getElementById('headerUserAvatar').src = activeAvatar;

  document.getElementById('profileModal').classList.remove('hidden');
}

function closeProfileModal() {
  document.getElementById('profileModal').classList.add('hidden');
}

function updateProfilePicture() {
  const newUrl = document.getElementById('customDpUrl').value.trim();
  if (!newUrl) return;

  customPhotoURL = newUrl;
  document.getElementById('userAvatar').src = customPhotoURL;
  document.getElementById('headerUserAvatar').src = customPhotoURL;
  document.getElementById('customDpUrl').value = '';

  db.collection('users').doc(currentUser.uid).set({ customPhotoURL: customPhotoURL }, { merge: true });
}

// TAB NAVIGATION
function switchTab(tab) {
  if (tab === 'home') {
    document.getElementById('homeView').classList.remove('hidden');
    document.getElementById('routineView').classList.add('hidden');
    document.getElementById('navHomeBtn').classList.add('active');
    document.getElementById('navRoutineBtn').classList.remove('active');
  } else {
    document.getElementById('homeView').classList.add('hidden');
    document.getElementById('routineView').classList.remove('hidden');
    document.getElementById('navHomeBtn').classList.remove('active');
    document.getElementById('navRoutineBtn').classList.add('active');
  }
}

// REALTIME FIRESTORE
function listenToRealtimeData() {
  if (!currentUser) return;

  db.collection('users').doc(currentUser.uid).onSnapshot(doc => {
    if (doc.exists) {
      const data = doc.data();
      subjects = data.subjects || [];
      recentSessions = data.recentSessions || [];
      weeklyData = data.weeklyData || [0, 0, 0, 0, 0, 0, 0];
      routineTasks = data.routineTasks || [];
      customPhotoURL = data.customPhotoURL || null;

      if (customPhotoURL) {
        document.getElementById('headerUserAvatar').src = customPhotoURL;
      } else if (currentUser.photoURL) {
        document.getElementById('headerUserAvatar').src = currentUser.photoURL;
      }

      renderSubjects();
      renderRecentSessions();
      renderRoutineTimeline();
      updateGraph();
      calculateTotals();
    } else {
      saveToFirestore();
    }
  });
}

function setFilter(filterType, btnElement) {
  currentFilter = filterType;
  document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
  calculateTotals();
}

function formatTime(totalSecs) {
  let hrs = Math.floor(totalSecs / 3600);
  let mins = Math.floor((totalSecs % 3600) / 60);
  let secs = totalSecs % 60;
  return `${hrs}h ${mins}m ${secs}s`;
}

// RENDER SUBJECTS
function renderSubjects() {
  const container = document.getElementById('subjectGrid');
  container.innerHTML = "";

  subjects.forEach(sub => {
    const card = document.createElement('div');
    card.className = 'sub-card-box';
    card.onclick = () => openTimerForSubject(sub.name);
    card.innerHTML = `
      <i class="fa-solid ${sub.icon || 'fa-book-bookmark'} sub-icon"></i>
      <h4>${sub.name}</h4>
      <p>${formatTime(sub.totalSecs || 0)}</p>
    `;
    container.appendChild(card);
  });

  const addBtn = document.createElement('div');
  addBtn.className = 'add-sub-card';
  addBtn.onclick = openAddSubjectModal;
  addBtn.innerHTML = `
    <div class="add-circle"><i class="fa-solid fa-plus"></i></div>
    <span>Add Subject</span>
  `;
  container.appendChild(addBtn);
}

// RENDER RECENT SESSIONS
function renderRecentSessions() {
  const list = document.getElementById('recentSessionsList');
  list.innerHTML = "";

  if (recentSessions.length === 0) {
    list.innerHTML = `<div style="color:var(--text-sub); font-size:12px;">No sessions recorded yet.</div>`;
    return;
  }

  recentSessions.slice(0, 3).forEach(s => {
    const item = document.createElement('div');
    item.className = 'recent-item';
    item.innerHTML = `
      <div><strong>${s.subject}</strong> <span style="color:var(--text-sub)">(${s.time})</span></div>
      <span class="time-tag">${s.duration}</span>
    `;
    list.appendChild(item);
  });
}

// RENDER ROUTINE
function renderRoutineTimeline() {
  const container = document.getElementById('routineTimeline');
  container.innerHTML = "";

  if (routineTasks.length === 0) {
    container.innerHTML = `<div style="color: var(--text-sub); font-size: 12px;">No routine tasks added.</div>`;
    return;
  }

  routineTasks.forEach((item, index) => {
    const el = document.createElement('div');
    el.className = 'timeline-item';
    el.innerHTML = `
      <div class="timeline-card-content">
        <div>
          <span class="time-tag">${item.time}</span>
          <div style="font-size:13px; font-weight:600; margin-top:4px;">${item.subject}</div>
        </div>
        <button class="del-btn" onclick="deleteRoutineTask(${index})"><i class="fa-solid fa-trash"></i></button>
      </div>
    `;
    container.appendChild(el);
  });
}

function addRoutineTask() {
  let time = document.getElementById('taskTime').value.trim();
  let subject = document.getElementById('taskSubject').value.trim();

  if (!time || !subject) return;

  routineTasks.push({ time, subject });
  document.getElementById('taskTime').value = "";
  document.getElementById('taskSubject').value = "";

  saveToFirestore();
}

function deleteRoutineTask(index) {
  routineTasks.splice(index, 1);
  saveToFirestore();
}

// CALCULATE TOTALS
function calculateTotals() {
  let totalSecsCalculated = 0;

  if (currentFilter === '1d') {
    let todayIndex = new Date().getDay();
    totalSecsCalculated = weeklyData[todayIndex] || 0;
  } else if (currentFilter === '7d') {
    totalSecsCalculated = weeklyData.reduce((a, b) => a + b, 0);
  } else {
    totalSecsCalculated = subjects.reduce((acc, curr) => acc + (curr.totalSecs || 0), 0);
  }

  document.getElementById('totalFocusedDisplay').innerText = formatTime(totalSecsCalculated);

  if (subjects.length > 0) {
    let topSub = subjects.reduce((max, s) => (s.totalSecs || 0) > (max.totalSecs || 0) ? s : max, subjects[0]);
    document.getElementById('mostFocusedText').innerText = (topSub.totalSecs > 0) ? topSub.name.toUpperCase() : "NONE";
  } else {
    document.getElementById('mostFocusedText').innerText = "NONE";
  }
}

// CHART
function initChart() {
  const ctx = document.getElementById('performanceChart').getContext('2d');
  
  const gradient = ctx.createLinearGradient(0, 0, 0, 150);
  gradient.addColorStop(0, 'rgba(168, 85, 247, 0.4)');
  gradient.addColorStop(1, 'rgba(168, 85, 247, 0.0)');

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      datasets: [{
        data: weeklyData.map(s => +(s/3600).toFixed(2)),
        borderColor: '#a855f7',
        borderWidth: 3,
        fill: true,
        backgroundColor: gradient,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#a855f7'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: { display: false, min: 0 }
      }
    }
  });
}

function updateGraph() {
  if (chartInstance) {
    chartInstance.data.datasets[0].data = weeklyData.map(s => +(s/3600).toFixed(2));
    chartInstance.update();
  }
}

// TIMER MODAL
function openTimerForSubject(name) {
  activeSubjectName = name;
  document.getElementById('timerSubjectTitle').innerText = name;
  document.getElementById('timerModal').classList.remove('hidden');
}

function closeTimerModal() {
  clearInterval(timer);
  timerSeconds = 0;
  document.getElementById('timerDisplay').innerText = "00:00:00";
  document.getElementById('startBtn').disabled = false;
  document.getElementById('stopBtn').disabled = true;
  document.getElementById('timerModal').classList.add('hidden');
}

function startTimer() {
  document.getElementById('startBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;
  timer = setInterval(() => {
    timerSeconds++;
    let hrs = Math.floor(timerSeconds / 3600).toString().padStart(2, '0');
    let mins = Math.floor((timerSeconds % 3600) / 60).toString().padStart(2, '0');
    let secs = (timerSeconds % 60).toString().padStart(2, '0');
    document.getElementById('timerDisplay').innerText = `${hrs}:${mins}:${secs}`;
  }, 1000);
}

function stopAndSaveTimer() {
  clearInterval(timer);

  let sub = subjects.find(s => s.name === activeSubjectName);
  if (sub) {
    sub.totalSecs = (sub.totalSecs || 0) + timerSeconds;
  }

  let mins = Math.floor(timerSeconds / 60);
  let secs = timerSeconds % 60;
  let durationText = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  recentSessions.unshift({
    duration: durationText,
    subject: activeSubjectName,
    time: 'Just now'
  });

  let todayIndex = new Date().getDay();
  weeklyData[todayIndex] = (weeklyData[todayIndex] || 0) + timerSeconds;

  saveToFirestore();
  closeTimerModal();
}

// ADD SUBJECT
function openAddSubjectModal() { document.getElementById('addSubjectModal').classList.remove('hidden'); }
function closeAddSubjectModal() { document.getElementById('addSubjectModal').classList.add('hidden'); }

function createNewSubject() {
  let name = document.getElementById('newSubjectName').value.trim();
  if (!name) return;

  subjects.push({ name: name, totalSecs: 0, icon: 'fa-book-bookmark' });
  document.getElementById('newSubjectName').value = "";
  
  saveToFirestore();
  closeAddSubjectModal();
}

// SAVE TO FIRESTORE
function saveToFirestore() {
  if (currentUser) {
    db.collection('users').doc(currentUser.uid).set({
      subjects,
      recentSessions,
      weeklyData,
      routineTasks,
      customPhotoURL
    }, { merge: true });
  }
}