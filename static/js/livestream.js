const appId = window.livestreamAppId;
const channel = window.livestreamChannel;
const uid = parseInt(window.livestreamUserId);
const userName = window.livestreamUserName;
const isHost = window.livestreamIsHost;
const roomType = window.livestreamRoomType;
const roomId = window.livestreamRoomId;
const csrfToken = window.livestreamCsrfToken;

let token = "";
let localTracks = { audioTrack: null, videoTrack: null };
let localTrackState = { audioTrackMuted: false, videoTrackMuted: false };
let remoteUsers = {};
let currentSpeakerId = null;
let client = null;
let allUsers = [];
let amISpeaker = false;
let canEnableMic = true;
let canEnableCamera = true;
let canControlMicCamera = true;
let handRaised = false;

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
    if (!canControlMicCamera || !canEnableMic) {
        micBtn.disabled = true;
        micBtn.classList.add('muted');
        micBtn.title = !canControlMicCamera ? "Вам не дали слово" : "Ведущий запретил включать микрофон";
    } else {
        micBtn.disabled = false;
        micBtn.classList.remove('muted');
        micBtn.title = "Включить/выключить микрофон";
    }
    if (!canEnableCamera) {
        cameraBtn.disabled = true;
        cameraBtn.classList.add('muted');
        cameraBtn.title = "Ведущий запретил включать камеру";
    } else {
        cameraBtn.disabled = false;
        cameraBtn.classList.remove('muted');
        cameraBtn.title = "Включить/выключить камеру";
    }
}

function updateHandButton() {
    const handBtn = document.getElementById('hand-btn');
    if (roomType === 'broadcast' && !isHost && !amISpeaker) {
        handBtn.style.display = 'inline-block';
        handBtn.innerHTML = handRaised ? '<i class="hand-icon">✋</i> Опустить руку' : '<i class="hand-icon">✋</i> Поднять руку';
    } else {
        handBtn.style.display = 'none';
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

function checkUserStatus() {
    fetch(`/livestream/check_status/${roomId}/?t=${Date.now()}`)
        .then(response => response.json())
        .then(data => {
            canEnableMic = data.can_enable_mic;
            canEnableCamera = data.can_enable_camera;
            canControlMicCamera = isHost ? true : data.can_control_mic;
            handRaised = data.hand_raised;
            amISpeaker = data.is_speaker;
            updateMicCameraButtons();
            updateHandButton();
            updateReturnWordButton();
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
setInterval(checkUserStatus, 2000);

function showVideo(uid, label, isSpeaker) {
    let container = document.getElementById(`user-${uid}`);
    let displayName = label;
    if (uid === parseInt(window.livestreamHostId)) {
        displayName = window.livestreamHostName + " (Ведущий)";
    } else if (uid === parseInt(uid)) {
        displayName = userName + " (Вы)";
    }
    if (!container) {
        container = document.createElement('div');
        container.id = `user-${uid}`;
        container.className = 'video-player';
        if (isSpeaker) container.classList.add('speaking');
        container.innerHTML = `
            <div class="user-name">
                ${displayName}
                <div class="user-icons" id="icons-${uid}"></div>
            </div>
            <div id="video-box-${uid}" class="video-box"></div>
        `;
        document.getElementById('agora-video').append(container);
    } else if (isSpeaker) {
        container.classList.add('speaking');
    } else {
        container.classList.remove('speaking');
    }
}

function updateUserIcons(uid, isMuted, hasVideo) {
    const iconsContainer = document.getElementById(`icons-${uid}`);
    if (iconsContainer) {
        let html = '';
        html += isMuted ? '<span class="icon-mic-off" title="Микрофон выключен">🔇</span>' : '<span class="icon-mic-on" title="Микрофон включён">🎤</span>';
        html += hasVideo ? '<span class="icon-cam-on" title="Камера включена">📹</span>' : '<span class="icon-cam-off" title="Камера выключена">🚫</span>';
        iconsContainer.innerHTML = html;
    }
}

function removeVideo(uid) {
    const container = document.getElementById(`user-${uid}`);
    if (container) container.remove();
    if (currentSpeakerId === uid) {
        document.getElementById('speaker-status').innerHTML = '';
        currentSpeakerId = null;
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    const role = isHost ? 1 : 2;
    const response = await fetch(`/livestream/token/?channel=${channel}&uid=${uid}&role=${role}`);
    const data = await response.json();
    token = data.token;

    client = AgoraRTC.createClient({ mode: roomType === 'broadcast' ? 'live' : 'rtc', codec: 'vp8' });

    if (roomType === 'broadcast') {
        client.setClientRole(isHost ? 'host' : 'audience');
    }

    await client.join(appId, channel, token, uid);
    showCustomAlert("Вы присоединились к трансляции", "success");

    if (isHost || roomType === 'conference') {
        try {
            [localTracks.audioTrack, localTracks.videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
            showVideo(uid, userName + " (Вы)", isHost);
            localTracks.videoTrack.play(`video-box-${uid}`);
            updateUserIcons(uid, localTrackState.audioTrackMuted, !localTrackState.videoTrackMuted);
            await client.publish([localTracks.audioTrack, localTracks.videoTrack]);
        } catch (error) {
            showCustomAlert("Не удалось получить доступ к камере или микрофону.", "error");
        }
    } else {
        document.getElementById('mic-btn').style.display = 'inline-block';
        document.getElementById('camera-btn').style.display = 'inline-block';
        showVideo(uid, userName + " (Вы)", false);
    }

    document.getElementById('mic-btn').addEventListener('click', async function() {
        if (!canControlMicCamera) {
            showCustomAlert("Вам не дали слово!", "warning");
            return;
        }
        if (!canEnableMic) {
            showCustomAlert("Ведущий запретил включать микрофон", "error");
            return;
        }
        if (!localTracks.audioTrack) return;
        if (localTrackState.audioTrackMuted) {
            await localTracks.audioTrack.setMuted(false);
            localTrackState.audioTrackMuted = false;
            this.classList.remove('muted');
            this.querySelector('.mic-icon').textContent = '🎤';
        } else {
            await localTracks.audioTrack.setMuted(true);
            localTrackState.audioTrackMuted = true;
            this.classList.add('muted');
            this.querySelector('.mic-icon').textContent = '🔇';
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
            this.querySelector('.camera-icon').textContent = '📹';
        } else {
            await localTracks.videoTrack.setMuted(true);
            localTrackState.videoTrackMuted = true;
            this.classList.add('muted');
            this.querySelector('.camera-icon').textContent = '🚫';
        }
    });

    document.getElementById('hand-btn').addEventListener('click', function() {
        if (!handRaised) {
            fetch(`/livestream/raise_hand/${roomId}/`, {
                method: 'POST',
                headers: {'X-CSRFToken': csrfToken}
            }).then(r => r.json()).then(data => {
                if (data.success) {
                    handRaised = true;
                    updateHandButton();
                    showCustomAlert("Вы подняли руку. Ожидайте решения ведущего.", "info");
                }
            });
        } else {
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
        }
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
            }
        });
    });

    document.getElementById('leave-btn').addEventListener('click', async function() {
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
    });

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
                                <span>${u.name} просится в трансляцию</span>
                                <button onclick="approveUser(${u.id})" class="btn-approve">Принять</button>
                                <button onclick="rejectUser(${u.id})" class="btn-reject">Отклонить</button>
                            </div>`;
                        });
                        dialog.innerHTML = html;
                        dialog.style.display = 'block';
                        showCustomAlert("Новая заявка на вход!", "info");
                    } else {
                        dialog.innerHTML = '';
                        dialog.style.display = 'none';
                    }
                });
        }, 2000);
    }

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

    function loadUsers() {
        fetch(`/livestream/users/${roomId}/`)
            .then(r => r.json())
            .then(data => {
                allUsers = data.users;
                for (let user of allUsers) {
                    if (user.id === uid) {
                        amISpeaker = user.is_speaker;
                        canEnableMic = user.can_enable_mic;
                        canEnableCamera = user.can_enable_camera;
                        handRaised = user.hand_raised;
                        break;
                    }
                }
                updateReturnWordButton();
                updateMicCameraButtons();
                updateHandButton();
                renderUsers(data.users, data.waiting);
            });
    }
    setInterval(loadUsers, 2000);
    loadUsers();

    function renderUsers(users, waiting) {
        const usersList = document.getElementById('users-list');
        usersList.innerHTML = '';
        users.forEach(user => {
            let icons = '';
            icons += user.can_enable_mic ? '<span class="icon-mic-on" title="Микрофон разрешён">🎤</span>' : '<span class="icon-mic-off" title="Микрофон запрещён">🔇</span>';
            icons += user.can_enable_camera ? '<span class="icon-cam-on" title="Камера разрешена">📹</span>' : '<span class="icon-cam-off" title="Камера запрещена">🚫</span>';
            if (user.is_host) icons += '<span class="icon-host" title="Ведущий">👑</span>';
            if (user.is_speaker) icons += '<span class="icon-speaker" title="Говорит">🎙️</span>';
            if (user.hand_raised) icons += '<span class="icon-hand" title="Поднял руку">✋</span>';

            let menu = '';
            if (isHost && user.id !== uid) {
                menu = `
                <div class="user-actions-dropdown">
                    <button class="btn btn-sm burger-btn" onclick="toggleDropdown(this)">⋮</button>
                    <div class="user-actions-dropdown-content">
                        ${roomType === 'broadcast' ? `<button onclick="grantUser(${user.id})">${user.is_speaker ? 'Забрать слово' : 'Дать слово'}</button>` : ''}
                        <button onclick="muteUser(${user.id})">${user.is_muted ? 'Включить микрофон' : 'Выключить микрофон'}</button>
                        <button onclick="togglePermission(${user.id}, 'mic')">${user.can_enable_mic ? 'Запретить микрофон' : 'Разрешить микрофон'}</button>
                        <button onclick="togglePermission(${user.id}, 'camera')">${user.can_enable_camera ? 'Запретить камеру' : 'Разрешить камеру'}</button>
                        <button onclick="kickUser(${user.id})">Исключить</button>
                    </div>
                </div>
                `;
            }

            const row = document.createElement('div');
            row.className = 'user-row';
            row.innerHTML = `
                <span class="user-name-row">${user.name} ${icons}</span>
                ${menu}
            `;
            usersList.appendChild(row);
        });
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

    window.kickUser = function(id) {
        fetch(`/livestream/kick/${roomId}/${id}/`, {
            method: 'POST',
            headers: {'X-CSRFToken': csrfToken}
        }).then(r => r.json()).then(data => {
            if (data.success) {
                showCustomAlert("Пользователь исключён", "success");
                loadUsers();
            }
        });
    };
    window.muteUser = function(id) {
        fetch(`/livestream/mute/${roomId}/${id}/`, {
            method: 'POST',
            headers: {'X-CSRFToken': csrfToken}
        }).then(r => r.json()).then(data => {
            if (data.success) {
                showCustomAlert("Статус микрофона изменён", "success");
                loadUsers();
            }
        });
    };
    window.grantUser = function(id) {
        fetch(`/livestream/grant/${roomId}/${id}/`, {
            method: 'POST',
            headers: {'X-CSRFToken': csrfToken}
        }).then(r => r.json()).then(data => {
            if (data.success) {
                showCustomAlert("Статус спикера изменён", "success");
                loadUsers();
            }
        });
    };
    window.togglePermission = function(id, device) {
        fetch(`/livestream/toggle_permission/${roomId}/${id}/${device}/`, {
            method: 'POST',
            headers: {'X-CSRFToken': csrfToken}
        }).then(r => r.json()).then(data => {
            if (data.success) {
                showCustomAlert(`Права на ${device === 'mic' ? 'микрофон' : 'камеру'} изменены`, "success");
                loadUsers();
            }
        });
    };
    window.toggleDropdown = function(btn) {
        document.querySelectorAll('.user-actions-dropdown').forEach(el => el.classList.remove('open'));
        btn.parentNode.classList.toggle('open');
        event.stopPropagation();
    };
    document.addEventListener('click', function() {
        document.querySelectorAll('.user-actions-dropdown').forEach(el => el.classList.remove('open'));
    });
});