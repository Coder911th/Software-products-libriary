import ws from 'ws';
import badPortError from './badPortError.mjs';

let wss,         /* WebSocket Server */
    pool,        /* MySQL Connection Pool */
    confTypes;   /* Типы конфигураций */

/* Регулярное выражение, определяющее положительное число */
let numMask = /^\d+?(\.\d+)??$/;

// Широковещательная рассылка сообщений всем клиентам
function broadcast(message) {
    if (!wss) return;

    wss.clients.forEach(ws => ws.send(message));
}

/* Создание WebSocket-сервера */
export default
function createWebSocketServer() {
    // Достаём из глобальной области видимости пул соединений с MySQL
    pool = global.pool;

    // Создаём WebSocket-сервер (порт 8081)
    wss = new ws.Server({
        clientTracking: true,
        port: 8081
    }, addHandlers).on('error', e => badPortError(8081));
}

// Отправка наборов данных клиенту
async function sendDatasets(ws) {
    // Отправляем все dataset'ы новому клиенту
    let connection = await pool.getConnection();

    let datasets = await connection.query('CALL get_all_datasets');
    connection.release();
    ws.send(JSON.stringify({
        type: 'datasets',
        softwares: datasets[0],
        developer: datasets[1],
        category: datasets[2],
        OS: datasets[3],
        CPU: datasets[4],
        GPU: datasets[5]
    }));
}

/* Добавление обработчиков WebSocket-серверу */
async function addHandlers() {

    console.log('WebSocket-сервер запущен по адресу ws://localhost:8081');

    // Получаем отображение types.name => types.id
    confTypes = {
        [Symbol.iterator]() { // Итератор по конфигурациям
            let keys = Object.keys(this);
            let cur = 0;

            return {
                next() {
                    return {
                        value: keys[cur++],
                        done: cur > keys.length
                    }
                }
            };
        }
    };

    let connection = await pool.getConnection();
    (await connection.query('SELECT * FROM types')).map(row =>
        confTypes[row.name] = row.id);
    connection.release();

    // Обрабатываем каждое новое соединение с WebSocket-сервером
    wss.on('connection', async function(ws) {

        // Обрабатываем получение сообщений от клиентов
        ws.on('message', message => messageHandler(ws, message));

        ws.on('error', () => {});

        // Обрабатываем закрытие соединения клиентами
        ws.on('close', (code, reason) => {});

        // Отправляем первичные наборы данных клиенту
        sendDatasets(ws);
    });
}

// Обработчик получения сообщения от клиента
async function messageHandler(ws, message) {
    let connection;

    // Отправка клиенту ответа с сообщением
    async function sendResponce(message, success = false, type = 'adding') {
        if (connection) {
            if (!success) {
                await connection.query('ROLLBACK'); // Откатываем изменения в базе
            } else {
                await connection.query('COMMIT'); // Принимаем изменения
            }

            connection.release(); // Возвращаем соединение в пул
        }

        ws.send(JSON.stringify({
            type, success, message
        }));
    }

    /* Возвращает id первого элемента из результата запроса queryResult.
       Если запрос не дал никаких результатов, выполняется запрос на вставку
       insertText с параметрами insertArgs и возвращается id вставленой строки */
    async function getId(queryResult, insertText, insertArgs,
        name = undefined, type = undefined) {
        if (queryResult.length == 0) {
            return {
                type, name,
                inserted: true,
                id: (await connection.query(insertText, insertArgs)).insertId
            }
        } else {
            return {
                type, name,
                inserted: false,
                id: queryResult[0].id
            }
        }
    }

    try {
        message = JSON.parse(message);
    } catch(e) {
        return;
    }

    switch (message.type) {
        case 'find': // Запрос на поиск с условиями

            // Удаляем начальные и конечные пробелы в присланных данных
            for (let key in message) {
                if (message[key].trim &&
                    message[key].trim instanceof Function
                ) {
                    message[key] = message[key].trim();
                }
            }

            console.log('Запрос на поиск: ', message);

            if (typeof message.name != 'string' ||
                typeof message.category != 'string' ||
                typeof message.developer != 'string' ||
                typeof message.minPrice != 'string' ||
                typeof message.maxPrice != 'string' ||
                typeof message.minRAM != 'string' ||
                typeof message.maxRAM != 'string' ||
                typeof message.minROM != 'string' ||
                typeof message.maxROM != 'string' ||
                typeof message.OS != 'string' ||
                typeof message.CPU != 'string' ||
                typeof message.GPU != 'string' ||
                (!numMask.test(message.minPrice) && message.minPrice != '') ||
                (!numMask.test(message.maxPrice) && message.maxPrice != '') ||
                (!numMask.test(message.minRAM) && message.minRAM != '') ||
                (!numMask.test(message.maxRAM) && message.maxRAM != '') ||
                (!numMask.test(message.minROM) && message.minROM != '') ||
                (!numMask.test(message.maxROM) && message.maxROM != '')
            ) return; // Кто-то пытается подделать запрос оригинального интерфейса

            let query = 'SELECT DISTINCT s.name ' +
                        'FROM softwares AS s ' +
                        'JOIN categories AS c ' +
                        'ON c.id = s.categories_id ' +
                        'JOIN developers AS d ' +
                        'ON d.id = s.developers_id ' +
                        'JOIN requirements AS r ' +
                        'ON r.softwares_id = s.id ' +
                        'JOIN configurations AS conf ' +
                        'ON conf.id = r.configurations_id ' +
                        'JOIN types AS t ' +
                        'ON t.id = conf.types_id ';

            let args = [];

            let flag;

            function getWhere(condition, value, word = 'AND') {
                args.push(value);

                if (flag == 1) {
                    flag++;
                    return `${condition} `;
                }

                if (args.length == 1)
                    return `WHERE ${condition} `;
                else
                    return `${word} ${condition} `;
            }

            // Категория
            if (message.category != '') {
                query += getWhere('c.name = ?', message.category);
            }

            // Разработчик
            if (message.developer != '') {
                query += getWhere('d.name = ?', message.developer);
            }

            // Название ПО
            if (message.name != '') {
                query += getWhere("s.name LIKE ?", `%${message.name}%`);
            }

            // Ценовой диапазон
            if (message.minPrice != '') {
                query += getWhere('s.price >= ? ', +message.minPrice);
            }

            if (message.maxPrice != '') {
                query += getWhere('s.price <= ? ', +message.maxPrice);
            }

            // RAM
            if (message.minRAM != '') {
                query += getWhere('s.RAM >= ? ', +message.minRAM);
            }

            if (message.maxRAM != '') {
                query += getWhere('s.RAM <= ? ', +message.maxRAM);
            }

            // ROM
            if (message.minROM != '') {
                query += getWhere('s.ROM >= ? ', +message.minROM);
            }

            if (message.maxROM != '') {
                query += getWhere('s.ROM <= ? ', +message.maxROM);
            }

            flag = 0;
            if (args.length != 0) {
                flag = 1;
                query += 'AND (';
            }

            // OS
            if (message.OS != '') {
                query += getWhere("t.name = 'OS' AND conf.name LIKE ?", `%${message.OS}%`, 'OR');
            }

            // CPU
            if (message.CPU != '') {
                query += getWhere("t.name = 'CPU' AND conf.name LIKE ?", `%${message.CPU}%`, 'OR');
            }

            // GPU
            if (message.GPU != '') {
                query += getWhere("t.name = 'GPU' AND conf.name LIKE ?", `%${message.GPU}%`, 'OR');
            }

            if (flag == 1) {
                query += '1 = 1';
            }

            if (flag > 0) {
                query += ')';
            }

            console.log(query);

            connection = await pool.getConnection();

            ws.send(JSON.stringify({
                type: 'find-results',
                data: await connection.query(query, args)
            }));

            connection.release();

            break;
        case 'get-details': // Запрос на детализацию по названию ПО

            console.log(`Получен запрос на детализацию данный по ` +
                `'${message.target}'`);

            connection = await pool.getConnection();

            // Запрашиваем основную информацию о ПО
            let softInfo = await connection.query(
                'SELECT * ' +
                'FROM softwares ' +
                'WHERE name = ?',
                [message.target]
            );

            if (softInfo.length === 0) {
                // Повторно отправляем все наборы данных клиенту
                sendDatasets(ws);

                return sendResponce('Не удалось загрузить данные ' +
                    'о запрашиваемом приложении!', false, 'details');
            }

            softInfo = softInfo[0];

            let response = {
                type: 'details',
                name: softInfo.name,
                category: (await connection.query(
                    'SELECT name ' +
                    'FROM categories ' +
                    'WHERE id = ?',
                    [softInfo.categories_id]
                ))[0].name,
                developer: (await connection.query(
                    'SELECT name ' +
                    'FROM developers ' +
                    'WHERE id = ?',
                    [softInfo.developers_id]
                ))[0].name,
                RAM: softInfo.RAM,
                ROM: softInfo.ROM,
                price: softInfo.price
            }

            for (let conf of confTypes) {
                response[conf] = (await connection.query(
                    'SELECT c.name ' +
                    'FROM configurations AS c ' +
                    'JOIN requirements AS r ' +
                    'ON r.configurations_id = c.id ' +
                    'WHERE c.types_id = ? ' +
                    'AND r.softwares_id = ?',
                    [confTypes[conf], softInfo.id]
                )).map(row => row.name);
            }

            connection.release();

            ws.send(JSON.stringify(response));

            break;
        case 'add-software': // Запрос на добавление нового ПО в базу

            // Удаляем начальные и конечные пробелы в присланных данных
            for (let key in message) {
                if (message[key].trim &&
                    message[key].trim instanceof Function
                ) {
                    message[key] = message[key].trim();
                }
            }

            console.log('Получен запрос на добавление данных в базу: ', message);

            // Проверяем наличие обязательных полей
            if (typeof message.name != 'string' ||
                typeof message.category != 'string' ||
                typeof message.developer != 'string' ||
                typeof message.price != 'string' ||
                typeof message.RAM != 'string' ||
                typeof message.ROM != 'string' ||
                (!message.OS || !(message.OS instanceof Array) ||
                message.OS.length < 1) ||
                (!message.CPU || !(message.CPU instanceof Array) ||
                message.CPU.length < 1) ||
                (!message.GPU || !(message.GPU instanceof Array) ||
                message.GPU.length < 1)
            )
                return sendResponce(`Не удалось добавить новое ПО!` +
                    `\nНа сторону сервера отправлено недостаточное ` +
                    `количество информации!`);

            /* Проверяем кооретности длины данных */
            if (message.name.length < 1 || message.name.length > 45)
                return sendResponce(`Не удалось добавить новое ПО!` +
                    `\nДлина поля Name должна быть в диапазоне от 1 до 45 ` +
                    `символов включительно!`);

            if (message.category.length < 1 || message.category.length > 45)
                return sendResponce(`Не удалось добавить новое ПО!` +
                    `\nДлина поля Category должна быть в диапазоне от 1 до 45 ` +
                    `символов включительно!`);

            if (message.developer.length < 1 || message.developer.length > 60)
                return sendResponce(`Не удалось добавить новое ПО!` +
                    `\nДлина поля Developer должна быть в диапазоне от 1 до 60 ` +
                    `символов включительно!`);

            if (!numMask.test(message.price) || +message.price > Number.MAX_SAFE_INTEGER)
                return sendResponce(`Не удалось добавить новое ПО!` +
                    `\nВведено некорректное значение в поле Price!`);

            if (!numMask.test(message.RAM) || +message.RAM > Number.MAX_SAFE_INTEGER)
                return sendResponce(`Не удалось добавить новое ПО!` +
                    `\nВведено некорректное значение в поле RAM!`);

            if (!numMask.test(message.ROM) || +message.ROM > Number.MAX_SAFE_INTEGER)
                return sendResponce(`Не удалось добавить новое ПО!` +
                    `\nВведено некорректное значение в поле ROM!`);
            /* END */

            // Достаём себе из пула одно соединение с MySQL
            connection = await pool.getConnection();
            /*** Начинаем транзакцию ***/
            await connection.query('START TRANSACTION');

            // Проверяем наличие текущего ПО в базе
            if ((await connection.query(
                'SELECT COUNT(*) ' +
                'FROM softwares ' +
                'WHERE name = ?',
                [message.name]
            ))[0]['COUNT(*)'] != 0)
                return sendResponce(`Не удалось добавить новое ПО!` +
                    `\nПО с названием '${message.name}' уже находится ` +
                    `в базе данных!`);

            // Id для добавления текущей записи
            let softwareId, categoryId, developerId, configurationsId = [];

            /* Получаем id, указанной в запросе категории.
               Если таковой не найдено, то она будет добавлена в базу */
            categoryId = await getId(

                await connection.query(
                    'SELECT id ' +
                    'FROM categories ' +
                    'WHERE name = ?',
                    [message.category]
                ),

                'INSERT INTO categories(name) ' +
                'VALUES (?)',

                [message.category]

            );

            /* Получаем id, указанного в запросе разработчика.
               Если такового не найдено, то он будет добавлен в базу */
            developerId = await getId(

                await connection.query(
                    'SELECT id ' +
                    'FROM developers ' +
                    'WHERE name = ?',
                    [message.developer]
                ),

                'INSERT INTO developers(name) ' +
                'VALUES (?)',

                [message.developer]

            );

            // Для каждого типа конфигураций
            for (let conf of confTypes) {

                /* Для каждого элемента из списка запроса клиента
                   текущего типа конфигурации */
                for (let item of message[conf]) {

                    if (item.length > 45) {
                        /* Имя конфигурации не может быть
                           больше 45 символов */

                        return sendResponce(`Не удалось добавить новое ПО!` +
                            `\nДлина названия элементов ${conf} не может ` +
                            `быть больше 45 символов! А '${item}' ` +
                            `не удовлетворяет этому условию!`);
                    }

                    /* Проверяем наличие всех конфигураций в таблице
                    configurations, при отсутствии - добавляем */

                    configurationsId.push(
                        await getId(

                            await connection.query(
                                'SELECT id ' +
                                'FROM configurations ' +
                                'WHERE types_id = ? ' +
                                'AND name = ?',
                                [confTypes[conf], item]
                            ),

                            'INSERT INTO configurations(name, types_id) ' +
                            'VALUES (?, ?)',

                            [item, confTypes[conf]],

                            item, // Название конфигурации

                            conf // Тип конфигурации

                        )
                    );

                }

            }

            /* Добавляем ПО в базу */
            console.log('В таблицу softwares добавлены следующие данные: ', [
                message.name,
                +message.price,
                +message.RAM,
                +message.ROM,
                categoryId,
                developerId,
            ]);

            softwareId = (await connection.query(
                'INSERT INTO softwares(name, price, RAM, ROM, categories_id, developers_id) ' +
                'VALUES (?, ?, ?, ?, ?, ?)',
                [
                    message.name,
                    +message.price,
                    +message.RAM,
                    +message.ROM,
                    categoryId.id,
                    developerId.id,
                ]
            )).insertId;

            let updated = {
                OS: [],
                CPU: [],
                GPU: []
            }

            /* Добавляем в базу системные требования к ПО */
            for (let confId of configurationsId) {

                if (confId.inserted) {
                    updated[confId.type].push(confId.name);
                }

                await connection.query(
                    'INSERT INTO requirements(softwares_id, configurations_id) ' +
                    'VALUES (?, ?)',
                    [softwareId, confId.id]
                );
            }

            // Широковещательная отправка обновления датасетов
            broadcast(JSON.stringify({
                type: 'update',
                name: message.name,
                category: categoryId.inserted ? message.category : null,
                developer: developerId.inserted ? message.developer : null,
                OS: updated.OS,
                CPU: updated.CPU,
                GPU: updated.GPU
            }));

            return sendResponce('ПО успешно добавлено в базу!', true);
    }
}
