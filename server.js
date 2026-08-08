const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));

// فحص صحة السيرفر (يستخدمه Render)
app.get('/health', (req, res) => res.json({ ok: true, online: players.size }));

// اللاعبون المتصلون: socketId -> بيانات اللاعب
const players = new Map();

// ⭐ نقطة الالتقاء: كل اللاعبين يبدأون من منتصف الخريطة
const SPAWN = { x: 0, y: 0, angle: 0 };
// ⭐ حدود خريطة اللعبة (إحداثيات بسيطة من -1 إلى 1)
const LIMIT = 1;

io.on('connection', (socket) => {
  console.log('⚡ اتصال جديد:', socket.id);

  // 1) دخول لاعب
  socket.on('join', (data = {}) => {
    const player = {
      id: socket.id,
      name: String(data.name || 'لاعب').slice(0, 20),
      color: String(data.color || '#FF5252'),
      x: clampNum(data.x, -LIMIT, LIMIT) ?? SPAWN.x,
      y: clampNum(data.y, -LIMIT, LIMIT) ?? SPAWN.y,
      angle: data.angle || 0,
      lastSeen: Date.now()
    };
    players.set(socket.id, player);

    socket.emit('init', allPlayers());            // قائمة الموجودين للقادم
    socket.broadcast.emit('playerJoined', player); // إعلان للباقين
    io.emit('playerCount', players.size);
    console.log('🎮 انضم:', player.name, '| المتصلون:', players.size);
  });

  // 2) تحديث الموقع أثناء الحركة
  socket.on('move', (pos = {}) => {
    const p = players.get(socket.id);
    if (!p) return;
    p.x = clampNum(pos.x, -LIMIT, LIMIT) ?? p.x;
    p.y = clampNum(pos.y, -LIMIT, LIMIT) ?? p.y;
    p.angle = pos.angle || 0;
    p.lastSeen = Date.now();
    socket.broadcast.emit('playerMoved', { id: socket.id, x: p.x, y: p.y, angle: p.angle });
  });

  // 3) دردشة عامة
  socket.on('chat', (text) => {
    const p = players.get(socket.id);
    if (!p) return;
    const clean = String(text).slice(0, 120).trim();
    if (!clean) return;
    io.emit('chat', { id: socket.id, name: p.name, text: clean, time: Date.now() });
  });

  // 4) خروج لاعب
  socket.on('disconnect', () => {
    players.delete(socket.id);
    io.emit('playerLeft', socket.id);
    io.emit('playerCount', players.size);
  });
});

// تنظيف اللاعبين المتجمدين (30 ثانية بلا حركة)
setInterval(() => {
  const now = Date.now();
  players.forEach((p, id) => {
    if (now - p.lastSeen > 30000) {
      players.delete(id);
      io.emit('playerLeft', id);
      io.emit('playerCount', players.size);
    }
  });
}, 5000);

// أدوات مساعدة
function allPlayers() {
  return Array.from(players.values()).map(p => ({
    id: p.id, name: p.name, color: p.color, x: p.x, y: p.y, angle: p.angle
  }));
}
function clampNum(v, min, max) {
  const n = Number(v);
  if (isNaN(n)) return null;
  return Math.min(max, Math.max(min, n));
}

server.listen(PORT, () => {
  console.log('🚀 السيرفر يعمل على المنفذ', PORT);
});
