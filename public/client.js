/**
 * E-Arena ve Teknoloji Topluluğu - Sahne İstemci Yönetimi (client.js)
 * Socket.io Gerçek Zamanlı Veri Akışı, Çark, Kimlik Doğrulama, Kayıt Kontrolü ve Konfeti
 */

document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // DOM Elemanları (Yönetim & Sahne)
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

  // Hızlı Manuel Katılımcı Ekleme Elemanları
  const manualAddForm = document.getElementById('manualAddForm');
  const manualNameInput = document.getElementById('manualNameInput');
  const manualStudentIdInput = document.getElementById('manualStudentIdInput');
  const manualAddBtn = document.getElementById('manualAddBtn');
  const manualAddAlert = document.getElementById('manualAddAlert');

  // Yönetici Giriş Paneli Elemanları
  const adminAuthOverlay = document.getElementById('adminAuthOverlay');
  const adminLoginForm = document.getElementById('adminLoginForm');
  const adminUsernameInput = document.getElementById('adminUsernameInput');
  const adminPasswordInput = document.getElementById('adminPasswordInput');
  const adminSubmitBtn = document.getElementById('adminSubmitBtn');
  const adminLoginAlert = document.getElementById('adminLoginAlert');
  const adminLogoutBtn = document.getElementById('adminLogoutBtn');

  // Kazanan Modal Elemanları
  const winnerModal = document.getElementById('winnerModal');
  const winnerName = document.getElementById('winnerName');
  const winnerId = document.getElementById('winnerId');
  const removeWinnerBtn = document.getElementById('removeWinnerBtn');
  const keepWinnerBtn = document.getElementById('keepWinnerBtn');

  // Çark Motorunu Başlat
  const wheel = new ArenaWheel('wheelCanvas', 'wheelPointer');

  let currentParticipants = [];
  let isRegistrationOpen = true;
  let isAdminAuthenticated = false;
  let currentWinner = null;

  function getAdminToken() {
    const saved = sessionStorage.getItem('earena_admin_auth');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed?.token || null;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  // ==========================================================================
  // YÖNETİCİ KİMLİK DOĞRULAMA (AUTH FLOW)
  // ==========================================================================

  function showAdminError(msg) {
    if (adminLoginAlert) {
      adminLoginAlert.textContent = msg;
      adminLoginAlert.style.display = 'block';
    }
  }

  function hideAdminError() {
    if (adminLoginAlert) {
      adminLoginAlert.style.display = 'none';
    }
  }

  function setAdminLoggedIn(authData) {
    isAdminAuthenticated = true;
    sessionStorage.setItem('earena_admin_auth', JSON.stringify({
      token: authData.token,
      username: authData.username
    }));

    if (adminAuthOverlay) {
      adminAuthOverlay.classList.add('authenticated');
    }
    if (adminLogoutBtn) {
      adminLogoutBtn.style.display = 'inline-flex';
    }
    hideAdminError();
    spinBtn.disabled = currentParticipants.length === 0 || wheel.isSpinning;
  }

  function setAdminLoggedOut() {
    isAdminAuthenticated = false;
    sessionStorage.removeItem('earena_admin_auth');
    if (adminAuthOverlay) {
      adminAuthOverlay.classList.remove('authenticated');
    }
    if (adminLogoutBtn) {
      adminLogoutBtn.style.display = 'none';
    }
    spinBtn.disabled = true;
    if (adminUsernameInput) adminUsernameInput.value = '';
    if (adminPasswordInput) adminPasswordInput.value = '';
    hideAdminError();
  }

  // Sayfa açıldığında sessionStorage kontrolü
  const savedAdminAuth = sessionStorage.getItem('earena_admin_auth');
  if (savedAdminAuth) {
    try {
      const parsed = JSON.parse(savedAdminAuth);
      if (parsed && parsed.token) {
        socket.emit('admin_login', { token: parsed.token }, (res) => {
          if (res && res.success) {
            setAdminLoggedIn(res);
          } else {
            setAdminLoggedOut();
          }
        });
      }
    } catch (e) {
      setAdminLoggedOut();
    }
  } else {
    setAdminLoggedOut();
  }

  // Yönetici Giriş Formu Gönderimi
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      hideAdminError();

      const username = adminUsernameInput.value.trim();
      const password = adminPasswordInput.value;

      if (!username || !password) {
        showAdminError('Lütfen kullanıcı adı ve şifre giriniz!');
        return;
      }

      adminSubmitBtn.disabled = true;
      adminSubmitBtn.textContent = 'Doğrulanıyor...';

      socket.emit('admin_login', { username, password }, (res) => {
        adminSubmitBtn.disabled = false;
        adminSubmitBtn.textContent = 'Sisteme Giriş Yap 🔐';

        if (res && res.success) {
          setAdminLoggedIn(res);
        } else {
          showAdminError(res?.message || 'Hatalı kullanıcı adı veya şifre!');
        }
      });
    });
  }

  // Yönetici Çıkış Butonu
  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener('click', () => {
      if (confirm('Yönetici oturumunu kapatmak istediğinize emin misiniz?')) {
        setAdminLoggedOut();
        window.location.reload();
      }
    });
  }

  // ==========================================================================
  // KONFETİ & ARAYÜZ YARDIMCILARI
  // ==========================================================================

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
          <button 
            type="button" 
            class="btn-delete-participant" 
            title="${escapeHtml(p.name)} kişisini sil" 
            data-student-id="${escapeHtml(p.studentId)}" 
            data-id="${escapeHtml(p.id)}"
          >✖</button>
        </div>
      `).join('');
    }

    // Çarkı güncelle (liste her değiştiğinde çark anında yeniden çizilir)
    wheel.setParticipants(list);

    // Çark çevirme butonu durumu (yalnızca yönetici girişi yapıldıysa)
    if (isAdminAuthenticated) {
      spinBtn.disabled = list.length === 0 || wheel.isSpinning;
    } else {
      spinBtn.disabled = true;
    }
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
    if (data.qrDataUrl && (!qrImage.getAttribute('src') || qrImage.getAttribute('src') === '')) {
      qrImage.src = data.qrDataUrl;
    }
    if (data.mobileJoinUrl) {
      qrUrlText.textContent = data.mobileJoinUrl;
      if (qrUrlText.tagName && qrUrlText.tagName.toLowerCase() === 'a') {
        qrUrlText.href = data.mobileJoinUrl;
      }
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

  // Liste sıfırlandığında sahne ekranı temizliği
  socket.on('list_cleared', () => {
    if (winnerName) winnerName.textContent = '-';
    if (winnerId) winnerId.textContent = '-';
    if (winnerModal) winnerModal.classList.remove('active');
    currentWinner = null;
  });

  // Yeni katılımcı anında eklendiğinde
  socket.on('participant_added', (participant) => {
    // Liste renderParticipantList ile otomatik güncelleniyor
  });

  // ==========================================================================
  // MANUEL KATILIMCI EKLEME & SİLME (YÖNETİCİ KORUMALI)
  // ==========================================================================

  function showManualAlert(msg, isError = true) {
    if (!manualAddAlert) return;
    manualAddAlert.textContent = msg;
    manualAddAlert.className = `manual-add-alert ${isError ? 'error' : 'success'}`;
    manualAddAlert.style.display = 'block';
    setTimeout(() => {
      manualAddAlert.style.display = 'none';
    }, 4000);
  }

  // Manuel ekleme: Öğrenci numarasını sadece rakam ve max 9 hane ile kısıtla
  if (manualStudentIdInput) {
    manualStudentIdInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 9);
    });
  }

  // Manuel Katılımcı Ekle Formu
  if (manualAddForm) {
    manualAddForm.addEventListener('submit', (e) => {
      e.preventDefault();

      if (!isAdminAuthenticated) {
        showManualAlert('Katılımcı eklemek için yönetici girişi yapmalısınız!', true);
        return;
      }

      const name = manualNameInput.value.trim();
      const studentId = manualStudentIdInput.value.trim();

      if (!name || name.length < 2) {
        showManualAlert('Lütfen geçerli bir Ad Soyad giriniz (en az 2 karakter)!', true);
        manualNameInput.focus();
        return;
      }

      // 9 Haneli ve 20-26 ile başlayan öğrenci no kontrolü
      const studentIdRegex = /^(20|21|22|23|24|25|26)\d{7}$/;
      if (!studentIdRegex.test(studentId)) {
        showManualAlert('Geçerli bir öğrenci numarası giriniz!', true);
        manualStudentIdInput.focus();
        return;
      }

      manualAddBtn.disabled = true;
      manualAddBtn.innerHTML = '<span>Ekleniyor...</span>';

      socket.emit('admin_add_participant', {
        name,
        studentId,
        token: getAdminToken()
      }, (res) => {
        manualAddBtn.disabled = false;
        manualAddBtn.innerHTML = '<span>➕ Katılımcı Ekle</span>';

        if (res && res.success) {
          manualNameInput.value = '';
          manualStudentIdInput.value = '';
          showManualAlert('Katılımcı başarıyla eklendi! ✓', false);
        } else {
          showManualAlert(res?.message || 'Katılımcı eklenemedi!', true);
        }
      });
    });
  }

  // Listeden Tek Tek Manuel Kişi Silme (Event Delegation)
  if (participantsList) {
    participantsList.addEventListener('click', (e) => {
      const delBtn = e.target.closest('.btn-delete-participant');
      if (!delBtn) return;
      e.stopPropagation();

      if (!isAdminAuthenticated) {
        alert('Katılımcı silmek için yönetici girişi yapmalısınız!');
        return;
      }

      if (wheel.isSpinning) {
        alert('Çark dönerken katılımcı silinemez!');
        return;
      }

      const studentId = delBtn.getAttribute('data-student-id');
      const pId = delBtn.getAttribute('data-id');

      if (confirm('Bu katılımcıyı listeden ve çarktan silmek istediğinize emin misiniz?')) {
        socket.emit('remove_participant', {
          studentId: studentId,
          id: pId,
          token: getAdminToken()
        });
      }
    });
  }

  // ==========================================================================
  // ETKİLEŞİMLER & BUTONLAR (YÖNETİCİ KORUMALI)
  // ==========================================================================

  // Yönetici: Katılımı Durdur / Aç (Toggle Registration)
  if (toggleRegBtn) {
    toggleRegBtn.addEventListener('click', () => {
      if (!isAdminAuthenticated) {
        alert('Bu işlem için yönetici girişi yapmalısınız!');
        return;
      }
      socket.emit('toggle_registration', { token: getAdminToken() });
    });
  }

  // Çarkı Çevir
  spinBtn.addEventListener('click', () => {
    if (!isAdminAuthenticated) {
      alert('Çarkı çevirmek için yönetici girişi yapmalısınız!');
      return;
    }
    if (wheel.isSpinning || currentParticipants.length === 0) return;

    spinBtn.disabled = true;
    spinBtn.innerHTML = `<span>DÖNÜYOR...</span>`;

    wheel.spin((winner) => {
      // Çark durdu! Kazanan belirlendi.
      currentWinner = winner;
      spinBtn.innerHTML = `<span>🎲 ÇARK'I ÇEVİR</span>`;
      spinBtn.disabled = currentParticipants.length <= 1;

      // Kazanan bilgilerini modala doldur
      winnerName.textContent = winner.name;
      winnerId.textContent = winner.studentId;

      // Modalı aç
      winnerModal.classList.add('active');

      // Konfeti patlat
      launchArenaConfetti();
    });
  });

  // Kazanan Modalı: "Listeden Çıkar" Butonu
  if (removeWinnerBtn) {
    removeWinnerBtn.addEventListener('click', () => {
      if (currentWinner) {
        socket.emit('remove_winner', {
          winner: currentWinner,
          studentId: currentWinner.studentId,
          id: currentWinner.id,
          token: getAdminToken()
        });
        currentWinner = null;
      }
      winnerModal.classList.remove('active');
    });
  }

  // Kazanan Modalı: "Listede Tut / Yeniden Çek" Butonu
  if (keepWinnerBtn) {
    keepWinnerBtn.addEventListener('click', () => {
      currentWinner = null;
      winnerModal.classList.remove('active');
    });
  }

  // Listeyi Sıfırla Butonu (Onaylı & reset_participants Olayı ile)
  resetBtn.addEventListener('click', () => {
    if (!isAdminAuthenticated) {
      alert('Listeyi sıfırlamak için yönetici girişi yapmalısınız!');
      return;
    }
    if (wheel.isSpinning) return;

    if (confirm('Tüm katılımcı listesi kalıcı olarak silinecek. Emin misiniz?')) {
      socket.emit('reset_participants', { token: getAdminToken() });
      if (winnerName) winnerName.textContent = '-';
      if (winnerId) winnerId.textContent = '-';
      if (winnerModal) winnerModal.classList.remove('active');
      currentWinner = null;
    }
  });

  // Hızlı Test Verisi Ekle (Provada kolaylık için)
  addSampleBtn.addEventListener('click', () => {
    if (!isAdminAuthenticated) {
      alert('Test verisi eklemek için yönetici girişi yapmalısınız!');
      return;
    }
    if (wheel.isSpinning) return;
    socket.emit('add_sample_data', { token: getAdminToken() });
  });

  // Ses Aç / Kapat (Herkes açıp kapatabilir)
  soundBtn.addEventListener('click', () => {
    const isEnabled = wheel.toggleSound();
    soundBtn.innerHTML = isEnabled 
      ? `<span>🔊 Ses: Açık</span>` 
      : `<span>🔇 Ses: Kapalı</span>`;
  });

  // Çarka tıklandığında da çevirme desteği (Yönetici yetkisi varsa)
  wheelCanvas.addEventListener('click', () => {
    if (isAdminAuthenticated && !wheel.isSpinning && currentParticipants.length > 0) {
      spinBtn.click();
    }
  });
});
