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

function showCustomAlert(msg, type = 'info') {
    let alertDiv = document.getElementById('custom-alert');
    alertDiv.innerHTML = msg;
    alertDiv.className = 'custom-alert ' + type;
    alertDiv.style.display = 'block';
    setTimeout(() => { alertDiv.style.display = 'none'; }, 3500);
}

function updateMicCameraButtons() {
    const micBtn = document.getElementById('mic-btn');
    const cameraBtn = document.getElementById('camera-btn');
    
    // Микрофон
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
    
    // Камера
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

function updateHandButton() {
    const handBtn = document.getElementById('hand-btn');
    const lowerHandBtn = document.getElementById('lower-hand-btn');
    if (roomType === 'broadcast' && !isHost && !amISpeaker) {
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
}

function updateReturnWordButton() {
    const returnWordBtn = document.getElementById('return-word-btn');
    if (!returnWordBtn) return;
    if (amISpeaker && !isHost) {
        returnWordBtn.style.display = 'block';
    } else {
        returnWordBtn.style.display = 'none';
    }
}

function updateSpeakerStatus(name) {
    const statusBar = document.getElementById('speaker-status');
    if (name) {
        statusBar.innerHTML = `<b>Сейчас говорит:</b> ${name}`;
    } else {
        statusBar.innerHTML = '';
    }
}

function checkUserStatus() {
    fetch(`/livestream/check_status/${roomId}/?t=${Date.now()}`)
        .then(response => response.json())
        .then(data => {
            canEnableMic = data.can_enable_mic;
            canEnableCamera = data.can_enable_camera;
            handRaised = data.hand_raised;
            amISpeaker = data.is_speaker;
            
            updateMicCameraButtons();
            updateHandButton();
            updateReturnWordButton();
            
            // Обновляем отображение видео в зависимости от статуса
            updateVideoLayout();
            
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

// Обновление расположения видео в зависимости от текущего статуса
function updateVideoLayout() {
    // Получаем информацию о пользователях
    fetch(`/livestream/users/${roomId}/`)
        .then(r => r.json())
        .then(data => {
            const users = data.users;
            
            // Находим ведущего и говорящего
            const hostUser = users.find(u => u.is_host);
            const speakerUser = users.find(u => u.is_speaker && !u.is_host);
            
            // Очищаем контейнеры
            const mainContainer = document.getElementById('main-video-container');
            const miniContainer = document.getElementById('mini-video-container');
            
            if (!mainContainer || !miniContainer) return;
            
            mainContainer.innerHTML = '';
            miniContainer.innerHTML = '';
            
            // Определяем, кто должен быть на главном экране
            let mainUser = null;
            let miniUser = null;
            
            if (speakerUser) {
                // Если есть говорящий (не ведущий), он на главном экране
                mainUser = speakerUser;
                miniUser = hostUser;
            } else {
                // Иначе ведущий на главном экране
                mainUser = hostUser;
                miniUser = null;
            }
            
            // Отображаем главное видео
            if (mainUser) {
                const isMainUserMe = mainUser.id === uid;
                
                // Создаем элемент для главного видео
                const mainVideoEl = document.createElement('div');
                mainVideoEl.className = 'video-card main-video';
                mainVideoEl.id = `main-video-${mainUser.id}`;
                
                // Определяем имя для отображения
                let displayName = mainUser.name;
                if (mainUser.is_host) {
                    displayName += " (Ведущий)";
                }
                if (mainUser.is_speaker && !mainUser.is_host) {
                    displayName += " (Говорит)";
                }
                
                // Создаем HTML для видео
                mainVideoEl.innerHTML = `
                    <div class="video-box" id="main-video-box-${mainUser.id}"></div>
                    <div class="video-info">
                        <div class="video-name">${displayName}</div>
                        <div class="video-icons" id="main-video-icons-${mainUser.id}"></div>
                    </div>
                `;
                
                // Добавляем в контейнер
                mainContainer.appendChild(mainVideoEl);
                
                // Воспроизводим видео
                if (isMainUserMe) {
                    // Если это я, использую локальный трек
                    if (localTracks.videoTrack && !localTrackState.videoTrackMuted) {
                        localTracks.videoTrack.play(`main-video-box-${mainUser.id}`);
                    }
                } else {
                    // Если это удаленный пользователь
                    if (remoteUsers[mainUser.id] && remoteUsers[mainUser.id].videoTrack) {
                        remoteUsers[mainUser.id].videoTrack.play(`main-video-box-${mainUser.id}`);
                    }
                }
                
                // Обновляем иконки статуса
                updateVideoIcons(mainUser.id, 'main');
                
                // Обновляем статус говорящего
                updateSpeakerStatus(displayName);
                currentSpeakerUid = mainUser.id;
            }
            
            // Отображаем мини-видео (если есть)
            if (miniUser) {
                const isMiniUserMe = miniUser.id === uid;
                
                // Создаем элемент для мини-видео
                const miniVideoEl = document.createElement('div');
                miniVideoEl.className = 'video-card mini-video';
                miniVideoEl.id = `mini-video-${miniUser.id}`;
                
                // Определяем имя для отображения
                let displayName = miniUser.name;
                if (miniUser.is_host) {
                    displayName += " (Ведущий)";
                }
                
                // Создаем HTML для видео
                miniVideoEl.innerHTML = `
                    <div class="video-box" id="mini-video-box-${miniUser.id}"></div>
                    <div class="video-info">
                        <div class="video-name">${displayName}</div>
                        <div class="video-icons" id="mini-video-icons-${miniUser.id}"></div>
                    </div>
                `;
                
                // Добавляем в контейнер
                miniContainer.appendChild(miniVideoEl);
                
                // Воспроизводим видео
                if (isMiniUserMe) {
                    // Если это я, использую локальный трек
                    if (localTracks.videoTrack && !localTrackState.videoTrackMuted) {
                        localTracks.videoTrack.play(`mini-video-box-${miniUser.id}`);
                    }
                } else {
                    // Если это удаленный пользователь
                    if (remoteUsers[miniUser.id] && remoteUsers[miniUser.id].videoTrack) {
                        remoteUsers[miniUser.id].videoTrack.play(`mini-video-box-${miniUser.id}`);
                    }
                }
                
                // Обновляем иконки статуса
                updateVideoIcons(miniUser.id, 'mini');
                
                // Делаем мини-видео перетаскиваемым
                makeDraggable(miniVideoEl);
            }
        });
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

// Функция для перетаскивания мини-видео
function makeDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    element.onmousedown = dragMouseDown;
    
    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        // Получаем начальную позицию курсора
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        // Вызываем функцию при движении курсора
        document.onmousemove = elementDrag;
    }
    
    function elementDrag(e) {
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
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

// Проверка статуса пользователя каждые 2 секунды
setInterval(checkUserStatus, 2000);

document.addEventListener('DOMContentLoaded', async function() {
    const role = isHost ? 1 : 2;
    const response = await fetch(`/livestream/token/?channel=${channel}&uid=${uid}&role=${role}`);
    const data = await response.json();
    token = data.token;

    client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

    await client.join(appId, channel, token, uid);
    showCustomAlert("Вы присоединились к трансляции", "success");

    // Создаем контейнеры для видео
    const videoArea = document.getElementById('agora-video');
    videoArea.innerHTML = `
        <div id="main-video-container" class="main-video-container"></div>
        <div id="mini-video-container" class="mini-video-container"></div>
    `;

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
        
        // Обновляем расположение видео
        updateVideoLayout();
    } catch (error) {
        showCustomAlert("Не удалось получить доступ к камере или микрофону: " + error.message, "error");
    }

    // Обработчики кнопок управления
    document.getElementById('mic-btn').addEventListener('click', async function() {
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

    document.getElementById('camera-btn').addEventListener('click', async function() {
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

    document.getElementById('hand-btn').addEventListener('click', function() {
        fetch(`/livestream/raise_hand/${roomId}/`, {
            method: 'POST',
            headers: {'X-CSRFToken': csrfToken}
        }).then(r => r.json()).then(data => {
            if (data.success) {
                handRaised = true;
                updateHandButton();
                showCustomAlert("Вы подняли руку. Ожидайте решения ведущего.", "info");
                handDialogShown = false;
            }
        });
    });

    document.getElementById('lower-hand-btn').addEventListener('click', function() {
        fetch(`/livestream/lower_hand/${roomId}/`, {
            method: 'POST',
            headers: {'X-CSRFToken': csrfToken}
        }).then(r => r.json()).then(data => {
            if (data.success) {
                handRaised = false;
                updateHandButton();
                showCustomAlert("Вы опустили руку.", "info");
            }
        });
    });

    document.getElementById('return-word-btn').addEventListener('click', function() {
        fetch(`/livestream/grant/${roomId}/${uid}/`, {
            method: 'POST',
            headers: {'X-CSRFToken': csrfToken}
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

    document.getElementById('leave-btn').addEventListener('click', async function() {
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

    // Обработка запросов на вход для ведущего
    if (isHost) {
        setInterval(function() {
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
                        if (!handDialogShown) {
                            showCustomAlert("Пользователь просится в трансляцию или поднял руку!", "info");
                            handDialogShown = true;
                        }
                    } else {
                        dialog.innerHTML = '';
                        dialog.style.display = 'none';
                        handDialogShown = false;
                    }
                });
        }, 2000);
    }

    // Глобальные функции для управления пользователями
    window.approveUser = function(id) {
        fetch(`/livestream/approve/${roomId}/${id}/`, {
            method: 'POST',
            headers: {'X-CSRFToken': csrfToken}
        }).then(r => r.json()).then(data => {
            if (data.success) {
                showCustomAlert("Пользователь одобрен", "success");
            }
        });
    };
    
    window.rejectUser = function(id) {
        fetch(`/livestream/kick/${roomId}/${id}/`, {
            method: 'POST',
            headers: {'X-CSRFToken': csrfToken}
        }).then(r => r.json()).then(data => {
            if (data.success) {
                showCustomAlert("Пользователь отклонён", "warning");
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
    
    document.getElementById('chat-form').onsubmit = function(e) {
        e.preventDefault();
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text) return;
        const button = this.querySelector('button');
        button.disabled = true;
        button.textContent = 'Отправка...';
        fetch(`/livestream/chat/${roomId}/`, {
            method: 'POST',
            headers: {'X-CSRFToken': csrfToken},
            body: new URLSearchParams({text})
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
                
                                micBtn.onclick = function() {
                    if (user.can_enable_mic) {
                        // Если микрофон разрешен, переключаем состояние
                        fetch(`/livestream/mute/${roomId}/${user.id}/`, {
                            method: 'POST',
                            headers: {'X-CSRFToken': csrfToken}
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
                            headers: {'X-CSRFToken': csrfToken}
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
                
                camBtn.onclick = function() {
                    fetch(`/livestream/toggle_permission/${roomId}/${user.id}/camera/`, {
                        method: 'POST',
                        headers: {'X-CSRFToken': csrfToken}
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
                    
                    speakBtn.onclick = function() {
                        fetch(`/livestream/grant/${roomId}/${user.id}/`, {
                            method: 'POST',
                            headers: {'X-CSRFToken': csrfToken}
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
                
                kickBtn.onclick = function() {
                    if (confirm(`Вы уверены, что хотите исключить пользователя ${user.name}?`)) {
                        fetch(`/livestream/kick/${roomId}/${user.id}/`, {
                            method: 'POST',
                            headers: {'X-CSRFToken': csrfToken}
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

    document.getElementById('invite-search').addEventListener('input', function() {
        loadUsers();
    });
    
    // Обработчик для кнопки завершения трансляции
    const endBtn = document.getElementById('end-btn');
    if (endBtn) {
        endBtn.addEventListener('click', function(e) {
            if (!confirm("Вы уверены, что хотите завершить трансляцию для всех участников?")) {
                e.preventDefault();
            }
        });
    }
});