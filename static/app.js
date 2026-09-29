// ================= اتصال =================
const socket = io({ transports: ['websocket', 'polling'] });

// ================= عناصر =================
const $ = (id) => document.getElementById(id);

const loginScreen = $('login');
const appEl = $('app');
const nameInput = $('nameInput');
const joinBtn = $('joinBtn');

const myAvatar = $('myAvatar');
const myName = $('myName');
const userList = $('userList');
const userCount = $('userCount');
const headerCount = $('headerCount');

const messagesEl = $('messages');
const msgInput = $('msgInput');
const sendBtn = $('sendBtn');
const fileInput = $('fileInput');
const attachBtn = $('attachBtn');
const micBtn = $('micBtn');

const composerMain = $('composerMain');
const composerRec = $('composerRec');
const recTime = $('recTime');
const sendRec = $('sendRec');
const cancelRec = $('cancelRec');

const callModal = $('callModal');
const callAvatar = $('callAvatar');
const callName = $('callName');
const callStatus = $('callStatus');
const acceptCallBtn = $('acceptCall');
const rejectCallBtn = $('rejectCall');

const activeCall = $('activeCall');
const activeAvatar = $('activeAvatar');
const activeName = $('activeName');
const activeStatus = $('activeStatus');
const muteBtn = $('muteBtn');
const endCallBtn = $('endCallBtn');

const remoteAudio = $('remoteAudio');
const toastEl = $('toast');

// ================= وضعیت =================
let me = { id: null, name: '' };
let allUsers = [];
let mediaRecorder = null;
let recordedChunks = [];
let recTimer = null;
let recSeconds = 0;
let stream = null;

// تماس
let currentCall = {
  peer: null,          // sid طرف مقابل
  name: '',
  isCaller: false,
  pc: null,
  localStream: null,
  iceQueue: [],
  timer: null,
  seconds: 0,
  muted: false,
};

// ================= ابزار =================
function initial(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}
function colorFromName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 65%, 55%)`;
}
function avatarStyle(el, name) {
  el.style.background = `linear-gradient(135deg, ${colorFromName(name)}, ${colorFromName(name + 'x')})`;
}
function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('show'), 2500);
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function scrollBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function fmtDur(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

// ================= ورود =================
joinBtn.addEventListener('click', doJoin);
nameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') doJoin(); });

function doJoin() {
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  me.name = name;
  myName.textContent = name;
  myAvatar.textContent = initial(name);
  avatarStyle(myAvatar, name);

  socket.emit('join', { name });

  loginScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  setTimeout(() => msgInput.focus(), 300);
}

// ================= لیست کاربران =================
socket.on('users_list', (users) => {
  allUsers = users;
  userCount.textContent = users.length;
  headerCount.textContent = users.length;
  renderUsers(users);
});

function renderUsers(users) {
  userList.innerHTML = '';
  users.forEach(u => {
    const li = document.createElement('li');
    const isMe = (u.id === socket.id);
    if (isMe) li.classList.add('me');
    li.innerHTML = `
      <div class="avatar" style="background:linear-gradient(135deg,${colorFromName(u.name)},${colorFromName(u.name+'x')})">
        ${initial(u.name)}
      </div>
      <div style="flex:1">
        <div class="u-name">${escapeHtml(u.name)} ${isMe ? '(شما)' : ''}</div>
        <div class="u-hint">${isMe ? 'خودتان' : 'برای تماس کلیک کنید'}</div>
      </div>
    `;
    if (!isMe) {
      li.addEventListener('click', () => startCall(u.id, u.name));
    }
    userList.appendChild(li);
  });
}

// ================= پیام متنی =================
sendBtn.addEventListener('click', sendMessage);
msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
// auto-resize
msgInput.addEventListener('input', () => {
  msgInput.style.height = 'auto';
  msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
});

function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;
  socket.emit('message', { text });
  msgInput.value = '';
  msgInput.style.height = 'auto';
}

// ================= تاریخچه =================
socket.on('history', (msgs) => {
  messagesEl.innerHTML = '';
  msgs.forEach(addMessage);
  scrollBottom();
});

// ================= دریافت پیام =================
socket.on('message', (msg) => {
  addMessage(msg);
  scrollBottom();
});

// ================= پیام سیستمی =================
socket.on('user_joined', (u) => addSysMsg(`${u.name} وارد چت شد`));
socket.on('user_left',   (u) => addSysMsg(`${u.name} چت را ترک کرد`));

function addSysMsg(text) {
  const div = document.createElement('div');
  div.className = 'sys-msg';
  div.textContent = text;
  messagesEl.appendChild(div);
  scrollBottom();
}

// ================= نمایش پیام =================
function addMessage(msg) {
  const own = (msg.id === socket.id);
  const wrap = document.createElement('div');
  wrap.className = 'msg' + (own ? ' own' : '');

  const av = document.createElement('div');
  av.className = 'avatar';
  av.textContent = initial(msg.name);
  avatarStyle(av, msg.name);

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = `<span class="name">${escapeHtml(msg.name)}</span><span>${msg.time || ''}</span>`;
  bubble.appendChild(meta);

  if (msg.type === 'text') {
    const p = document.createElement('div');
    p.className = 'text';
    p.textContent = msg.text;
    bubble.appendChild(p);
  }
  else if (msg.type === 'file') {
    if ((msg.filetype || '').startsWith('image/')) {
      const img = document.createElement('img');
      img.src = msg.data;
      img.alt = msg.filename;
      bubble.appendChild(img);
    } else {
      const a = document.createElement('a');
      a.className = 'file-link';
      a.href = msg.data;
      a.download = msg.filename;
      a.innerHTML = `📎 <span>${escapeHtml(msg.filename)}</span>`;
      bubble.appendChild(a);
    }
  }
  else if (msg.type === 'voice') {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = msg.data;
    audio.style.display = 'block';
    bubble.appendChild(audio);
    if (msg.duration) {
      const d = document.createElement('div');
      d.style.fontSize = '11px';
      d.style.color = 'rgba(255,255,255,.7)';
      d.style.marginTop = '4px';
      d.textContent = `🎙️ ${fmtDur(msg.duration)}`;
      bubble.appendChild(d);
    }
  }

  wrap.appendChild(av);
  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
}

// ================= ارسال فایل =================
attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const f = fileInput.files[0];
  if (f) sendFile(f);
  fileInput.value = '';
});

// Drag & Drop
['dragover','drop'].forEach(ev =>
  messagesEl.addEventListener(ev, e => e.preventDefault())
);
messagesEl.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files[0];
  if (f) sendFile(f);
});

const MAX_FILE = 40 * 1024 * 1024; // 40MB

function sendFile(file) {
  if (file.size > MAX_FILE) {
    showToast('حجم فایل نباید بیشتر از ۴۰ مگابایت باشد');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    socket.emit('file', {
      filename: file.name,
      filetype: file.type,
      data: reader.result,
    });
    showToast('فایل ارسال شد ✅');
  };
  reader.readAsDataURL(file);
}

// ================= ضبط ویس =================
micBtn.addEventListener('click', startRecording);
sendRec.addEventListener('click', stopAndSend);
cancelRec.addEventListener('click', cancelRecording);

async function startRecording() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    showToast('دسترسی به میکروفون داده نشد ❌');
    return;
  }
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
  };

  mediaRecorder.start();

  composerMain.classList.add('hidden');
  composerRec.classList.remove('hidden');
  micBtn.classList.add('recording');

  recSeconds = 0;
  recTime.textContent = '00:00';
  recTimer = setInterval(() => {
    recSeconds++;
    recTime.textContent = fmtDur(recSeconds);
    if (recSeconds >= 120) stopAndSend(); // حداکثر ۲ دقیقه
  }, 1000);
}

function stopAndSend() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  mediaRecorder.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    const reader = new FileReader();
    reader.onload = () => {
      socket.emit('voice', {
        data: reader.result,
        duration: recSeconds,
      });
    };
    reader.readAsDataURL(blob);
  };
  mediaRecorder.stop();
  cleanupRecording();
}

function cancelRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.onstop = () => stream.getTracks().forEach(t => t.stop());
    mediaRecorder.stop();
  }
  cleanupRecording();
}

function cleanupRecording() {
  clearInterval(recTimer);
  micBtn.classList.remove('recording');
  composerMain.classList.remove('hidden');
  composerRec.classList.add('hidden');
}

// ================= WebRTC - تنظیمات =================
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  currentCall.pc = pc;
  currentCall.iceQueue = [];

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit('webrtc_ice', { to: peerId, candidate: e.candidate });
    }
  };

  pc.ontrack = (e) => {
    remoteAudio.srcObject = e.streams[0];
  };

  pc.onconnectionstatechange = () => {
    if (['failed','disconnected','closed'].includes(pc.connectionState)) {
      endCall(true);
    }
  };

  return pc;
}

async function getMicStream() {
  return await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }
  });
}

// ================= شروع تماس (من زنگ می‌زنم) =================
async function startCall(peerId, peerName) {
  if (currentCall.peer) {
    showToast('شما در حال حاضر در یک تماس هستید');
    return;
  }
  currentCall.peer = peerId;
  currentCall.name = peerName;
  currentCall.isCaller = true;
  currentCall.muted = false;

  // نمایش مودال «در حال تماس»
  showActiveCallModal(peerName, 'در حال زنگ زدن...', false);

  socket.emit('call_user', { to: peerId });
}

// ================= دریافت تماس =================
socket.on('incoming_call', ({ from, name }) => {
  if (currentCall.peer) {
    socket.emit('reject_call', { to: from });
    return;
  }
  currentCall.peer = from;
  currentCall.name = name;
  currentCall.isCaller = false;

  callAvatar.textContent = initial(name);
  avatarStyle(callAvatar, name);
  callName.textContent = name;
  callStatus.textContent = 'در حال تماس...';
  callModal.classList.remove('hidden');
});

// ================= رد / لغو =================
rejectCallBtn.addEventListener('click', () => {
  if (currentCall.peer) socket.emit('reject_call', { to: currentCall.peer });
  callModal.classList.add('hidden');
  resetCall();
});

socket.on('call_rejected', () => {
  showToast('تماس رد شد');
  resetCall();
});

// ================= پذیرش تماس =================
acceptCallBtn.addEventListener('click', async () => {
  callModal.classList.add('hidden');
  try {
    const local = await getMicStream();
    currentCall.localStream = local;

    const pc = createPeerConnection(currentCall.peer);
    local.getTracks().forEach(t => pc.addTrack(t, local));

    socket.emit('accept_call', { to: currentCall.peer });
    showActiveCallModal(currentCall.name, 'در حال اتصال...', true);
  } catch (e) {
    showToast('دسترسی به میکروفون داده نشد ❌');
    socket.emit('reject_call', { to: currentCall.peer });
    resetCall();
  }
});

// ================= تماس پذیرفته شد (سمت زنگ‌زننده) =================
socket.on('call_accepted', async ({ from }) => {
  try {
    const local = await getMicStream();
    currentCall.localStream = local;

    const pc = createPeerConnection(from);
    local.getTracks().forEach(t => pc.addTrack(t, local));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('webrtc_offer', { to: from, sdp: offer });

    updateActiveStatus('در حال اتصال...');
  } catch (e) {
    showToast('خطا در شروع تماس ❌');
    endCall(true);
  }
});

// ================= WebRTC Signaling =================
socket.on('webrtc_offer', async ({ from, sdp }) => {
  if (!currentCall.pc) return;
  await currentCall.pc.setRemoteDescription(new RTCSessionDescription(sdp));
  // تخلیه صف ICE
  for (const c of currentCall.iceQueue) {
    try { await currentCall.pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
  }
  currentCall.iceQueue = [];

  const answer = await currentCall.pc.createAnswer();
  await currentCall.pc.setLocalDescription(answer);
  socket.emit('webrtc_answer', { to: from, sdp: answer });
});

socket.on('webrtc_answer', async ({ sdp }) => {
  if (!currentCall.pc) return;
  await currentCall.pc.setRemoteDescription(new RTCSessionDescription(sdp));
  for (const c of currentCall.iceQueue) {
    try { await currentCall.pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
  }
  currentCall.iceQueue = [];
  // شروع تایمر
  startCallTimer();
  updateActiveStatus('در حال مکالمه');
});

socket.on('webrtc_ice', async ({ candidate }) => {
  if (!currentCall.pc) return;
  if (currentCall.pc.remoteDescription && currentCall.pc.remoteDescription.type) {
    try { await currentCall.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
  } else {
    currentCall.iceQueue.push(candidate);
  }
});

// ================= پایان تماس =================
socket.on('call_ended', () => {
  endCall(true);
});

endCallBtn.addEventListener('click', () => {
  if (currentCall.peer) socket.emit('end_call', { to: currentCall.peer });
  endCall(false);
});

function endCall(fromRemote) {
  if (currentCall.pc) {
    try { currentCall.pc.close(); } catch {}
  }
  if (currentCall.localStream) {
    currentCall.localStream.getTracks().forEach(t => t.stop());
  }
  if (currentCall.timer) clearInterval(currentCall.timer);
  remoteAudio.srcObject = null;

  activeCall.classList.add('hidden');
  callModal.classList.add('hidden');
  resetCall();
}

function resetCall() {
  currentCall = {
    peer: null, name: '', isCaller: false, pc: null,
    localStream: null, iceQueue: [], timer: null, seconds: 0, muted: false,
  };
  muteBtn.classList.remove('muted');
  muteBtn.textContent = '🎙️';
}

// ================= مودال‌ها =================
function showActiveCallModal(name, status, connected) {
  activeAvatar.textContent = initial(name);
  avatarStyle(activeAvatar, name);
  activeName.textContent = name;
  activeStatus.textContent = status;
  activeCall.classList.remove('hidden');
  endCallBtn.disabled = false;
}

function updateActiveStatus(text) {
  activeStatus.textContent = text;
}

function startCallTimer() {
  clearInterval(currentCall.timer);
  currentCall.seconds = 0;
  currentCall.timer = setInterval(() => {
    currentCall.seconds++;
    activeStatus.textContent = fmtDur(currentCall.seconds);
  }, 1000);
}

// ================= بی‌صدا =================
muteBtn.addEventListener('click', () => {
  if (!currentCall.localStream) return;
  const track = currentCall.localStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  currentCall.muted = !track.enabled;
  muteBtn.classList.toggle('muted', currentCall.muted);
  muteBtn.textContent = currentCall.muted ? '🔇' : '🎙️';
});

// ================= سایدبار موبایل =================
$('openSide').addEventListener('click', () => {
  $('sidebar').classList.add('open');
});
$('closeSide').addEventListener('click', () => {
  $('sidebar').classList.remove('open');
});

// ================= قبل از خروج =================
window.addEventListener('beforeunload', () => {
  if (currentCall.peer) {
    socket.emit('end_call', { to: currentCall.peer });
  }
});
