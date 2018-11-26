import fs from 'fs';

function parseFile(path) {
    let file;
    try {
        file = fs.readFileSync(path, 'utf8');
    } catch (err) {
        throw new Error(`Не найден файл конфигураций "${path}"!`);
    }

    try {
        return JSON.parse(file);
    } catch (err) {
        throw new Error('Файл конфигурации имеет формат отличный от JSON!');
    }
}

export default function(args = []) {
    let config = parseFile('config.json');

    let result = {};
    args.forEach(arg => {
        for (let item in config) {
            if (arg === item) {
                return result[item] = config[item];
            }
        }
        throw new Error(`В файле конфигураций не обнаружено значение` +
            ` свойства "${arg}"!`);
    });

    return result;
};
