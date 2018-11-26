// Обработчик ошибки "Порт уже занят"
export default
function badPortError(port) {

    console.log(`Порт ${port} уже занят другим приложением!`);

    if (global.httpServer) {
        global.httpServer.close();
    }

    if (global.connection) {
        global.connection.destroy(); // Закрываем MySQL соединение
    }
}
