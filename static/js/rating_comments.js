function getCSRFToken() {
    const cookie = document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='));
    return cookie ? decodeURIComponent(cookie.split('=')[1]) : '';
}

function updateCommentsCount() {
    const countElem = document.querySelector('.js-comments-count');
    if (countElem) {
        const list = document.querySelectorAll('.js-comment-list .comment-item');
        countElem.textContent = list.length;
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const csrftoken = getCSRFToken();

    // ⭐ — Оценка
    const ratingBlock = document.querySelector('.js-rating-block');
    if (ratingBlock) {
        const stars = ratingBlock.querySelectorAll('.js-star');
        const label = ratingBlock.querySelector('.js-rating-label');
        const articleId = ratingBlock.dataset.articleId;
        const avgElem = document.querySelector('.average-rating');
        const allRatingsBlock = document.querySelector('.all-ratings ul');

        function setStars(value) {
            stars.forEach(s => {
                s.classList.remove('active', 'hovered', 'unselected');
                if (parseInt(s.dataset.value) <= value) {
                    s.classList.add('active');
                } else {
                    s.classList.add('unselected');
                }
            });
        }

        function setStarsHovered(value) {
            stars.forEach(s => {
                s.classList.remove('hovered');
                if (parseInt(s.dataset.value) <= value) {
                    s.classList.add('hovered');
                }
            });
        }

        function clearStarsHovered() {
            stars.forEach(s => s.classList.remove('hovered'));
        }

        // Наведение и клик
        stars.forEach(star => {
            star.addEventListener('mouseenter', function () {
                setStarsHovered(parseInt(this.dataset.value));
            });
            star.addEventListener('mouseleave', function () {
                clearStarsHovered();
            });
            star.addEventListener('click', function () {
                const value = parseInt(this.dataset.value);

                fetch(`/comments/api/ratings/${articleId}/submit/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-CSRFToken': csrftoken
                    },
                    body: `value=${value}`
                })
                .then(res => {
                    if (!res.ok) return res.text().then(text => { throw new Error(text); });
                    return res.json();
                })
                .then(data => {
                    setStars(data.user_value || 0);
                    clearStarsHovered();
                    if (label) {
                        label.innerHTML = data.user_value
                            ? `Ваша оценка: <strong>${data.user_value}</strong>/5`
                            : `Оцените от 1 до 5 звёзд.`;
                    }
                    if (avgElem && data.avg !== undefined && data.count !== undefined) {
                        avgElem.innerHTML = `<p>Средняя оценка: <strong>${data.avg}</strong>/5 (${data.count})</p>`;
                    }
                    updateAllRatingsFromData(data);
                    bindOwnDeleteBtn(); // обновить обработчик своей кнопки
                })
                .catch(err => {
                    alert('Ошибка при оценке: ' + err.message);
                });
            });
        });

        // 🗑️ Удаление оценки (суперадмин)
        function bindDeleteRating() {
            ratingBlock.querySelectorAll('.js-delete-rating').forEach(btn => {
                btn.onclick = function (e) {
                    e.preventDefault();
                    const ratingId = this.dataset.id;
                    if (!confirm('Удалить эту оценку?')) return;

                    fetch(`/comments/api/ratings/${ratingId}/delete/`, {
                        method: 'DELETE',
                        headers: { 'X-CSRFToken': csrftoken }
                    })
                    .then(res => {
                        if (!res.ok) return res.text().then(text => { throw new Error(text); });
                        return res.json();
                    })
                    .then(data => {
                        setStars(0);
                        clearStarsHovered();
                        if (label) {
                            label.innerHTML = `Оцените от 1 до 5 звёзд.`;
                        }
                        if (avgElem && data.avg !== undefined && data.count !== undefined) {
                            avgElem.innerHTML = `<p>Средняя оценка: <strong>${data.avg}</strong>/5 (${data.count})</p>`;
                        }
                        updateAllRatingsFromData(data);
                        bindOwnDeleteBtn();
                    })
                    .catch(err => alert('Ошибка удаления оценки: ' + err.message));
                };
            });
        }

        // 🗑️ Удаление своей оценки (обычный пользователь)
        function bindOwnDeleteBtn() {
            const ownDeleteBtn = document.querySelector('.js-delete-own-rating');
            if (ownDeleteBtn) {
                ownDeleteBtn.onclick = function (e) {
                    e.preventDefault();
                    const ratingId = this.dataset.id;
                    if (!confirm('Удалить вашу оценку?')) return;

                    fetch(`/comments/api/ratings/${ratingId}/delete/`, {
                        method: 'DELETE',
                        headers: { 'X-CSRFToken': csrftoken }
                    })
                    .then(res => {
                        if (!res.ok) return res.text().then(text => { throw new Error(text); });
                        return res.json();
                    })
                    .then(data => {
                        setStars(0);
                        clearStarsHovered();
                        if (label) {
                            label.innerHTML = `Оцените от 1 до 5 звёзд.`;
                        }
                        if (avgElem && data.avg !== undefined && data.count !== undefined) {
                            avgElem.innerHTML = `<p>Средняя оценка: <strong>${data.avg}</strong>/5 (${data.count})</p>`;
                        }
                        updateAllRatingsFromData(data);
                        ownDeleteBtn.remove();
                    })
                    .catch(err => alert('Ошибка удаления вашей оценки: ' + err.message));
                };
            }
        }

        // Обновление списка оценок (для суперадмина) — из ответа
        function updateAllRatingsFromData(data) {
            if (!allRatingsBlock) return;
            allRatingsBlock.innerHTML = '';
            if (data.ratings && data.ratings.length) {
                data.ratings.forEach(rating => {
                    const li = document.createElement('li');
                    li.innerHTML = `${rating.user} — ${rating.value}/5 <a href="#" class="btn-delete-rating text-danger js-delete-rating" data-id="${rating.id}" title="Удалить оценку">✖️</a>`;
                    allRatingsBlock.appendChild(li);
                });
            } else {
                allRatingsBlock.innerHTML = '<li>Нет ни одной оценки</li>';
            }
            bindDeleteRating();
        }
        bindDeleteRating();
        bindOwnDeleteBtn();
    }

    // 💬 Комментарии
    const commentBlock = document.querySelector('.js-comments-block');
    if (commentBlock) {
        const articleId = commentBlock.dataset.articleId;
        const textarea = commentBlock.querySelector('#comment-text');
        const submitBtn = commentBlock.querySelector('.js-submit-comment');
        const list = commentBlock.querySelector('.js-comment-list');

        // Отправка комментария
        if (submitBtn && textarea) {
            submitBtn.addEventListener('click', () => {
                const text = textarea.value.trim();
                if (!text) {
                    alert('Комментарий не может быть пустым.');
                    return;
                }

                fetch(`/comments/api/comments/${articleId}/submit/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-CSRFToken': csrftoken
                    },
                    body: `text=${encodeURIComponent(text)}`
                })
                .then(res => res.json())
                .then(comment => {
                    if (comment.error) {
                        alert(comment.error);
                        return;
                    }

                    const existing = list.querySelector(`[data-id="${comment.id}"]`);
                    const html = `
                        <div class="comment-header">
                            <strong>${comment.author}</strong>
                            <span class="comment-date">${comment.date}</span>
                        </div>
                        <div class="comment-body js-comment-text">${comment.text}</div>
                        <div class="comment-actions">
                            <a href="#" class="btn btn-sm js-edit-comment" data-id="${comment.id}">✏️</a>
                            <a href="#" class="btn btn-sm text-danger js-delete-comment" data-id="${comment.id}">🗑️</a>
                        </div>
                    `;

                    if (existing) {
                        existing.innerHTML = html;
                    } else {
                        const newLi = document.createElement('li');
                        newLi.className = 'comment-item';
                        newLi.dataset.id = comment.id;
                        newLi.innerHTML = html;
                        list.prepend(newLi);
                    }

                    textarea.value = '';
                    bindCommentActions();
                    updateCommentsCount();
                })
                .catch(err => alert('Ошибка добавления комментария: ' + err.message));
            });
        }

        // Удаление / редактирование комментариев
        function bindCommentActions() {
            // Удаление
            list.querySelectorAll('.js-delete-comment').forEach(link => {
                link.onclick = function (e) {
                    e.preventDefault();
                    const commentId = link.dataset.id;
                    if (!confirm('Удалить комментарий?')) return;

                    fetch(`/comments/api/comments/${commentId}/delete/`, {
                        method: 'DELETE',
                        headers: { 'X-CSRFToken': csrftoken }
                    })
                    .then(res => res.json())
                    .then(() => {
                        const item = list.querySelector(`[data-id="${commentId}"]`);
                        if (item) item.remove();
                        updateCommentsCount();
                    })
                    .catch(err => alert('Ошибка удаления комментария: ' + err.message));
                };
            });

            // Редактирование
            list.querySelectorAll('.js-edit-comment').forEach(link => {
                link.onclick = function (e) {
                    e.preventDefault();
                    const commentId = this.dataset.id;
                    const textBlock = list.querySelector(`[data-id="${commentId}"] .js-comment-text`);
                    const content = textBlock.textContent.trim();
                    textarea.value = content;
                    textarea.focus();
                };
            });
        }

        bindCommentActions();
    }
});