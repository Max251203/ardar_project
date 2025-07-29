const appId = window.livestreamAppId;
const channel = window.livestreamChannel;
const uid = window.livestreamUid;
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
let handRaised = false;
let statusCheckInterval = null;

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
    if (!canEnableMic) {
        micBtn.disabled = true;
        micBtn.classList.add('muted');
        micBtn.title = "Ведущий запретил включать микрофон";
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

function checkUserStatus() {
    fetch(`/livestream/check_status/${roomId}/?t=${Date.now()}`)
        .then(response => response.json())
        .then(data => {
            canEnableMic = data.can_enable_mic;
            canEnableCamera = data.can_enable_camera;
            handRaised = data.hand_raised;
            updateMicCameraButtons();
            updateHandButton();
            if (data.is_kicked) {
                localStorage.setItem('kicked_from_room', '1');
                window.location.href = "/livestream/";
            }
            if (data.room_ended) {
                localStorage.setItem('stream_ended', '1');
                window.location.href = "/livestream/";
            }
        });
}
statusCheckInterval = setInterval(checkUserStatus, 3000);

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
            updateUserIcons(uid, false, !localTrackState.videoTrackMuted);
        } else {
            await localTracks.audioTrack.setMuted(true);
            localTrackState.audioTrackMuted = true;
            this.classList.add('muted');
            this.querySelector('.mic-icon').textContent = '🔇';
            updateUserIcons(uid, true, !localTrackState.videoTrackMuted);
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
            updateUserIcons(uid, localTrackState.audioTrackMuted, true);
        } else {
            await localTracks.videoTrack.setMuted(true);
            localTrackState.videoTrackMuted = true;
            this.classList.add('muted');
            this.querySelector('.camera-icon').textContent = '🚫';
            updateUserIcons(uid, localTrackState.audioTrackMuted, false);
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
                    } else {
                        dialog.innerHTML = '';
                        dialog.style.display = 'none';
                    }
                });
        }, 3000);
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
                showCustomAlert("Пользователь отклонён", "info");
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
                        updateMicCameraButtons();
                        updateHandButton();
                        break;
                    }
                }
            });
    }
    setInterval(loadUsers, 3000);
    loadUsers();
});