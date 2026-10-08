const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Bellekte katılımcı listesi
// Yapı: { id, name, studentId, timestamp }
let participants = [];

// Canlı Katılım Durumu (Yönetici Kontrolü - Varsayılan: Açık)
let registrationOpen = true;

// Yerel IP Adresini otomatik tespit etme
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Render, Özel Domain (Custom Domain) veya Yerel Ağ için Dinamik Base URL
function getBaseUrl(reqOrSocket) {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, '');
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  
  const headers = reqOrSocket?.headers || reqOrSocket?.handshake?.headers;
  if (headers && headers.host) {
    const host = headers.host;
    // Eğer localhost değilse (Render, ngrok, custom domain vb.)
    if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
      const proto = headers['x-forwarded-proto'] || (headers.referer?.startsWith('https') ? 'https' : 'http');
      return `${proto}://${host}`;
    }
  }
  
  const localIp = getLocalIpAddress();
  return `http://${localIp}:${PORT}`;
}

const qrCache = new Map();

async function getQrCodeForUrl(url) {
  if (qrCache.has(url)) return qrCache.get(url);
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      width: 320,
      margin: 1.5,
      color: {
        dark: '#ffffff',
        light: '#0a0a0c'
      },
      errorCorrectionLevel: 'M'
    });
    qrCache.set(url, dataUrl);
    return dataUrl;
  } catch (err) {
    console.error('QR Kod üretilemedi:', err);
    return '';
  }
}

// REST API Uç Noktaları
app.get('/api/info', async (req, res) => {
  const baseUrl = getBaseUrl(req);
  const joinUrl = `${baseUrl}/katil.html`;
  const qrUrl = await getQrCodeForUrl(joinUrl);
  res.json({
    mobileJoinUrl: joinUrl,
    qrDataUrl: qrUrl,
    participantCount: participants.length,
    registrationOpen
  });
});

app.get('/api/participants', (req, res) => {
  res.json(participants);
});

// HTTP üzerinden katılım desteği (yedek olarak)
app.post('/api/join', (req, res) => {
  const { name, studentId } = req.body;
  const result = addParticipant(name, studentId);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

// HTTP üzerinden katılımı durdurma / açma desteği
app.post('/api/toggle-registration', (req, res) => {
  registrationOpen = !registrationOpen;
  io.emit('registration_status_changed', { registrationOpen });
  res.json({ success: true, registrationOpen });
});

// Katılımcı ekleme mantığı ve mükerrer kontrolü
function addParticipant(name, studentId) {
  // 1. Canlı katılım açık mı kontrolü
  if (!registrationOpen) {
    return { success: false, message: 'Çekiliş kayıtları geçici olarak durdurulmuştur.' };
  }

  const cleanName = (name || '').trim();
  const cleanStudentId = (studentId || '').trim();

  if (!cleanName || cleanName.length < 2) {
    return { success: false, message: 'Lütfen geçerli bir Ad Soyad giriniz (en az 2 karakter).' };
  }

  // 2. 9 Haneli Öğrenci Numarası Doğrulaması (Sadece rakam ve tam 9 basamak)
  const studentIdRegex = /^\d{9}$/;
  if (!studentIdRegex.test(cleanStudentId)) {
    return { success: false, message: 'Öğrenci numarası tam olarak 9 basamaklı rakamlardan oluşmalıdır!' };
  }

  // 3. Mükerrer Kayıt Engeli (Aynı öğrenci numarası ile yalnızca 1 kez kayıt)
  const isDuplicateId = participants.some(
    p => p.studentId === cleanStudentId
  );

  if (isDuplicateId) {
    return { success: false, message: 'Bu öğrenci numarası ile zaten kayıt yapılmış!' };
  }

  const newParticipant = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
    name: cleanName,
    studentId: cleanStudentId,
    timestamp: Date.now()
  };

  participants.push(newParticipant);

  // Socket.io ile tüm istemcilere anında yay
  io.emit('participant_added', newParticipant);
  io.emit('update_participants', participants);

  return { success: true, participant: newParticipant };
}

// Kazananı listeden çıkarma
function removeWinner(identifier) {
  if (!identifier) return false;
  const initialLen = participants.length;
  
  participants = participants.filter(p => {
    if (typeof identifier === 'object') {
      if (identifier.id && p.id === identifier.id) return false;
      if (identifier.studentId && p.studentId.toLowerCase() === identifier.studentId.toLowerCase()) return false;
      if (identifier.name && p.name.toLowerCase() === identifier.name.toLowerCase()) return false;
    } else {
      if (p.id === identifier || p.studentId === identifier || p.name === identifier) return false;
    }
    return true;
  });

  const removed = participants.length < initialLen;
  if (removed) {
    io.emit('update_participants', participants);
    io.emit('winner_removed', identifier);
  }
  return removed;
}

// Listeyi tamamen sıfırlama
function resetParticipants() {
  participants = [];
  io.emit('update_participants', participants);
  io.emit('list_cleared');
}

// Socket.io Bağlantı Olayları
io.on('connection', async (socket) => {
  const baseUrl = getBaseUrl(socket);
  const clientJoinUrl = `${baseUrl}/katil.html`;
  const clientQr = await getQrCodeForUrl(clientJoinUrl);

  // Yeni bağlanan istemciye güncel verileri ilet
  socket.emit('init_data', {
    participants,
    mobileJoinUrl: clientJoinUrl,
    qrDataUrl: clientQr,
    registrationOpen
  });

  // Yönetici: Katılımı Durdur / Başlat (Toggle Registration)
  socket.on('toggle_registration', () => {
    registrationOpen = !registrationOpen;
    io.emit('registration_status_changed', { registrationOpen });
    console.log(`[Katılım Durumu Güncellendi] registrationOpen = ${registrationOpen}`);
  });

  // Mobil veya harici kayıttan gelen 'join_draw' olayı
  socket.on('join_draw', (data, callback) => {
    const result = addParticipant(data?.name, data?.studentId);
    if (typeof callback === 'function') {
      callback(result);
    }
  });

  // Kazanan belirlendiğinde otomatik çıkarma
  socket.on('remove_winner', (winnerData) => {
    removeWinner(winnerData);
  });

  // Yönetici listeyi sıfırladığında
  socket.on('reset_list', () => {
    resetParticipants();
  });

  // Test verisi ekleme talebi (isteğe bağlı sunum öncesi prova)
  socket.on('add_sample_data', () => {
    const samples = [
      { name: 'Ahmet Yılmaz', studentId: '220101001' },
      { name: 'Zeynep Kaya', studentId: '220101002' },
      { name: 'Burak Demir', studentId: '220101003' },
      { name: 'Elif Şahin', studentId: '220101004' },
      { name: 'Emre Çelik', studentId: '220101005' },
      { name: 'Selin Aydın', studentId: '220101006' },
      { name: 'Can Özkan', studentId: '220101007' },
      { name: 'Merve Arslan', studentId: '220101008' }
    ];
    samples.forEach(s => addParticipant(s.name, s.studentId));
  });
});

// Başlatma
async function startServer() {
  const defaultBaseUrl = getBaseUrl();
  const defaultJoinUrl = `${defaultBaseUrl}/katil.html`;
  await getQrCodeForUrl(defaultJoinUrl);

  server.listen(PORT, () => {
    console.log('====================================================');
    console.log('⚡ E-ARENA VE TEKNOLOJİ TOPLULUĞU ÇEKİLİŞ ÇARKI SUNUCUSU');
    console.log(`🚀 Sahne / Projeksiyon Ekranı: http://localhost:${PORT}`);
    console.log(`📱 Mobil Katılım URL:         ${defaultJoinUrl}`);
    console.log('====================================================');
  });
}

startServer();
