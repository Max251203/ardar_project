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
        
        // Получаем существующий блок всех оценок или null, если его нет
        let allRatingsContainer = document.querySelector('.all-ratings');
        let allRatingsBlock = allRatingsContainer ? allRatingsContainer.querySelector('ul') : null;

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

        // Проверка, является ли пользователь суперадмином
        function isSuperAdmin() {
            return document.querySelector('[data-is-superadmin="true"]') !== null;
        }

        // Создаем кнопку удаления оценки, если её нет
        function createDeleteButton(ratingId) {
            // Проверяем, существует ли уже кнопка удаления
            let deleteBtn = ratingBlock.querySelector('.js-delete-own-rating');
            
            // Если кнопки нет, создаем новую
            if (!deleteBtn) {
                deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn-delete-rating js-delete-own-rating';
                deleteBtn.dataset.id = ratingId;
                deleteBtn.textContent = 'Удалить мою оценку';
                
                // Добавляем кнопку после рейтинга
                const ratingInfo = ratingBlock.querySelector('.rating-info');
                if (ratingInfo) {
                    ratingInfo.after(deleteBtn);
                } else {
                    // Если нет .rating-info, добавляем после звёзд
                    const starSelect = ratingBlock.querySelector('.star-select');
                    if (starSelect) {
                        starSelect.after(deleteBtn);
                    }
                }
                
                // Привязываем обработчик события
                bindOwnDeleteBtn();
            } else {
                // Если кнопка уже существует, обновляем её ID
                deleteBtn.dataset.id = ratingId;
            }
            
            return deleteBtn;
        }

        // Удаляем кнопку удаления своей оценки
        function removeDeleteButton() {
            const deleteBtn = ratingBlock.querySelector('.js-delete-own-rating');
            if (deleteBtn) {
                deleteBtn.remove();
            }
        }

        // Создать блок "Все оценки" для суперадмина
        function createAllRatingsBlock() {
            // Проверяем, не существует ли уже блок
            if (!allRatingsContainer) {
                // Создаем контейнер
                allRatingsContainer = document.createElement('div');
                allRatingsContainer.className = 'all-ratings';
                
                // Заголовок
                const heading = document.createElement('h4');
                heading.textContent = 'Все оценки:';
                
                // Список
                allRatingsBlock = document.createElement('ul');
                
                // Собираем структуру
                allRatingsContainer.appendChild(heading);
                allRatingsContainer.appendChild(allRatingsBlock);
                
                // Добавляем в блок рейтинга
                ratingBlock.appendChild(allRatingsContainer);
            }
            
            return allRatingsBlock;
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
                    
                    // Обновляем текст оценки
                    if (label) {
                        label.innerHTML = data.user_value
                            ? `Ваша оценка: <strong>${data.user_value}</strong>/5`
                            : `Оцените от 1 до 5 звёзд.`;
                    }
                    
                    // Обновляем среднюю оценку
                    if (avgElem && data.avg !== undefined && data.count !== undefined) {
                        avgElem.innerHTML = `<p>Средняя оценка: <strong>${data.avg}</strong>/5 (${data.count})</p>`;
                    }
                    
                    // Создаем кнопку удаления, если её нет и пользователь оставил оценку
                    if (data.user_value) {
                        // Находим ID своей оценки
                        let userRatingId = null;
                        if (data.ratings && data.ratings.length) {
                            // Ищем свою оценку в списке
                            data.ratings.forEach(rating => {
                                if (rating.is_current_user) {
                                    userRatingId = rating.id;
                                }
                            });
                            
                            // Если не нашли по флагу, берем последнюю оценку
                            if (!userRatingId && data.ratings.length > 0) {
                                // Предполагаем, что последняя оценка - наша
                                userRatingId = data.ratings[data.ratings.length - 1].id;
                            }
                        }
                        
                        if (userRatingId) {
                            createDeleteButton(userRatingId);
                        }
                    } else {
                        // Если нет оценки, удаляем кнопку удаления
                        removeDeleteButton();
                    }
                    
                    // Для суперадмина - обновляем список всех оценок
                    if (isSuperAdmin()) {
                        if (data.ratings && data.ratings.length) {
                            // Получаем или создаем блок всех оценок
                            createAllRatingsBlock();
                            updateAllRatingsFromData(data);
                            
                            // Показываем блок, если он был скрыт
                            if (allRatingsContainer) {
                                allRatingsContainer.style.display = 'block';
                            }
                        } else {
                            // Если оценок нет, скрываем блок
                            if (allRatingsContainer) {
                                allRatingsContainer.style.display = 'none';
                            }
                        }
                    }
                    
                    bindOwnDeleteBtn(); // обновить обработчик своей кнопки
                    bindDeleteRating(); // обновить обработчики кнопок удаления в списке
                })
                .catch(err => {
                    alert('Ошибка при оценке: ' + err.message);
                });
            });
        });

        // 🗑️ Удаление оценки (суперадмин)
        function bindDeleteRating() {
            document.querySelectorAll('.js-delete-rating').forEach(btn => {
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
                        // Проверяем, была ли удалена наша оценка
                        const ownDeleteBtn = document.querySelector('.js-delete-own-rating');
                        if (ownDeleteBtn && ownDeleteBtn.dataset.id === ratingId) {
                            // Если удалили свою оценку, сбрасываем звезды и удаляем кнопку
                            setStars(0);
                            clearStarsHovered();
                            if (label) {
                                label.innerHTML = `Оцените от 1 до 5 звёзд.`;
                            }
                            removeDeleteButton();
                        }
                        
                        // Обновляем среднюю оценку
                        if (avgElem && data.avg !== undefined && data.count !== undefined) {
                            avgElem.innerHTML = `<p>Средняя оценка: <strong>${data.avg}</strong>/5 (${data.count})</p>`;
                        }
                        
                        // Обновляем список всех оценок
                        updateAllRatingsFromData(data);
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
                        // Сбрасываем звезды
                        setStars(0);
                        clearStarsHovered();
                        if (label) {
                            label.innerHTML = `Оцените от 1 до 5 звёзд.`;
                        }
                        
                        // Обновляем среднюю оценку
                        if (avgElem && data.avg !== undefined && data.count !== undefined) {
                            avgElem.innerHTML = `<p>Средняя оценка: <strong>${data.avg}</strong>/5 (${data.count})</p>`;
                        }
                        
                        // Обновляем список всех оценок, если пользователь суперадмин
                        if (isSuperAdmin()) {
                            updateAllRatingsFromData(data);
                        }
                        
                        // Удаляем кнопку удаления
                        removeDeleteButton();
                    })
                    .catch(err => alert('Ошибка удаления вашей оценки: ' + err.message));
                };
            }
        }

        // Обновление списка оценок (для суперадмина) — из ответа
        function updateAllRatingsFromData(data) {
            // Проверяем, является ли пользователь суперадмином
            if (!isSuperAdmin()) return;
            
            // Если нет оценок, скрываем блок и выходим
            if (!data.ratings || data.ratings.length === 0) {
                if (allRatingsContainer) {
                    allRatingsContainer.style.display = 'none';
                }
                return;
            }
            
            // Получаем или создаем блок для всех оценок
            const ratingsListElement = createAllRatingsBlock();
            
            // Показываем блок
            if (allRatingsContainer) {
                allRatingsContainer.style.display = 'block';
            }
            
            // Очищаем список оценок
            ratingsListElement.innerHTML = '';
            
            // Заполняем список оценок
            data.ratings.forEach(rating => {
                const li = document.createElement('li');
                li.innerHTML = `${rating.user} — ${rating.value}/5 <a href="#" class="btn-delete-rating text-danger js-delete-rating" data-id="${rating.id}" title="Удалить оценку">✖️</a>`;
                ratingsListElement.appendChild(li);
            });
            
            // Привязываем обработчики событий к кнопкам удаления
            bindDeleteRating();
        }

        // Инициализация обработчиков
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