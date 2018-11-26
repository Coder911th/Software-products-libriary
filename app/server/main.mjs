import badPortError from './badPortError.mjs';
import configLoader from './config-loader.mjs';
import Prompt from 'prompt-password';
import mysql from 'promise-mysql';
import express from 'express';
import createWebSocketServer from './WebSocketServer.mjs';

process.stdout.write("\u001b[2J\u001b[0;0H");

let config; // Данные, считанные из конфигурационного файла

(async function() {

    try {
        // Загрузка конфигурации сервера
        config = configLoader(['host', 'user', 'database', 'http-server-port']);
        console.log('Файл конфигурации успешно загружен!');

        // Проверка корректности port
        if (
            !/^\d+$/.test(config['http-server-port'].trim()) ||
            +config['http-server-port'] > 65535
        ) {
            throw new Error('В файле конфигурации указано некорректное ' +
                'значение http-server-port!');
        }

        // Аутентификация в базе данных
        global.pool = await mysql.createPool({
            host: config.host,
            user: config.user,
            password: await new Prompt({
                type: 'password',
                message: `Введите пароль пользователя ${config.user} ` +
                    `от Mysql сервера:`
            }).run(),
            database: config.database
        });

        // Check connection
        (await global.pool.getConnection()).release();;
    } catch (error) {
        return console.log(error.message);
    }

    // Создаём HTTP-сервер
    let app = express();

    // Выдаём статику клиентам
    app.use('/', express.static(`./client`));

    // Прослушиваем порт указанный в конфигурации
    global.httpServer = app.listen(config['http-server-port'], function() {

        // Выводим сообщение об успешном создании HTTP-сервера
        console.log(`HTTP-сервер запущен по адресу ` +
            `http://localhost:${config['http-server-port']}`);

        // Создаём WebSocket Server
        createWebSocketServer();

    }).on('error', e => badPortError(config['http-server-port']));

})();
