// === LIVESTREAM - ROOM AGORA JS FILE ===
// === Подключение клиента Agora RTC + RTM ===

// 🧩 Переменные из шаблона
const APP_ID = window.livestreamAppId;
const CHANNEL = window.livestreamChannel;
const UID = String(window.livestreamUserId);
const USER_NAME = window.livestreamUserName;
const IS_HOST = window.livestreamIsHost;
const CSRF_TOKEN = window.livestreamCsrfToken;
const ROOM_ID = window.livestreamRoomId;
const IS_SUPERUSER = window.livestreamIsSuperuser;

// 🧠 Состояния
let rtcClient, rtmClient, rtmChannel;
let localTracks = { audio: null, video: null };
let isAudioMuted = !IS_HOST;
let isVideoMuted = false;
let canUseMic = true;
let canUseCam = true;
let isSpeaker = IS_HOST;
let hasRaisedHand = false;
let participants = {};
let currentSpeakerUid = IS_HOST ? UID : null;
let userNames = {};
let chatHistory = [];
let wasKicked = localStorage.getItem('kicked_from_' + ROOM_ID) === 'true';
let waitingApproval = wasKicked;
let roomEnded = false;

// 🔧 Утилиты
const log = (...args) => console.log('%c[ARDAR]', 'color:#3b82f6;font-weight:bold', ...args);
const showAlert = (msg, type = 'info') => {
  const el = document.getElementById('custom-alert');
  if (!el) return;
  el.textContent = msg;
  el.className = `custom-alert ${type}`;
  el.style.display = 'block';
  setTimeout(() => (el.style.display = 'none'), 3500);
};
const sendRTM = data => {
  if (rtmChannel) rtmChannel.sendMessage({ text: JSON.stringify(data) });
};
const formatTime = dt => {
  const h = dt.getHours().toString().padStart(2, '0');
  const m = dt.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
};

// === RTC Инициализация ===
async function initRTC() {
  log('🟢 Инициализация RTC');
  
  // Если пользователь был исключен, показываем экран ожидания
  if (wasKicked) {
    showWaitingApprovalScreen();
    return;
  }
  
  rtcClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

  rtcClient.on('user-published', async (user, mediaType) => {
    await rtcClient.subscribe(user, mediaType);
    const uid = String(user.uid);
    
    // Создаем участника, если его еще нет
    if (!participants[uid]) {
      participants[uid] = { 
        uid: uid,
        name: userNames[uid] || "Участник",
        isAudioMuted: true,
        isVideoMuted: true,
        allowMic: true,
        allowCam: true,
        isHost: false
      };
    }
    
    if (mediaType === 'video') {
      participants[uid].videoTrack = user.videoTrack;
      participants[uid].isVideoMuted = false;
    }
    
    if (mediaType === 'audio') {
      participants[uid].audioTrack = user.audioTrack;
      participants[uid].isAudioMuted = false;
      user.audioTrack.play();
    }
    
    updateUI();
  });

  rtcClient.on('user-unpublished', (user, mediaType) => {
    const uid = String(user.uid);
    if (participants[uid]) {
      if (mediaType === 'video') {
        participants[uid].videoTrack = null;
        participants[uid].isVideoMuted = true;
      }
      if (mediaType === 'audio') {
        participants[uid].audioTrack = null;
        participants[uid].isAudioMuted = true;
      }
    }
    updateUI();
  });

  rtcClient.on('user-left', (user) => {
    const uid = String(user.uid);
    if (participants[uid]) {
      // Если ушел ведущий, уведомляем всех
      if (participants[uid].isHost) {
        showAlert("Ведущий покинул трансляцию", "warning");
      }
      
      delete participants[uid];
      
      // Если ушел говорящий, возвращаем слово ведущему
      if (currentSpeakerUid === uid) {
        const hostUid = Object.entries(participants).find(([_, p]) => p.isHost)?.[0] || null;
        if (hostUid) {
          currentSpeakerUid = hostUid;
          
          if (IS_HOST) {
            sendRTM({
              type: "current_speaker",
              speakerUid: hostUid,
              speakerName: participants[hostUid].name
            });
          }
        } else {
          currentSpeakerUid = null;
        }
      }
      
      updateUI();
    }
  });

  const res = await fetch(`/livestream/token/?channel=${CHANNEL}&uid=${UID}&role=1`);
  const { token } = await res.json();
  await rtcClient.join(APP_ID, CHANNEL, token, parseInt(UID));

  const [micTrack, camTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
  localTracks.audio = micTrack;
  localTracks.video = camTrack;

  if (!IS_HOST) await micTrack.setMuted(true);

  await rtcClient.publish([micTrack, camTrack]);

  // Добавляем себя в список участников
  participants[UID] = {
    uid: UID,
    name: USER_NAME,
    videoTrack: camTrack,
    audioTrack: micTrack,
    isAudioMuted: !IS_HOST,
    isVideoMuted: false,
    isHost: IS_HOST,
    isLocal: true,
    allowMic: true,
    allowCam: true
  };
  
  // Сохраняем свое имя
  userNames[UID] = USER_NAME;

  if (IS_HOST) {
    currentSpeakerUid = UID;
    isSpeaker = true;
  }

  updateUI();
}

// === RTM Инициализация ===
async function initRTM() {
  log('🟣 Инициализация RTM');
  const res = await fetch('/livestream/rtm_token/');
  const { token } = await res.json();

  rtmClient = AgoraRTM.createInstance(APP_ID);
  await rtmClient.login({ uid: UID, token });

  rtmChannel = rtmClient.createChannel(CHANNEL);
  await rtmChannel.join();
  log('✅ RTM подключен');

  // Принимаем сообщения от канала
  rtmChannel.on('ChannelMessage', ({ text }, senderId) => {
    try {
      const payload = JSON.parse(text);
      handleRTMMessage(payload, senderId);
    } catch (e) {
      console.warn('Невалидное сообщение RTM:', text);
    }
  });

  // Отправляем свою информацию при входе
  sendRTM({ 
    type: 'join', 
    uid: UID, 
    name: USER_NAME,
    wasKicked: wasKicked,
    isAudioMuted: isAudioMuted,
    isVideoMuted: isVideoMuted,
    allowMic: canUseMic,
    allowCam: canUseCam,
    isHost: IS_HOST
  });

  // Если мы ведущий, устанавливаем себя как говорящего
  if (IS_HOST) {
    setTimeout(() => {
      currentSpeakerUid = UID;
      sendRTM({
        type: 'current_speaker',
        speakerUid: UID,
        speakerName: USER_NAME
      });
    }, 1000); // Небольшая задержка, чтобы все успели получить информацию о подключении
  }

  // Запрашиваем историю чата
  sendRTM({ type: 'request_chat_history', uid: UID });
  
  // Запрашиваем текущего говорящего
  sendRTM({ type: 'request_current_speaker', uid: UID });
  
    // Проверяем статус комнаты
  checkRoomStatus();
}

// Проверка статуса комнаты
function checkRoomStatus() {
  fetch(`/livestream/check_status/${ROOM_ID}/`)
    .then(response => response.json())
    .then(data => {
      if (data.room_ended && !roomEnded) {
        roomEnded = true;
        showAlert("Трансляция завершена ведущим", "warning");
        setTimeout(() => {
          window.location.href = "/livestream/";
        }, 2000);
      }
    })
    .catch(err => console.error("Ошибка проверки статуса:", err));
  
  if (!roomEnded) {
    setTimeout(checkRoomStatus, 5000);
  }
}

// === Экран ожидания одобрения ===
function showWaitingApprovalScreen() {
  // Скрываем основной контент
  document.querySelector('.livestream-grid').style.display = 'none';
  
  // Создаем экран ожидания по шаблону
  const waitingScreen = document.createElement('div');
  waitingScreen.className = 'waiting-screen';
  waitingScreen.innerHTML = `
    <h2>Ожидание одобрения ведущего</h2>
    <p id="waiting-message">Ваша заявка на вход отправлена ведущему. Пожалуйста, дождитесь решения.</p>
    <div class="loader"></div>
    <div id="status-message" class="status-message"></div>
    <button id="cancel-waiting" class="btn-cancel">Отменить заявку</button>
  `;
  
  document.querySelector('main').appendChild(waitingScreen);
  
  // Кнопка отмены
  document.getElementById('cancel-waiting').onclick = () => {
    window.location.href = "/livestream/";
  };
}

// === Обработка RTM сообщений ===
function handleRTMMessage(data, senderId) {
  const { type, uid, name } = data;
  log('📨 RTM MSG:', type, data);

  // 1. Сохраняем имя участника
  if (uid && name) {
    userNames[uid] = name;
    if (participants[uid]) {
      participants[uid].name = name;
    }
  }

  // 2. Обработка типов событий
  switch (type) {
    case 'join':
      // Если пользователь был исключен и пытается войти
      if (data.wasKicked && IS_HOST) {
        showJoinRequestDialog(uid, name);
      } else {
        // Отправляем свою информацию новому участнику
        sendRTM({ 
          type: 'user_info', 
          uid: UID, 
          name: USER_NAME,
          isAudioMuted: isAudioMuted,
          isVideoMuted: isVideoMuted,
          allowMic: canUseMic,
          allowCam: canUseCam,
          isHost: IS_HOST
        });
        
        // Если участник еще не в списке, добавляем его
        if (!participants[uid]) {
          participants[uid] = {
            uid: uid,
            name: name,
            isAudioMuted: data.isAudioMuted !== undefined ? data.isAudioMuted : true,
            isVideoMuted: data.isVideoMuted !== undefined ? data.isVideoMuted : true,
            allowMic: data.allowMic !== undefined ? data.allowMic : true,
            allowCam: data.allowCam !== undefined ? data.allowCam : true,
            isHost: data.isHost || false
          };
        } else {
          // Обновляем информацию о существующем участнике
          participants[uid].name = name;
          if (data.isAudioMuted !== undefined) participants[uid].isAudioMuted = data.isAudioMuted;
          if (data.isVideoMuted !== undefined) participants[uid].isVideoMuted = data.isVideoMuted;
          if (data.allowMic !== undefined) participants[uid].allowMic = data.allowMic;
          if (data.allowCam !== undefined) participants[uid].allowCam = data.allowCam;
          if (data.isHost !== undefined) participants[uid].isHost = data.isHost;
        }
        
        // Если мы ведущий, отправляем текущего говорящего
        if (IS_HOST && currentSpeakerUid) {
          sendRTM({
            type: 'current_speaker',
            speakerUid: currentSpeakerUid,
            speakerName: participants[currentSpeakerUid]?.name || USER_NAME
          });
        }
        
        // Если мы ведущий, отправляем историю чата
        if (IS_HOST && chatHistory.length > 0) {
          sendRTM({ 
            type: 'chat_history', 
            uid: uid,
            history: chatHistory 
          });
        }
        
        updateUI();
      }
      break;
    
    case 'join_request_approved':
      if (uid === UID && waitingApproval) {
        waitingApproval = false;
        localStorage.removeItem('kicked_from_' + ROOM_ID);
        wasKicked = false;
        showAlert("Ваш запрос на вход одобрен", "success");
        
        // Обновляем статус
        const statusMsg = document.getElementById('status-message');
        if (statusMsg) {
          statusMsg.textContent = "Ваша заявка одобрена! Вход в трансляцию...";
        }
        
        // Перезагружаем страницу для входа в трансляцию
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
      break;
      
    case 'join_request_rejected':
      if (uid === UID && waitingApproval) {
        showAlert("Ваш запрос на вход отклонен", "error");
        
        // Обновляем статус
        const statusMsg = document.getElementById('status-message');
        if (statusMsg) {
          statusMsg.textContent = "Ваша заявка отклонена ведущим.";
        }
        
        setTimeout(() => {
          window.location.href = "/livestream/";
        }, 2000);
      }
      break;
    
    case 'user_info':
      // Сохраняем имя пользователя
      userNames[uid] = name;
      
      // Если участник еще не в списке, добавляем его
      if (!participants[uid]) {
        participants[uid] = {
          uid: uid,
          name: name,
          isAudioMuted: data.isAudioMuted !== undefined ? data.isAudioMuted : true,
          isVideoMuted: data.isVideoMuted !== undefined ? data.isVideoMuted : true,
          allowMic: data.allowMic !== undefined ? data.allowMic : true,
          allowCam: data.allowCam !== undefined ? data.allowCam : true,
          isHost: data.isHost || false
        };
      } else {
        // Обновляем информацию о существующем участнике
        participants[uid].name = name;
        if (data.isAudioMuted !== undefined) participants[uid].isAudioMuted = data.isAudioMuted;
        if (data.isVideoMuted !== undefined) participants[uid].isVideoMuted = data.isVideoMuted;
        if (data.allowMic !== undefined) participants[uid].allowMic = data.allowMic;
        if (data.allowCam !== undefined) participants[uid].allowCam = data.allowCam;
        if (data.isHost !== undefined) participants[uid].isHost = data.isHost;
      }
      
      updateUI();
      break;
      
    case 'request_current_speaker':
      // Если мы ведущий, отправляем текущего говорящего
      if (IS_HOST && currentSpeakerUid && participants[currentSpeakerUid]) {
        sendRTM({
          type: 'current_speaker',
          speakerUid: currentSpeakerUid,
          speakerName: participants[currentSpeakerUid].name
        });
      }
      break;

    case 'current_speaker':
      // Обновляем текущего говорящего
      currentSpeakerUid = data.speakerUid;
      
      // Обновляем статус говорящего
      if (UID === data.speakerUid) {
        isSpeaker = true;
      } else if (isSpeaker && UID !== data.speakerUid) {
        isSpeaker = false;
      }
      
      // Важно: обновляем UI для всех
      updateUI();
      break;

    case 'request_chat_history':
      if (IS_HOST && chatHistory.length > 0) {
        sendRTM({ 
          type: 'chat_history', 
          uid: uid,
          history: chatHistory 
        });
      }
      break;

    case 'chat_history':
      if (Array.isArray(data.history)) {
        // Очищаем чат перед добавлением истории
        const chatLog = document.getElementById('chat-log');
        if (chatLog) chatLog.innerHTML = '';
        
        // Добавляем сообщения из истории
        data.history.forEach(msg => {
          renderChat(msg.name, msg.message, msg.time);
        });
      }
      break;

    case 'chat':
      const time = data.time || formatTime(new Date());
      renderChat(name, data.message, time);
      
      // Сохраняем сообщение в историю чата (все участники)
      chatHistory.push({ name, message: data.message, time });
      if (chatHistory.length > 100) chatHistory.shift();
      
      break;

    case 'mute':
      if (uid === UID && localTracks.audio) {
        localTracks.audio.setMuted(data.state);
        isAudioMuted = data.state;
        if (participants[UID]) {
          participants[UID].isAudioMuted = data.state;
        }
        updateLocalControls();
      }
      
      if (participants[uid]) {
        participants[uid].isAudioMuted = data.state;
      }
      
      updateUI();
      break;

    case 'cam_off':
      if (uid === UID && localTracks.video) {
        localTracks.video.setMuted(data.state);
        isVideoMuted = data.state;
        if (participants[UID]) {
          participants[UID].isVideoMuted = data.state;
        }
        updateLocalControls();
      }
      
      if (participants[uid]) {
        participants[uid].isVideoMuted = data.state;
      }
      
      updateUI();
      break;

    case 'permission':
      // Обновляем разрешения в списке участников
      if (participants[uid]) {
        if (data.device === 'mic') {
          participants[uid].allowMic = data.state;
        }
        if (data.device === 'cam') {
          participants[uid].allowCam = data.state;
        }
      }
      
      // Если это наши разрешения
      if (uid === UID) {
        if (data.device === 'mic') {
          canUseMic = data.state;
          showAlert(`Микрофон ${data.state ? 'разрешён' : 'запрещён'}`, data.state ? "success" : "warning");
          
          // Если запретили и микрофон включен - выключаем
          if (!data.state && !isAudioMuted && localTracks.audio) {
            localTracks.audio.setMuted(true);
            isAudioMuted = true;
            if (participants[UID]) {
              participants[UID].isAudioMuted = true;
            }
            sendRTM({ type: 'mute', uid: UID, state: true });
          }
        }
        
        if (data.device === 'cam') {
          canUseCam = data.state;
          showAlert(`Камера ${data.state ? 'разрешена' : 'запрещена'}`, data.state ? "success" : "warning");
          
          // Если запретили и камера включена - выключаем
          if (!data.state && !isVideoMuted && localTracks.video) {
            localTracks.video.setMuted(true);
            isVideoMuted = true;
            if (participants[UID]) {
              participants[UID].isVideoMuted = true;
            }
            sendRTM({ type: 'cam_off', uid: UID, state: true });
          }
        }
        
        updateLocalControls();
      }
      
      updateUI();
      break;

    case 'grant_word':
      // Если нам дали слово
      if (uid === UID) {
        isSpeaker = true;
        showAlert("Вам дали слово", "success");
      }
      
      // Обновляем текущего говорящего у ВСЕХ
      currentSpeakerUid = uid;
      
      // Важно: обновляем UI для всех
      updateUI();
      
      // Отправляем всем обновление о текущем говорящем
      if (participants[uid]) {
        sendRTM({
          type: "current_speaker",
          speakerUid: uid,
          speakerName: participants[uid].name
        });
      }
      break;

    case 'revoke_word':
      // Если у нас забрали слово
      if (uid === UID) {
        isSpeaker = false;
        showAlert("У вас забрали слово", "warning");
      }
      
      // Находим UID ведущего
      const hostUid = Object.entries(participants).find(([_, p]) => p.isHost)?.[0] || null;
      
      // Возвращаем слово ведущему
      if (hostUid) {
        currentSpeakerUid = hostUid;
        
        // Оповещаем всех о смене говорящего
        sendRTM({
          type: "current_speaker",
          speakerUid: hostUid,
          speakerName: participants[hostUid].name
        });
      } else {
        currentSpeakerUid = null;
      }
      
      // Важно: обновляем UI для всех
      updateUI();
      break;

    case 'raise_hand':
      if (IS_HOST || IS_SUPERUSER) {
        showHandDialog(uid, name);
      }
      break;

    case 'kicked':
      if (uid === UID) {
        showAlert("Вы были исключены из трансляции", "error");
        localStorage.setItem('kicked_from_' + ROOM_ID, 'true');
        setTimeout(() => {
          window.location.href = "/livestream/";
        }, 2000);
      } else if (participants[uid]) {
        // Удаляем участника из списка
        delete participants[uid];
        
                // Если исключили говорящего, возвращаем слово ведущему
        if (currentSpeakerUid === uid) {
          const hostUid = Object.entries(participants).find(([_, p]) => p.isHost)?.[0] || null;
          if (hostUid) {
            currentSpeakerUid = hostUid;
            
            sendRTM({
              type: "current_speaker",
              speakerUid: hostUid,
              speakerName: participants[hostUid].name
            });
          } else {
            currentSpeakerUid = null;
          }
        }
        
        updateUI();
      }
      break;
      
    case 'room_ended':
      roomEnded = true;
      showAlert("Трансляция завершена ведущим", "warning");
      setTimeout(() => {
        window.location.href = "/livestream/";
      }, 2000);
      break;

    default:
      console.warn('⚠️ Неизвестный тип RTM:', type);
  }
}

// === Обновление UI ===
function updateUI() {
  updateMainSpeaker();
  updateParticipantsColumn();
  updateParticipantPanel();
  updateWordToggleButton();
}

// === Обновление кнопки слова ===
function updateWordToggleButton() {
  const btn = document.getElementById("word-toggle-btn");
  if (!btn) return;

  // Ведущий, но не говорит сейчас
  if (IS_HOST && currentSpeakerUid !== UID && currentSpeakerUid !== null) {
    btn.style.display = "inline-flex";
    btn.title = "Забрать слово";
    btn.innerHTML = '<img src="/static/img/word_back.png" class="icon-btn" alt="Слово">';
    btn.onclick = () => {
      sendRTM({ type: 'revoke_word', uid: currentSpeakerUid });
      showAlert("Вы забрали слово", "success");
    };
    return;
  }

  // Говорящий (не ведущий) хочет вернуть слово
  if (!IS_HOST && isSpeaker && currentSpeakerUid === UID) {
    btn.style.display = "inline-flex";
    btn.title = "Вернуть слово";
    btn.innerHTML = '<img src="/static/img/word_back.png" class="icon-btn" alt="Слово">';
    btn.onclick = () => {
      sendRTM({ type: 'revoke_word', uid: UID });
      showAlert("Вы вернули слово ведущему", "info");
    };
    return;
  }

  // В остальных случаях скрываем кнопку
  btn.style.display = "none";
}

// === Главный говорящий ===
function updateMainSpeaker() {
  const container = document.getElementById('main-speaker-container');
  if (!container) return;

  container.innerHTML = '';

  if (!currentSpeakerUid || !participants[currentSpeakerUid]) {
    container.innerHTML = `<div class="no-speaker">Нет активного говорящего</div>`;
    return;
  }

  const p = participants[currentSpeakerUid];
  const card = document.createElement('div');
  card.className = 'user-card main-speaker-card';
  card.id = `main-speaker-${currentSpeakerUid}`;

  const video = document.createElement('div');
  video.className = 'video-slot';
  video.id = `video-main-${currentSpeakerUid}`;
  card.appendChild(video);

  const info = document.createElement('div');
  info.className = 'video-info';

  const name = document.createElement('div');
  name.className = 'video-name';
  name.innerText = p.name;
  if (currentSpeakerUid === UID) name.innerText += " (Вы)";
  if (p.isHost) name.innerText += " (Ведущий)";
  info.appendChild(name);

  // Иконки
  const icons = document.createElement('div');
  icons.className = 'video-icons';

  const mic = document.createElement('img');
  mic.src = `/static/img/${p.isAudioMuted ? 'mic-off' : 'mic-on'}.png`;
  mic.className = 'status-icon';
  icons.appendChild(mic);

  const cam = document.createElement('img');
  cam.src = `/static/img/${p.isVideoMuted ? 'cam-off' : 'cam-on'}.png`;
  cam.className = 'status-icon';
  icons.appendChild(cam);

  // crown
  if (p.isHost) {
    const host = document.createElement("img");
    host.src = "/static/img/crown.png";
    host.className = "status-icon";
    icons.appendChild(host);
  }

  info.appendChild(icons);
  card.appendChild(info);

  container.appendChild(card);

  // 🎥 Воспроизведение видео
  setTimeout(() => {
    if (currentSpeakerUid === UID && localTracks.video && !isVideoMuted)
      localTracks.video.play(`video-main-${currentSpeakerUid}`);
    else if (p.videoTrack && !p.isVideoMuted)
      p.videoTrack.play(`video-main-${currentSpeakerUid}`);
    else
      video.innerHTML = `<div class="video-placeholder">Видео отключено</div>`;
  }, 100);
}

// === Участники (колонка) ===
function updateParticipantsColumn() {
  const column = document.getElementById('secondary-participants');
  if (!column) return;

  column.innerHTML = '';

  // Сортируем участников: сначала ведущий, потом текущий пользователь, потом остальные
  const others = Object.entries(participants)
    .filter(([uid]) => uid !== currentSpeakerUid)
    .sort(([uidA, a], [uidB, b]) => {
      if (a.isHost) return -1; // Ведущий всегда первый
      if (b.isHost) return 1;
      if (uidA === UID) return -1; // Текущий пользователь после ведущего
      if (uidB === UID) return 1;
      return a.name.localeCompare(b.name); // Остальные по алфавиту
    });

  others.forEach(([uid, p]) => {
    const card = document.createElement('div');
    card.className = 'user-card';
    if (p.isHost) card.classList.add('host-card');
    if (uid === UID) card.classList.add('current-user-card');
    card.id = `part-${uid}`;

    // Видео
    const video = document.createElement('div');
    video.className = 'video-slot';
    video.id = `video-${uid}`;
    card.appendChild(video);

    // Info bar
    const info = document.createElement('div');
    info.className = 'video-info';

    const name = document.createElement('div');
    name.className = 'video-name';
    name.innerText = p.name;
    if (uid === UID) name.innerText += " (Вы)";
    if (p.isHost) name.innerText += " (Ведущий)";
    info.appendChild(name);

    const icons = document.createElement('div');
    icons.className = 'video-icons';

    const mic = document.createElement("img");
    mic.src = `/static/img/${p.isAudioMuted ? 'mic-off' : 'mic-on'}.png`;
    mic.className = "status-icon";
    icons.appendChild(mic);

    const cam = document.createElement("img");
    cam.src = `/static/img/${p.isVideoMuted ? 'cam-off' : 'cam-on'}.png`;
    cam.className = "status-icon";
    icons.appendChild(cam);

    if (p.isHost) {
      const host = document.createElement("img");
      host.src = "/static/img/crown.png";
      host.className = "status-icon";
      icons.appendChild(host);
    }

    info.appendChild(icons);
    card.appendChild(info);
    column.appendChild(card);

    // Воспроизведение видео
    setTimeout(() => {
      if (uid === UID && localTracks.video && !isVideoMuted)
        localTracks.video.play(`video-${uid}`);
      else if (p.videoTrack && !p.isVideoMuted)
        p.videoTrack.play(`video-${uid}`);
      else
        video.innerHTML = `<div class="video-placeholder">Видео отключено</div>`;
    }, 100);
  });
}

// === Панель участников ===
function updateParticipantPanel() {
  const panel = document.getElementById("participants-panel");
  if (!panel) return;
  panel.innerHTML = "";

  // Сортируем участников: сначала ведущий, потом текущий пользователь, потом остальные
  const sortedParticipants = Object.entries(participants).sort(([uidA, a], [uidB, b]) => {
    if (a.isHost) return -1; // Ведущий всегда первый
    if (b.isHost) return 1;
    if (uidA === UID) return -1; // Текущий пользователь после ведущего
    if (uidB === UID) return 1;
    return a.name.localeCompare(b.name); // Остальные по алфавиту
  });

  sortedParticipants.forEach(([uid, p]) => {
    const row = document.createElement("div");
    row.className = "user-row";
    
    // Подсветка говорящего
    if (uid === currentSpeakerUid) {
      row.classList.add("speaking");
    }
    
    // Подсветка ведущего и текущего пользователя
    if (p.isHost) {
      row.classList.add("host-row");
    }
    if (uid === UID) {
      row.classList.add("current-user-row");
    }

    const name = document.createElement("span");
    name.className = "user-name-row";
    name.textContent = p.name;
    if (uid === UID) name.textContent += " (Вы)";
    if (p.isHost) name.textContent += " (Ведущий)";
    if (uid === currentSpeakerUid) name.textContent += " (Говорит)";
    row.appendChild(name);

    // Только ведущий/суперадмин управляют
    if ((IS_HOST || IS_SUPERUSER) && uid !== UID) {
      const actions = document.createElement("div");
      actions.className = "user-actions";

      // Микрофон
      const micBtn = document.createElement("button");
      micBtn.className = "action-btn";
      micBtn.title = p.isAudioMuted ? "Включить микрофон" : "Выключить микрофон";
      micBtn.innerHTML = `<img src="/static/img/${p.isAudioMuted ? 'mic-off' : 'mic-on'}.png" class="action-icon">`;
      micBtn.onclick = () => sendRTM({ type: "mute", uid, state: !p.isAudioMuted });
      actions.appendChild(micBtn);

      // Камера
      const camBtn = document.createElement("button");
      camBtn.className = "action-btn";
      camBtn.title = p.isVideoMuted ? "Включить камеру" : "Выключить камеру";
      camBtn.innerHTML = `<img src="/static/img/${p.isVideoMuted ? 'cam-off' : 'cam-on'}.png" class="action-icon">`;
      camBtn.onclick = () => sendRTM({ type: "cam_off", uid, state: !p.isVideoMuted });
      actions.appendChild(camBtn);

      // Permission mic - правильные иконки и состояния
      const micPerm = document.createElement("button");
      micPerm.className = `action-btn ${p.allowMic ? 'allow' : 'deny'}`;
      micPerm.title = p.allowMic ? "Запретить микрофон" : "Разрешить микрофон";
      micPerm.innerHTML = `<img src="/static/img/${p.allowMic ? 'mic-block' : 'mic-on'}.png" class="action-icon">`;
      micPerm.onclick = () => {
        // Инвертируем текущее состояние
        const newState = !p.allowMic;
        // Обновляем локальное состояние
        p.allowMic = newState;
        // Обновляем UI
        micPerm.title = newState ? "Запретить микрофон" : "Разрешить микрофон";
        micPerm.innerHTML = `<img src="/static/img/${newState ? 'mic-block' : 'mic-on'}.png" class="action-icon">`;
        micPerm.className = `action-btn ${newState ? 'allow' : 'deny'}`;
        // Отправляем сигнал
        sendRTM({ 
          type: "permission", 
          uid, 
          device: "mic", 
          state: newState 
        });
      };
      actions.appendChild(micPerm);

      // Permission cam - правильные иконки и состояния
      const camPerm = document.createElement("button");
      camPerm.className = `action-btn ${p.allowCam ? 'allow' : 'deny'}`;
      camPerm.title = p.allowCam ? "Запретить камеру" : "Разрешить камеру";
      camPerm.innerHTML = `<img src="/static/img/${p.allowCam ? 'cam-block' : 'cam-on'}.png" class="action-icon">`;
      camPerm.onclick = () => {
        // Инвертируем текущее состояние
        const newState = !p.allowCam;
        // Обновляем локальное состояние
        p.allowCam = newState;
        // Обновляем UI
        camPerm.title = newState ? "Запретить камеру" : "Разрешить камеру";
        camPerm.innerHTML = `<img src="/static/img/${newState ? 'cam-block' : 'cam-on'}.png" class="action-icon">`;
        camPerm.className = `action-btn ${newState ? 'allow' : 'deny'}`;
        // Отправляем сигнал
        sendRTM({ 
          type: "permission", 
          uid, 
          device: "cam", 
          state: newState 
        });
      };
      actions.appendChild(camPerm);

      // 🎙️ Дать / забрать слово - ИСПРАВЛЕНО
      if (currentSpeakerUid === uid) {
        // Если этот пользователь сейчас говорит - показываем кнопку "забрать слово"
        const revoke = document.createElement("button");
        revoke.className = "action-btn word-back";
        revoke.title = "Забрать слово";
        revoke.innerHTML = `<img src="/static/img/word_back.png" class="action-icon">`;
        revoke.onclick = () => {
          sendRTM({ type: "revoke_word", uid });
          showAlert(`Вы забрали слово у ${p.name}`, "info");
        };
        actions.appendChild(revoke);
      } else {
        // Если этот пользователь не говорит - показываем кнопку "дать слово"
        const grant = document.createElement("button");
        grant.className = "action-btn give-word";
        grant.title = "Дать слово";
        grant.innerHTML = `<img src="/static/img/give_word.png" class="action-icon">`;
        grant.onclick = () => {
          sendRTM({ type: "grant_word", uid });
          showAlert(`Вы дали слово ${p.name}`, "success");
        };
        actions.appendChild(grant);
      }

      // ❌ Исключить
      const kick = document.createElement("button");
      kick.className = "action-btn";
      kick.title = "Исключить";
      kick.innerHTML = `<img src="/static/img/exit.png" class="action-icon">`;
      kick.onclick = () => {
        if (confirm(`Исключить ${p.name}?`))
          sendRTM({ type: "kicked", uid });
      };
      actions.appendChild(kick);

      row.appendChild(actions);
    }

    panel.appendChild(row);
  });
}

// === Чат ===
function renderChat(sender, message, time) {
  const log = document.getElementById('chat-log');
  if (!log) return;

  const msg = document.createElement('div');
  msg.className = 'chat-message';
  msg.innerHTML = `<strong>${sender}</strong>: ${message} <span class="chat-time">${time}</span>`;
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
}

// === Статус-бар ===
function updateSpeakerBar(name) {
  // Удаляем статус-бар, так как он больше не нужен
  const status = document.getElementById('speaker-status');
  if (status) {
    status.style.display = 'none';
  }
}

// === Диалог поднятой руки ===
function showHandDialog(uid, name) {
  const dialog = document.getElementById("hand-raised-dialog");
  const userEl = document.getElementById("hand-raised-user");
  const giveBtn = document.getElementById("give-word-btn");
  const rejectBtn = document.getElementById("reject-hand-btn");

  if (!dialog || !userEl || !giveBtn || !rejectBtn) return;

  userEl.textContent = name;
  dialog.style.display = "flex";

  giveBtn.onclick = () => {
    sendRTM({ type: "grant_word", uid });
    dialog.style.display = "none";
    showAlert(`Вы дали слово ${name}`, "success");
  };

  rejectBtn.onclick = () => {
    dialog.style.display = "none";
  };

  // Закрытие по клику вне диалога
  document.addEventListener("click", function closeDialog(e) {
    if (e.target === dialog) {
      dialog.style.display = "none";
      document.removeEventListener("click", closeDialog);
    }
  });
}

// === Диалог запроса на вход ===
function showJoinRequestDialog(uid, name) {
  // Создаем диалог, если его нет
  let dialog = document.getElementById("join-request-dialog");
  
  if (!dialog) {
    dialog = document.createElement("div");
    dialog.id = "join-request-dialog";
    dialog.className = "dialog-modal";
    
    const content = document.createElement("div");
    content.className = "dialog-content";
    
    const title = document.createElement("h3");
    title.textContent = "Запрос на вход";
    content.appendChild(title);
    
    const userText = document.createElement("p");
    userText.id = "join-request-user";
    content.appendChild(userText);
    
    const actions = document.createElement("div");
    actions.className = "dialog-actions";
    
    const approveBtn = document.createElement("button");
    approveBtn.id = "approve-join-btn";
    approveBtn.className = "btn-approve";
    approveBtn.textContent = "Разрешить";
    actions.appendChild(approveBtn);
    
    const rejectBtn = document.createElement("button");
    rejectBtn.id = "reject-join-btn";
    rejectBtn.className = "btn-reject";
    rejectBtn.textContent = "Отклонить";
    actions.appendChild(rejectBtn);
    
    content.appendChild(actions);
    dialog.appendChild(content);
    document.body.appendChild(dialog);
  }
  
  const userEl = document.getElementById("join-request-user");
  const approveBtn = document.getElementById("approve-join-btn");
  const rejectBtn = document.getElementById("reject-join-btn");
  
  userEl.textContent = `${name} просит разрешения войти в трансляцию`;
  dialog.style.display = "flex";
  
  approveBtn.onclick = () => {
    sendRTM({ type: "join_request_approved", uid });
    dialog.style.display = "none";
    showAlert(`Пользователь ${name} допущен к трансляции`, "success");
  };
  
  rejectBtn.onclick = () => {
    sendRTM({ type: "join_request_rejected", uid });
    dialog.style.display = "none";
    showAlert(`Пользователь ${name} не допущен к трансляции`, "info");
  };
  
  // Закрытие по клику вне диалога
  document.addEventListener("click", function closeDialog(e) {
    if (e.target === dialog) {
      dialog.style.display = "none";
      document.removeEventListener("click", closeDialog);
    }
  });
}

// === Обновление локальных кнопок ===
function updateLocalControls() {
  const micBtn = document.getElementById("mic-btn");
  const micIcon = document.getElementById("mic-icon");
  const camBtn = document.getElementById("cam-btn");
  const camIcon = document.getElementById("cam-icon");
  const handBtn = document.getElementById("hand-btn");

  if (micBtn && micIcon) {
    if (!canUseMic) {
      micBtn.classList.add("disabled");
      micIcon.src = "/static/img/mic-block.png";
    } else {
      micBtn.classList.remove("disabled");
      micIcon.src = isAudioMuted ? "/static/img/mic-off.png" : "/static/img/mic-on.png";
    }
  }

  if (camBtn && camIcon) {
    if (!canUseCam) {
      camBtn.classList.add("disabled");
      camIcon.src = "/static/img/cam-block.png";
    } else {
      camBtn.classList.remove("disabled");
      camIcon.src = isVideoMuted ? "/static/img/cam-off.png" : "/static/img/cam-on.png";
    }
  }

  if (handBtn) {
    handBtn.disabled = IS_HOST || isSpeaker;
    handBtn.style.opacity = (IS_HOST || isSpeaker) ? "0.5" : "1";
  }
}

// === Подключение кнопок ===
function bindControlButtons() {
  const micBtn = document.getElementById('mic-btn');
  const camBtn = document.getElementById('cam-btn');
  const handBtn = document.getElementById('hand-btn');
  const leaveBtn = document.getElementById('leave-btn');
  const wordToggleBtn = document.getElementById('word-toggle-btn');

  if (micBtn)
    micBtn.onclick = () => {
      if (!canUseMic) {
        showAlert('Микрофон запрещён ведущим', 'warning');
        return;
      }
      isAudioMuted = !isAudioMuted;
      localTracks.audio.setMuted(isAudioMuted);
      if (participants[UID]) {
        participants[UID].isAudioMuted = isAudioMuted;
      }
      sendRTM({ type: 'mute', uid: UID, state: isAudioMuted });
      updateUI();
      updateLocalControls();
    };

  if (camBtn)
    camBtn.onclick = () => {
      if (!canUseCam) {
        showAlert('Камера запрещена ведущим', 'warning');
        return;
      }
      isVideoMuted = !isVideoMuted;
      localTracks.video.setMuted(isVideoMuted);
      if (participants[UID]) {
        participants[UID].isVideoMuted = isVideoMuted;
      }
      sendRTM({ type: 'cam_off', uid: UID, state: isVideoMuted });
      updateUI();
      updateLocalControls();
    };

  if (handBtn)
    handBtn.onclick = () => {
      if (IS_HOST || isSpeaker) return;
      hasRaisedHand = true;
      sendRTM({ type: 'raise_hand', uid: UID, name: USER_NAME });
      showAlert("Вы подняли руку", "info");
    };

  if (leaveBtn)
    leaveBtn.onclick = async () => {
      if (confirm("Покинуть трансляцию?")) {
        if (rtcClient) await rtcClient.leave();
        if (rtmChannel) await rtmChannel.leave();
        if (rtmClient) await rtmClient.logout();
        window.location.href = "/livestream/";
      }
    };

  // Кнопка слова обновляется динамически в updateWordToggleButton()
  if (wordToggleBtn) {
    updateWordToggleButton();
  }

  // Поиск в участниках
  const search = document.getElementById("user-search");
  if (search)
    search.addEventListener("input", e => {
      const val = e.target.value.toLowerCase();
      document.querySelectorAll("#participants-panel .user-row").forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(val) ? '' : 'none';
      });
    });

  // Форма чата
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  if (chatForm && chatInput) {
    chatForm.onsubmit = e => {
      e.preventDefault();
      const msg = chatInput.value.trim();
      if (!msg) return;

      const time = formatTime(new Date());
      sendRTM({
        type: 'chat',
        uid: UID,
        name: USER_NAME,
        message: msg,
        time
      });

      renderChat(USER_NAME, msg, time);
      chatInput.value = '';
    };
  }
}

// === Запуск ===
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Если пользователь был исключен, показываем экран ожидания
    if (wasKicked) {
      showWaitingApprovalScreen();
      
      // Инициализируем только RTM для общения с ведущим
      await initRTM();
      
      showAlert("Запрос на повторное подключение отправлен", "info");
    } else {
      showAlert("Подключение...", "info");
      
      await initRTC();
      await initRTM();
      updateLocalControls();
      bindControlButtons();
      
      showAlert("Вы в трансляции", "success");
    }
  } catch (err) {
    console.error("Ошибка старта:", err);
    showAlert("Ошибка подключения: " + err.message, "error");
  }
});