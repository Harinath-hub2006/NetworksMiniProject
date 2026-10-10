const socket = io('http://localhost:3000');

const loginModal = document.getElementById('login-modal');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');

const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('color-picker');
const sizePicker = document.getElementById('size-picker');
const sizeVal = document.getElementById('size-val');
const undoBtn = document.getElementById('undo-btn');
const eraserBtn = document.getElementById('eraser-btn');
const clearBtn = document.getElementById('clear-btn');
const usersList = document.getElementById('users-list');
const canvasWrapper = document.getElementById('canvas-wrapper');

const statusBanner = document.getElementById('status-banner');
const connStatus = document.getElementById('conn-status');
const pingVal = document.getElementById('ping-val');

let drawing = false;
let isEraser = false;
let currentColor = '#000000';
let currentSize = 5;
let lastX = 0;
let lastY = 0;
const remoteCursors = {};

// --- Network Lifecycle & Latency (RTT) Tracking ---
socket.on('connect', () => {
  statusBanner.textContent = "Connected to Server";
  statusBanner.className = "status-connected";
  connStatus.textContent = "Connected";
  connStatus.style.color = "green";
  measurePing();
});

socket.on('disconnect', () => {
  statusBanner.textContent = "Disconnected! Attempting to reconnect...";
  statusBanner.className = "status-disconnected";
  connStatus.textContent = "Disconnected";
  connStatus.style.color = "red";
  pingVal.textContent = "--";
});

// Calculate Round Trip Time (RTT) periodically
function measurePing() {
  if (!socket.connected) return;
  const start = Date.now();
  socket.emit('ping', () => {
    const latency = Date.now() - start;
    pingVal.textContent = latency;
  });
}
setInterval(measurePing, 3000);

// Canvas Resize Logic
function resizeCanvas() {
  const rect = canvasWrapper.getBoundingClientRect();
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  tempCtx.drawImage(canvas, 0, 0);

  canvas.width = rect.width;
  canvas.height = rect.height;
  ctx.drawImage(tempCanvas, 0, 0);
}
window.addEventListener('resize', resizeCanvas);

// Room Join
joinBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  const room = roomInput.value.trim();
  if (!username || !room) {
    alert('Please enter both name and room ID!');
    return;
  }
  socket.emit('join-room', { room, username });
  loginModal.style.display = 'none';
  resizeCanvas();
});

// Tools
colorPicker.addEventListener('input', (e) => { currentColor = e.target.value; isEraser = false; eraserBtn.style.background = '#f8f9fa'; });
sizePicker.addEventListener('input', (e) => { currentSize = e.target.value; sizeVal.textContent = currentSize; });
eraserBtn.addEventListener('click', () => {
  isEraser = !isEraser;
  eraserBtn.style.background = isEraser ? '#ffc107' : '#f8f9fa';
});

undoBtn.addEventListener('click', () => {
  socket.emit('undo');
});

// Drawing Events
canvas.addEventListener('mousedown', (e) => {
  drawing = true;
  [lastX, lastY] = [e.offsetX, e.offsetY];
});

canvas.addEventListener('mousemove', (e) => {
  socket.emit('cursor-move', { x: e.offsetX, y: e.offsetY });
  if (!drawing) return;

  const currentX = e.offsetX;
  const currentY = e.offsetY;
  const color = isEraser ? '#ffffff' : currentColor;
  const size = isEraser ? currentSize * 3 : currentSize;

  drawLine(lastX, lastY, currentX, currentY, color, size);
  socket.emit('draw', { x0: lastX, y0: lastY, x1: currentX, y1: currentY, color, size });
  [lastX, lastY] = [currentX, currentY];
});

window.addEventListener('mouseup', () => { drawing = false; });

function drawLine(x0, y0, x1, y1, color, size) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.closePath();
}

socket.on('draw', (data) => {
  drawLine(data.x0, data.y0, data.x1, data.y1, data.color, data.size);
});

socket.on('load-history', (history) => {
  history.forEach(data => {
    drawLine(data.x0, data.y0, data.x1, data.y1, data.color, data.size);
  });
});

socket.on('refresh-canvas', (history) => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  history.forEach(data => {
    drawLine(data.x0, data.y0, data.x1, data.y1, data.color, data.size);
  });
});

clearBtn.addEventListener('click', () => { socket.emit('clear-canvas'); });
socket.on('clear-canvas', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); });

socket.on('update-users', (users) => {
  usersList.innerHTML = '';
  users.forEach(user => {
    const li = document.createElement('li');
    li.textContent = user.username;
    usersList.appendChild(li);
  });
});

socket.on('cursor-move', (data) => {
  let cursorEl = remoteCursors[data.id];
  if (!cursorEl) {
    cursorEl = document.createElement('div');
    cursorEl.className = 'remote-cursor';
    cursorEl.innerHTML = `<div class="cursor-dot"></div><div class="cursor-label">${data.username}</div>`;
    canvasWrapper.appendChild(cursorEl);
    remoteCursors[data.id] = cursorEl;
  }
  cursorEl.style.left = `${data.x}px`;
  cursorEl.style.top = `${data.y}px`;
});