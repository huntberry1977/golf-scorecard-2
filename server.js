const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data', 'rounds.json');

app.use(express.json());
app.use(express.static(__dirname));

// Initialize data file
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ rounds: [], players: [] }));
}

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Get all rounds
app.get('/api/rounds', (req, res) => {
  res.json(readData());
});

// Save/update round
app.post('/api/rounds', (req, res) => {
  const data = readData();
  const round = req.body;
  round.id = round.id || Date.now().toString();
  round.updatedAt = new Date().toISOString();
  const idx = data.rounds.findIndex(r => r.id === round.id);
  if (idx >= 0) data.rounds[idx] = round;
  else data.rounds.push(round);
  writeData(data);
  res.json(round);
});

// Delete round
app.delete('/api/rounds/:id', (req, res) => {
  const data = readData();
  data.rounds = data.rounds.filter(r => r.id !== req.params.id);
  writeData(data);
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`⛳ 골프 스코어카드 서버 실행 중`);
  console.log(`   로컬: http://localhost:${PORT}`);
  console.log(`   폰에서 접속: 같은 와이파이에서 http://[내 PC IP]:${PORT}`);
});
