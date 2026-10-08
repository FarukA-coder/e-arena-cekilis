/**
 * E-Arena ve Teknoloji Topluluğu - Sahne İstemci Yönetimi (client.js)
 * Socket.io Gerçek Zamanlı Veri Akışı, Çark, Kayıt Kontrolü ve Konfeti Entegrasyonu
 */

document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // DOM Elemanları
  const wheelCanvas = document.getElementById('wheelCanvas');
  const spinBtn = document.getElementById('spinBtn');
  const resetBtn = document.getElementById('resetBtn');
  const soundBtn = document.getElementById('soundBtn');
  const addSampleBtn = document.getElementById('addSampleBtn');
  const toggleRegBtn = document.getElementById('toggleRegBtn');

  const qrImage = document.getElementById('qrImage');
  const qrUrlText = document.getElementById('qrUrlText');
  const regStatusPill = document.getElementById('regStatusPill');
  const participantCount = document.getElementById('participantCount');
  const participantsList = document.getElementById('participantsList');

  // Kazanan Modal Elemanları
  const winnerModal = document.getElementById('winnerModal');
  const winnerName = document.getElementById('winnerName');
  const winnerId = document.getElementById('winnerId');
  const closeWinnerModalBtn = document.getElementById('closeWinnerModalBtn');

  // Çark Motorunu Başlat
  const wheel = new ArenaWheel('wheelCanvas', 'wheelPointer');

  let currentParticipants = [];
  let isRegistrationOpen = true;

  // Konfeti Efekti (E-Arena Bordo, Gümüş ve Altın Tonları)
  function launchArenaConfetti() {
    if (typeof confetti === 'function') {
      const colors = ['#800020', '#8B0029', '#630018', '#420010', '#ffffff', '#e2e8f0', '#ffd700'];
      const end = Date.now() + 3.5 * 1000;

      (function frame() {
        confetti({
          particleCount: 5,
          angle: 60,
          spread: 65,
          origin: { x: 0, y: 0.7 },
          colors: colors
        });
        confetti({
          particleCount: 5,
          angle: 120,
          spread: 65,
          origin: { x: 1, y: 0.7 },
          colors: colors
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      })();
    }
  }

  // Katılım Açık / Kapalı Durumunu Arayüzde Güncelle
  function updateRegistrationUi(isOpen) {
    isRegistrationOpen = Boolean(isOpen);

    if (toggleRegBtn) {
      if (isRegistrationOpen) {
        toggleRegBtn.className = 'btn-secondary reg-btn close-mode';
        toggleRegBtn.innerHTML = '<span>🔴 Katılımları Kapat</span>';
        toggleRegBtn.title = 'Yeni katılımcı kaydını durdurmak için tıklayın';
      } else {
        toggleRegBtn.className = 'btn-secondary reg-btn open-mode';
        toggleRegBtn.innerHTML = '<span>🟢 Katılımları Aç</span>';
        toggleRegBtn.title = 'Yeni katılımcı kaydını tekrar başlatmak için tıklayın';
      }
    }

    if (regStatusPill) {
      if (isRegistrationOpen) {
        regStatusPill.className = 'reg-pill open';
        regStatusPill.textContent = 'Katılımlar Açık';
      } else {
        regStatusPill.className = 'reg-pill closed';
        regStatusPill.textContent = 'Katılımlar Durduruldu';
      }
    }
  }

  // Katılımcı Listesini Ekrana Bas
  function renderParticipantList(list) {
    currentParticipants = list;
    participantCount.textContent = `${list.length} Kişi`;

    if (list.length === 0) {
      participantsList.innerHTML = `
        <div class="empty-state">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p>Henüz katılan kimse yok.<br>Katılmak için QR kodu okutun!</p>
        </div>
      `;
    } else {
      participantsList.innerHTML = list.map((p, idx) => `
        <div class="participant-item" id="item-${p.id}">
          <div class="p-details">
            <span class="p-index">${idx + 1}</span>
            <div>
              <div class="p-name">${escapeHtml(p.name)}</div>
              <div class="p-id">${escapeHtml(p.studentId)}</div>
            </div>
          </div>
        </div>
      `).join('');
    }

    // Çarkı güncelle
    wheel.setParticipants(list);

    // Çark çevirme butonunun durumu
    spinBtn.disabled = list.length === 0 || wheel.isSpinning;
  }

  // XSS Koruması
  function escapeHtml(str) {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================================================
  // SOCKET.IO OLAYLARI
  // ==========================================================================

  // Sunucuya ilk bağlandığında verileri al
  socket.on('init_data', (data) => {
    if (data.qrDataUrl) {
      qrImage.src = data.qrDataUrl;
    }
    if (data.mobileJoinUrl) {
      qrUrlText.textContent = data.mobileJoinUrl;
    }
    if (data.registrationOpen !== undefined) {
      updateRegistrationUi(data.registrationOpen);
    }
    renderParticipantList(data.participants || []);
  });

  // Katılım durumu (Açık/Kapalı) değiştiğinde
  socket.on('registration_status_changed', (data) => {
    if (data.registrationOpen !== undefined) {
      updateRegistrationUi(data.registrationOpen);
    }
  });

  // Katılımcı listesi güncellendiğinde
  socket.on('update_participants', (list) => {
    renderParticipantList(list || []);
  });

  // Yeni katılımcı anında eklendiğinde
  socket.on('participant_added', (participant) => {
    // Liste renderParticipantList ile otomatik güncelleniyor
  });

  // ==========================================================================
  // ETKİLEŞİMLER & BUTONLAR
  // ==========================================================================

  // Yönetici: Katılımı Durdur / Aç (Toggle Registration)
  if (toggleRegBtn) {
    toggleRegBtn.addEventListener('click', () => {
      socket.emit('toggle_registration');
    });
  }

  // Çarkı Çevir
  spinBtn.addEventListener('click', () => {
    if (wheel.isSpinning || currentParticipants.length === 0) return;

    spinBtn.disabled = true;
    spinBtn.innerHTML = `<span>DÖNÜYOR...</span>`;

    wheel.spin((winner) => {
      // Çark durdu! Kazanan belirlendi.
      spinBtn.innerHTML = `<span>🎲 ÇARK'I ÇEVİR</span>`;
      spinBtn.disabled = currentParticipants.length <= 1; // 1 kişi vardıysa artık kalmayacak

      // Kazanan bilgilerini modala doldur
      winnerName.textContent = winner.name;
      winnerId.textContent = winner.studentId;

      // Modalı aç
      winnerModal.classList.add('active');

      // Konfeti patlat
      launchArenaConfetti();

      // Kazanan otomatik olarak listeden ve çarktan düşürülür
      socket.emit('remove_winner', winner);
    });
  });

  // Kazanan Modalını Kapat
  closeWinnerModalBtn.addEventListener('click', () => {
    winnerModal.classList.remove('active');
  });

  // Listeyi Sıfırla
  resetBtn.addEventListener('click', () => {
    if (wheel.isSpinning) return;
    if (confirm('Tüm katılımcı listesini sıfırlamak istediğinize emin misiniz?')) {
      socket.emit('reset_list');
    }
  });

  // Hızlı Test Verisi Ekle (Provada kolaylık için)
  addSampleBtn.addEventListener('click', () => {
    if (wheel.isSpinning) return;
    socket.emit('add_sample_data');
  });

  // Ses Aç / Kapat
  soundBtn.addEventListener('click', () => {
    const isEnabled = wheel.toggleSound();
    soundBtn.innerHTML = isEnabled 
      ? `<span>🔊 Ses: Açık</span>` 
      : `<span>🔇 Ses: Kapalı</span>`;
  });

  // Çarka tıklandığında da çevirme desteği
  wheelCanvas.addEventListener('click', () => {
    if (!wheel.isSpinning && currentParticipants.length > 0) {
      spinBtn.click();
    }
  });
});
