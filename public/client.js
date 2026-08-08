// ============================================
//  خريطة اللعبة (نمط Video Game Maps)
//  كل اللاعبين يلتقون في ساحة مركزية واحدة
// ============================================

const SETTINGS = {
  speed: 0.00055,
  reportEvery: 100,
  colors: ['#FF5252', '#FFC107', '#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#00BCD4', '#E91E63']
};

// ⭐ حدود صورة خريطة اللعبة (إحداثيات بسيطة)
const BOUNDS = [[-1, -1], [1, 1]];
// ⭐ نقطة الالتقاء — منتصف الخريطة
const SPAWN = { x: 0, y: 0, angle: 0 };

let socket = null, joined = false, myName = 'لاعب', myColor = SETTINGS.colors[0], myMarker = null;
const me = { x: SPAWN.x, y: SPAWN.y, angle: 0 };
let target = null;
const keys = {};
const others = new Map();

// ---------- الخريطة بنمط الألعاب (CRS.Simple = بدون جغرافيا) ----------
const map = L.map('map', {
  crs: L.CRS.Simple,
  minZoom: -3,
  maxZoom: 2,
  zoomControl: false,
  maxBounds: BOUNDS,
  maxBoundsViscosity: 1.0
}).setView([SPAWN.y, SPAWN.x], -1);

// ⭐ صورة خريطة اللعبة — ضع صورتك في public/map/game-map.png
L.imageOverlay('map/game-map.png', BOUNDS).addTo(map);
L.control.zoom({ position: 'bottomleft' }).addTo(map);

// ⭐ ساحة الالتقاء — دائرة كبيرة في منتصف الخريطة
L.circleMarker([0, 0], {
  radius: 18,
  color: '#FFD54F',
  weight: 3,
  fillColor: '#FFD54F',
  fillOpacity: 0.35
}).addTo(map).bindTooltip('📍 ساحة الالتقاء — يبدأ الجميع من هنا', { direction: 'top' });

// ---------- أيقونة السيارة ----------
function carIcon(color, angle) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 64 64" style="transform:rotate(${angle||0}deg)">
    <rect x="8" y="22" width="48" height="20" rx="6" fill="${color}" stroke="#1a1a2e" stroke-width="2"/>
    <rect x="19" y="12" width="15" height="13" rx="4" fill="${color}" stroke="#1a1a2e" stroke-width="2"/>
    <rect x="38" y="14" width="13" height="11" rx="4" fill="${color}" stroke="#1a1a2e" stroke-width="2"/>
    <rect x="16" y="34" width="32" height="5" rx="2.5" fill="#cdeffd" opacity="0.85"/>
    <circle cx="21" cy="44" r="6.5" fill="#1a1a2e"/>
    <circle cx="43" cy="44" r="6.5" fill="#1a1a2e"/></svg>`;
  return L.divIcon({ html: svg, className: 'car-icon', iconSize: [36, 36], iconAnchor: [18, 18] });
}
function rotateMarker(marker, angle) {
  const svg = marker.getElement()?.querySelector('svg');
  if (svg) svg.style.transform = `rotate(${angle}deg)`;
}

// ---------- منتقي الألوان ----------
const colorPicker = document.getElementById('colorPicker');
SETTINGS.colors.forEach((c, i) => {
  const b = document.createElement('button');
  b.className = 'color-btn' + (i === 0 ? ' active' : '');
  b.style.background = c;
  b.dataset.color = c;
  b.addEventListener('click', () => {
    document.querySelectorAll('.color-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    myColor = c;
  });
  colorPicker.appendChild(b);
});

// ---------- الدخول ----------
function join() {
  myName = document.getElementById('nameInput').value.trim() || 'لاعب';
  document.getElementById('status').textContent = '⏳ جاري الاتصال بالسيرفر...';
  document.getElementById('joinBtn').disabled = true;
  socket = io();
  setupSocket(socket);
  socket.on('connect', () => socket.emit('join', { name: myName, color: myColor, x: me.x, y: me.y }));
}
document.getElementById('joinBtn').addEventListener('click', join);
document.getElementById('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });

// ---------- أحداث السيرفر ----------
function setupSocket(sock) {
  sock.on('init', list => { list.forEach(addOther); startGame(); });
  sock.on('playerJoined', p => { addOther(p); updateCount(); });
  sock.on('playerMoved', d => {
    const o = others.get(d.id);
    if (o) { o.x = d.x; o.y = d.y; o.angle = d.angle || 0; }
  });
  sock.on('playerLeft', id => {
    const o = others.get(id);
    if (o) { map.removeLayer(o.marker); others.delete(id); }
    updatePlayerList(); updateCount();
  });
  sock.on('chat', msg => appendChat(msg));
  sock.on('playerCount', n => { document.getElementById('countBadge').textContent = '👥 ' + n; });
  sock.on('connect_error', () => {
    document.getElementById('status').textContent = '❌ تعذر الاتصال بالسيرفر!';
  });
}

function startGame() {
  joined = true;
  document.getElementById('joinScreen').style.display = 'none';
  // يظهر اللاعب في ساحة الالتقاء
  myMarker = L.marker([me.y, me.x], { icon: carIcon(myColor, 0), zIndexOffset: 1000 })
    .addTo(map).bindTooltip('أنت', { direction: 'top' });
  map.setView([me.y, me.x], -1);
  updatePlayerList(); updateCount();
  setTimeout(() => document.getElementById('help').style.display = 'none', 6000);
}

function addOther(p) {
  if (others.has(p.id)) return;
  const m = L.marker([p.y, p.x], { icon: carIcon(p.color, p.angle || 0) })
    .addTo(map).bindTooltip(p.name, { direction: 'top' });
  others.set(p.id, { marker: m, x: p.x, y: p.y, angle: p.angle || 0, name: p.name, color: p.color });
  updatePlayerList();
}

function updatePlayerList() {
  const list = document.getElementById('playersList');
  list.innerHTML = '';
  const meLi = document.createElement('li');
  meLi.innerHTML = `<span class="dot" style="background:${myColor}"></span> ${esc(myName)} <small style="color:#ffd54f">(أنت)</small>`;
  list.appendChild(meLi);
  others.forEach(o => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot" style="background:${o.color}"></span> ${esc(o.name)}`;
    list.appendChild(li);
  });
}
function updateCount() { document.getElementById('countBadge').textContent = '👥 ' + (others.size + (joined ? 1 : 0)); }

// ---------- الدردشة ----------
const chatMessages = document.getElementById('chatMessages');
function appendChat(msg) {
  const div = document.createElement('div');
  div.className = 'msg';
  const color = msg.id === socket.id ? myColor : (others.get(msg.id)?.color || '#8b97b3');
  const time = new Date(msg.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  div.innerHTML = `<b style="color:${color}">${esc(msg.name)}:</b> ${esc(msg.text)} <span class="time">${time}</span>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
document.getElementById('chatSend').addEventListener('click', sendChat);
document.getElementById('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text || !socket?.connected) return;
  socket.emit('chat', text);
  input.value = '';
}

// ---------- الحركة ----------
map.on('click', e => { if (joined) target = { x: e.latlng.lng, y: e.latlng.lat }; });
window.addEventListener('keydown', e => { keys[e.key] = true; });
window.addEventListener('keyup', e => { keys[e.key] = false; });

let lastFrame = performance.now(), lastReport = 0;
function frame(now) {
  const dt = Math.min(now - lastFrame, 60);
  lastFrame = now;
  if (joined) {
    let dx = 0, dy = 0;
    if (keys['ArrowUp'] || keys['w'] || keys['W']) dy = 1;
    if (keys['ArrowDown'] || keys['s'] || keys['S']) dy = -1;
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) dx = -1;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) dx = 1;
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      me.x += (dx / len) * SETTINGS.speed * dt;
      me.y += (dy / len) * SETTINGS.speed * dt;
      me.angle = Math.atan2(dx, dy) * 180 / Math.PI;
      target = null;
    } else if (target) {
      const dX = target.x - me.x, dY = target.y - me.y;
      const dist = Math.hypot(dX, dY);
      if (dist < 0.002) target = null;
      else {
        const step = SETTINGS.speed * dt;
        const k = Math.min(1, step / dist);
        me.x += dX * k; me.y += dY * k;
        me.angle = Math.atan2(dX, dY) * 180 / Math.PI;
      }
    }
    if (myMarker) { myMarker.setLatLng([me.y, me.x]); rotateMarker(myMarker, me.angle); }
    if (now - lastReport > SETTINGS.reportEvery) {
      lastReport = now;
      if (socket?.connected) socket.emit('move', { x: me.x, y: me.y, angle: me.angle });
    }
  }
  others.forEach(o => {
    const m = o.marker.getLatLng();
    const dX = o.x - m.lng, dY = o.y - m.lat;
    if (Math.abs(dX) > 0.000001 || Math.abs(dY) > 0.000001) {
      o.marker.setLatLng([m.lat + dY * 0.2, m.lng + dX * 0.2]);
      rotateMarker(o.marker, o.angle);
    }
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- الأزرار ----------
function togglePanel(id) { document.getElementById(id).classList.toggle('hidden'); }
document.getElementById('playersBtn').addEventListener('click', () => togglePanel('playersPanel'));
document.getElementById('chatBtn').addEventListener('click', () => togglePanel('chatPanel'));
document.getElementById('shareBtn').addEventListener('click', () => {
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(location.href).then(() => showToast('✅ تم نسخ رابط الدعوة!'));
  else showToast('📋 الرابط: ' + location.href);
});
document.getElementById('leaveBtn').addEventListener('click', () => { socket?.disconnect(); location.reload(); });

function showToast(t) {
  const el = document.getElementById('toast');
  el.textContent = t;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2500);
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
