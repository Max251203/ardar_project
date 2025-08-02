const appId = window.livestreamAppId;
const channel = window.livestreamChannel;
const uid = parseInt(window.livestreamUserId);
const userName = window.livestreamUserName;
const isHost = window.livestreamIsHost;
const roomType = window.livestreamRoomType;
const roomId = window.livestreamRoomId;
const csrfToken = window.livestreamCsrfToken;
const userRole = window.livestreamUserRole;
const isSuperuser = window.livestreamIsSuperuser === "true";

let token = "";
let localTracks = { audioTrack: null, videoTrack: null };
let localTrackState = { audioTrackMuted: false, videoTrackMuted: false };
let client = null;
let amISpeaker = false;
let canEnableMic = true;
let canEnableCamera = true;
let handRaised = false;
let handDialogShown = false;
let currentSpeakerUid = null;
let remoteUsers = {};
let localVideoCollapsed = false;
let localVideoSize = { width: 220, height: 160 };

// Показ уведомлений
function showCustomAlert(msg, type = 'info') {
  const alertDiv = document.getElementById('custom-alert');
  alertDiv.innerHTML = msg;
  alertDiv.className = 'custom-alert ' + type;
  alertDiv.style.display = 'block';
  setTimeout(() => { alertDiv.style.display = 'none'; }, 3500);
}

// Обновление кнопок микрофона и камеры
function updateMicCameraButtons() {
  const micBtn = document.getElementById('mic-btn');
  const cameraBtn = document.getElementById('camera-btn');

  if (!canEnableMic) {
    micBtn.disabled = true;
    micBtn.classList.add('muted');
    micBtn.title = "Микрофон запрещен ведущим";
    document.getElementById('mic-btn-icon').src = '/static/img/mic-block.png';
  } else if (localTrackState.audioTrackMuted) {
    micBtn.disabled = false;
    micBtn.classList.remove('muted');
    micBtn.title = "Включить микрофон";
    document.getElementById('mic-btn-icon').src = '/static/img/mic-off.png';
  } else {
    micBtn.disabled = false;
    micBtn.classList.remove('muted');
    micBtn.title = "Выключить микрофон";
    document.getElementById('mic-btn-icon').src = '/static/img/mic-on.png';
  }

  if (!canEnableCamera) {
    cameraBtn.disabled = true;
    cameraBtn.classList.add('muted');
    cameraBtn.title = "Камера запрещена ведущим";
    document.getElementById('cam-btn-icon').src = '/static/img/cam-block.png';
  } else if (localTrackState.videoTrackMuted) {
    cameraBtn.disabled = false;
    cameraBtn.classList.remove('muted');
    cameraBtn.title = "Включить камеру";
    document.getElementById('cam-btn-icon').src = '/static/img/cam-off.png';
  } else {
    cameraBtn.disabled = false;
    cameraBtn.classList.remove('muted');
    cameraBtn.title = "Выключить камеру";
    document.getElementById('cam-btn-icon').src = '/static/img/cam-on.png';
  }
}

// Обновление кнопок поднятия руки
function updateHandButton() {
  const handBtn = document.getElementById('hand-btn');
  const lowerHandBtn = document.getElementById('lower-hand-btn');

  if (!isHost) {
    if (!amISpeaker) {
      if (!handRaised) {
        handBtn.style.display = 'inline-block';
        lowerHandBtn.style.display = 'none';
      } else {
        handBtn.style.display = 'none';
        lowerHandBtn.style.display = 'inline-block';
      }
    } else {
      handBtn.style.display = 'none';
      lowerHandBtn.style.display = 'none';
    }
  } else {
    handBtn.style.display = 'none';
    lowerHandBtn.style.display = 'none';
  }
}

// Обновление кнопки возврата слова
function updateReturnWordButton() {
  const returnWordBtn = document.getElementById('return-word-btn');
  if (!returnWordBtn) return;
  if (amISpeaker && !isHost) {
    returnWordBtn.style.display = 'block';
  } else {
    returnWordBtn.style.display = 'none';
  }
}

// Обновление статуса говорящего
function updateSpeakerStatus(name) {
  const statusBar = document.getElementById('speaker-status');
  if (name) {
    statusBar.innerHTML = `<b>Сейчас говорит:</b> ${name}`;
  } else {
    statusBar.innerHTML = '';
  }
}

// Проверка статуса пользователя
function checkUserStatus() {
  fetch(`/livestream/check_status/${roomId}/?t=${Date.now()}`)
    .then(response => response.json())
    .then(data => {
      const statusChanged =
        canEnableMic !== data.can_enable_mic ||
        canEnableCamera !== data.can_enable_camera ||
        handRaised !== data.hand_raised ||
        amISpeaker !== data.is_speaker;

      canEnableMic = data.can_enable_mic;
      canEnableCamera = data.can_enable_camera;
      handRaised = data.hand_raised;
      amISpeaker = data.is_speaker;

      if (statusChanged) {
        updateMicCameraButtons();
        updateHandButton();
        updateReturnWordButton();
        updateVideoLayout();
      }

      if (data.is_kicked) {
        showCustomAlert("Вы были исключены из трансляции ведущим.", "error");
        setTimeout(() => window.location.href = "/livestream/", 1500);
      }
      if (data.room_ended) {
        showCustomAlert("Трансляция завершена ведущим.", "warning");
        setTimeout(() => window.location.href = "/livestream/", 1500);
      }
    });
}

// Обновление расположения видео
function updateVideoLayout() {
  fetch(`/livestream/users/${roomId}/`)
    .then(r => r.json())
    .then(data => {
      const users = data.users;
      const hostUser = users.find(u => u.is_host);
      const speakerUser = users.find(u => u.is_speaker && !u.is_host);

      const mainContainer = document.getElementById('main-video-container');
      const localContainer = document.getElementById('local-video-container');

      if (!mainContainer || !localContainer) return;

      mainContainer.innerHTML = '';
      localContainer.innerHTML = '';

      let mainUser = speakerUser || hostUser;

      if (mainUser) {
        const isMainUserMe = mainUser.id === uid;

        const mainVideoEl = document.createElement('div');
        mainVideoEl.className = 'video-card main-video';
        mainVideoEl.id = `main-video-${mainUser.id}`;
        let displayName = mainUser.name;
        if (mainUser.is_host) displayName += " (Ведущий)";
        if (mainUser.is_speaker && !mainUser.is_host) displayName += " (Говорит)";

        mainVideoEl.innerHTML = `
          <div class="video-box" id="main-video-box-${mainUser.id}"></div>
          <div class="video-info">
            <div class="video-name">${displayName}</div>
            <div class="video-icons" id="main-video-icons-${mainUser.id}"></div>
          </div>
        `;

        mainContainer.appendChild(mainVideoEl);

        if (isMainUserMe) {
          if (localTracks.videoTrack && !localTrackState.videoTrackMuted) {
            localTracks.videoTrack.play(`main-video-box-${mainUser.id}`);
          }
        } else {
          if (remoteUsers[mainUser.id] && remoteUsers[mainUser.id].videoTrack) {
            remoteUsers[mainUser.id].videoTrack.play(`main-video-box-${mainUser.id}`);
          }
        }

        updateVideoIcons(mainUser.id, 'main');
        updateSpeakerStatus(displayName);
        currentSpeakerUid = mainUser.id;
      }

      // Локальное видео всегда показываем, кроме когда оно на главном экране
      if (uid !== mainUser.id && !localVideoCollapsed) {
        const localVideoEl = document.createElement('div');
        localVideoEl.className = 'video-card local-video resizable';
        localVideoEl.id = `local-video-${uid}`;
        localVideoEl.style.width = `${localVideoSize.width}px`;
        localVideoEl.style.height = `${localVideoSize.height}px`;

        localVideoEl.innerHTML = `
          <div class="local-video-controls">
            <button class="local-control-btn" id="local-collapse-btn" title="Свернуть">
              <img src="/static/img/return.png" class="local-control-icon" alt="Свернуть" />
            </button>
            <button class="local-control-btn" id="local-move-btn" title="Переместить">
              <img src="/static/img/hand.png" class="local-control-icon" alt="Переместить" />
            </button>
          </div>
          <div class="video-box" id="local-video-box-${uid}"></div>
          <div class="video-info">
            <div class="video-name">${userName} (Вы)</div>
            <div class="video-icons" id="local-video-icons-${uid}"></div>
          </div>
        `;

        localContainer.appendChild(localVideoEl);

        if (localTracks.videoTrack && !localTrackState.videoTrackMuted) {
          localTracks.videoTrack.play(`local-video-box-${uid}`);
        }

        updateVideoIcons(uid, 'local');

        document.getElementById('local-collapse-btn').addEventListener('click', e => {
          e.stopPropagation();
          collapseLocalVideo();
        });

        document.getElementById('local-move-btn').addEventListener('click', e => {
          e.stopPropagation();
          makeDraggable(localVideoEl);
        });

        makeDraggable(localVideoEl);

        localVideoEl.addEventListener('mouseup', () => {
          localVideoSize.width = localVideoEl.offsetWidth;
          localVideoSize.height = localVideoEl.offsetHeight;
        });
      } else if (uid !== mainUser.id && localVideoCollapsed) {
        const collapsedBtn = document.createElement('div');
        collapsedBtn.className = 'local-video-collapsed';
        collapsedBtn.id = `collapsed-local-video-${uid}`;
        collapsedBtn.innerHTML = `<img src="/static/img/cam-on.png" class="icon-btn" alt="Развернуть" />`;
        collapsedBtn.addEventListener('click', () => {
          expandLocalVideo();
        });
        localContainer.appendChild(collapsedBtn);
      }
    });
}

// Свернуть локальное видео
function collapseLocalVideo() {
    localVideoCollapsed = true;
    updateVideoLayout();
}

// Развернуть локальное видео
function expandLocalVideo() {
    localVideoCollapsed = false;
    updateVideoLayout();
}

// Обновление иконок статуса для видео
function updateVideoIcons(userId, type) {
    const iconsContainer = document.getElementById(`${type}-video-icons-${userId}`);
    if (!iconsContainer) return;

    fetch(`/livestream/users/${roomId}/`)
        .then(r => r.json())
        .then(data => {
            const userInfo = data.users.find(u => u.id === userId);
            if (!userInfo) return;

            let html = '';

            // Микрофон
            if (!userInfo.can_enable_mic) {
                html += '<img src="/static/img/mic-block.png" class="icon-btn" title="Микрофон запрещён">';
            } else if (userInfo.is_muted) {
                html += '<img src="/static/img/mic-off.png" class="icon-btn" title="Микрофон выключен">';
            } else {
                html += '<img src="/static/img/mic-on.png" class="icon-btn" title="Микрофон включён">';
            }

            // Камера
            if (!userInfo.can_enable_camera) {
                html += '<img src="/static/img/cam-block.png" class="icon-btn" title="Камера запрещена">';
            } else if (!userInfo.has_video) {
                html += '<img src="/static/img/cam-off.png" class="icon-btn" title="Камера выключена">';
            } else {
                html += '<img src="/static/img/cam-on.png" class="icon-btn" title="Камера включена">';
            }

            // Говорящий
            if (userInfo.is_speaker) {
                html += '<img src="/static/img/speak.png" class="icon-btn" title="Говорит">';
            }

            // Ведущий
            if (userInfo.is_host) {
                html += '<img src="/static/img/crown.png" class="icon-btn" title="Ведущий">';
            }

            // Поднятая рука
            if (userInfo.hand_raised) {
                html += '<img src="/static/img/hand.png" class="icon-btn" title="Поднял руку">';
            }

            iconsContainer.innerHTML = html;
        });
}

// Функция для перетаскивания локального видео
function makeDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let isDragging = false;

    // Добавляем обработчик для всего элемента
    element.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e = e || window.event;
        // Проверяем, что клик был не на кнопке управления
        if (e.target.closest('.local-control-btn')) {
            return;
        }

        e.preventDefault();
        isDragging = true;

        // Получаем начальную позицию курсора
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        // Вызываем функцию при движении курсора
        document.onmousemove = elementDrag;

        // Добавляем класс для визуального эффекта перетаскивания
        element.classList.add('dragging');
    }

    function elementDrag(e) {
        if (!isDragging) return;

        e = e || window.event;
        e.preventDefault();
        // Вычисляем новую позицию
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;

        // Получаем размеры родительского контейнера
        const container = document.getElementById('agora-video');
        const containerRect = container.getBoundingClientRect();

        // Получаем размеры элемента
        const elementRect = element.getBoundingClientRect();

        // Вычисляем новую позицию с учетом границ
        let newTop = element.offsetTop - pos2;
        let newLeft = element.offsetLeft - pos1;

        // Ограничиваем перемещение в пределах контейнера
        const maxTop = containerRect.height - elementRect.height;
        const maxLeft = containerRect.width - elementRect.width;

        // Устанавливаем новую позицию
        element.style.top = Math.max(0, Math.min(newTop, maxTop)) + "px";
        element.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + "px";
    }

    function closeDragElement() {
        // Останавливаем перемещение при отпускании кнопки мыши
        isDragging = false;
        document.onmouseup = null;
        document.onmousemove = null;

        // Удаляем класс перетаскивания
        element.classList.remove('dragging');
    }
}

// Показать диалог с поднятой рукой
function showHandRaisedDialog(userId, userName) {
    const dialog = document.getElementById('hand-raised-dialog');
    const userNameEl = document.getElementById('hand-raised-user');
    const giveWordBtn = document.getElementById('give-word-btn');
    const rejectHandBtn = document.getElementById('reject-hand-btn');

    userNameEl.textContent = userName;
    lastHandRaisedUser = userId;

    // Настраиваем обработчики кнопок
    giveWordBtn.onclick = function () {
        giveWordToUser(userId);
        dialog.style.display = 'none';
    };

    rejectHandBtn.onclick = function () {
        rejectHandRaised(userId);
        dialog.style.display = 'none';
    };

    dialog.style.display = 'block';

    // Автоматически скрываем диалог через 10 секунд
    setTimeout(() => {
        if (dialog.style.display === 'block') {
            dialog.style.display = 'none';
        }
    }, 10000);
}

// Показать диалог с запросом на вход
function showUserKickedDialog(userId, userName) {
    const dialog = document.getElementById('user-kicked-dialog');
    const userNameEl = document.getElementById('user-kicked-name');
    const approveBtn = document.getElementById('approve-user-btn');
    const rejectBtn = document.getElementById('reject-user-btn');

    userNameEl.textContent = userName;

    // Настраиваем обработчики кнопок
    approveBtn.onclick = function () {
        approveUser(userId);
        dialog.style.display = 'none';
    };

    rejectBtn.onclick = function () {
        rejectUser(userId);
        dialog.style.display = 'none';
    };

    dialog.style.display = 'block';

    // Автоматически скрываем диалог через 10 секунд
    setTimeout(() => {
        if (dialog.style.display === 'block') {
            dialog.style.display = 'none';
        }
    }, 10000);
}

// Дать слово пользователю
function giveWordToUser(userId) {
    fetch(`/livestream/grant/${roomId}/${userId}/`, {
        method: 'POST',
        headers: { 'X-CSRFToken': csrfToken }
    }).then(r => r.json()).then(data => {
        if (data.success) {
            showCustomAlert(`Слово дано пользователю`, "success");
            // Обновляем отображение видео
            updateVideoLayout();
        }
    });
}

// Отклонить поднятую руку
function rejectHandRaised(userId) {
    // Сначала опускаем руку пользователя
    fetch(`/livestream/lower_hand/${roomId}/${userId}/`, {
        method: 'POST',
        headers: { 'X-CSRFToken': csrfToken }
    }).then(r => r.json()).then(data => {
        if (data.success) {
            showCustomAlert(`Запрос отклонен`, "info");
        }
    });
}

// Проверка статуса пользователя каждые 2 секунды
setInterval(checkUserStatus, 2000);

document.addEventListener('DOMContentLoaded', async function () {
    const role = isHost ? 1 : 2;
    const response = await fetch(`/livestream/token/?channel=${channel}&uid=${uid}&role=${role}`);
    const data = await response.json();
    token = data.token;

    client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

    await client.join(appId, channel, token, uid);
    showCustomAlert("Вы присоединились к трансляции", "success");

    try {
        [localTracks.audioTrack, localTracks.videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();

        // Если пользователь не ведущий и не в режиме конференции, отключаем аудио по умолчанию
        if (!isHost && roomType === 'broadcast') {
            await localTracks.audioTrack.setMuted(true);
            localTrackState.audioTrackMuted = true;
        }

        // Публикуем локальные треки
        await client.publish([localTracks.audioTrack, localTracks.videoTrack]);

        // Обновляем кнопки управления
        updateMicCameraButtons();
        updateHandButton();

        // Обновляем расположение видео
        updateVideoLayout();
    } catch (error) {
        showCustomAlert("Не удалось получить доступ к камере или микрофону: " + error.message, "error");
    }

    // Обработчики кнопок управления
    document.getElementById('mic-btn').addEventListener('click', async function () {
        if (!canEnableMic) {
            showCustomAlert("Ведущий запретил включать микрофон", "error");
            return;
        }
        if (!localTracks.audioTrack) return;

        if (localTrackState.audioTrackMuted) {
            await localTracks.audioTrack.setMuted(false);
            localTrackState.audioTrackMuted = false;
            this.classList.remove('muted');
            document.getElementById('mic-btn-icon').src = '/static/img/mic-on.png';
            this.title = "Выключить микрофон";
        } else {
            await localTracks.audioTrack.setMuted(true);
            localTrackState.audioTrackMuted = true;
            this.classList.add('muted');
            document.getElementById('mic-btn-icon').src = '/static/img/mic-off.png';
            this.title = "Включить микрофон";
        }
    });

    document.getElementById('camera-btn').addEventListener('click', async function () {
        if (!canEnableCamera) {
            showCustomAlert("Ведущий запретил включать камеру", "error");
            return;
        }
        if (!localTracks.videoTrack) return;

        if (localTrackState.videoTrackMuted) {
            await localTracks.videoTrack.setMuted(false);
            localTrackState.videoTrackMuted = false;
            this.classList.remove('muted');
            document.getElementById('cam-btn-icon').src = '/static/img/cam-on.png';
            this.title = "Выключить камеру";
        } else {
            await localTracks.videoTrack.setMuted(true);
            localTrackState.videoTrackMuted = true;
            this.classList.add('muted');
            document.getElementById('cam-btn-icon').src = '/static/img/cam-off.png';
            this.title = "Включить камеру";
        }

        // Обновляем отображение видео
        updateVideoLayout();
    });

    document.getElementById('hand-btn').addEventListener('click', function () {
        fetch(`/livestream/raise_hand/${roomId}/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrfToken }
        }).then(r => r.json()).then(data => {
            if (data.success) {
                handRaised = true;
                updateHandButton();
                showCustomAlert("Вы подняли руку. Ожидайте решения ведущего.", "info");
                handDialogShown = false;
            }
        });
    });

    document.getElementById('lower-hand-btn').addEventListener('click', function () {
        fetch(`/livestream/lower_hand/${roomId}/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrfToken }
        }).then(r => r.json()).then(data => {
            if (data.success) {
                handRaised = false;
                updateHandButton();
                showCustomAlert("Вы опустили руку.", "info");
            }
        });
    });

    document.getElementById('return-word-btn').addEventListener('click', function () {
        fetch(`/livestream/grant/${roomId}/${uid}/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrfToken }
        }).then(r => r.json()).then(data => {
            if (data.success) {
                amISpeaker = false;
                updateReturnWordButton();
                showCustomAlert("Вы вернули слово ведущему", "success");

                // Обновляем отображение видео
                updateVideoLayout();
            }
        });
    });

    document.getElementById('leave-btn').addEventListener('click', async function () {
        if (confirm("Вы уверены, что хотите покинуть трансляцию?")) {
            for (const trackName in localTracks) {
                const track = localTracks[trackName];
                if (track) {
                    track.stop();
                    track.close();
                    localTracks[trackName] = null;
                }
            }
            await client.leave();
            window.location.href = "/livestream/";
        }
    });

    // Обработка событий Agora
    client.on('user-published', async (user, mediaType) => {
        await client.subscribe(user, mediaType);

        // Сохраняем информацию о пользователе
        if (!remoteUsers[user.uid]) {
            remoteUsers[user.uid] = {
                uid: user.uid,
                audioTrack: null,
                videoTrack: null,
                hasAudio: false,
                hasVideo: false
            };
        }

        // Обновляем треки и состояние
        if (mediaType === 'audio') {
            remoteUsers[user.uid].audioTrack = user.audioTrack;
            remoteUsers[user.uid].hasAudio = true;
            user.audioTrack.play();
        } else if (mediaType === 'video') {
            remoteUsers[user.uid].videoTrack = user.videoTrack;
            remoteUsers[user.uid].hasVideo = true;

            // Обновляем отображение видео
            updateVideoLayout();
        }
    });

    client.on('user-unpublished', (user, mediaType) => {
        // Обновляем треки и состояние
        if (mediaType === 'audio' && remoteUsers[user.uid]) {
            remoteUsers[user.uid].audioTrack = null;
            remoteUsers[user.uid].hasAudio = false;
        } else if (mediaType === 'video' && remoteUsers[user.uid]) {
            remoteUsers[user.uid].videoTrack = null;
            remoteUsers[user.uid].hasVideo = false;

            // Обновляем отображение видео
            updateVideoLayout();
        }
    });

    // Обработка запросов на вход и поднятых рук для ведущего
    if (isHost) {
        // Проверка ожидающих пользователей
        setInterval(function () {
            fetch(`/livestream/pending_requests/${roomId}/`)
                .then(r => r.json())
                .then(data => {
                    const dialog = document.getElementById('pending-dialog');
                    if (data.waiting && data.waiting.length) {
                        let html = '';
                        data.waiting.forEach(u => {
                            html += `<div class="pending-request">
                                <span>${u.name} просится в трансляцию или поднял руку</span>
                                <div class="pending-actions">
                                    <button onclick="approveUser(${u.id})" class="btn-approve">Принять</button>
                                    <button onclick="rejectUser(${u.id})" class="btn-reject">Отклонить</button>
                                </div>
                            </div>`;
                        });
                        dialog.innerHTML = html;
                        dialog.style.display = 'block';

                        // Показываем отдельный диалог для первого ожидающего пользователя
                        if (!handDialogShown && data.waiting.length > 0) {
                            showUserKickedDialog(data.waiting[0].id, data.waiting[0].name);
                            handDialogShown = true;
                        }
                    } else {
                        dialog.innerHTML = '';
                        dialog.style.display = 'none';
                        handDialogShown = false;
                    }
                });
        }, 2000);

        // Проверка поднятых рук
        setInterval(function () {
            fetch(`/livestream/users/${roomId}/`)
                .then(r => r.json())
                .then(data => {
                    const users = data.users;
                    // Находим пользователей с поднятой рукой
                    const usersWithRaisedHand = users.filter(u => u.hand_raised && !u.is_host && !u.is_speaker);

                    if (usersWithRaisedHand.length > 0 && document.getElementById('hand-raised-dialog').style.display !== 'block') {
                        // Показываем диалог для первого пользователя с поднятой рукой
                        const user = usersWithRaisedHand[0];
                        showHandRaisedDialog(user.id, user.name);
                    }
                });
        }, 3000);
    }

    // Глобальные функции для управления пользователями
    window.approveUser = function (id) {
        fetch(`/livestream/approve/${roomId}/${id}/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrfToken }
        }).then(r => r.json()).then(data => {
            if (data.success) {
                showCustomAlert("Пользователь одобрен", "success");
                document.getElementById('user-kicked-dialog').style.display = 'none';
            }
        });
    };

    window.rejectUser = function (id) {
        fetch(`/livestream/kick/${roomId}/${id}/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrfToken }
        }).then(r => r.json()).then(data => {
            if (data.success) {
                showCustomAlert("Пользователь отклонён", "warning");
                document.getElementById('user-kicked-dialog').style.display = 'none';
            }
        });
    };

    // Функции для управления чатом
    function loadChat() {
        fetch(`/livestream/chat/${roomId}/`)
            .then(r => r.json())
            .then(data => {
                const chat = document.getElementById('chat-messages');
                chat.innerHTML = '';
                data.messages.forEach(msg => {
                    const div = document.createElement('div');
                    div.className = 'chat-message';
                    div.innerHTML = `<b>${msg.user}:</b> ${msg.text} <span class="chat-time">${msg.created}</span>`;
                    chat.appendChild(div);
                });
                chat.scrollTop = chat.scrollHeight;
            });
    }

    document.getElementById('chat-form').onsubmit = function (e) {
        e.preventDefault();
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text) return;
        const button = this.querySelector('button');
        button.disabled = true;
        button.textContent = 'Отправка...';
        fetch(`/livestream/chat/${roomId}/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrfToken },
            body: new URLSearchParams({ text })
        })
            .then(r => r.json())
            .then(msg => {
                input.value = '';
                loadChat();
                button.disabled = false;
                button.textContent = 'Отправить';
            })
            .catch(() => {
                button.disabled = false;
                button.textContent = 'Отправить';
            });
    };
    setInterval(loadChat, 3000);
    loadChat();

    // Функции для управления списком пользователей
    function loadUsers() {
        fetch(`/livestream/users/${roomId}/`)
            .then(r => r.json())
            .then(data => {
                let users = data.users;
                let waiting = data.waiting;
                let searchVal = document.getElementById('invite-search').value.trim().toLowerCase();
                let filtered = users.filter(u => u.name.toLowerCase().includes(searchVal));
                renderUsers(filtered, waiting);
            });
    }
    setInterval(loadUsers, 2000);
    loadUsers();

    function renderUsers(users, waiting) {
        const usersList = document.getElementById('users-list');
        usersList.innerHTML = '';
        users.forEach(user => {
            const row = document.createElement('div');
            row.className = 'user-row';

            // Имя пользователя
            const nameSpan = document.createElement('span');
            nameSpan.className = 'user-name-row';
            nameSpan.textContent = user.name;
            if (user.is_host) {
                nameSpan.textContent += ' (Ведущий)';
            }
            if (user.is_speaker && !user.is_host) {
                nameSpan.textContent += ' (Говорит)';
            }
            row.appendChild(nameSpan);

            // Кнопки управления (только для ведущего)
            if (isHost && user.id !== uid) {
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'user-actions';

                // Кнопка микрофона
                const micBtn = document.createElement('button');
                micBtn.className = 'action-btn';
                micBtn.title = user.can_enable_mic ?
                    (user.is_muted ? "Включить микрофон" : "Выключить микрофон") :
                    "Разрешить микрофон";

                const micImg = document.createElement('img');
                micImg.className = 'icon-btn';
                micImg.src = user.can_enable_mic ?
                    (user.is_muted ? "/static/img/mic-off.png" : "/static/img/mic-on.png") :
                    "/static/img/mic-block.png";
                micBtn.appendChild(micImg);

                micBtn.onclick = function () {
                    if (user.can_enable_mic) {
                        // Если микрофон разрешен, переключаем состояние
                        fetch(`/livestream/mute/${roomId}/${user.id}/`, {
                            method: 'POST',
                            headers: { 'X-CSRFToken': csrfToken }
                        }).then(r => r.json()).then(data => {
                            if (data.success) {
                                showCustomAlert(user.is_muted ?
                                    `Микрофон пользователя ${user.name} включен` :
                                    `Микрофон пользователя ${user.name} выключен`, "info");
                                loadUsers();
                                // Обновляем отображение видео
                                updateVideoLayout();
                            }
                        });
                    } else {
                        // Если микрофон запрещен, разрешаем его
                        fetch(`/livestream/toggle_permission/${roomId}/${user.id}/mic/`, {
                            method: 'POST',
                            headers: { 'X-CSRFToken': csrfToken }
                        }).then(r => r.json()).then(data => {
                            if (data.success) {
                                showCustomAlert(`Микрофон пользователя ${user.name} разрешен`, "info");
                                loadUsers();
                                // Обновляем отображение видео
                                updateVideoLayout();
                            }
                        });
                    }
                };
                actionsDiv.appendChild(micBtn);

                // Кнопка камеры
                const camBtn = document.createElement('button');
                camBtn.className = 'action-btn';
                camBtn.title = user.can_enable_camera ?
                    (user.has_video ? "Выключить камеру" : "Включить камеру") :
                    "Разрешить камеру";

                const camImg = document.createElement('img');
                camImg.className = 'icon-btn';
                camImg.src = user.can_enable_camera ?
                    (user.has_video ? "/static/img/cam-on.png" : "/static/img/cam-off.png") :
                    "/static/img/cam-block.png";
                camBtn.appendChild(camImg);

                camBtn.onclick = function () {
                    fetch(`/livestream/toggle_permission/${roomId}/${user.id}/camera/`, {
                        method: 'POST',
                        headers: { 'X-CSRFToken': csrfToken }
                    }).then(r => r.json()).then(data => {
                        if (data.success) {
                            showCustomAlert(user.can_enable_camera ?
                                `Камера пользователя ${user.name} запрещена` :
                                `Камера пользователя ${user.name} разрешена`, "info");
                            loadUsers();
                            // Обновляем отображение видео
                            updateVideoLayout();
                        }
                    });
                };
                actionsDiv.appendChild(camBtn);

                // Кнопка дать/забрать слово
                if (roomType === 'broadcast') {
                    const speakBtn = document.createElement('button');
                    speakBtn.className = 'action-btn';
                    speakBtn.title = user.is_speaker ? "Забрать слово" : "Дать слово";

                    const speakImg = document.createElement('img');
                    speakImg.className = 'icon-btn';
                    speakImg.src = user.is_speaker ? "/static/img/return.png" : "/static/img/speak.png";
                    speakBtn.appendChild(speakImg);

                    speakBtn.onclick = function () {
                        fetch(`/livestream/grant/${roomId}/${user.id}/`, {
                            method: 'POST',
                            headers: { 'X-CSRFToken': csrfToken }
                        }).then(r => r.json()).then(data => {
                            if (data.success) {
                                showCustomAlert(user.is_speaker ?
                                    `Слово у пользователя ${user.name} забрано` :
                                    `Слово дано пользователю ${user.name}`, "info");
                                loadUsers();
                                // Обновляем отображение видео
                                updateVideoLayout();
                            }
                        });
                    };
                    actionsDiv.appendChild(speakBtn);
                }

                // Кнопка исключения
                const kickBtn = document.createElement('button');
                kickBtn.className = 'action-btn';
                kickBtn.title = "Исключить пользователя";

                const kickImg = document.createElement('img');
                kickImg.className = 'icon-btn';
                kickImg.src = "/static/img/exit.png";
                kickBtn.appendChild(kickImg);

                kickBtn.onclick = function () {
                    if (confirm(`Вы уверены, что хотите исключить пользователя ${user.name}?`)) {
                        fetch(`/livestream/kick/${roomId}/${user.id}/`, {
                            method: 'POST',
                            headers: { 'X-CSRFToken': csrfToken }
                        }).then(r => r.json()).then(data => {
                            if (data.success) {
                                showCustomAlert(`Пользователь ${user.name} исключён`, "success");
                                loadUsers();
                                // Обновляем отображение видео
                                updateVideoLayout();
                            }
                        });
                    }
                };
                actionsDiv.appendChild(kickBtn);

                row.appendChild(actionsDiv);
            }

            // Индикаторы состояния
            const statusDiv = document.createElement('div');
            statusDiv.className = 'user-status';

            // Индикатор поднятой руки
            if (user.hand_raised) {
                const handIcon = document.createElement('img');
                handIcon.src = "/static/img/hand.png";
                handIcon.className = 'status-icon';
                handIcon.title = "Поднял руку";
                statusDiv.appendChild(handIcon);
            }

            // Индикатор говорящего
            if (user.is_speaker) {
                const speakIcon = document.createElement('img');
                speakIcon.src = "/static/img/speak.png";
                speakIcon.className = 'status-icon';
                speakIcon.title = "Говорит";
                statusDiv.appendChild(speakIcon);
            }

            // Индикатор ведущего
            if (user.is_host) {
                const hostIcon = document.createElement('img');
                hostIcon.src = "/static/img/crown.png";
                hostIcon.className = 'status-icon';
                hostIcon.title = "Ведущий";
                statusDiv.appendChild(hostIcon);
            }

            row.appendChild(statusDiv);
            usersList.appendChild(row);
        });

        // Добавляем ожидающих пользователей
        if (isHost && waiting && waiting.length) {
            waiting.forEach(u => {
                const waitingRow = document.createElement('div');
                waitingRow.className = 'user-row waiting';
                waitingRow.innerHTML = `
                    <span class="waiting-user">${u.name} просится в трансляцию</span>
                    <div class="user-actions">
                        <button onclick="approveUser(${u.id})" class="btn-approve">Одобрить</button>
                        <button onclick="rejectUser(${u.id})" class="btn-reject">Отклонить</button>
                    </div>
                `;
                usersList.appendChild(waitingRow);
            });
        }
    }

    document.getElementById('invite-search').addEventListener('input', function () {
        loadUsers();
    });

    // Обработчик для кнопки завершения трансляции
    const endBtn = document.getElementById('end-btn');
    if (endBtn) {
        endBtn.addEventListener('click', function (e) {
            if (!confirm("Вы уверены, что хотите завершить трансляцию для всех участников?")) {
                e.preventDefault();
            }
        });
    }

    // Обработчик для закрытия диалогов
    document.addEventListener('click', function (e) {
        const handRaisedDialog = document.getElementById('hand-raised-dialog');
        const userKickedDialog = document.getElementById('user-kicked-dialog');

        // Закрываем диалог с поднятой рукой
        if (handRaisedDialog && handRaisedDialog.style.display === 'block') {
            // Проверяем, что клик был не на диалоге и не на его дочерних элементах
            if (!handRaisedDialog.contains(e.target)) {
                handRaisedDialog.style.display = 'none';
            }
        }

        // Закрываем диалог с запросом на вход
        if (userKickedDialog && userKickedDialog.style.display === 'block') {
            // Проверяем, что клик был не на диалоге и не на его дочерних элементах
            if (!userKickedDialog.contains(e.target)) {
                userKickedDialog.style.display = 'none';
            }
        }
    });

    // Обработчик для клавиши Escape - закрывает диалоги
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            const handRaisedDialog = document.getElementById('hand-raised-dialog');
            const userKickedDialog = document.getElementById('user-kicked-dialog');

            if (handRaisedDialog && handRaisedDialog.style.display === 'block') {
                handRaisedDialog.style.display = 'none';
            }

            if (userKickedDialog && userKickedDialog.style.display === 'block') {
                userKickedDialog.style.display = 'none';
            }
        }
    });
});