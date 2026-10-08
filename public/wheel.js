/**
 * E-Arena ve Teknoloji Topluluğu - Çekiliş Çarkı Motoru (wheel.js)
 * HTML5 Canvas, Web Audio API ve Fizik Tabanlı Dönüş
 */

class ArenaWheel {
  constructor(canvasId, pointerId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.pointerEl = document.getElementById(pointerId);

    this.participants = [];
    this.currentAngle = 0; // Radyan cinsinden güncel açı
    this.isSpinning = false;
    this.soundEnabled = true;

    // Renk Teması (E-Arena Kurumsal Kimliği - Asil Bordo ve Kömür)
    this.sliceColors = [
      '#800020', // Asil Klasik Bordo
      '#131317', // Derin Kömür Siyahı
      '#630018', // Koyu Şarap Bordosu
      '#1c1c23', // Mat Grafit Kömür
      '#8B0029', // E-Arena Canlı Bordo
      '#24242e'  // Füme Kömür
    ];

    // Placeholder (Katılımcı henüz yokken gösterilecek şık dilimler)
    this.placeholders = [
      'E-ARENA',
      'QR İLE KATIL',
      'TEKNOLOJİ',
      'CANLI ÇEKİLİŞ',
      'E-ARENA',
      'KATILIM BEKLENİYOR',
      'ESPOR TOPLULUĞU',
      'HAZIRLANIN'
    ];

    // Logo Görseli (sunum logo.jpeg)
    this.logoImage = new Image();
    this.logoImage.src = 'sunum logo.jpeg';
    this.logoLoaded = false;
    this.logoImage.onload = () => {
      this.logoLoaded = true;
      this.draw();
    };

    // Web Audio API Kurulumu
    this.audioCtx = null;
    this.lastTickSlice = -1;

    // Retina / Yüksek Çözünürlük Desteği
    this.setupHiDPI();
    window.addEventListener('resize', () => {
      this.setupHiDPI();
      this.draw();
    });

    this.draw();
  }

  // Web Audio Context başlatma (Kullanıcı etkileşimiyle)
  initAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  // Çark tık-tık sesi (Synthesizer click)
  playTickSound() {
    if (!this.soundEnabled) return;
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(650, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(140, this.audioCtx.currentTime + 0.035);

      gain.gain.setValueAtTime(0.35, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.035);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.04);

      // İbreye hafif yaylanma animasyonu tetikle
      if (this.pointerEl) {
        this.pointerEl.classList.remove('tick-bump');
        void this.pointerEl.offsetWidth; // Reflow
        this.pointerEl.classList.add('tick-bump');
      }
    } catch (e) {
      console.warn('Ses çalınamadı:', e);
    }
  }

  // Kazanan tebrik jingle/fanfare sesi (Synthesized victory fanfare)
  playVictorySound() {
    if (!this.soundEnabled) return;
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const notes = [440, 554.37, 659.25, 880, 1108.73]; // A4, C#5, E5, A5, C#6
      notes.forEach((freq, idx) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime + idx * 0.1);

        const startTime = this.audioCtx.currentTime + idx * 0.1;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.3, startTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.65);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.7);
      });
    } catch (e) {
      console.warn('Zafer sesi çalınamadı:', e);
    }
  }

  // Yüksek çözünürlüklü ekranlar (Retina / 4K Projeksiyon) için keskinleştirme
  setupHiDPI() {
    const rect = this.canvas.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height) || 600;
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;

    this.ctx.resetTransform?.();
    this.ctx.scale(dpr, dpr);

    this.size = size;
    this.radius = size / 2;
    this.centerX = size / 2;
    this.centerY = size / 2;
  }

  setParticipants(list) {
    this.participants = [...list];
    if (!this.isSpinning) {
      this.draw();
    }
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    return this.soundEnabled;
  }

  // Çarkı Çiz
  draw() {
    const { ctx, centerX, centerY, radius } = this;
    ctx.clearRect(0, 0, this.size, this.size);

    const items = this.participants.length > 0 
      ? this.participants.map(p => p.name) 
      : this.placeholders;

    const count = items.length;
    const sliceAngle = (Math.PI * 2) / count;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(this.currentAngle);

    // 1. Dilimleri Çiz
    for (let i = 0; i < count; i++) {
      const angleStart = i * sliceAngle;
      const angleEnd = angleStart + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius - 6, angleStart, angleEnd);
      ctx.closePath();

      // Dilim Rengi
      ctx.fillStyle = this.sliceColors[i % this.sliceColors.length];
      ctx.fill();

      // Dilim Kenarlığı (İnce metalik ayraç)
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.stroke();

      // 2. Metin Çizimi
      ctx.save();
      ctx.rotate(angleStart + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      // Dinamik yazı boyutu
      let fontSize = Math.max(11, Math.min(18, Math.floor(340 / count)));
      if (count <= 6) fontSize = 20;
      if (count > 30) fontSize = 11;

      ctx.font = `600 ${fontSize}px "Montserrat", "Inter", sans-serif`;

      // Metin gölgesi
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = '#ffffff';

      // Çok uzun isimleri kısaltma (Truncate)
      let text = items[i];
      const maxTextWidth = radius * 0.58;
      if (ctx.measureText(text).width > maxTextWidth) {
        while (ctx.measureText(text + '..').width > maxTextWidth && text.length > 3) {
          text = text.slice(0, -1);
        }
        text += '..';
      }

      ctx.fillText(text, radius - 28, 0);
      ctx.restore();
    }

    ctx.restore();

    // 3. Dış Çember Çerçevesi (Glowing Metallic Bordo Border)
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 6, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#800020';
    ctx.shadowColor = 'rgba(128, 0, 32, 0.65)';
    ctx.shadowBlur = 15;
    ctx.stroke();
    ctx.restore();

    // 4. MERKEZ LOGO GÖBEĞİ (Center Hub / Pin)
    this.drawCenterHub();
  }

  // Merkez rozet ve sunum logo.jpeg çizimi
  drawCenterHub() {
    const { ctx, centerX, centerY, radius } = this;
    const hubRadius = Math.max(38, radius * 0.22); // Orantılı merkez büyüklüğü

    ctx.save();

    // Dış parıltılı halka
    ctx.beginPath();
    ctx.arc(centerX, centerY, hubRadius + 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10, 10, 12, 0.9)';
    ctx.shadowColor = 'rgba(128, 0, 32, 0.75)';
    ctx.shadowBlur = 18;
    ctx.fill();

    // Metalik Bordo Çember
    ctx.lineWidth = 4;
    const gradient = ctx.createLinearGradient(centerX - hubRadius, centerY - hubRadius, centerX + hubRadius, centerY + hubRadius);
    gradient.addColorStop(0, '#8B0029');
    gradient.addColorStop(0.5, '#ffffff');
    gradient.addColorStop(1, '#420010');
    ctx.strokeStyle = gradient;
    ctx.stroke();

    // Dairesel Kırpma ile Logo Çizimi
    ctx.beginPath();
    ctx.arc(centerX, centerY, hubRadius, 0, Math.PI * 2);
    ctx.clip();

    if (this.logoLoaded && this.logoImage.complete) {
      ctx.drawImage(
        this.logoImage,
        centerX - hubRadius,
        centerY - hubRadius,
        hubRadius * 2,
        hubRadius * 2
      );
    } else {
      // Logo yüklenene kadar modern degrade ikon
      ctx.fillStyle = '#800020';
      ctx.fill();
      ctx.font = 'bold 16px "Orbitron"';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('E-ARENA', centerX, centerY);
    }

    ctx.restore();
  }

  // Çarkı Döndürme
  spin(onFinish) {
    if (this.isSpinning) return;
    if (this.participants.length === 0) {
      alert('Çarkı çevirmek için en az 1 katılımcı olmalıdır!');
      return;
    }

    this.initAudio();
    this.isSpinning = true;

    const count = this.participants.length;
    const sliceAngle = (Math.PI * 2) / count;

    // Rastgele bir kazanan belirle
    const winningIndex = Math.floor(Math.random() * count);
    const winner = this.participants[winningIndex];

    // İbre tam tepede (12 o'clock = 3 * Math.PI / 2 veya -Math.PI / 2)
    // Kazanan dilimin tam ortasının tepeye gelmesi gereken nihai açı hesabı:
    const targetSliceMidAngle = (winningIndex * sliceAngle) + (sliceAngle / 2);
    const pointerAngle = (3 * Math.PI) / 2; // 270 derece (tepe)

    // Minimum dönüş sayısı (5 ila 7 tam tur)
    const extraSpins = 6 + Math.floor(Math.random() * 3);
    const baseTargetAngle = (pointerAngle - targetSliceMidAngle) + (extraSpins * Math.PI * 2);

    // Açının mevcut pozisyondan ileriye doğru düzgün gitmesi için:
    const delta = (baseTargetAngle - (this.currentAngle % (Math.PI * 2))) + (extraSpins * Math.PI * 2);
    const startAngle = this.currentAngle;
    const finalAngle = startAngle + delta;

    const duration = 6500; // 6.5 saniye gerilim dolu dönüş
    const startTime = performance.now();

    // Ease-out Quartic Fonksiyonu (Yumuşak ve gerçekçi yavaşlama)
    const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutQuart(progress);

      this.currentAngle = startAngle + (finalAngle - startAngle) * easedProgress;

      // Tık-tık sesi kontrolü (İbrenin geçtiği dilim değiştikçe ses çal)
      const normalizedAngle = ((pointerAngle - this.currentAngle) % (Math.PI * 2) + (Math.PI * 2)) % (Math.PI * 2);
      const currentSlice = Math.floor(normalizedAngle / sliceAngle);

      if (currentSlice !== this.lastTickSlice) {
        this.playTickSound();
        this.lastTickSlice = currentSlice;
      }

      this.draw();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Çark durdu!
        this.isSpinning = false;
        this.currentAngle = finalAngle % (Math.PI * 2);
        this.draw();
        this.playVictorySound();

        if (typeof onFinish === 'function') {
          onFinish(winner);
        }
      }
    };

    requestAnimationFrame(animate);
  }
}

// Global nesne olarak dışa aktar
window.ArenaWheel = ArenaWheel;
