const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
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

// Yönetici Kimlik Bilgileri
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'faruk';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'earena202627';
const ADMIN_TOKEN = crypto.randomBytes(24).toString('hex');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Bellekte katılımcı listesi
// Yapı: { id, name, studentId, timestamp }
let participants = [];

// Canlı Katılım Durumu (Yönetici Kontrolü - Varsayılan: Açık)
let registrationOpen = true;

// Mobil Katılım URL'i (Render Canlı Yayını)
const MOBILE_URL = process.env.BASE_URL || 'https://e-arena-cekilis.onrender.com/katil.html';
let qrDataUrl = '';

// QRCode ile data URL formatında QR kod görseli üret
async function generateQrCode() {
  try {
    qrDataUrl = await QRCode.toDataURL(MOBILE_URL, {
      width: 320,
      margin: 1.5,
      color: {
        dark: '#ffffff',
        light: '#0a0a0c'
      },
      errorCorrectionLevel: 'M'
    });
    console.log(`[QR Kod Üretildi] Canlı Katılım Bağlantısı: ${MOBILE_URL}`);
  } catch (err) {
    console.error('QR Kod üretilemedi:', err);
  }
}

// REST API Uç Noktaları
app.get('/api/info', async (req, res) => {
  if (!qrDataUrl) {
    await generateQrCode();
  }
  res.json({
    mobileJoinUrl: MOBILE_URL,
    qrDataUrl,
    participantCount: participants.length,
    registrationOpen
  });
});

app.get('/api/participants', (req, res) => {
  res.json(participants);
});

// Yönetici Giriş API'si
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return res.json({ success: true, token: ADMIN_TOKEN, username: ADMIN_USERNAME });
  }
  return res.status(401).json({ success: false, message: 'Hatalı kullanıcı adı veya şifre!' });
});

// Yönetici Oturum Doğrulama API'si
app.post('/api/admin/verify', (req, res) => {
  const { token } = req.body || {};
  if (token && token === ADMIN_TOKEN) {
    return res.json({ success: true, username: ADMIN_USERNAME });
  }
  return res.status(401).json({ success: false, message: 'Oturum süresi doldu veya geçersiz!' });
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

  // 2. 9 Haneli ve 20-26 ile Başlayan Öğrenci Numarası Doğrulaması
  // Kural: Tam 9 hane ve sadece '20','21','22','23','24','25','26' ile başlamalı
  const studentIdRegex = /^(20|21|22|23|24|25|26)\d{7}$/;
  if (!studentIdRegex.test(cleanStudentId)) {
    return { success: false, message: 'Geçerli bir öğrenci numarası giriniz!' };
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
  if (!qrDataUrl) {
    await generateQrCode();
  }

  // Yeni bağlanan istemciye güncel verileri ilet
  socket.emit('init_data', {
    participants,
    mobileJoinUrl: MOBILE_URL,
    qrDataUrl,
    registrationOpen
  });

  // Yönetici Girişi / Oturum Doğrulama
  socket.on('admin_login', (data, callback) => {
    const { username, password, token } = data || {};
    const isValid = (token && token === ADMIN_TOKEN) ||
                    (username === ADMIN_USERNAME && password === ADMIN_PASSWORD);
    
    if (isValid) {
      socket.data.isAdmin = true;
      if (typeof callback === 'function') {
        callback({ success: true, token: ADMIN_TOKEN, username: ADMIN_USERNAME });
      }
      console.log(`[Yönetici Doğrulandı] Socket ID: ${socket.id}`);
    } else {
      socket.data.isAdmin = false;
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Hatalı kullanıcı adı veya şifre!' });
      }
    }
  });

  // Yönetici Yetki Kontrolü Yardımcısı
  function checkAdmin(callback) {
    if (!socket.data || !socket.data.isAdmin) {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Yetkisiz erişim! Yönetici girişi gereklidir.' });
      }
      console.warn(`[Yetkisiz İşlem Reddedildi] Socket ID: ${socket.id}`);
      return false;
    }
    return true;
  }

  // Yönetici: Katılımı Durdur / Başlat (Toggle Registration)
  socket.on('toggle_registration', (callback) => {
    if (!checkAdmin(callback)) return;
    registrationOpen = !registrationOpen;
    io.emit('registration_status_changed', { registrationOpen });
    console.log(`[Katılım Durumu Güncellendi] registrationOpen = ${registrationOpen}`);
    if (typeof callback === 'function') {
      callback({ success: true, registrationOpen });
    }
  });

  // Mobil veya harici kayıttan gelen 'join_draw' olayı
  socket.on('join_draw', (data, callback) => {
    const result = addParticipant(data?.name, data?.studentId);
    if (typeof callback === 'function') {
      callback(result);
    }
  });

  // Kazanan belirlendiğinde otomatik çıkarma (Yönetici yetkisi gerekir)
  socket.on('remove_winner', (winnerData, callback) => {
    if (!checkAdmin(callback)) return;
    removeWinner(winnerData);
    if (typeof callback === 'function') {
      callback({ success: true });
    }
  });

  // Yönetici listeyi sıfırladığında (Yönetici yetkisi gerekir)
  socket.on('reset_list', (callback) => {
    if (!checkAdmin(callback)) return;
    resetParticipants();
    if (typeof callback === 'function') {
      callback({ success: true });
    }
  });

  // Test verisi ekleme talebi (Yönetici yetkisi gerekir)
  socket.on('add_sample_data', (callback) => {
    if (!checkAdmin(callback)) return;
    const samples = [
      { name: 'Ahmet Yılmaz', studentId: '220101001' },
      { name: 'Zeynep Kaya', studentId: '220101002' },
      { name: 'Burak Demir', studentId: '220101003' },
      { name: 'Elif Şahin', studentId: '230101004' },
      { name: 'Emre Çelik', studentId: '240101005' },
      { name: 'Selin Aydın', studentId: '250101006' },
      { name: 'Can Özkan', studentId: '260101007' },
      { name: 'Merve Arslan', studentId: '210101008' }
    ];
    samples.forEach(s => addParticipant(s.name, s.studentId));
    if (typeof callback === 'function') {
      callback({ success: true });
    }
  });
});

// Başlatma
async function startServer() {
  await generateQrCode();

  server.listen(PORT, () => {
    console.log('====================================================');
    console.log('⚡ E-ARENA VE TEKNOLOJİ TOPLULUĞU ÇEKİLİŞ ÇARKI SUNUCUSU');
    console.log(`🚀 Sahne / Projeksiyon Ekranı: http://localhost:${PORT}`);
    console.log(`📱 Mobil Katılım URL:         ${MOBILE_URL}`);
    console.log(`👤 Yönetici Kullanıcı Adı:    ${ADMIN_USERNAME}`);
    console.log('====================================================');
  });
}

startServer();
