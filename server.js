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
const ADMIN_TOKEN = crypto.createHash('sha256').update(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}:earena2026_fixed_auth`).digest('hex');

// Socket.io Handshake Kimlik Doğrulama Middleware'i
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token && token === ADMIN_TOKEN) {
    socket.data.isAdmin = true;
  }
  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Bellekte katılımcı listesi (Çarkta olanlar)
// Yapı: { id, name, studentId, timestamp }
let participants = [];

// Tüm kayıt geçmişi ve katılımcı havuzu (Çekilişten çıksa dahi kaybolmaz)
// Yapı: { id, name, studentId, timestamp, isWon: boolean }
let participantArchive = [];

// Arşivin anlık durumunu (çarkta aktif mi, çıkarıldı mı, kazandı mı) hesapla
function getArchiveWithStatus() {
  return participantArchive.map(p => {
    const inWheel = participants.some(cur => cur.studentId === p.studentId);
    return {
      id: p.id,
      name: p.name,
      studentId: p.studentId,
      timestamp: p.timestamp,
      isWon: Boolean(p.isWon),
      inWheel: inWheel,
      status: inWheel ? 'active' : (p.isWon ? 'won' : 'removed')
    };
  });
}

function broadcastState() {
  io.emit('update_participants', participants);
  io.emit('update_archive', getArchiveWithStatus());
}

// Canlı Katılım Durumu (Yönetici Kontrolü - Varsayılan: Açık)
let registrationOpen = true;

// Mobil Katılım URL'i (Render Canlı Yayını)
const MOBILE_URL = process.env.BASE_URL || 'https://e-arena-cekilis.onrender.com/katil.html';
let qrDataUrl = '';

// QRCode ile data URL formatında QR kod görseli üret (Standart yüksek kontrast, beyaz zemin & net kenar boşluğu)
async function generateQrCode() {
  try {
    qrDataUrl = await QRCode.toDataURL(MOBILE_URL, {
      width: 400,
      margin: 3,
      color: {
        dark: '#000000',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'H'
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

// Kayıtlı Tüm Katılımcı Havuzu (Arşiv)
app.get('/api/archive', (req, res) => {
  res.json(getArchiveWithStatus());
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

// Katılımcı ekleme mantığı ve havuz yönetimi
function addParticipant(name, studentId, isAdminBypass = false) {
  // 1. Canlı katılım açık mı kontrolü (Yönetici manuel eklemelerinde bypass edilebilir)
  if (!registrationOpen && !isAdminBypass) {
    return { success: false, message: 'Çekiliş kayıtları geçici olarak durdurulmuştur.' };
  }

  const cleanName = (name || '').trim();
  const cleanStudentId = (studentId || '').trim();

  if (!cleanName || cleanName.length < 2) {
    return { success: false, message: 'Lütfen geçerli bir Ad Soyad giriniz (en az 2 karakter).' };
  }

  // 2. 9 Haneli ve 20-26 ile Başlayan Öğrenci Numarası Doğrulaması
  const studentIdRegex = /^(20|21|22|23|24|25|26)\d{7}$/;
  if (!studentIdRegex.test(cleanStudentId)) {
    return { success: false, message: 'Geçerli bir öğrenci numarası giriniz!' };
  }

  // 3. Çarkta zaten aktif mi kontrolü (Mükerrer aktif kayıt engeli)
  const isAlreadyActive = participants.some(
    p => p.studentId === cleanStudentId
  );

  if (isAlreadyActive) {
    return { success: false, message: 'Bu öğrenci numarası ile zaten çarkta aktif kayıt var!' };
  }

  // Havuzda daha önce var mı kontrolü
  let archiveItem = participantArchive.find(p => p.studentId === cleanStudentId);
  if (archiveItem) {
    archiveItem.name = cleanName || archiveItem.name;
    archiveItem.isWon = false;
  } else {
    archiveItem = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
      name: cleanName,
      studentId: cleanStudentId,
      timestamp: Date.now(),
      isWon: false
    };
    participantArchive.push(archiveItem);
  }

  const newParticipant = {
    id: archiveItem.id,
    name: archiveItem.name,
    studentId: archiveItem.studentId,
    timestamp: archiveItem.timestamp
  };

  participants.push(newParticipant);

  // Socket.io ile tüm istemcilere anında yay
  io.emit('participant_added', newParticipant);
  broadcastState();

  return { success: true, participant: newParticipant };
}

// Katılımcıyı aktif çarktan çıkarma (Kazanan veya manuel silme)
function removeParticipant(identifier, isWinner = false) {
  if (!identifier) return false;
  const initialLen = participants.length;

  let targetId = null;
  let targetStudentId = null;

  participants = participants.filter(p => {
    let match = false;
    if (typeof identifier === 'object') {
      if (identifier.id && p.id === identifier.id) match = true;
      if (identifier.studentId && p.studentId === identifier.studentId) match = true;
      if (identifier.name && p.name.toLowerCase() === identifier.name.toLowerCase()) match = true;
    } else {
      const clean = String(identifier).trim();
      if (p.id === clean || p.studentId === clean) match = true;
    }
    if (match) {
      targetId = p.id;
      targetStudentId = p.studentId;
      return false;
    }
    return true;
  });

  const removed = participants.length < initialLen;
  if (removed) {
    // Arşivdeki durumunu güncelle (silinmez, sadece çarktan düşer)
    const arch = participantArchive.find(p => 
      (targetId && p.id === targetId) || 
      (targetStudentId && p.studentId === targetStudentId)
    );
    if (arch && isWinner) {
      arch.isWon = true;
    }
    broadcastState();
    io.emit('participant_removed', identifier);
    console.log(`[Katılımcı Çarktan Çıkarıldı] ID: ${targetId || identifier}, Kazanan: ${isWinner}`);
  }
  return removed;
}

// Katılımcıyı Manuel Olarak Düzenleme (İsim güncelleme)
function editParticipant(studentId, newName) {
  const cleanId = String(studentId || '').trim();
  const cleanName = String(newName || '').trim();
  if (!cleanId || !cleanName || cleanName.length < 2) {
    return { success: false, message: 'Lütfen geçerli bir Ad Soyad giriniz (en az 2 karakter)!' };
  }
  let edited = false;
  participants.forEach(p => {
    if (p.studentId === cleanId) {
      p.name = cleanName;
      edited = true;
    }
  });
  participantArchive.forEach(p => {
    if (p.studentId === cleanId) {
      p.name = cleanName;
      edited = true;
    }
  });
  if (edited) {
    broadcastState();
    console.log(`[Katılımcı Düzenlendi] Öğrenci No: ${cleanId}, Yeni İsim: ${cleanName}`);
    return { success: true, message: 'Katılımcı güncellendi.' };
  }
  return { success: false, message: 'Katılımcı bulunamadı!' };
}

// Çıkarılmış kişiyi havuza bakarak çarka geri ekleme
function readdParticipant(identifier) {
  if (!identifier) return { success: false, message: 'Geçersiz parametre!' };

  let target = null;
  if (typeof identifier === 'object') {
    target = participantArchive.find(p => 
      (identifier.studentId && p.studentId === identifier.studentId) ||
      (identifier.id && p.id === identifier.id)
    );
  } else {
    const clean = String(identifier).trim();
    target = participantArchive.find(p => p.studentId === clean || p.id === clean);
  }

  if (!target) {
    return { success: false, message: 'Katılımcı havuzda bulunamadı!' };
  }

  const alreadyActive = participants.some(p => p.studentId === target.studentId);
  if (alreadyActive) {
    return { success: false, message: 'Bu kişi zaten çarkta aktif!' };
  }

  const restored = {
    id: target.id,
    name: target.name,
    studentId: target.studentId,
    timestamp: Date.now()
  };

  participants.push(restored);
  target.isWon = false;

  broadcastState();
  console.log(`[Katılımcı Çarka Geri Alındı] ${target.name} (${target.studentId})`);

  return { success: true, participant: restored };
}

// Çark listesini sıfırlama (Havuz korunur!)
function resetParticipants() {
  participants = [];
  broadcastState();
  io.emit('list_cleared');
  console.log('[Liste Sıfırlandı] Çark katılımcıları temizlendi, havuz korundu.');
}

// Havuzu ve çarkı tamamen sıfırlama (İsteğe bağlı tam temizlik)
function clearArchive() {
  participants = [];
  participantArchive = [];
  broadcastState();
  io.emit('list_cleared');
  console.log('[Tam Temizlik] Tüm havuz ve çark temizlendi.');
}

// Socket.io Bağlantı Olayları
io.on('connection', async (socket) => {
  if (!qrDataUrl) {
    await generateQrCode();
  }

  // Yeni bağlanan istemciye güncel verileri ilet
  socket.emit('init_data', {
    participants,
    archive: getArchiveWithStatus(),
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
  function checkAdmin(data, callback) {
    const cb = typeof data === 'function' ? data : callback;
    const token = (typeof data === 'object' && data?.token) || socket.handshake.auth?.token;
    if (socket.data?.isAdmin || (token && token === ADMIN_TOKEN)) {
      socket.data.isAdmin = true;
      return true;
    }
    if (typeof cb === 'function') {
      cb({ success: false, message: 'Yetkisiz erişim! Yönetici girişi gereklidir.' });
    }
    console.warn(`[Yetkisiz İşlem Reddedildi] Socket ID: ${socket.id}`);
    return false;
  }

  // Yönetici: Katılımı Durdur / Başlat (Toggle Registration)
  socket.on('toggle_registration', (data, callback) => {
    if (!checkAdmin(data, callback)) return;
    registrationOpen = !registrationOpen;
    io.emit('registration_status_changed', { registrationOpen });
    console.log(`[Katılım Durumu Güncellendi] registrationOpen = ${registrationOpen}`);
    const cb = typeof data === 'function' ? data : callback;
    if (typeof cb === 'function') {
      cb({ success: true, registrationOpen });
    }
  });

  // Mobil veya harici kayıttan gelen 'join_draw' olayı
  socket.on('join_draw', (data, callback) => {
    const result = addParticipant(data?.name, data?.studentId);
    if (typeof callback === 'function') {
      callback(result);
    }
  });

  // Yönetici Ekranından Manuel Katılımcı Ekleme
  socket.on('admin_add_participant', (data, callback) => {
    if (!checkAdmin(data, callback)) return;
    const result = addParticipant(data?.name, data?.studentId, true);
    const cb = typeof callback === 'function' ? callback : (typeof data === 'function' ? data : null);
    if (typeof cb === 'function') {
      cb(result);
    }
  });

  // Katılımcıyı Manuel Olarak Silme
  socket.on('remove_participant', (data, callback) => {
    if (!checkAdmin(data, callback)) return;
    const identifier = data?.studentId || data?.id || data;
    const removed = removeParticipant(identifier);
    const cb = typeof data === 'function' ? data : callback;
    if (typeof cb === 'function') {
      cb({ success: removed });
    }
  });

  // Katılımcıyı Manuel Olarak Düzenleme (İsim güncelleme)
  socket.on('edit_participant', (data, callback) => {
    if (!checkAdmin(data, callback)) return;
    const result = editParticipant(data?.studentId, data?.newName || data?.name);
    const cb = typeof data === 'function' ? data : callback;
    if (typeof cb === 'function') {
      cb(result);
    }
  });

  // Çıkarılmış katılımcıyı çarka geri alma (Havuzdan manuel sokma)
  socket.on('readd_participant', (data, callback) => {
    if (!checkAdmin(data, callback)) return;
    const identifier = data?.studentId || data?.id || data;
    const result = readdParticipant(identifier);
    const cb = typeof data === 'function' ? data : callback;
    if (typeof cb === 'function') {
      cb(result);
    }
  });

  // Kayıtlı tüm katılımcı havuzunu getirme
  socket.on('get_archive', (data, callback) => {
    const cb = typeof data === 'function' ? data : callback;
    if (typeof cb === 'function') {
      cb({ success: true, archive: getArchiveWithStatus() });
    }
  });

  // Kazanan belirlendiğinde listeden çıkarma
  socket.on('remove_winner', (data, callback) => {
    if (!checkAdmin(data, callback)) return;
    const identifier = data?.winner || data?.studentId ? (data.winner || data) : data;
    const removed = removeParticipant(identifier, true);
    const cb = typeof data === 'function' ? data : callback;
    if (typeof cb === 'function') {
      cb({ success: removed });
    }
  });

  // Yönetici listeyi sıfırladığında (reset_participants ve reset_list)
  socket.on('reset_participants', (data, callback) => {
    if (!checkAdmin(data, callback)) return;
    resetParticipants();
    const cb = typeof data === 'function' ? data : callback;
    if (typeof cb === 'function') {
      cb({ success: true });
    }
  });

  socket.on('reset_list', (data, callback) => {
    if (!checkAdmin(data, callback)) return;
    resetParticipants();
    const cb = typeof data === 'function' ? data : callback;
    if (typeof cb === 'function') {
      cb({ success: true });
    }
  });

  // Tüm havuzu ve arşivi tamamen sıfırlama
  socket.on('clear_archive', (data, callback) => {
    if (!checkAdmin(data, callback)) return;
    clearArchive();
    const cb = typeof data === 'function' ? data : callback;
    if (typeof cb === 'function') {
      cb({ success: true });
    }
  });

  // Test verisi ekleme talebi (Yönetici yetkisi gerekir)
  socket.on('add_sample_data', (data, callback) => {
    if (!checkAdmin(data, callback)) return;
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
    samples.forEach(s => addParticipant(s.name, s.studentId, true));
    const cb = typeof data === 'function' ? data : callback;
    if (typeof cb === 'function') {
      cb({ success: true });
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
