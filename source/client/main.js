import 'babel-polyfill';
import './styles.scss';
import './scrollbar/jquery.overlayScrollbars.css';
import './scrollbar/jquery.overlayScrollbars.js';
import body from './body.pug';

// Выносим jQuery в глобальную область видимости
window.$ = $;
window.ws = ws;

let softList = [];

// Переводит приложение в режим ожидания ответа от сервера
function setWaitingForMode() {
    // Экран добавление ПО
    $('#back').addClass('hidden');
    $('form#add-software-page').addClass('hidden');

    // Главный экран поиска
    $('#filters').addClass('hidden');
    $('#software-list').addClass('hidden');

    // Экран ожидания
    $('#waiting-for-response').removeClass('hidden');
}

// Добавляем основное тело нашего приложения в документ
$('body').append($(body()));

// Добавляем полосы прокрутки
$('#filters').overlayScrollbars({});
$('#software-list').overlayScrollbars({});
$('#add-software-page').overlayScrollbars({});
$('#show-software').overlayScrollbars({});

// Кнопка "ADD-SOFTWARE"
$('#add-software').click(e => {
    $('#filters').addClass('hidden');
    $('#software-list').addClass('hidden');
    $('#add-software-page').removeClass('hidden');
    $('#back').removeClass('hidden');
});

// Кнопка "BACK"
$('#back').click(e => {
    $('#add-software-page').addClass('hidden');
    $('#show-software').addClass('hidden');
    $('#filters').removeClass('hidden');
    $('#software-list').removeClass('hidden');
    $('#back').addClass('hidden');
});

// Добавление чего-либо в список из нескольких элементов (OS, CPU, GPU)
$('.add').click(e => {
    let btn = $(e.target),
        input = btn.prev(),
        container = btn.parent().next();

    if (input.val().trim() !== '') {
        container.append($(
            '<div class="added-item">' +
                `<div>${input.val().trim()}</div>` +
                '<div class="cancel"></div>' +
            '</div>'
        ));
        input.val('');
    }
});

// Кнопка-кресник для added-item
$('#add-software-page').click(e => {
    let target = $(e.target);

    if (target.hasClass('cancel')) {
        target.parent().remove();
    }
});

// RESET (Addition a new software to the database)
$('#reset-add-software').click(e => {
    $('#add-software-name').val('');
    $('#add-software-category').val('');
    $('#add-software-developer').val('');
    $('#add-software-price').val('');
    $('#add-software-ram').val('');
    $('#add-software-rom').val('');
    $('#add-software-os').val('');
    $('#add-software-cpu').val('');
    $('#add-software-gpu').val('');
    $('#OS').html('');
    $('#CPU').html('');
    $('#GPU').html('');
});

// RESET (Search)
$('#find-reset').click(e => {
    $('#find-name').val('');
    $('#find-category').val('');
    $('#find-developer').val('');
    $('#find-min-price').val('');
    $('#find-max-price').val('');
    $('#find-os').val('');
    $('#find-cpu').val('');
    $('#find-gpu').val('');
    $('#find-min-ram').val('');
    $('#find-max-ram').val('');
    $('#find-min-rom').val('');
    $('#find-max-rom').val('');

    // Вывод полного списока софта
    $('#software-list ul').html('<li class="title">Software list</li>');

    for (let soft of softList) {
        $('#software-list ul').append(`<li class="item">${soft}</li>`);
    }
});

// Кнопка "FIND"
$('#find').click(e => {
    if (!$('form#filters')[0].checkValidity()) {
        return alert(
            'Форма поиска заполнена не правильно!\n' +
            'Проверте поля "min/max Price", "min/max RAM", "min/max ROM". ' +
            'В них могут находится только числа!'
        );
    }

    setWaitingForMode(); // Включаем режим ожидания
    ws.send(JSON.stringify({
        type: 'find',
        name: $('#find-name').val(),
        category: $('#find-category').val(),
        developer: $('#find-developer').val(),
        minPrice: $('#find-min-price').val(),
        maxPrice: $('#find-max-price').val(),
        minRAM: $('#find-min-ram').val(),
        maxRAM: $('#find-max-ram').val(),
        minROM: $('#find-min-rom').val(),
        maxROM: $('#find-max-rom').val(),
        OS: $('#find-os').val(),
        CPU: $('#find-cpu').val(),
        GPU: $('#find-gpu').val()
    }));
});

// Кнопка, добавляющая новый софт
$('#add-soft').click(e => {
    if (!$('form#add-software-page')[0].checkValidity()) {
        return alert(
            'Форма заполнена не правильно!\n' +
            'Наведите по очереди на каждое из полей для ввода данных, ' +
            'чтобы получить более подробную информацию!'
        );
    }

    setWaitingForMode(); // Включаем режим ожидания

    ws.send(JSON.stringify({
        type: 'add-software',
        name: $('#add-software-name').val(),
        category: $('#add-software-category').val(),
        developer: $('#add-software-developer').val(),
        price: $('#add-software-price').val(),
        RAM: $('#add-software-ram').val(),
        ROM: $('#add-software-rom').val(),
        OS: [...$('#OS .added-item div:first-child').map(function() {
            return $(this).text();
        })],
        CPU: [...$('#CPU .added-item div:first-child').map(function() {
            return $(this).text();
        })],
        GPU: [...$('#GPU .added-item div:first-child').map(function() {
            return $(this).text();
        })]
    }));
});

// Детализованный клик по ПО
$('#software-list ul').click(e => {
    let target = e.target;

    if (target instanceof HTMLLIElement && $(target).hasClass('item')) {

        setWaitingForMode();

        // Запрос детализации по софту с названием $(target).text()
        ws.send(JSON.stringify({
            type: 'get-details',
            target: $(target).text()
        }));
    }
});

// Устанавливаем содениение с сервером по протоколу WebSocket
let ws = new WebSocket(`ws://${location.hostname}:8081`);

// Принимаем сообщения от сервера
ws.onmessage = e => {
    let data = JSON.parse(e.data);
    console.log(data);

    switch (data.type) {
        case 'find-results': // Результаты поиска
            $('#waiting-for-response').addClass('hidden');
            $('#filters').removeClass('hidden');
            $('#software-list').removeClass('hidden');

            $('#software-list ul').html('<li class="title">Software list</li>');
            for (let item of data.data) {
                $('#software-list ul')
                    .append(`<li class="item">${item.name}</li>`);
            }
            break;
        case 'adding': // Ответ на запрос добавления нового ПО
            $('#waiting-for-response').addClass('hidden');
            $('#back').removeClass('hidden');
            $('form#add-software-page').removeClass('hidden');

            setTimeout(() => alert(data.message), 200);
            break;
        case 'update': // Обновление datalists

            softList.push(data.name);

            if (data.category)
                $('#data-category')
                    .append(`<option value="${data.category}"></option>`);

            if (data.developer)
                $('#data-developer')
                    .append(`<option value="${data.developer}"></option>`);

            for (let item of data.OS)
                $('#data-OS')
                    .append(`<option value="${item}"></option>`);

            for (let item of data.CPU)
                $('#data-CPU')
                    .append(`<option value="${item}"></option>`);

            for (let item of data.GPU)
                $('#data-GPU')
                    .append(`<option value="${item}"></option>`);
            break;
        case 'datasets': // Получение всех наборов данных

            $('#software-list ul').html('<li class="title">Software list</li>');

            softList = [];

            for (let key in data) {
                $(`#data-${key}`).html('');

                for (let item of data[key]) {
                    if (key == 'softwares') {
                        $('#software-list ul')
                            .append(`<li class="item">${item.name}</li>`);

                        softList.push(item.name);
                    } else {
                        $(`#data-${key}`)
                            .append(`<option value="${item.name}"></option>`);
                    }
                }
            }
            break;
        case 'details': // Получение детализированной информации о ПО

            if (data.success == false) {
                // Показываем главный экран поиска
                $('#filters').removeClass('hidden');
                $('#software-list').removeClass('hidden');

                // Скрываем экран ожидания
                $('#waiting-for-response').addClass('hidden');

                return setTimeout(() => alert(data.message), 200);
            }

            // Показываем экран детализации
            $('#show-software').removeClass('hidden');
            $('#back').removeClass('hidden'); // Кнопочка "Назад"

            // Скрываем экран ожидания
            $('#waiting-for-response').addClass('hidden');

            // Установка значений таблице
            $('#item-name').text(data.name);
            $('#item-category').text(data.category);
            $('#item-developer').text(data.developer);
            $('#item-os').text(data.OS.join(' / '));
            $('#item-cpu').text(data.CPU.join(' / '));
            $('#item-gpu').text(data.GPU.join(' / '));
            $('#item-ram').text(`${data.RAM}MB`);
            $('#item-rom').text(`${data.ROM}MB`);
            $('#item-price').text(`${data.price}$`);
            break;
    }

};

// Обрабатываем ошибки
ws.onerror = console.log;

// Соединение закрыто
ws.onclose = console.log;
