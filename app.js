/* Room Ranger — static, privacy-first camera I-spy prototype. */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const CONFIG = {
    scanSampleMs: 850,
    huntSampleMs: 430,
    confidence: 0.48,
    supported: [
      'backpack', 'handbag', 'suitcase', 'umbrella', 'bottle', 'cup', 'bowl',
      'banana', 'apple', 'orange', 'sandwich', 'chair', 'couch', 'potted plant',
      'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote',
      'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
      'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'toothbrush'
    ]
  };

  const OBJECT_META = {
    backpack: ['🎒', 'rucksack', 'It may have straps and carry things.'],
    handbag: ['👜', 'handbag', 'Look near a chair, hook or doorway.'],
    suitcase: ['🧳', 'suitcase', 'It may be near a cupboard or wall.'],
    umbrella: ['☂️', 'umbrella', 'Look near a door or coat area.'],
    bottle: ['🧴', 'bottle', 'Check a table, shelf or kitchen surface.'],
    cup: ['🥤', 'cup', 'Look where people have drinks.'],
    bowl: ['🥣', 'bowl', 'Try the kitchen or dining table.'],
    banana: ['🍌', 'banana', 'Look with fruit or food.'],
    apple: ['🍎', 'apple', 'Look in a fruit bowl or kitchen.'],
    orange: ['🍊', 'orange', 'Look with fruit or food.'],
    sandwich: ['🥪', 'sandwich', 'Look where food is being prepared or eaten.'],
    chair: ['🪑', 'chair', 'Look around tables and desks.'],
    couch: ['🛋️', 'sofa', 'Look for a large soft seat.'],
    'potted plant': ['🪴', 'plant', 'Look near a window or bright corner.'],
    bed: ['🛏️', 'bed', 'Look in a bedroom.'],
    'dining table': ['🍽️', 'table', 'Look for a large flat surface with legs.'],
    toilet: ['🚽', 'toilet', 'This one should be in the bathroom.'],
    tv: ['📺', 'television', 'Look towards the main wall in a living room.'],
    laptop: ['💻', 'laptop', 'Look on a desk, table or sofa.'],
    mouse: ['🖱️', 'computer mouse', 'It is often close to a computer.'],
    remote: ['🎛️', 'remote control', 'Try near the television or sofa.'],
    keyboard: ['⌨️', 'keyboard', 'Look near a computer or desk.'],
    'cell phone': ['📱', 'phone', 'Look on a table, desk or charging spot.'],
    microwave: ['◼️', 'microwave', 'Look in the kitchen, often above a counter.'],
    oven: ['♨️', 'oven', 'Look low down in the kitchen.'],
    toaster: ['🍞', 'toaster', 'Look on a kitchen worktop.'],
    sink: ['🚰', 'sink', 'Look in a kitchen or bathroom.'],
    refrigerator: ['🧊', 'fridge', 'Look for a tall cold cupboard in the kitchen.'],
    book: ['📘', 'book', 'Look on a shelf, desk or bedside table.'],
    clock: ['🕒', 'clock', 'Look on a wall, shelf or table.'],
    vase: ['🏺', 'vase', 'It may hold flowers or sit on a shelf.'],
    scissors: ['✂️', 'scissors', 'Look near craft things or a desk.'],
    'teddy bear': ['🧸', 'teddy bear', 'Look on a bed, chair or toy shelf.'],
    toothbrush: ['🪥', 'toothbrush', 'Look near a bathroom sink.']
  };

  const DIFFICULTIES = {
    easy: { targetCount: 3, seconds: 55, streak: 1, label: 'Easy' },
    standard: { targetCount: 5, seconds: 42, streak: 2, label: 'Standard' },
    tricky: { targetCount: 7, seconds: 30, streak: 3, label: 'Tricky' }
  };

  const state = {
    model: null,
    modelReady: false,
    modelError: null,
    stream: null,
    recorder: null,
    recordedChunks: [],
    replayUrl: null,
    detected: new Map(),
    selected: [],
    difficulty: 'standard',
    scanDuration: 8,
    scanning: false,
    hunting: false,
    demo: false,
    scanStartedAt: 0,
    scanLastSample: 0,
    huntLastSample: 0,
    animationFrame: null,
    scanInterval: null,
    objectTimer: null,
    currentIndex: 0,
    secondsLeft: 0,
    targetStreak: 0,
    lastTargetSeenAt: 0,
    score: 0,
    hintUsed: false,
    results: [],
    holdTimer: null,
    holdDone: false,
    keepRecording: false
  };

  const screens = $$('.screen');
  const scanVideo = $('#scanVideo');
  const huntVideo = $('#huntVideo');
  const scanOverlay = $('#scanOverlay');
  const huntOverlay = $('#huntOverlay');
  const toast = $('#toast');

  function showScreen(id) {
    screens.forEach(screen => screen.classList.toggle('screen--active', screen.id === id));
    window.scrollTo(0, 0);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 2400);
  }

  function friendlyName(objectClass) {
    return OBJECT_META[objectClass]?.[1] || objectClass;
  }

  function objectIcon(objectClass) {
    return OBJECT_META[objectClass]?.[0] || '🔎';
  }

  function objectHint(objectClass) {
    return OBJECT_META[objectClass]?.[2] || 'Move slowly and look from another angle.';
  }

  function getSelectedDifficulty() {
    return $('input[name="difficulty"]:checked')?.value || 'standard';
  }

  function getSelectedDuration() {
    return Number($('input[name="duration"]:checked')?.value || 8);
  }

  async function loadModel() {
    const status = $('#modelStatus');
    const openButton = $('#openCameraButton');
    try {
      if (!window.tf || !window.cocoSsd) throw new Error('Recognition scripts did not load.');
      await tf.ready();
      state.model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      state.modelReady = true;
      status.classList.add('is-ready');
      status.innerHTML = '<span class="status-dot" aria-hidden="true"></span><div><strong>Object recognition ready</strong><span>All analysis happens in this browser.</span></div>';
      openButton.disabled = false;
    } catch (error) {
      console.error(error);
      state.modelError = error;
      status.classList.add('is-error');
      status.innerHTML = '<span class="status-dot" aria-hidden="true"></span><div><strong>Recognition could not load</strong><span>Check the internet connection, then reload — or use demo mode.</span></div>';
      openButton.disabled = true;
    }
  }

  async function startCamera(videoElement) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access needs HTTPS and a supported browser.');
    }
    stopCamera();
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };
    state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = state.stream;
    await videoElement.play();
  }

  function stopCamera() {
    if (state.stream) {
      state.stream.getTracks().forEach(track => track.stop());
      state.stream = null;
    }
    scanVideo.srcObject = null;
    huntVideo.srcObject = null;
  }

  function clearReplay() {
    state.keepRecording = false;
    if (state.replayUrl) URL.revokeObjectURL(state.replayUrl);
    state.replayUrl = null;
    $('#scanReplay').removeAttribute('src');
    $('#scanReplayWrap').hidden = true;
    state.recordedChunks = [];
  }

  function startRecording() {
    state.recordedChunks = [];
    state.keepRecording = true;
    if (!state.stream || !window.MediaRecorder) return;
    try {
      const preferredTypes = [
        'video/mp4;codecs=h264',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
      ];
      const mimeType = preferredTypes.find(type => MediaRecorder.isTypeSupported(type));
      state.recorder = mimeType
        ? new MediaRecorder(state.stream, { mimeType, videoBitsPerSecond: 1_500_000 })
        : new MediaRecorder(state.stream);
      state.recorder.addEventListener('dataavailable', event => {
        if (event.data?.size) state.recordedChunks.push(event.data);
      });
      state.recorder.addEventListener('stop', () => {
        if (!state.keepRecording || !state.recordedChunks.length) return;
        const type = state.recordedChunks[0].type || 'video/webm';
        const blob = new Blob(state.recordedChunks, { type });
        state.replayUrl = URL.createObjectURL(blob);
        const replay = $('#scanReplay');
        replay.src = state.replayUrl;
        $('#scanReplayWrap').hidden = false;
      });
      state.recorder.start(500);
    } catch (error) {
      console.warn('MediaRecorder unavailable:', error);
      state.recorder = null;
    }
  }

  function stopRecording() {
    if (state.recorder?.state === 'recording') state.recorder.stop();
  }

  function resizeCanvas(canvas, video) {
    const rect = video.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    }
    return { width, height, dpr };
  }

  function drawPredictions(canvas, video, predictions, targetClass = null) {
    const { width, height, dpr } = resizeCanvas(canvas, video);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    if (!video.videoWidth || !video.videoHeight) return;

    const videoRatio = video.videoWidth / video.videoHeight;
    const canvasRatio = width / height;
    let scale, offsetX = 0, offsetY = 0;
    if (canvasRatio > videoRatio) {
      scale = width / video.videoWidth;
      offsetY = (height - video.videoHeight * scale) / 2;
    } else {
      scale = height / video.videoHeight;
      offsetX = (width - video.videoWidth * scale) / 2;
    }

    predictions
      .filter(pred => pred.score >= CONFIG.confidence && (targetClass ? pred.class === targetClass : CONFIG.supported.includes(pred.class)))
      .forEach(pred => {
        const [x, y, w, h] = pred.bbox;
        const bx = x * scale + offsetX;
        const by = y * scale + offsetY;
        const bw = w * scale;
        const bh = h * scale;
        const target = pred.class === targetClass;
        ctx.strokeStyle = target ? '#ffce55' : 'rgba(255,255,255,.78)';
        ctx.lineWidth = (target ? 5 : 3) * dpr;
        ctx.setLineDash(target ? [] : [9 * dpr, 7 * dpr]);
        ctx.strokeRect(bx, by, bw, bh);
        ctx.setLineDash([]);
        if (target) {
          const label = `Found ${friendlyName(pred.class)} · ${Math.round(pred.score * 100)}%`;
          ctx.font = `800 ${14 * dpr}px system-ui`;
          const labelWidth = ctx.measureText(label).width + 18 * dpr;
          ctx.fillStyle = '#ffce55';
          ctx.fillRect(bx, Math.max(0, by - 31 * dpr), labelWidth, 31 * dpr);
          ctx.fillStyle = '#243047';
          ctx.fillText(label, bx + 9 * dpr, Math.max(20 * dpr, by - 10 * dpr));
        }
      });
  }

  async function detectFrame(video, canvas, targetClass = null) {
    if (!state.model || video.readyState < 2) return [];
    const predictions = await state.model.detect(video, 20, CONFIG.confidence);
    drawPredictions(canvas, video, predictions, targetClass);
    return predictions;
  }

  async function beginScan() {
    state.scanDuration = getSelectedDuration();
    state.difficulty = getSelectedDifficulty();
    state.demo = false;
    state.detected.clear();
    clearReplay();

    try {
      await startCamera(scanVideo);
      showScreen('scanScreen');
      state.scanning = true;
      state.scanStartedAt = performance.now();
      state.scanLastSample = 0;
      $('#scanTimer').textContent = `0:${String(state.scanDuration).padStart(2, '0')}`;
      $('#scanProgressBar').style.width = '0%';
      $('#scanFoundCount').textContent = 'Looking for useful objects…';
      startRecording();
      state.animationFrame = requestAnimationFrame(scanLoop);
    } catch (error) {
      console.error(error);
      showToast(cameraErrorMessage(error));
    }
  }

  function cameraErrorMessage(error) {
    if (error?.name === 'NotAllowedError') return 'Camera permission was blocked. Allow it in browser settings.';
    if (error?.name === 'NotFoundError') return 'No camera was found on this device.';
    return error?.message || 'The camera could not start.';
  }

  async function scanLoop(now) {
    if (!state.scanning) return;
    const elapsed = (now - state.scanStartedAt) / 1000;
    const remaining = Math.max(0, Math.ceil(state.scanDuration - elapsed));
    const progress = Math.min(100, (elapsed / state.scanDuration) * 100);
    $('#scanTimer').textContent = `0:${String(remaining).padStart(2, '0')}`;
    $('#scanProgressBar').style.width = `${progress}%`;

    if (now - state.scanLastSample >= CONFIG.scanSampleMs) {
      state.scanLastSample = now;
      try {
        const predictions = await detectFrame(scanVideo, scanOverlay);
        predictions
          .filter(pred => CONFIG.supported.includes(pred.class) && pred.score >= CONFIG.confidence)
          .forEach(pred => {
            const current = state.detected.get(pred.class) || { class: pred.class, hits: 0, best: 0 };
            current.hits += 1;
            current.best = Math.max(current.best, pred.score);
            state.detected.set(pred.class, current);
          });
        const usefulCount = [...state.detected.values()].filter(item => item.hits >= 1).length;
        $('#scanFoundCount').textContent = usefulCount
          ? `${usefulCount} useful object${usefulCount === 1 ? '' : 's'} spotted`
          : 'Looking for useful objects…';
      } catch (error) {
        console.warn('Scan inference failed:', error);
      }
    }

    if (elapsed >= state.scanDuration) {
      finishScan();
      return;
    }
    state.animationFrame = requestAnimationFrame(scanLoop);
  }

  function finishScan() {
    state.keepRecording = true;
    state.scanning = false;
    cancelAnimationFrame(state.animationFrame);
    stopRecording();
    stopCamera();
    renderReview({ initial: true });
    showScreen('reviewScreen');
  }

  function cancelScan() {
    state.keepRecording = false;
    state.scanning = false;
    cancelAnimationFrame(state.animationFrame);
    stopRecording();
    stopCamera();
    clearReplay();
    showScreen('setupScreen');
  }

  function detectedCandidates() {
    return [...state.detected.values()]
      .sort((a, b) => (b.hits * b.best) - (a.hits * a.best));
  }

  function renderReview({ initial = false } = {}) {
    const difficulty = DIFFICULTIES[state.difficulty];
    const candidates = detectedCandidates();
    if (initial || state.selected.length === 0) {
      state.selected = candidates.slice(0, difficulty.targetCount).map(item => item.class);
    }

    $('#selectionHelp').textContent = `Pick up to ${difficulty.targetCount} clear, reachable objects.`;
    $('#scanSummary').innerHTML = candidates.length
      ? `<span aria-hidden="true">✨</span><div><strong>The scan spotted ${candidates.length} possible object${candidates.length === 1 ? '' : 's'}.</strong><br>Select the clearest ones for the hunt.</div>`
      : '<span aria-hidden="true">🔎</span><div><strong>No clear objects were recognised.</strong><br>Add familiar objects below, or scan again in brighter light.</div>';

    const grid = $('#detectedObjects');
    grid.innerHTML = '';
    candidates.forEach(item => grid.appendChild(makeObjectCard(item.class, item.best, item.hits)));
    state.selected
      .filter(objectClass => !candidates.some(item => item.class === objectClass))
      .forEach(objectClass => grid.appendChild(makeObjectCard(objectClass, null, 0)));
    renderManualObjects();
    updateSelectionUi();
  }

  function makeObjectCard(objectClass, confidence, hits) {
    const label = document.createElement('label');
    const matchText = Number.isFinite(confidence)
      ? `${Math.round(confidence * 100)}% match · seen ${hits}×`
      : 'Added by adult';
    label.className = 'object-card';
    label.innerHTML = `
      <input type="checkbox" value="${objectClass}" ${state.selected.includes(objectClass) ? 'checked' : ''}>
      <span class="object-emoji" aria-hidden="true">${objectIcon(objectClass)}</span>
      <span><strong>${friendlyName(objectClass)}</strong><small>${matchText}</small></span>`;
    $('input', label).addEventListener('change', event => {
      toggleSelection(objectClass, event.target.checked, event.target);
      if (!Number.isFinite(confidence) && !event.target.checked) renderReview();
    });
    return label;
  }

  function toggleSelection(objectClass, checked, input = null) {
    const max = DIFFICULTIES[state.difficulty].targetCount;
    if (checked && !state.selected.includes(objectClass)) {
      if (state.selected.length >= max) {
        if (input) input.checked = false;
        showToast(`Choose up to ${max} objects.`);
        return;
      }
      state.selected.push(objectClass);
    } else if (!checked) {
      state.selected = state.selected.filter(item => item !== objectClass);
    }
    renderManualObjects();
    updateSelectionUi();
  }

  function renderManualObjects() {
    const wrap = $('#manualObjects');
    const detectedClasses = new Set(detectedCandidates().map(item => item.class));
    wrap.innerHTML = '';
    CONFIG.supported
      .filter(item => !detectedClasses.has(item))
      .forEach(objectClass => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'object-chip';
        button.textContent = `${objectIcon(objectClass)} ${friendlyName(objectClass)}`;
        button.disabled = state.selected.includes(objectClass);
        button.addEventListener('click', () => {
          toggleSelection(objectClass, true);
          renderReview();
        });
        wrap.appendChild(button);
      });
  }

  function updateSelectionUi() {
    const max = DIFFICULTIES[state.difficulty].targetCount;
    $('#selectionCount').textContent = `${state.selected.length} / ${max}`;
    $('#continueReviewButton').disabled = state.selected.length < 1;
  }

  function prepareHandoff() {
    clearReplay();
    $('#huntPreview').innerHTML = state.selected
      .map(item => `<span class="preview-chip"><span aria-hidden="true">${objectIcon(item)}</span>${friendlyName(item)}</span>`)
      .join('');
    showScreen('handoffScreen');
  }

  function createDemoGame() {
    state.demo = true;
    state.difficulty = 'easy';
    state.selected = ['book', 'chair', 'bottle'];
    state.detected = new Map(state.selected.map((item, index) => [item, { class: item, hits: 4 - index, best: .91 - index * .07 }]));
    prepareHandoff();
  }

  function beginHold(event) {
    event.preventDefault();
    if (state.holdDone) return;
    const button = $('#holdStartButton');
    button.classList.add('is-holding');
    state.holdTimer = setTimeout(() => {
      state.holdDone = true;
      button.classList.remove('is-holding');
      startHunt();
    }, 2000);
  }

  function cancelHold() {
    clearTimeout(state.holdTimer);
    $('#holdStartButton').classList.remove('is-holding');
  }

  async function startHunt() {
    state.score = 0;
    state.currentIndex = 0;
    state.results = [];
    state.hunting = true;
    state.holdDone = false;
    $('#scoreValue').textContent = '0';
    $('#roundTotal').textContent = state.selected.length;
    showScreen('huntScreen');

    const huntStage = $('#huntScreen .camera-stage');
    huntStage.classList.toggle('demo-stage', state.demo);

    if (state.demo) {
      huntVideo.hidden = true;
      startRound();
      return;
    }

    try {
      await startCamera(huntVideo);
      huntVideo.hidden = false;
      startRound();
      state.huntLastSample = 0;
      state.animationFrame = requestAnimationFrame(huntLoop);
    } catch (error) {
      console.error(error);
      state.hunting = false;
      showToast(cameraErrorMessage(error));
      showScreen('handoffScreen');
    }
  }

  function startRound() {
    if (state.currentIndex >= state.selected.length) {
      finishGame();
      return;
    }
    const target = state.selected[state.currentIndex];
    const difficulty = DIFFICULTIES[state.difficulty];
    state.secondsLeft = difficulty.seconds;
    state.targetStreak = 0;
    state.lastTargetSeenAt = 0;
    state.hintUsed = false;

    $('#roundValue').textContent = state.currentIndex + 1;
    $('#targetIcon').textContent = objectIcon(target);
    $('#huntTarget').textContent = friendlyName(target);
    $('#targetTimer').textContent = state.secondsLeft;
    $('#targetTimer').classList.remove('is-low');
    $('#hintBox').hidden = true;
    $('#hintButton').disabled = false;
    $('#detectionStatus').hidden = false;
    $('#detectionStatus').innerHTML = '<span class="search-pulse" aria-hidden="true"></span>Point the camera around the room';

    clearInterval(state.objectTimer);
    state.objectTimer = setInterval(() => {
      if (!state.hunting) return;
      state.secondsLeft -= 1;
      $('#targetTimer').textContent = Math.max(0, state.secondsLeft);
      $('#targetTimer').classList.toggle('is-low', state.secondsLeft <= 10);
      if (state.secondsLeft <= 0) completeRound(false, 'time');
    }, 1000);

    if (state.demo) runDemoRound(target);
  }

  function runDemoRound(target) {
    let demoProgress = 0;
    const status = $('#detectionStatus');
    clearInterval(state.demoInterval);
    state.demoInterval = setInterval(() => {
      if (!state.hunting) return;
      demoProgress += 1;
      if (demoProgress === 2) status.innerHTML = `<span class="search-pulse" aria-hidden="true"></span>Maybe a ${friendlyName(target)} is nearby…`;
      if (demoProgress >= 4) {
        clearInterval(state.demoInterval);
        completeRound(true, 'camera');
      }
    }, 800);
  }

  async function huntLoop(now) {
    if (!state.hunting || state.demo) return;
    if (now - state.huntLastSample >= CONFIG.huntSampleMs) {
      state.huntLastSample = now;
      const target = state.selected[state.currentIndex];
      try {
        const predictions = await detectFrame(huntVideo, huntOverlay, target);
        const targetPrediction = predictions
          .filter(pred => pred.class === target && pred.score >= CONFIG.confidence)
          .sort((a, b) => b.score - a.score)[0];

        if (targetPrediction) {
          const nowMs = performance.now();
          state.targetStreak = (nowMs - state.lastTargetSeenAt < 1700) ? state.targetStreak + 1 : 1;
          state.lastTargetSeenAt = nowMs;
          const needed = DIFFICULTIES[state.difficulty].streak;
          $('#detectionStatus').innerHTML = `<span class="search-pulse" aria-hidden="true"></span>I can see it — hold steady ${Math.min(state.targetStreak, needed)}/${needed}`;
          if (state.targetStreak >= needed) completeRound(true, 'camera');
        } else {
          if (performance.now() - state.lastTargetSeenAt > 1700) state.targetStreak = 0;
          $('#detectionStatus').innerHTML = `<span class="search-pulse" aria-hidden="true"></span>Looking for ${friendlyName(target)}…`;
        }
      } catch (error) {
        console.warn('Hunt inference failed:', error);
      }
    }
    state.animationFrame = requestAnimationFrame(huntLoop);
  }

  function useHint() {
    const target = state.selected[state.currentIndex];
    state.hintUsed = true;
    $('#hintBox').textContent = `💡 ${objectHint(target)} (-20 point bonus)`;
    $('#hintBox').hidden = false;
    $('#detectionStatus').hidden = true;
    $('#hintButton').disabled = true;
    setTimeout(() => {
      if (!state.hunting) return;
      $('#hintBox').hidden = true;
      $('#detectionStatus').hidden = false;
    }, 4500);
  }

  function completeRound(found, reason) {
    if (!state.hunting) return;
    clearInterval(state.objectTimer);
    clearInterval(state.demoInterval);
    state.hunting = false;
    const target = state.selected[state.currentIndex];
    let points = 0;
    if (found) {
      points = 100 + Math.max(0, Math.min(50, state.secondsLeft));
      if (state.hintUsed) points = Math.max(60, points - 20);
      state.score += points;
      $('#scoreValue').textContent = state.score;
      $('#pointsEarned').textContent = `+${points} points`;
      $('#foundCelebration').hidden = false;
    }
    state.results.push({ target, found, reason, points, hint: state.hintUsed });

    setTimeout(() => {
      $('#foundCelebration').hidden = true;
      state.currentIndex += 1;
      state.hunting = true;
      startRound();
      if (!state.demo && state.currentIndex < state.selected.length) {
        state.animationFrame = requestAnimationFrame(huntLoop);
      }
    }, found ? 1350 : 250);
  }

  function skipRound() {
    completeRound(false, 'skip');
  }

  function pauseGame() {
    if (!state.hunting) return;
    state.hunting = false;
    clearInterval(state.objectTimer);
    cancelAnimationFrame(state.animationFrame);
    clearInterval(state.demoInterval);
    $('#pauseDialog').showModal();
  }

  function resumeGame() {
    $('#pauseDialog').close();
    state.hunting = true;
    state.objectTimer = setInterval(() => {
      if (!state.hunting) return;
      state.secondsLeft -= 1;
      $('#targetTimer').textContent = Math.max(0, state.secondsLeft);
      $('#targetTimer').classList.toggle('is-low', state.secondsLeft <= 10);
      if (state.secondsLeft <= 0) completeRound(false, 'time');
    }, 1000);
    if (state.demo) runDemoRound(state.selected[state.currentIndex]);
    else state.animationFrame = requestAnimationFrame(huntLoop);
  }

  function endGame() {
    $('#pauseDialog').close();
    state.hunting = false;
    clearInterval(state.objectTimer);
    clearInterval(state.demoInterval);
    cancelAnimationFrame(state.animationFrame);
    stopCamera();
    finishGame();
  }

  function finishGame() {
    state.hunting = false;
    clearInterval(state.objectTimer);
    clearInterval(state.demoInterval);
    cancelAnimationFrame(state.animationFrame);
    stopCamera();
    huntOverlay.getContext('2d').clearRect(0, 0, huntOverlay.width, huntOverlay.height);

    const found = state.results.filter(result => result.found).length;
    const skipped = state.results.length - found;
    const hints = state.results.filter(result => result.hint).length;
    $('#finalScore').textContent = state.score;
    $('#resultMessage').textContent = found === state.selected.length
      ? `You found every object in the ${DIFFICULTIES[state.difficulty].label.toLowerCase()} hunt.`
      : `You found ${found} of ${state.selected.length} objects. Every explorer gets better with practice.`;
    $('#resultStats').innerHTML = `
      <div class="stat-card"><strong>${found}</strong><span>found</span></div>
      <div class="stat-card"><strong>${skipped}</strong><span>missed</span></div>
      <div class="stat-card"><strong>${hints}</strong><span>hints</span></div>`;
    $('#resultList').innerHTML = state.results.map(result => `
      <div class="result-row">
        <span aria-hidden="true">${result.found ? '✅' : '➖'}</span>
        <strong>${friendlyName(result.target)}</strong>
        <span>${result.found ? `+${result.points}` : result.reason === 'time' ? 'Time up' : 'Skipped'}</span>
      </div>`).join('');
    showScreen('resultScreen');
  }

  function resetForNewHunt() {
    state.selected = [];
    state.detected.clear();
    state.results = [];
    state.score = 0;
    state.demo = false;
    clearReplay();
    showScreen('setupScreen');
  }

  function replaySameRoom() {
    state.results = [];
    state.score = 0;
    state.demo = false;
    prepareHandoff();
    showToast('Same targets kept. The camera will open again for a fresh round.');
  }

  function bindEvents() {
    $('#startButton').addEventListener('click', () => {
      showScreen('setupScreen');
      if (!state.modelReady && !state.modelError) loadModel();
    });
    $('#demoButton').addEventListener('click', createDemoGame);
    $$('[data-back]').forEach(button => button.addEventListener('click', () => showScreen(button.dataset.back)));
    $('#openCameraButton').addEventListener('click', beginScan);
    $('#cancelScanButton').addEventListener('click', cancelScan);
    $('#rescanBackButton').addEventListener('click', () => {
      clearReplay();
      showScreen('setupScreen');
    });
    $('#continueReviewButton').addEventListener('click', prepareHandoff);

    const holdButton = $('#holdStartButton');
    holdButton.addEventListener('pointerdown', beginHold);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => holdButton.addEventListener(type, cancelHold));

    $('#hintButton').addEventListener('click', useHint);
    $('#skipButton').addEventListener('click', skipRound);
    $('#pauseButton').addEventListener('click', pauseGame);
    $('#resumeButton').addEventListener('click', resumeGame);
    $('#endGameButton').addEventListener('click', endGame);
    $('#playAgainButton').addEventListener('click', resetForNewHunt);
    $('#sameRoomButton').addEventListener('click', replaySameRoom);

    window.addEventListener('beforeunload', () => {
      stopCamera();
      clearReplay();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.hunting) pauseGame();
    });
  }

  bindEvents();
})();
